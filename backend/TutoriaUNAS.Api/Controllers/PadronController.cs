using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Controllers;

/// <summary>Consulta institucional del Excel autorizado; separada de la asignación tutorial por escuela.</summary>
[ApiController, Route("api/padron"), Authorize(Policy = RoleNames.TutoringAccessPolicy)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[RequierePermiso("integraciones", "ver")]
public sealed class PadronController(TutoriaDbContext db, TutoriaContext context) : ControllerBase
{
    // El padrón importado cambia poco (solo al reimportar): se analiza y ordena una
    // vez por proceso y se revalida con un sello barato (conteo, último Id y suma de
    // longitudes), en lugar de transferir y re-parsear todas las filas en cada consulta.
    private static readonly ConcurrentDictionary<string, JsonElement[]> CachePadron = new(StringComparer.Ordinal);
    private static readonly string[] CamposBusqueda = ["codigo", "apellidos", "nombres", "correo", "departamento"];

    private async Task<ActorTutoria> ExigirCoordinacion(CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "coordinacion", "El padrón institucional está reservado a coordinación.", 403);
        return actor;
    }

    [HttpGet]
    public async Task<object> Listar([FromQuery] string tipo = "estudiante", [FromQuery] string buscar = "",
        [FromQuery] string escuelaId = "", [FromQuery] int pagina = 1, CancellationToken ct = default)
    {
        var actor = await ExigirCoordinacion(ct);
        TutoriaError.Exigir(tipo is "estudiante" or "tutor" && buscar.Length <= 150 && escuelaId.Length <= 80 && pagina is > 0 and <= 10000, "Filtros de padrón inválidos.");
        if (!actor.AdminInstitucional)
        {
            TutoriaError.Exigir(escuelaId == "" || escuelaId == actor.EscuelaId, "La escuela solicitada está fuera de tu ámbito.", 403);
            escuelaId = actor.EscuelaId;
        }
        var prefijo = tipo == "estudiante" ? "PAD-ALU-" : "PAD-DOC-";
        var totalFilas = await db.Personas.AsNoTracking().Where(p => p.Tipo == tipo && p.Id.StartsWith(prefijo) &&
                (escuelaId == "" || p.EscuelaId == escuelaId)).GroupBy(_ => 1)
            .Select(g => $"{g.Count()}:{g.Max(x => x.Id)}:{g.Sum(x => x.DatosJson.Length)}").SingleOrDefaultAsync(ct);
        var consulta = $"{db.Database.GetDbConnection().Database}|{tipo}|{escuelaId}|{prefijo}|";
        var sello = consulta + (totalFilas ?? "vacio");
        var ordenadas = CachePadron.GetOrAdd(sello, _ => CargarPadron(db, tipo, escuelaId, prefijo));
        // Solo se conserva la versión vigente de cada consulta: sin esto, cada cambio del padrón dejaba en memoria
        // una copia completa más que nunca se liberaba.
        foreach (var clave in CachePadron.Keys)
            if (clave != sello && clave.StartsWith(consulta, StringComparison.Ordinal)) CachePadron.TryRemove(clave, out _);
        var texto = buscar.Trim();
        var coincidencias = ordenadas.Where(p => texto.Length == 0 ||
            CultureInfo.GetCultureInfo("es-PE").CompareInfo.IndexOf(string.Join(" ", CamposBusqueda
                .Select(k => p.TryGetProperty(k, out var v) ? v.GetString() : "")), texto, CompareOptions.IgnoreCase | CompareOptions.IgnoreNonSpace) >= 0)
            .ToArray();
        const int tamano = 25;
        var actual = Math.Min(pagina, Math.Max(1, (coincidencias.Length + tamano - 1) / tamano));
        var reportes = actor.AdminInstitucional
            ? await db.Fuentes.AsNoTracking().Where(f => f.Tipo == "importacionesPadron").OrderByDescending(f => f.FechaCorte).Select(f => f.DatosJson).ToArrayAsync(ct)
            : [];
        var escuelas = await db.Catalogos.AsNoTracking().Where(c => c.Tipo == "escuelas" &&
            (actor.AdminInstitucional || c.Id == actor.EscuelaId)).Select(c => c.DatosJson).ToArrayAsync(ct);
        return new { filas = coincidencias.Skip((actual - 1) * tamano).Take(tamano).ToArray(), total = coincidencias.Length, pagina = actual, tamano,
            escuelas = escuelas.Select(JsonDatos.Elemento).ToArray(), importaciones = reportes.Select(JsonDatos.Elemento).ToArray() };
    }

    private static JsonElement[] CargarPadron(TutoriaDbContext db, string tipo, string escuelaId, string prefijo)
    {
        return db.Personas.AsNoTracking().Where(p => p.Tipo == tipo && p.Id.StartsWith(prefijo) &&
                (escuelaId == "" || p.EscuelaId == escuelaId)).OrderBy(p => p.Id).Select(p => p.DatosJson).ToArray()
            .Select(JsonDatos.Elemento)
            .OrderBy(p => p.GetProperty("apellidos").GetString(), StringComparer.Create(CultureInfo.GetCultureInfo("es-PE"), true))
            .ThenBy(p => p.GetProperty("id").GetString(), StringComparer.Ordinal).ToArray();
    }

    [HttpGet("{id}")]
    public async Task<object> Detalle(string id, CancellationToken ct)
    {
        var actor = await ExigirCoordinacion(ct);
        var importado = id.StartsWith("PAD-ALU-", StringComparison.Ordinal) || id.StartsWith("PAD-DOC-", StringComparison.Ordinal);
        var persona = await db.Personas.AsNoTracking().SingleOrDefaultAsync(p => p.Id == id &&
            (actor.AdminInstitucional || p.EscuelaId == actor.EscuelaId) &&
            (importado || (actor.AdminInstitucional && p.Tipo == "estudiante")), ct) ?? throw new TutoriaError(404, "Registro de padrón no disponible.");
        var datosPersona = importado
            ? JsonDatos.Elemento(persona.DatosJson)
            : JsonDatos.Elemento(await db.VistaPersonasEstado.AsNoTracking().Where(p => p.Id == id).Select(p => p.DatosEstado).SingleAsync(ct));
        var matriculas = await db.Matriculas.AsNoTracking().Where(m => m.EstudianteId == id).OrderBy(m => m.SemestreId).Select(m => m.DatosJson).ToArrayAsync(ct);
        var matriculasLeidas = matriculas.Select(JsonDatos.Leer<Dictionary<string, JsonElement>>).ToArray();
        var cursoIds = matriculasLeidas
            .SelectMany(datos => datos["cursos"].EnumerateArray().Select(c => c.GetProperty("cursoId").GetString()!))
            .Distinct().ToArray();
        var cursos = cursoIds.Length == 0
            ? []
            : await db.Catalogos.AsNoTracking().Where(c => c.Tipo == "cursos" && cursoIds.Contains(c.Id)).Select(c => c.DatosJson).ToArrayAsync(ct);
        var mapa = cursos.Select(JsonDatos.Elemento).ToDictionary(c => c.GetProperty("id").GetString()!);
        return new { persona = datosPersona, matriculas = matriculasLeidas.Select(datos => {
            var inscritos = datos["cursos"].EnumerateArray().Select(c => {
                var curso = c.Deserialize<Dictionary<string, object?>>(JsonDatos.Options)!;
                if (mapa.TryGetValue(c.GetProperty("cursoId").GetString()!, out var catalogo)) { curso["codigo"] = catalogo.GetProperty("codigo"); curso["nombre"] = catalogo.GetProperty("nombre"); }
                return curso;
            }).ToArray();
            return new { semestreId = datos["semestreId"], estado = datos["estado"], cursos = inscritos };
        }).ToArray() };
    }
}
