using System.Security.Cryptography;
using Microsoft.Net.Http.Headers;

namespace TutoriaUNAS.Api.Configuration;

/// <summary>
/// Etiqueta (ETag) las consultas GET de la API con el hash de su contenido. El portal
/// vuelve a pedir el estado periódicamente: si nada cambió, recibe 304 sin cuerpo y no
/// descarga, analiza ni vuelve a pintar los mismos datos. Las respuestas no se guardan en
/// la caché del navegador (<c>no-store</c>): el cliente conserva su copia en memoria.
/// </summary>
public sealed class EtiquetaRespuestaApi(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext http)
    {
        var original = http.Response.Body;
        await using var buffer = new MemoryStream();
        http.Response.Body = buffer;
        try { await next(http); }
        finally { http.Response.Body = original; }

        var response = http.Response;
        if (response.StatusCode == StatusCodes.Status200OK && buffer.Length > 0 &&
            response.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true)
        {
            buffer.Position = 0;
            var etag = new EntityTagHeaderValue("\"" + Convert.ToBase64String(await SHA256.HashDataAsync(buffer, http.RequestAborted))[..27] + "\"", isWeak: true);
            response.Headers.ETag = etag.ToString();
            if (!response.Headers.ContainsKey(HeaderNames.CacheControl)) response.Headers.CacheControl = "no-store";
            if (EntityTagHeaderValue.TryParseList(http.Request.Headers.IfNoneMatch, out var recibidas) &&
                recibidas.Any(r => r.Compare(etag, useStrongComparison: false)))
            {
                response.StatusCode = StatusCodes.Status304NotModified;
                response.ContentLength = null;
                return;
            }
        }
        buffer.Position = 0;
        if (response.StatusCode != StatusCodes.Status304NotModified && buffer.Length > 0)
            await buffer.CopyToAsync(original, http.RequestAborted);
    }
}
