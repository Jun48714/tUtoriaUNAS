using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;

namespace TutoriaUNAS.Api.Services.Accounts;

/// <summary>
/// Límite de inicios de sesión <b>fallidos</b> por IP y minuto. Los aciertos no consumen cupo: cientos de alumnos que
/// entran a la vez desde el WiFi del campus (una sola IP pública) no se bloquean entre sí, mientras que quien prueba
/// contraseñas desde una misma red sí queda frenado. El bloqueo de cada cuenta tras 10 fallos es independiente.
/// </summary>
public sealed class LimiteLoginsFallidos(IOptions<CuentasOptions> opciones) : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limite = PartitionedRateLimiter.Create<string, string>(ip =>
        RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = opciones.Value.IpLoginsPorMinuto,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));

    /// <summary>Verdadero si la IP ya agotó sus fallos del minuto (consultar no consume cupo).</summary>
    public bool Bloqueada(string ip)
    {
        using var consulta = _limite.AttemptAcquire(ip, 0);
        return !consulta.IsAcquired;
    }

    public void RegistrarFallo(string ip)
    {
        using var _ = _limite.AttemptAcquire(ip, 1);
    }

    public void Dispose() => _limite.Dispose();
}
