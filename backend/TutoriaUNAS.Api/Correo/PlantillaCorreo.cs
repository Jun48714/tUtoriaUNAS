using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;

namespace TutoriaUNAS.Api.Correo;

/// <summary>
/// Un dato del aviso. Si <see cref="Mono"/> es verdadero (una contraseña temporal) se muestra en su recuadro, como el código;
/// si no, como renglón centrado (tarea y su plazo). <see cref="Alerta"/> pinta la etiqueta en rojo.
/// </summary>
public sealed record RenglonCorreo(string Etiqueta, string Valor, bool Mono = false, bool Alerta = false);

/// <summary>Contenido de un aviso. <see cref="Tipo"/> elige el título (ver <see cref="PlantillaCorreo.Tipos"/>).
/// <see cref="Nombre"/> se conserva por compatibilidad con la cola, pero la plantilla no lo muestra.</summary>
public sealed record MensajeCorreo(string Tipo, string? Nombre, string Texto, IReadOnlyList<RenglonCorreo>? Renglones = null,
    string? Codigo = null, string? Vigencia = null, string? Boton = null, string? Enlace = null, string? Nota = null);

/// <summary>Imagen incrustada en el correo (cid:<see cref="Id"/>): no depende de imágenes externas que Outlook bloquea.</summary>
public sealed record RecursoInline(string Id, string Nombre, string TipoMime, byte[] Datos);
public sealed record CorreoHtml(string Html, IReadOnlyList<RecursoInline> Recursos);

/// <summary>
/// Plantilla única de los correos (Postal, versión blanca): franja de correo aéreo, escudo y «Tutoría UNAS», título en
/// Gabarito y un mensaje corto, todo centrado sobre blanco puro, con botón dorado. Sin datos personales en el cuerpo, salvo
/// el código o la contraseña temporal que el aviso necesita. HTML de tablas y estilos en línea, fluido para el celular y con
/// tabla fija solo para Outlook de escritorio. Imágenes: scripts/correo/generar_recursos.py.
/// </summary>
public static class PlantillaCorreo
{
    public static readonly IReadOnlyDictionary<string, string> Tipos = new Dictionary<string, string>
    {
        ["verificacion"] = "Tu código de verificación",
        ["recuperacion"] = "Tu código para recuperar tu contraseña",
        ["acceso"] = "Tu acceso está listo",
        ["verificada"] = "Tu cuenta quedó verificada",
        ["habilitada"] = "Tu cuenta fue habilitada",
        ["rehabilitada"] = "Tu cuenta vuelve a estar activa",
        ["baja"] = "Tu cuenta fue deshabilitada",
        ["coordinador"] = "Ahora coordinas tu escuela",
        ["coordinador-retirado"] = "Terminó tu designación como coordinador",
        ["pendientes"] = "Tienes actividades pendientes",
        ["cuenta-existente"] = "Ya tienes una cuenta",
        ["sin-cuenta"] = "No encontramos una cuenta activa",
        ["fuera-padron"] = "No te encontramos en el padrón",
        ["prueba"] = "Prueba de envío",
    };

    private const string Cuerpo = "Aptos,'Segoe UI Variable Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    private const string Mono = "'JetBrains Mono',Consolas,Menlo,'Courier New',monospace";
    private const string Estilos = """
            <style>
              @media (max-width:520px) {
                .pc-outer { padding:12px 6px !important; }
                .pc-pad { padding-left:18px !important; padding-right:18px !important; }
              }
            </style>
        """;
    private static readonly ConcurrentDictionary<string, byte[]> Cache = new();
    private static readonly Lazy<Dictionary<string, (int Ancho, int Alto)>> Medidas = new(LeerMedidas);

    public static string Serializar(string texto, MensajeCorreo plantilla) =>
        JsonSerializer.Serialize(new Sobre(1, texto, plantilla), JsonSerializerOptions.Web);

    /// <summary>Lee lo que guarda la cola: un sobre con texto y plantilla, o texto plano de mensajes anteriores.</summary>
    public static (string Texto, MensajeCorreo? Plantilla) Leer(string contenido)
    {
        if (!contenido.StartsWith("{\"v\":1", StringComparison.Ordinal)) return (contenido, null);
        var sobre = JsonSerializer.Deserialize<Sobre>(contenido, JsonSerializerOptions.Web) ?? throw new JsonException("Sobre vacío.");
        return (sobre.Texto, sobre.Plantilla);
    }
    private sealed record Sobre(int V, string Texto, MensajeCorreo Plantilla);

    public static CorreoHtml Renderizar(MensajeCorreo m, string asunto)
    {
        if (!Tipos.TryGetValue(m.Tipo, out var titulo)) throw new KeyNotFoundException("Tipo de correo desconocido.");
        static string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var (anchoMarca, altoMarca) = Medidas.Value["marca"];
        var (anchoTitulo, altoTitulo) = Medidas.Value["titulo-" + m.Tipo];

        static string Boton(string texto, string enlace) => $"""
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0"><tr>
              <td bgcolor="#e9a400" style="background:#e9a400;border:2px solid #0b2e19;border-radius:8px;box-shadow:3px 3px 0 #0b2e19">
                <a href="{E(enlace)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:{Cuerpo};font-size:15px;font-weight:800;color:#1d1400;text-decoration:none">{E(texto)}</a>
              </td></tr></table>
            """;
        // Recuadro centrado con borde punteado para lo que se copia: el código o la contraseña temporal.
        static string Recuadro(string etiqueta, string valor, int tamano, int espacio) => $"""
            <p style="margin:22px 0 6px;font-size:11.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#5b7363;text-align:center">{E(etiqueta)}</p>
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
              <td bgcolor="#eaf6ec" style="background:#eaf6ec;border:2px dashed #2b7d3c;border-radius:12px;padding:12px {12 + espacio / 2}px 12px {12 + espacio}px;text-align:center">
                <span style="font-family:{Mono};font-size:{tamano}px;line-height:1;font-weight:700;letter-spacing:{espacio}px;color:#0e5a32;white-space:nowrap">{E(valor)}</span>
              </td></tr></table>
            """;

        var h = new StringBuilder(7000);
        h.Append($"""
            <!doctype html>
            <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{E(asunto)}</title>
            {Estilos}</head>
            <body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0">{E(m.Texto)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff">
            <tr><td class="pc-outer" align="center" style="padding:24px 12px">
            <!--[if mso]><table role="presentation" width="580" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
            <div style="max-width:580px;margin:0 auto">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background:#ffffff">
            <tr><td style="line-height:0;font-size:0">
              <!--[if mso]><img src="cid:franja" width="580" height="8" alt="" style="display:block;border:0"><![endif]-->
              <!--[if !mso]><!--><img src="cid:franja" alt="" style="display:block;width:100%;height:8px;border:0;border-radius:4px"><!--<![endif]-->
            </td></tr>
            <tr><td class="pc-pad" align="center" style="padding:26px 28px 0;text-align:center;font-family:{Cuerpo}">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
                <td valign="middle" style="padding-right:12px"><img src="cid:escudo" width="46" height="54" alt="Escudo UNAS" style="display:block;border:0"></td>
                <td valign="middle" align="left" style="text-align:left">
                  <img src="cid:marca" width="{anchoMarca}" height="{altoMarca}" alt="Tutoría UNAS" style="display:block;width:100%;max-width:{anchoMarca}px;height:auto;border:0;font-family:{Cuerpo};font-size:26px;font-weight:800;color:#0e5a32">
                  <div style="margin-top:4px;font-size:12px;line-height:1.3;color:#5b7363">Universidad Nacional Agraria de la Selva</div>
                </td>
              </tr></table>
            </td></tr>
            <tr><td class="pc-pad" style="padding:22px 28px 0"><div style="border-top:2px dashed #d6e2d8;font-size:0;line-height:0">&nbsp;</div></td></tr>
            <tr><td class="pc-pad" align="center" style="padding:26px 28px 30px;text-align:center;font-family:{Cuerpo};color:#2f4437">
              <img src="cid:titulo" width="{anchoTitulo}" height="{altoTitulo}" alt="{E(titulo)}" style="display:block;margin:0 auto;border:0;width:100%;max-width:{anchoTitulo}px;height:auto;font-family:{Cuerpo};font-size:24px;font-weight:800;color:#0b2e19">
              <p style="margin:14px auto 0;max-width:440px;font-size:15.5px;line-height:1.6;color:#2f4437;text-align:center">{E(m.Texto)}</p>
            """);

        if (m.Codigo is not null)
        {
            // Botón «Copiar código» (abre una página nuestra que lo copia) y, debajo, el código sin espacios.
            if (m.Boton is not null && m.Enlace is not null) h.Append(Boton(m.Boton, m.Enlace));
            h.Append(Recuadro("Tu código", m.Codigo, 34, 10));
        }
        foreach (var r in m.Renglones?.Where(r => r.Mono) ?? []) h.Append(Recuadro(r.Etiqueta, r.Valor, 20, 2));
        if (m.Vigencia is not null)
            h.Append($"""<p style="margin:10px 0 0;font-size:13px;font-weight:700;line-height:1.5;color:#7a5600;text-align:center">Vence en {E(m.Vigencia)}</p>""");
        foreach (var r in m.Renglones?.Where(r => !r.Mono) ?? [])
            h.Append($"""
                <p style="margin:16px auto 0;max-width:440px;text-align:center;line-height:1.45">
                  <span style="font-size:15px;font-weight:700;color:#11261a">{E(r.Valor)}</span><br>
                  <span style="font-size:11.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:{(r.Alerta ? "#a3302b" : "#5b7363")}">{E(r.Etiqueta)}</span>
                </p>
                """);
        if (m.Codigo is null && m.Boton is not null && m.Enlace is not null) h.Append(Boton(m.Boton, m.Enlace));
        if (m.Nota is not null)
            h.Append($"""<p style="margin:24px auto 0;max-width:420px;font-size:12.5px;line-height:1.6;color:#617868;text-align:center">{E(m.Nota)}</p>""");
        h.Append($"""
              <p style="margin:20px 0 0;font-size:13.5px;line-height:1.5;color:#2f4437;text-align:center"><b style="color:#11261a">Coordinación de Tutoría · UNAS</b></p>
            </td></tr>
            </table>
            </div>
            <!--[if mso]></td></tr></table><![endif]-->
            <p style="max-width:580px;margin:6px auto 0;padding:0 8px;font-family:{Cuerpo};font-size:11.5px;line-height:1.6;color:#8a9a8f;text-align:center">Universidad Nacional Agraria de la Selva · Tingo María<br>Mensaje automático, no respondas a este correo.</p>
            </td></tr></table>
            </body></html>
            """);

        return new(h.ToString(), [
            new("franja", "franja.png", "image/png", Recurso("franja.png")),
            new("escudo", "escudo.png", "image/png", Recurso("escudo.png")),
            new("marca", "marca.png", "image/png", Recurso("marca.png")),
            new("titulo", $"titulo-{m.Tipo}.png", "image/png", Recurso($"titulo-{m.Tipo}.png")),
        ]);
    }

    /// <summary>Un ejemplo ficticio de cada aviso, para revisar la plantilla en un buzón real (--probar-correo --plantillas) y en las pruebas.</summary>
    public static IEnumerable<(string Asunto, MensajeCorreo Mensaje)> Ejemplos(string url) =>
    [
        ("Verifica tu cuenta · Tutoría UNAS", new("verificacion", null, "Ingresa este código en Tutoría UNAS para verificar tu cuenta.", Codigo: "482915", Vigencia: "10 minutos", Boton: "Copiar código", Enlace: EnlaceCopiar(url, "482915"), Nota: "Si no lo pediste, ignora este correo.")),
        ("Recupera tu contraseña · Tutoría UNAS", new("recuperacion", null, "Ingresa este código para elegir una contraseña nueva.", Codigo: "730264", Vigencia: "10 minutos", Boton: "Copiar código", Enlace: EnlaceCopiar(url, "730264"), Nota: "Si no lo pediste, ignora este correo.")),
        ("Tu acceso temporal · Tutoría UNAS", new("acceso", null, "Coordinación creó tu cuenta. Entra con esta contraseña temporal y luego elige la tuya.", [new("Contraseña temporal", "UNAS-7F3A9C21B4D8", Mono: true)], Vigencia: "48 horas", Boton: "Ir a Tutoría UNAS", Enlace: url, Nota: "No la compartas con nadie.")),
        ("Cuenta verificada · Tutoría UNAS", new("verificada", null, "Tu cuenta está lista. Ya puedes ingresar.", Boton: "Ingresar", Enlace: url)),
        ("Tu cuenta fue habilitada · Tutoría UNAS", new("habilitada", null, "Coordinación habilitó tu acceso. Ingresa con tu contraseña de siempre.", Boton: "Ingresar", Enlace: url)),
        ("Tu cuenta fue rehabilitada · Tutoría UNAS", new("rehabilitada", null, "Coordinación volvió a habilitar tu acceso. Ingresa con tu contraseña de siempre.", Boton: "Ingresar", Enlace: url)),
        ("Tu cuenta fue deshabilitada · Tutoría UNAS", new("baja", null, "Coordinación deshabilitó tu acceso. Si crees que es un error, comunícate con tu escuela.")),
        ("Fuiste designado coordinador de escuela · Tutoría UNAS", new("coordinador", null, "Ahora puedes ver el monitoreo de tu escuela. Vuelve a iniciar sesión para verlo.", Boton: "Ver el monitoreo", Enlace: url)),
        ("Ya no eres coordinador de escuela · Tutoría UNAS", new("coordinador-retirado", null, "Sigues con tu panel de docente tutor.")),
        ("Tienes actividades pendientes · Tutoría UNAS", new("pendientes", null, "Tienes tareas por completar en Tutoría UNAS.",
            [new("Venció el 25 nov", "Evaluación de la sesión", Alerta: true), new("Vence hoy", "Entrevista inicial", Alerta: true), new("Vence el 4 dic", "Ficha de seguimiento")], Boton: "Completar ahora", Enlace: url)),
        ("Ya tienes una cuenta · Tutoría UNAS", new("cuenta-existente", null, "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.", Boton: "Iniciar sesión", Enlace: url, Nota: "Si no lo pediste, ignora este correo.")),
        ("Recuperación de contraseña · Tutoría UNAS", new("sin-cuenta", null, "No hay una cuenta activa con este correo. Créala o comunícate con coordinación.", Boton: "Crear mi cuenta", Enlace: url, Nota: "Si no lo pediste, ignora este correo.")),
        ("Solicitud de cuenta · Tutoría UNAS", new("fuera-padron", null, "No figuras en el padrón. Pide a la coordinación de tu escuela que revise tu registro.", Nota: "Si no lo pediste, ignora este correo.")),
    ];

    /// <summary>Página del portal que copia el código al portapapeles. El código va después de «#»: no llega al servidor.</summary>
    public static string? EnlaceCopiar(string urlAcceso, string codigo) =>
        Uri.TryCreate(urlAcceso, UriKind.Absolute, out var u) && u.Scheme is "https" or "http"
            ? u.GetLeftPart(UriPartial.Authority) + "/copiar-codigo.html#" + codigo : null;

    public static byte[] Recurso(string nombre) => Cache.GetOrAdd(nombre, n =>
    {
        using var s = typeof(PlantillaCorreo).Assembly.GetManifestResourceStream("TutoriaUNAS.Api.Correo.Recursos." + n)
            ?? throw new FileNotFoundException("Falta el recurso de correo " + n);
        using var m = new MemoryStream(); s.CopyTo(m); return m.ToArray();
    });

    private static Dictionary<string, (int, int)> LeerMedidas() =>
        Encoding.UTF8.GetString(Recurso("medidas.txt")).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(l => l.Split(' ')).ToDictionary(p => p[0], p => (int.Parse(p[1], CultureInfo.InvariantCulture), int.Parse(p[2], CultureInfo.InvariantCulture)));
}
