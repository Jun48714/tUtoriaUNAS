using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Correo;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services.Accounts;

public interface ICorreoCuentaSender
{
    Task Enviar(string destinatario, string asunto, string contenido, CancellationToken ct);
    /// <summary>Envía la versión HTML (plantilla Postal) con sus imágenes incrustadas; quien no la soporte envía el texto.</summary>
    Task Enviar(string destinatario, string asunto, string contenido, CorreoHtml? html, CancellationToken ct) => Enviar(destinatario, asunto, contenido, ct);
}

/// <summary>Adaptador SMTP aislado: STARTTLS obligatorio, validación TLS del sistema y secreto protegido.</summary>
public sealed class SmtpCuentaSender(IOptions<SmtpCuentaOptions> options, IDataProtectionProvider protection) : ICorreoCuentaSender
{
    public const string SecretPurpose = "TutoriaUNAS.Smtp.Password.v1";
    public Task Enviar(string destinatario, string asunto, string contenido, CancellationToken ct) => Enviar(destinatario, asunto, contenido, null, ct);
    public async Task Enviar(string destinatario, string asunto, string contenido, CorreoHtml? html, CancellationToken ct)
    {
        var smtp = options.Value;
        if (smtp.Host.Length == 0 || smtp.Port != 587 || smtp.Usuario.Length == 0 || smtp.Remitente.Length == 0 || (smtp.PasswordFile.Length == 0 && smtp.Password.Length == 0))
            throw new InvalidOperationException("SMTP de cuentas no configurado.");
        string password;
        if (smtp.Password.Length > 0) password = smtp.Password.Replace(" ", "", StringComparison.Ordinal);
        else
        {
            var protectedValue = System.Text.Json.JsonSerializer.Deserialize<string>(await File.ReadAllTextAsync(smtp.PasswordFile, ct)) ?? throw new InvalidOperationException("Secreto SMTP no configurado.");
            password = protection.CreateProtector(SecretPurpose).Unprotect(protectedValue);
        }
        using var message = new MailMessage { From = new MailAddress(smtp.Remitente, smtp.Nombre, Encoding.UTF8),
            Subject = asunto, Body = contenido, BodyEncoding = Encoding.UTF8, SubjectEncoding = Encoding.UTF8, IsBodyHtml = false };
        message.To.Add(new MailAddress(destinatario));
        if (html is not null)
        {   // Texto y HTML como alternativas; las imágenes viajan dentro del mensaje (cid:).
            message.Body = null;
            message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(contenido, Encoding.UTF8, "text/plain"));
            var vista = AlternateView.CreateAlternateViewFromString(html.Html, Encoding.UTF8, "text/html");
            foreach (var r in html.Recursos)
                vista.LinkedResources.Add(new LinkedResource(new MemoryStream(r.Datos), r.TipoMime) { ContentId = r.Id });
            message.AlternateViews.Add(vista);
        }
        using var client = new SmtpClient(smtp.Host, smtp.Port) { EnableSsl = true, UseDefaultCredentials = false,
            Credentials = new NetworkCredential(smtp.Usuario, password), DeliveryMethod = SmtpDeliveryMethod.Network };
        await client.SendMailAsync(message, ct);
    }
}

public sealed class ColaCorreoCuenta(TutoriaDbContext db, IDataProtectionProvider protection, TimeProvider clock)
{
    public const string Purpose = "TutoriaUNAS.AccountMail.v1";
    /// <param name="plantilla">Versión con la plantilla Postal; <paramref name="cuerpo"/> queda como texto alternativo.</param>
    public void Agregar(string destinatario, string asunto, string cuerpo, DateTimeOffset caduca, string? usuario = null, string? reto = null, MensajeCorreo? plantilla = null)
    {
        var ahora = clock.GetUtcNow();
        var contenido = plantilla is null ? cuerpo : PlantillaCorreo.Serializar(cuerpo, plantilla);
        db.CorreosCuenta.Add(new() { Id = "MAIL-" + Guid.NewGuid().ToString("N"), UsuarioId = usuario, RetoId = reto,
            Destinatario = destinatario, Asunto = asunto, ContenidoProtegido = protection.CreateProtector(Purpose).Protect(contenido),
            Creado = ahora, Caduca = caduca, ProximoIntento = ahora });
    }
    /// <summary>Primer nombre de la persona para el saludo de la postal; null si no hay ficha.</summary>
    public async Task<string?> NombreDe(string? personaId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(personaId)) return null;
        return PrimerNombre(await db.Personas.AsNoTracking().Where(p => p.Id == personaId).Select(p => p.DatosJson).SingleOrDefaultAsync(ct));
    }
    public static string? PrimerNombre(string? datosJson)
    {
        var nombre = datosJson is null ? "" : JsonDatos.Texto(datosJson, "nombres").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        return nombre.Length == 0 ? null : CultureInfo.GetCultureInfo("es-PE").TextInfo.ToTitleCase(nombre.ToLowerInvariant());
    }
    public const string AsuntoBaja = "Tu cuenta fue deshabilitada · Tutoría UNAS";
    public const string AsuntoRehabilitada = "Tu cuenta fue rehabilitada · Tutoría UNAS";
    public const string AsuntoHabilitada = "Tu cuenta fue habilitada · Tutoría UNAS";

    private static string Perfil(string rol) => rol == "tutor" ? "docente" : rol == "coordinacion" ? "coordinación" : "estudiante";
    /// <summary>Un solo aviso del mismo tipo por hora y cuenta: alternar el estado no debe servir para enviar correos repetidos.</summary>
    private async Task<bool> YaAvisado(string usuarioId, string asunto, DateTimeOffset ahora, CancellationToken ct) =>
        await db.CorreosCuenta.AnyAsync(m => m.UsuarioId == usuarioId && m.Asunto == asunto && m.Creado > ahora.AddHours(-1), ct);

    /// <summary>
    /// Avisa a la persona afectada que coordinación deshabilitó su cuenta. Es el único mensaje que recibe desde ese momento:
    /// el despachador cancela cualquier otro que estuviera en cola (la baja no vuelve a recibir códigos ni recordatorios).
    /// </summary>
    public async Task AvisarBaja(UsuarioEntity usuario, CancellationToken ct)
    {
        var cred = await db.CredencialesCuenta.AsNoTracking().SingleOrDefaultAsync(c => c.UsuarioId == usuario.Id, ct);
        if (cred is null) return;
        var ahora = clock.GetUtcNow();
        if (await YaAvisado(usuario.Id, AsuntoBaja, ahora, ct)) return;
        Agregar(cred.CorreoNormalizado, AsuntoBaja,
            $"Coordinación deshabilitó tu acceso a Tutoría UNAS (perfil {Perfil(usuario.Rol)}).\n\nMientras la cuenta esté deshabilitada no podrás iniciar sesión ni recibirás avisos del sistema. Este es el único mensaje que recibirás por este motivo.\n\nSi crees que se trata de un error, comunícate con la coordinación de tu escuela.\n\nTutoría UNAS",
            ahora.AddDays(1), usuario.Id, plantilla: new MensajeCorreo("baja", null, "Coordinación deshabilitó tu acceso. Si crees que es un error, comunícate con tu escuela."));
    }

    /// <summary>
    /// Avisa que la cuenta quedó habilitada. <paramref name="rehabilitada"/>: se vuelve a habilitar tras una baja; si no, es la
    /// primera habilitación (por ejemplo, al vincular al docente con su escuela). Solo cuentas verificadas: las pendientes
    /// de activar reciben su acceso temporal por otro camino.
    /// </summary>
    public async Task AvisarHabilitacion(UsuarioEntity usuario, string urlAcceso, bool rehabilitada, CancellationToken ct)
    {
        var asunto = rehabilitada ? AsuntoRehabilitada : AsuntoHabilitada;
        var cred = await db.CredencialesCuenta.AsNoTracking().SingleOrDefaultAsync(c => c.UsuarioId == usuario.Id, ct);
        if (cred is null || !cred.Verificada || cred.CambioObligatorio) return;
        var ahora = clock.GetUtcNow();
        if (await YaAvisado(usuario.Id, asunto, ahora, ct)) return;
        var intro = rehabilitada
            ? $"Coordinación volvió a habilitar tu acceso a Tutoría UNAS (perfil {Perfil(usuario.Rol)})."
            : $"Coordinación habilitó tu acceso a Tutoría UNAS (perfil {Perfil(usuario.Rol)}).";
        Agregar(cred.CorreoNormalizado, asunto,
            $"{intro}\n\nIngresa en {urlAcceso} con tu correo y tu contraseña de siempre. Si no la recuerdas, usa «¿Olvidaste tu clave?» en esa página.\n\nSi no esperabas este mensaje, comunícate con la coordinación de tu escuela. No compartas tu contraseña con nadie.\n\nTutoría UNAS",
            ahora.AddDays(1), usuario.Id, plantilla: new MensajeCorreo(rehabilitada ? "rehabilitada" : "habilitada", null,
                (rehabilitada ? "Coordinación volvió a habilitar tu acceso." : "Coordinación habilitó tu acceso.") + " Ingresa con tu contraseña de siempre.",
                Boton: "Ingresar", Enlace: urlAcceso));
    }
    public const string AsuntoCoordinador = "Fuiste designado coordinador de escuela · Tutoría UNAS";
    public const string AsuntoCoordinadorRetirado = "Ya no eres coordinador de escuela · Tutoría UNAS";
    /// <summary>Avisa al docente que la administración lo designó (o le retiró) el monitoreo de su escuela.</summary>
    public async Task AvisarCoordinador(UsuarioEntity usuario, bool designado, string urlAcceso, CancellationToken ct)
    {
        var asunto = designado ? AsuntoCoordinador : AsuntoCoordinadorRetirado;
        var cred = await db.CredencialesCuenta.AsNoTracking().SingleOrDefaultAsync(c => c.UsuarioId == usuario.Id, ct);
        if (cred is null || !cred.Verificada) return;
        var ahora = clock.GetUtcNow();
        if (await YaAvisado(usuario.Id, asunto, ahora, ct)) return;
        var cuerpo = designado
            ? $"La administración te designó coordinador de escuela en Tutoría UNAS. Además de tu panel de docente, ahora tienes el módulo «Monitoreo de escuela» (solo lectura): avance de estudiantes y docentes, formatos y derivaciones de tu escuela.\n\nVuelve a iniciar sesión para verlo: {urlAcceso}\n\nTutoría UNAS"
            : $"La administración retiró tu designación como coordinador de escuela. Sigues con tu panel de docente tutor.\n\nTutoría UNAS";
        var plantilla = designado
            ? new MensajeCorreo("coordinador", null, "Ahora puedes ver el monitoreo de tu escuela. Vuelve a iniciar sesión para verlo.", Boton: "Ver el monitoreo", Enlace: urlAcceso)
            : new MensajeCorreo("coordinador-retirado", null, "Sigues con tu panel de docente tutor.");
        Agregar(cred.CorreoNormalizado, asunto, cuerpo, ahora.AddDays(1), usuario.Id, plantilla: plantilla);
    }
    public async Task CancelarRetos(string correo, string proposito, DateTimeOffset ahora, CancellationToken ct)
    {
        var anteriores = await db.RetosCorreo.Where(r => r.Correo == correo && r.Proposito == proposito && r.Consumido == null).ToArrayAsync(ct);
        var ids = anteriores.Select(r => r.Id).ToArray();
        foreach (var reto in anteriores) { reto.Consumido = ahora; reto.TicketHash = null; }
        foreach (var pendiente in await db.CorreosCuenta.Where(m => ids.Contains(m.RetoId!) && m.Enviado == null && m.Cancelado == null).ToArrayAsync(ct))
        { pendiente.Cancelado = ahora; pendiente.ContenidoProtegido = ""; }
    }
}

/// <summary>Outbox con arrendamiento recuperable, reintentos y exclusión entre procesos PostgreSQL.</summary>
public sealed class DespachadorCorreoCuenta(IServiceScopeFactory scopes, ILogger<DespachadorCorreoCuenta> logger) : BackgroundService
{
    public static async Task<bool> Procesar(IServiceProvider services, CancellationToken ct = default)
    {
        var db = services.GetRequiredService<TutoriaDbContext>();
        var clock = services.GetRequiredService<TimeProvider>();
        var ahora = clock.GetUtcNow();
        CorreoCuentaEntity? mail;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var pendientes = await db.CorreosCuenta.FromSqlInterpolated($"""
                SELECT * FROM "CorreosCuenta" WHERE "Enviado" IS NULL AND "Cancelado" IS NULL
                AND "Intentos" < 5 AND "ProximoIntento" <= {ahora}
                AND ("BloqueoHasta" IS NULL OR "BloqueoHasta" <= {ahora})
                ORDER BY "ProximoIntento", "Id" LIMIT 1 FOR UPDATE SKIP LOCKED
                """).ToArrayAsync(ct);
            mail = pendientes.SingleOrDefault();
            if (mail is null) { await tx.CommitAsync(ct); return false; }
            if (mail.Caduca <= ahora) { mail.Cancelado = ahora; mail.ContenidoProtegido = ""; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true; }
            mail.BloqueoHasta = ahora.AddMinutes(2); mail.Intentos++;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        if (mail.Asunto != ColaCorreoCuenta.AsuntoBaja && await BajaCorreo.Consultar(db, mail.Destinatario, ct))
        {
            // Se deshabilitó la cuenta o se dio de baja la ficha mientras el mensaje esperaba: no se envía.
            mail.Cancelado = clock.GetUtcNow(); mail.ContenidoProtegido = ""; mail.BloqueoHasta = null;
            await db.SaveChangesAsync(ct);
            return true;
        }
        try
        {
            var (texto, plantilla) = PlantillaCorreo.Leer(services.GetRequiredService<IDataProtectionProvider>().CreateProtector(ColaCorreoCuenta.Purpose).Unprotect(mail.ContenidoProtegido));
            var html = plantilla is null ? null : PlantillaCorreo.Renderizar(plantilla, mail.Asunto);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(45));
            await services.GetRequiredService<ICorreoCuentaSender>().Enviar(mail.Destinatario, mail.Asunto, texto, html, timeout.Token);
            mail.Enviado = clock.GetUtcNow(); mail.Error = null; mail.ContenidoProtegido = "";
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex) when (ex is SmtpException or HttpRequestException or System.Text.Json.JsonException or KeyNotFoundException or IOException or UnauthorizedAccessException or FormatException or InvalidOperationException or System.Security.Cryptography.CryptographicException or OperationCanceledException)
        {
            // No guardar errores del proveedor: pueden contener correos, códigos o credenciales.
            mail.Error = "No se pudo entregar al servidor de correo.";
            mail.ProximoIntento = clock.GetUtcNow().AddSeconds(Math.Min(120, 10 * Math.Pow(2, mail.Intentos)));
            if (mail.Intentos >= 5) { mail.Cancelado = clock.GetUtcNow(); mail.ContenidoProtegido = ""; }
        }
        mail.BloqueoHasta = null;
        await db.SaveChangesAsync(ct);
        return true;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                if (await Procesar(scope.ServiceProvider, stoppingToken)) continue;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) when (ex is System.Data.Common.DbException or DbUpdateException)
            { logger.LogWarning("La cola de correo espera a PostgreSQL; se reintentará sin perder los mensajes."); }
            try { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
