using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Controllers;

[ApiController]
[Route("api/access")]
[Authorize(Policy = RoleNames.TutoringAccessPolicy)]
public sealed class AccessController(TutoriaContext context) : ControllerBase
{
    [HttpGet("me")]
    [ProducesResponseType<CurrentIdentityDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<CurrentIdentityDto>> GetIdentity(CancellationToken ct)
    {
        // Solo se confirma la identidad de una cuenta vigente: una revocación o un cambio de
        // habilitación invalida también esta consulta, igual que el resto de la API.
        await context.Actor(ct);
        var subject = User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(subject)) return Forbid();
        var roles = User.FindAll("role").Select(claim => claim.Value).ToArray();
        return Ok(new CurrentIdentityDto(subject, roles));
    }
}
