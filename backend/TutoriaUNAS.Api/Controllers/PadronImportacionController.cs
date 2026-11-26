using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Services;
using TutoriaUNAS.Api.Services.Padron;

namespace TutoriaUNAS.Api.Controllers;

/// <summary>Importación del padrón (Excel) desde el panel de administración: primero vista previa, luego confirmación.</summary>
[ApiController, Route("api/padron/importar"), Authorize(Policy = RoleNames.TutoringAccessPolicy)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[RequierePermiso("integraciones", "editar")]
public sealed class PadronImportacionController(ImportadorPadronService importador, TutoriaContext context) : ControllerBase
{
    private const long MaxBytes = 30_000_000;

    private async Task<ActorTutoria> ExigirAdministracion(CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.AdminInstitucional, "Solo la administración institucional puede importar el padrón.", 403);
        return actor;
    }

    /// <summary>Lee y valida el Excel sin guardar nada. Devuelve cantidades, advertencias y las filas que no se importarán.</summary>
    [HttpPost("analizar"), RequestSizeLimit(MaxBytes), RequestFormLimits(MultipartBodyLengthLimit = MaxBytes)]
    public async Task<object> Analizar(IFormFile archivo, CancellationToken ct)
    {
        var actor = await ExigirAdministracion(ct);
        TutoriaError.Exigir(archivo is { Length: > 0 }, "Selecciona un archivo de Excel (.xlsx).", 400);
        TutoriaError.Exigir(archivo.Length <= MaxBytes, "El archivo supera los 30 MB.", 413);
        var nombre = Path.GetFileName(archivo.FileName);
        TutoriaError.Exigir(nombre.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase), "Solo se admiten libros de Excel con extensión .xlsx.", 400);
        var contenido = new byte[archivo.Length];
        await using (var flujo = archivo.OpenReadStream()) await flujo.ReadExactlyAsync(contenido, ct);
        return await importador.Analizar(contenido, nombre[..Math.Min(nombre.Length, 150)], actor.Usuario.Id, ct);
    }

    public sealed record ConfirmarDto(string Token);

    /// <summary>Guarda en la base el análisis aprobado. Todo o nada.</summary>
    [HttpPost("confirmar"), RequestSizeLimit(1024)]
    public async Task<ResultadoImportacion> Confirmar([FromBody] ConfirmarDto entrada, CancellationToken ct)
    {
        var actor = await ExigirAdministracion(ct);
        TutoriaError.Exigir(!string.IsNullOrWhiteSpace(entrada.Token) && entrada.Token.Length <= 64, "Falta la vista previa que se va a importar.", 400);
        return await importador.Confirmar(entrada.Token, actor, ct);
    }
}
