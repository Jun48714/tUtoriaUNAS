using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Controllers;

/// <summary>Monitoreo de solo lectura de la escuela (coordinador de escuela y administración con escuela elegida).</summary>
[ApiController, Route("api/monitoreo"), Authorize(Policy = RoleNames.TutoringAccessPolicy)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class MonitoreoController(MonitoreoService monitoreo) : ControllerBase
{
    [HttpGet("escuela")]
    public Task<object> Escuela(CancellationToken ct) => monitoreo.Escuela(ct);
}
