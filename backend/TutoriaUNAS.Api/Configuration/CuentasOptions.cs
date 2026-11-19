namespace TutoriaUNAS.Api.Configuration;

public sealed class CuentasOptions
{
    public bool Enabled { get; init; }
    public bool DisableDispatcher { get; init; }
    public int IpCodigosPorMinuto { get; init; } = 5;
    public int IpVerificacionesPorMinuto { get; init; } = 20;
    public string[] Dominios { get; init; } = ["unas.edu.pe"];
    /// <summary>Modo prueba: permite entrar con el código de la semilla (DOC-0421, 2023010456, coordinacion.tutoria).
    /// Solo resuelve el alias a la cuenta del portal; la contraseña se sigue verificando.</summary>
    public bool AliasPrueba { get; init; }
    /// <summary>La pantalla dice de inmediato si el correo existe o no (crear cuenta y recuperar contraseña).
    /// Facilita el uso pero permite saber qué correos tienen cuenta; ponlo en false para respuestas idénticas.</summary>
    public bool RevelarExistencia { get; init; }
    public string CodigoKey { get; init; } = "";
    public string KeyRingPath { get; init; } = "";
    public string UrlAcceso { get; init; } = "http://127.0.0.1:5173/login";
    public bool Valida()
    {
        if (!Enabled) return true;
        try { return Convert.FromBase64String(CodigoKey).Length >= 32 && Dominios.Length > 0 && IpCodigosPorMinuto is >= 1 and <= 100 && IpVerificacionesPorMinuto is >= 1 and <= 200 &&
            Uri.TryCreate(UrlAcceso, UriKind.Absolute, out var url) && (url.Scheme == "https" || (url.Scheme == "http" && url.IsLoopback)); }
        catch (FormatException) { return false; }
    }
}
/// <summary>Envío por Microsoft Graph. El secreto llega solo por variable de entorno (GraphCuentas__ClientSecret).</summary>
public sealed class GraphCuentaOptions
{
    public string TenantId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string ClientSecret { get; init; } = "";
    public string Remitente { get; init; } = "";
    /// <summary>Nombre que ve quien recibe el correo como remitente.</summary>
    public string Nombre { get; init; } = "Tutoría UNAS Notificaciones";
    public bool Configurado => Guid.TryParse(TenantId, out _) && Guid.TryParse(ClientId, out _) && ClientSecret.Length > 0 &&
        System.Net.Mail.MailAddress.TryCreate(Remitente, out var m) && m.Address == Remitente;
}

public sealed class SmtpCuentaOptions
{
    public string Host { get; init; } = "smtp.gmail.com";
    public int Port { get; init; } = 587;
    public string Usuario { get; init; } = "";
    public string Remitente { get; init; } = "";
    public string Nombre { get; init; } = "Tutoría UNAS";
    public string PasswordFile { get; init; } = "";
    /// <summary>Contraseña SMTP directa (variable de entorno o Docker secret montado como configuración).
    /// Úsala en Linux/Docker, donde no existe DPAPI. Si está vacía se usa PasswordFile.</summary>
    public string Password { get; init; } = "";
}

/// <summary>Recordatorios por correo de pendientes. Modo: off | simulacion (solo cuenta y registra) | activo (envía).</summary>
public sealed class RecordatoriosOptions
{
    public string Modo { get; init; } = "off";
    /// <summary>Hora de Lima (UTC-5) a partir de la cual se ejecuta el barrido diario.</summary>
    public int HoraLima { get; init; } = 8;
    /// <summary>Plazo en días desde el primer aviso de cada pendiente.</summary>
    public int DiasPlazo { get; init; } = 7;
    /// <summary>Días mínimos entre dos correos a la misma persona.</summary>
    public int FrecuenciaDias { get; init; } = 3;
    /// <summary>Recordatorios máximos por pendiente; después se deja de insistir.</summary>
    public int MaxAvisosPorPendiente { get; init; } = 4;
    /// <summary>Con cuántos días de anticipación al cierre se avisa de los informes del docente (F02 y F09).</summary>
    public int DiasAntesInformes { get; init; } = 14;
}
