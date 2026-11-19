using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;

namespace TutoriaUNAS.Api.Services.Accounts;

/// <summary>Token de Microsoft Graph solo en memoria: se renueva al vencer y nunca se escribe en disco ni en logs.</summary>
public sealed class GraphTokenCache
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private string? _token; private DateTimeOffset _vence;
    public void Invalidar() { _token = null; _vence = default; }
    public async Task<string> Obtener(HttpClient http, GraphCuentaOptions o, TimeProvider clock, CancellationToken ct)
    {
        if (_token is not null && _vence > clock.GetUtcNow().AddMinutes(5)) return _token;
        await _lock.WaitAsync(ct);
        try
        {
            if (_token is not null && _vence > clock.GetUtcNow().AddMinutes(5)) return _token;
            using var req = new HttpRequestMessage(HttpMethod.Post, $"https://login.microsoftonline.com/{o.TenantId}/oauth2/v2.0/token")
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = o.ClientId, ["client_secret"] = o.ClientSecret,
                    ["scope"] = "https://graph.microsoft.com/.default", ["grant_type"] = "client_credentials",
                }),
            };
            using var res = await http.SendAsync(req, ct);
            // No se propaga el cuerpo de la respuesta: podría reflejar datos de la credencial.
            if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"Microsoft Entra rechazó la autenticación ({(int)res.StatusCode}).");
            using var doc = await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            _token = doc.RootElement.GetProperty("access_token").GetString() ?? throw new InvalidOperationException("Respuesta de token vacía.");
            _vence = clock.GetUtcNow().AddSeconds(doc.RootElement.GetProperty("expires_in").GetInt32());
            return _token;
        }
        finally { _lock.Release(); }
    }
}

/// <summary>Envío por Microsoft Graph (client credentials). Sin SMTP ni autenticación básica.</summary>
public sealed class GraphCuentaSender(IHttpClientFactory httpFactory, IOptions<GraphCuentaOptions> options, GraphTokenCache cache, TimeProvider clock) : ICorreoCuentaSender
{
    public async Task Enviar(string destinatario, string asunto, string contenido, CancellationToken ct)
    {
        var o = options.Value;
        if (!o.Configurado) throw new InvalidOperationException("Microsoft Graph no está configurado.");
        var http = httpFactory.CreateClient("graph-cuentas");
        var payload = JsonSerializer.Serialize(new
        {
            message = new
            {
                subject = asunto,
                from = new { emailAddress = new { address = o.Remitente, name = o.Nombre } },
                body = new { contentType = "Text", content = contenido },
                toRecipients = new[] { new { emailAddress = new { address = destinatario } } },
            },
            saveToSentItems = false,
        });
        for (var intento = 0; ; intento++)
        {
            var token = await cache.Obtener(http, o, clock, ct);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(o.Remitente)}/sendMail")
            { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var res = await http.SendAsync(req, ct);
            if (res.IsSuccessStatusCode) return;
            // Token revocado o vencido antes de tiempo: se pide uno nuevo una sola vez.
            if ((int)res.StatusCode == 401 && intento == 0) { cache.Invalidar(); continue; }
            throw new InvalidOperationException($"Microsoft Graph rechazó el envío ({(int)res.StatusCode}).");
        }
    }
}
