using System.Diagnostics;
using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Services.Accounts;

namespace TutoriaUNAS.Api.Services;

/// <summary>
/// Recorre una vez, en segundo plano y solo en lectura, la ruta del estado de cada rol y el hash de contraseñas.
/// Sin esto el primer inicio de sesión tras arrancar paga la compilación JIT, el modelo de EF y las ~38 consultas
/// sin compilar (medido: login 557 ms y estado 760 ms en frío frente a 159 y 62 ms en caliente).
/// No expone nada ni escribe: el resultado se descarta y cualquier fallo solo se registra.
/// </summary>
public sealed class PrecalentamientoApi(IServiceScopeFactory scopes, ILogger<PrecalentamientoApi> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Yield(); // el arranque y la disponibilidad de la API no esperan este recorrido
        var reloj = Stopwatch.StartNew();
        try
        {
            await using (var scope = scopes.CreateAsyncScope())
                _ = scope.ServiceProvider.GetRequiredService<IPasswordHasher<CredencialCuentaEntity>>().HashPassword(new(), "precalentamiento");
            foreach (var rol in new[] { "tutor", "estudiante", "coordinacion" })
                try { await RecorrerEstado(rol, ct); }
                catch (Exception e) when (e is not OperationCanceledException) { logger.LogWarning(e, "No se pudo precalentar el estado de {Rol}.", rol); }
            logger.LogInformation("API precalentada en {Ms} ms.", reloj.ElapsedMilliseconds);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            logger.LogWarning(e, "No se pudo precalentar la API; el primer acceso será más lento.");
        }
    }

    private async Task RecorrerEstado(string rol, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<TutoriaDbContext>();
        // Mismas condiciones que TutoriaContext.Actor: una cuenta sin verificar haría fallar el recorrido.
        var usuario = await db.Usuarios.AsNoTracking().Where(u => u.Activo && u.Rol == rol && u.EscuelaId != "" &&
            (u.Issuer != SeguridadCuenta.Issuer || db.CredencialesCuenta.Any(c => c.UsuarioId == u.Id && c.Verificada && !c.CambioObligatorio)))
            .OrderBy(u => u.Id).FirstOrDefaultAsync(ct);
        if (usuario is null) return;
        var identidad = new ClaimsIdentity(new[] { new Claim("sub", usuario.Subject), new Claim("iss", usuario.Issuer), new Claim("role", usuario.Rol),
            new Claim("access_version", usuario.Version.ToString(CultureInfo.InvariantCulture)) }, "Precalentamiento", "sub", "role");
        var accessor = sp.GetRequiredService<IHttpContextAccessor>();
        accessor.HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identidad), RequestServices = sp };
        try { _ = await sp.GetRequiredService<EstadoTutoriaService>().Obtener(ct); }
        finally { accessor.HttpContext = null; }
    }
}
