using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Controllers;

[ApiController, Route("api/formatos"), Authorize(Policy = RoleNames.TutoringAccessPolicy), RequestSizeLimit(256_000)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class FormatosController(EditorFormatosService editor) : ControllerBase
{
    [HttpGet("{codigo}/editor")]
    public Task<EditorFormatoDto> Leer(string codigo, CancellationToken ct) => editor.Leer(codigo, ct);
    [HttpPut("{codigo}/borrador")]
    public Task<EditorFormatoDto> Guardar(string codigo, GuardarFormatoInput input, CancellationToken ct) => editor.Guardar(codigo, input, ct);
    [HttpPost("{codigo}/publicar")]
    public Task<EditorFormatoDto> Publicar(string codigo, PublicarFormatoInput input, CancellationToken ct) => editor.Publicar(codigo, input, ct);
    [HttpGet("{codigo}/versiones/{revision:int}")]
    public Task<JsonElement> Version(string codigo, int revision, CancellationToken ct) => editor.Version(codigo, revision, ct);
}
