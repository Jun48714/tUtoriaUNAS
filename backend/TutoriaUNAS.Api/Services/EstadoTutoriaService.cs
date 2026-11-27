using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services;

public sealed class EstadoTutoriaService(TutoriaDbContext db, TutoriaContext context, DocumentosService documentos, SistemaService sistema)
{
    private static readonly string[] Formatos = [.. Enumerable.Range(1, 12).Select(n => $"F{n:00}")];
    public async Task<EstadoTutoriaDto> Obtener(CancellationToken ct, bool inicioInstitucional = false)
    {
        var actor = await context.Actor(ct);
        if (inicioInstitucional && actor.AdminInstitucional && actor.EscuelaSeleccionada is null)
            actor = actor with { ConsultaInstitucional = true };
        var institucional = actor.ConsultaInstitucional;
        var periodo = await context.Periodo(actor, ct);
        var escuelasAdministrables = actor.AdminInstitucional
            ? await db.Periodos.AsNoTracking().Where(p => p.Activo).Select(p => p.EscuelaId).ToArrayAsync(ct)
            : [];
        var asignaciones = await db.Asignaciones.AsNoTracking().Where(a => (institucional ? escuelasAdministrables.Contains(a.EscuelaId) : a.EscuelaId == actor.EscuelaId) && a.Activa &&
            (actor.Rol == "coordinacion" || (actor.Rol == "tutor" ? a.TutorId == actor.Id : a.EstudianteId == actor.Id))).ToArrayAsync(ct);
        var ids = asignaciones.Select(a => a.EstudianteId).Append(actor.Id).Distinct().ToArray();
        var tutores = asignaciones.Select(a => a.TutorId).Append(actor.Id).Distinct().ToArray();
        var personas = await db.VistaPersonasEstado.AsNoTracking().Where(p => (institucional ? p.EscuelaId == "" || escuelasAdministrables.Contains(p.EscuelaId) : p.EscuelaId == actor.EscuelaId) &&
            (actor.Rol == "coordinacion" || (p.Tipo == "estudiante" ? ids.Contains(p.Id) : tutores.Contains(p.Id)))).ToArrayAsync(ct);
        var sesiones = await db.Sesiones.AsNoTracking().Include(s => s.Asistentes).Where(s => (institucional ? escuelasAdministrables.Contains(s.EscuelaId) : s.EscuelaId == actor.EscuelaId) &&
            (actor.Rol == "coordinacion" || (actor.Rol == "tutor" ? s.TutorId == actor.Id : s.Asistentes.Any(a => a.EstudianteId == actor.Id)))).ToArrayAsync(ct);
        var candidatas = await db.Instrumentos.AsNoTracking().Where(d => (institucional ? escuelasAdministrables.Contains(d.EscuelaId) : d.EscuelaId == actor.EscuelaId) &&
            (actor.Rol == "coordinacion" || (actor.Rol == "estudiante" ? d.EstudianteId == actor.Id : d.TutorId == actor.Id))).ToArrayAsync(ct);
        await documentos.PrepararLecturaMasiva(actor, sesiones, ct, asignaciones);
        var registros = new List<InstrumentoDto>();
        var historial = new List<InstrumentoDto>();
        if (actor.Rol == "estudiante" && actor.Puede("formularios", "ver"))
            foreach (var d in candidatas.Where(d => d.Estado is "enviado" or "aprobado"))
                if (await documentos.PuedeLeer(actor, d, ct)) historial.Add(JsonDatos.Dto(d));
        foreach (var d in candidatas.Where(_ => actor.Puede("formularios", "ver")))
        {
            // El historial se conserva; la bandeja solo presenta la entrevista vigente.
            if (actor.Rol == "estudiante" && d.Formato is "F03" or "F04" or "F05")
            {
                var estudiante = personas.Single(p => p.Id == actor.Id);
                if (estudiante.Ciclo is null || d.SemestreId != periodo.SemestreId || d.Formato != EtapasTutoria.FormatoEntrevistaInicial(estudiante.Ciclo.Value)) continue;
            }
            if (await documentos.PuedeLeerResumen(actor, d, ct))
                registros.Add(JsonDatos.Dto(d, incluirRespuestas: await documentos.PuedeLeer(actor, d, ct)));
        }
        var idsRegistros = registros.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        if (actor.Rol == "estudiante" && actor.Puede("formularios", "ver"))
            foreach (var s in sesiones)
            {
                var id = DocumentosService.IdEvaluacion(s, actor.Id);
                if (!idsRegistros.Add(id)) continue;
                var d = DocumentosService.Nuevo(id, s.Tipo == "individual" ? "F10" : "F11", s.TutorId, s.EscuelaId, s.SemestreId, actor.Id, context.Ahora, s.Id);
                d.RespuestasJson = JsonDatos.Serializar(await documentos.Canonizar(d, [], ct));
                registros.Add(JsonDatos.Dto(d));
            }
        var expediente = await db.Expediente.AsNoTracking().Where(e => !institucional && actor.Puede("formularios", "ver") && ids.Contains(e.EstudianteId) &&
            (actor.Rol == "estudiante" || db.Instrumentos.Any(origen => origen.Id == e.DocumentoId && (origen.Estado == "enviado" || origen.Estado == "aprobado")))).ToArrayAsync(ct);
        var precargas = new Dictionary<string, Dictionary<string, string>>();
        // Se agrupa una sola vez y en coordinación solo se precargan alumnos con asignación o formularios,
        // evitando serializar miles de mapas vacíos del padrón sin asignar.
        var expedientePorEstudiante = expediente.ToLookup(e => e.EstudianteId, StringComparer.Ordinal);
        var idsPrecarga = actor.Rol == "coordinacion"
            ? ids.Concat(candidatas.Where(c => c.EstudianteId is not null).Select(c => c.EstudianteId!)).ToHashSet(StringComparer.Ordinal)
            : null;
        foreach (var estudiante in personas.Where(p => !institucional && p.Tipo == "estudiante" && (idsPrecarga is null || idsPrecarga.Contains(p.Id))))
        {
            var datos = DocumentosService.DatosParaPeriodo(expedientePorEstudiante[estudiante.Id], periodo.SemestreId).ToArray();
            foreach (var formato in Formatos)
                precargas[$"{estudiante.Id}|{periodo.SemestreId}|{formato}"] = DocumentosService.Precargar(datos, formato);
        }
        // Coordinación consulta la matrícula de todo el padrón de su escuela desde vw_matriculas_estado (ya recortada en SQL);
        // tutor y estudiante conservan su alcance.
        var matriculas = actor.Rol == "coordinacion" && !institucional
            ? await db.VistaMatriculasEstado.AsNoTracking()
                .Where(m => db.Personas.Any(p => p.Id == m.EstudianteId && p.Tipo == "estudiante" && p.EscuelaId == actor.EscuelaId))
                .Select(m => m.DatosEstado).ToArrayAsync(ct)
            : await db.VistaMatriculasEstado.AsNoTracking()
                .Where(m => ids.Contains(m.EstudianteId))
                .Select(m => m.DatosEstado).ToArrayAsync(ct);
        foreach (var d in candidatas.Where(d => !institucional && d.SemestreId == periodo.SemestreId && ((actor.Rol == "tutor" && d.TutorId == actor.Id && d.Formato == "F02") || (actor.Rol == "coordinacion" && d.Formato == "F01"))))
            precargas[$"{d.TutorId}|{d.SemestreId}|{d.Formato}"] = await documentos.Canonizar(d, [], ct);
        // La procedencia (archivo y filas del Excel) no se usa en el portal y pesaba más que el propio bloque horario.
        var horarios = await db.Database.SqlQuery<string>($"""SELECT ("DatosJson" - 'origen')::text AS "Value" FROM "Horarios" WHERE "EstudianteId" = ANY({ids})""").ToArrayAsync(ct);
        var estudiantes = personas.Where(p => p.Tipo == "estudiante").Select(p => JsonDatos.Elemento(p.DatosEstado)).ToArray();
        var docentes = personas.Where(p => p.Tipo == "tutor").Select(p => JsonDatos.Elemento(p.DatosEstado)).ToArray();
        var matriculasDto = matriculas.Select(JsonDatos.Elemento).ToArray();
        var horariosDto = horarios.Select(JsonDatos.Elemento).ToArray();
        return new(actor.Dto, periodo.SemestreId, periodo.Momento, periodo.Version, estudiantes, docentes,
            asignaciones.Select(Asignacion).ToArray(), matriculasDto, horariosDto, registros.ToArray(),
            actor.Puede("sesiones", "ver") ? sesiones.Select(s => JsonDatos.Dto(s, actor.Rol == "estudiante" ? actor.Id : null, actor.Rol == "tutor" && s.TutorId == actor.Id)).ToArray() : [], precargas,
            await sistema.Obtener(actor, periodo, ct, CursosUsados(matriculasDto, horariosDto, docentes), ids, escuelasAdministrables), historial.ToArray(), actor.EscuelaId, escuelasAdministrables, institucional);
    }

    /// <summary>Cursos que el portal necesita nombrar: los de las matrículas, los horarios y los cursos asignados a docentes.</summary>
    private static string[] CursosUsados(JsonElement[] matriculas, JsonElement[] horarios, JsonElement[] docentes)
    {
        static IEnumerable<string> Textos(JsonElement e, string campo) =>
            e.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.Array ? v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!) : [];
        static string? Texto(JsonElement e, string campo) => e.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var usados = new HashSet<string>(StringComparer.Ordinal);
        foreach (var m in matriculas)
            if (m.TryGetProperty("cursos", out var cursos) && cursos.ValueKind == JsonValueKind.Array)
                foreach (var c in cursos.EnumerateArray()) if (Texto(c, "cursoId") is { } id) usados.Add(id);
        foreach (var h in horarios) if (Texto(h, "cursoId") is { } id) usados.Add(id);
        foreach (var d in docentes) usados.UnionWith(Textos(d, "cursosAsignados"));
        return [.. usados];
    }

    private static JsonElement Asignacion(AsignacionEntity asignacion)
    {
        var datos = JsonDatos.Leer<Dictionary<string, object?>>(asignacion.DatosJson);
        // Las columnas son la fuente de identidad y vigencia; el JSON histórico puede ser parcial.
        datos["id"] = asignacion.Id; datos["estudianteId"] = asignacion.EstudianteId;
        datos["tutorId"] = asignacion.TutorId; datos["escuelaId"] = asignacion.EscuelaId;
        datos["semestreId"] = asignacion.SemestreId; datos["grupo"] = asignacion.Grupo;
        datos["estado"] = asignacion.Activa ? "activa" : "finalizada"; datos["version"] = asignacion.Version;
        foreach (var campo in new[] { "fechaInicio", "criterio", "referenciaAprobacion" })
            if (datos.GetValueOrDefault(campo) is not JsonElement { ValueKind: JsonValueKind.String }) datos[campo] = "";
        datos.TryAdd("fechaFin", null);
        if (datos.GetValueOrDefault("historial") is not JsonElement { ValueKind: JsonValueKind.Array }) datos["historial"] = Array.Empty<object>();
        return JsonDatos.Elemento(JsonDatos.Serializar(datos));
    }

    public async Task CambiarMomento(CambiarMomentoDto request, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "coordinacion", "Solo coordinación puede cambiar el momento del semestre.", 403);
        actor.ExigirEscuelaParaGestion();
        await using var tx = await context.Transaccion(actor, ct);
        var periodo = await context.Periodo(actor, ct);
        TutoriaContext.Version(request.Version, periodo.Version);
        TutoriaError.Exigir(request.Momento is "inicio" or "durante" or "cierre", "Momento inválido.");
        periodo.Momento = request.Momento; periodo.Version++;
        context.Auditar(actor, "cambiar-momento", periodo.Id, periodo.Version);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task Asignar(AsignarTutorDto request, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "coordinacion", "Solo coordinación puede asignar tutores.", 403);
        if (actor.ConsultaInstitucional)
            actor = actor.ParaEscuela(await db.Personas.AsNoTracking().Where(p => p.Id == request.EstudianteId && p.Tipo == "estudiante")
                .Select(p => p.EscuelaId).SingleOrDefaultAsync(ct));
        actor.ExigirEscuelaParaGestion();
        await using var tx = await context.Transaccion(actor, ct);
        var periodo = await context.Periodo(actor, ct);
        await context.ExigirPeriodoAbierto(actor, ct);
        var e = await db.Personas.FindAsync([request.EstudianteId], ct);
        var tutor = await db.Personas.FindAsync([request.TutorId], ct);
        TutoriaError.Exigir(e?.Tipo == "estudiante" && e.Activa && tutor?.Tipo == "tutor" && e.EscuelaId == actor.EscuelaId && tutor.EscuelaId == actor.EscuelaId && tutor.Activa, "El estudiante y el tutor deben estar activos y pertenecer a tu escuela.", 403);
        TutoriaError.Exigir(!string.IsNullOrWhiteSpace(request.Referencia) && request.Referencia.Length <= 200 && (request.Grupo?.Length ?? 0) <= 100, "Registra la referencia de aprobación y un grupo válido.");
        var a = await db.Asignaciones.SingleOrDefaultAsync(a => a.EstudianteId == request.EstudianteId && a.EscuelaId == actor.EscuelaId && a.SemestreId == periodo.SemestreId && a.Activa, ct);
        if (a is null) { TutoriaError.Exigir(request.Version is null or 0, "La asignación cambió.", 409); a = new() { Id = "ASG-" + Guid.NewGuid(), EstudianteId = request.EstudianteId, TutorId = request.TutorId, EscuelaId = actor.EscuelaId, SemestreId = periodo.SemestreId }; db.Asignaciones.Add(a); }
        else TutoriaContext.Version(request.Version ?? -1, a.Version);
        var anterior = a.TutorId;
        if (request.SolicitudId is { } sid)
        {
            var s = await db.SolicitudesCambio.SingleOrDefaultAsync(s => s.Id == sid && s.EscuelaId == actor.EscuelaId && s.EstudianteId == a.EstudianteId && s.SemestreId == a.SemestreId, ct) ?? throw new TutoriaError(404, "Solicitud no disponible.");
            TutoriaContext.Version(request.SolicitudVersion ?? -1, s.Version);
            TutoriaError.Exigir(s.Estado == "pendiente" && s.TutorActualId == anterior && request.TutorId != anterior, "La solicitud o su asignación ya cambió.", 409);
            s.Estado = "aprobada"; s.Respuesta = request.Referencia.Trim(); s.ResueltoPor = actor.Usuario.Id; s.Resuelto = context.Ahora; s.Version++;
            context.Auditar(actor, "aprobar-cambio-tutor", s.Id, s.Version);
        }
        a.TutorId = request.TutorId; a.Grupo = request.Grupo; a.Version++;
        var datos = JsonDatos.Leer<Dictionary<string, object?>>(a.DatosJson);
        datos["id"] = a.Id; datos["estudianteId"] = a.EstudianteId; datos["tutorId"] = a.TutorId;
        datos["semestreId"] = a.SemestreId; datos["escuelaId"] = a.EscuelaId; datos["grupo"] = a.Grupo;
        datos["estado"] = "activa"; datos["fechaInicio"] = datos.GetValueOrDefault("fechaInicio") ?? context.Hoy;
        datos["fechaFin"] = null; datos["criterio"] = "asignación directiva"; datos["referenciaAprobacion"] = request.Referencia.Trim(); datos["version"] = a.Version;
        var historia = JsonDatos.Elemento(a.DatosJson).TryGetProperty("historial", out var h) && h.ValueKind == JsonValueKind.Array ? h.Deserialize<List<object>>()! : [];
        historia.Add(new { fecha = context.Hoy, tutorAnteriorId = anterior, tutorNuevoId = a.TutorId, motivo = request.Referencia.Trim(), responsable = actor.Dto.Name }); datos["historial"] = historia;
        a.DatosJson = JsonDatos.Serializar(datos);
        foreach (var d in await db.Instrumentos.Where(d => d.EstudianteId == a.EstudianteId && d.SemestreId == a.SemestreId && (d.Formato == "F03" || d.Formato == "F04" || d.Formato == "F05")).ToListAsync(ct)) { d.TutorId = a.TutorId; d.Version++; }
        if (e!.Ciclo is { } ciclo)
        {
            var iid = DocumentosService.IdEntrevista(a, ciclo);
            if (!await db.Instrumentos.AnyAsync(d => d.Id == iid, ct)) db.Instrumentos.Add(DocumentosService.Nuevo(iid, EtapasTutoria.FormatoEntrevistaInicial(ciclo), a.TutorId, a.EscuelaId, a.SemestreId, a.EstudianteId, context.Ahora));
        }
        context.Auditar(actor, "asignar-tutor", a.Id, a.Version);
        await ComunicacionService.Notificar(db, context, actor.EscuelaId, [a.EstudianteId], "estudiante", $"asignacion:{a.Id}:{a.Version}", "sistema", "Actualización de tu docente tutor", "Se actualizó tu asignación de tutoría.", "/estudiante/tutor", ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
