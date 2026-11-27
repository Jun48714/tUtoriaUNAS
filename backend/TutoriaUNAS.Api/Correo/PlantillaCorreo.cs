using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;

namespace TutoriaUNAS.Api.Correo;

/// <summary>Un renglón de datos de la postal: etiqueta en versalitas y valor. <see cref="Alerta"/> pinta la etiqueta en rojo.</summary>
public sealed record RenglonCorreo(string Etiqueta, string Valor, bool Mono = false, bool Alerta = false);

/// <summary>
/// Contenido de un aviso con la plantilla Postal. <see cref="Tipo"/> elige el sello animado y el título (ver
/// <see cref="PlantillaCorreo.Tipos"/>); el resto es texto real del mensaje.
/// </summary>
public sealed record MensajeCorreo(string Tipo, string? Nombre, string Texto, IReadOnlyList<RenglonCorreo>? Renglones = null,
    string? Codigo = null, string? Vigencia = null, string? Boton = null, string? Enlace = null, string? Nota = null);

/// <summary>Imagen incrustada en el correo (cid:<see cref="Id"/>): no depende de imágenes externas que Outlook bloquea.</summary>
public sealed record RecursoInline(string Id, string Nombre, string TipoMime, byte[] Datos);
public sealed record CorreoHtml(string Html, IReadOnlyList<RecursoInline> Recursos);

/// <summary>
/// Plantilla única de los correos: una postal con franja de correo aéreo, escudo y «Tutoría UNAS», un sello con el emoji
/// Fluent animado y matasellos «UNAS · TINGO MARÍA», título, renglones de datos y botón dorado. HTML de tablas y estilos en
/// línea para Outlook. Las imágenes se generan con scripts/correo/generar_recursos.py.
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
    private const string Estilos = """
            <style>
              @media (max-width:520px) {
                .pc-outer { padding:10px 6px !important; }
                .pc-pad { padding-left:16px !important; padding-right:16px !important; }
                .pc-etq { width:108px !important; }
              }
            </style>
        """;
    private const string Mono = "'JetBrains Mono',Consolas,Menlo,'Courier New',monospace";
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
        var saludo = $"""<p style="margin:0;font-size:14.5px;line-height:1.5;color:#5b7363">{(string.IsNullOrWhiteSpace(m.Nombre) ? "Hola:" : $"Hola, {E(m.Nombre)}:")}</p>""";
        var tituloImg = $"""<img src="cid:titulo" width="{anchoTitulo}" height="{altoTitulo}" alt="{E(titulo)}" style="display:block;border:0;margin:6px 0 0;width:100%;max-width:{anchoTitulo}px;height:auto;font-family:{Cuerpo};font-size:24px;font-weight:800;color:#0b2e19">""";
        var h = new StringBuilder(9000);
        h.Append($"""
            <!doctype html>
            <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{E(asunto)}</title>
            {Estilos}</head>
            <body style="margin:0;padding:0;background:#dce8de;-webkit-text-size-adjust:100%">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0">{E(m.Texto)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#dce8de" style="background:#dce8de">
            <tr><td class="pc-outer" align="center" style="padding:24px 12px">
            <!--[if mso]><table role="presentation" width="580" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
            <div style="max-width:580px;margin:0 auto">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffefa" style="width:100%;background:#fffefa;border-radius:6px;border:1px solid #c3d4c6">
            <tr><td style="line-height:0;font-size:0">
              <!--[if mso]><img src="cid:franja" width="580" height="8" alt="" style="display:block;border:0"><![endif]-->
              <!--[if !mso]><!--><img src="cid:franja" alt="" style="display:block;width:100%;height:8px;border:0;border-radius:6px 6px 0 0"><!--<![endif]-->
            </td></tr>
            <tr><td class="pc-pad" style="padding:16px 22px 0 28px;font-family:{Cuerpo}">
              <img src="cid:sello" align="right" width="166" height="150" alt="" style="float:right;width:42%;max-width:166px;height:auto;margin:0 0 4px 10px;border:0">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px"><tr>
                <td valign="middle" style="padding-right:11px"><img src="cid:escudo" width="46" height="54" alt="Escudo UNAS" style="display:block;border:0"></td>
                <td valign="middle">
                  <img src="cid:marca" width="{anchoMarca}" height="{altoMarca}" alt="Tutoría UNAS" style="display:block;width:100%;max-width:{anchoMarca}px;height:auto;border:0;font-family:{Cuerpo};font-size:26px;font-weight:800;color:#0e5a32">
                  <div style="margin-top:4px;font-size:12px;line-height:1.3;color:#5b7363">Universidad Nacional Agraria de la Selva</div>
                </td>
              </tr></table>
              <div style="padding-top:16px">{saludo}</div>
              {tituloImg}
              <div style="clear:both;font-size:0;line-height:0;height:0">&nbsp;</div>
            </td></tr>
            <tr><td class="pc-pad" style="padding:14px 28px 0"><div style="border-top:2px dashed #c8d9cc;font-size:0;line-height:0">&nbsp;</div></td></tr>
            <tr><td class="pc-pad" style="padding:16px 28px 26px;font-family:{Cuerpo};color:#2f4437">
              <p style="margin:0;font-size:15.5px;line-height:1.62;color:#2f4437">{E(m.Texto)}</p>
            """);

        var renglones = new List<RenglonCorreo>();
        if (m.Codigo is not null)
        {
            renglones.Add(new("Tu código", m.Codigo, true));
            if (m.Vigencia is not null) renglones.Add(new("Vigencia", m.Vigencia));
        }
        if (m.Renglones is not null) renglones.AddRange(m.Renglones);
        if (renglones.Count > 0)
        {
            h.Append("""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-collapse:collapse">""");
            foreach (var r in renglones)
            {
                var esCodigo = m.Codigo is not null && ReferenceEquals(r, renglones[0]);
                var valor = esCodigo
                    ? $"""<span style="font-family:{Mono};font-size:32px;font-weight:700;letter-spacing:6px;color:#0e5a32">{E(Agrupar(r.Valor))}</span>"""
                    : $"""<span style="font-size:15px;font-weight:700;color:#11261a;{(r.Mono ? $"font-family:{Mono};font-size:14px;letter-spacing:.5px;" : "")}">{E(r.Valor)}</span>""";
                h.Append($"""
                    <tr>
                      <td class="pc-etq" valign="top" width="132" style="width:132px;padding:10px 12px 8px 0;border-bottom:1.5px solid #c8d9cc;font-size:11.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:{(r.Alerta ? "#a3302b" : "#5b7363")}">{E(r.Etiqueta)}</td>
                      <td valign="top" style="padding:10px 0 8px;border-bottom:1.5px solid #c8d9cc">{valor}</td>
                    </tr>
                    """);
            }
            h.Append("</table>");
        }
        if (m.Boton is not null && m.Enlace is not null)
            h.Append($"""
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr>
                  <td bgcolor="#e9a400" style="background:#e9a400;border:2px solid #0b2e19;border-radius:8px;box-shadow:3px 3px 0 #0b2e19">
                    <a href="{E(m.Enlace)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:{Cuerpo};font-size:15px;font-weight:800;color:#1d1400;text-decoration:none">{E(m.Boton)}</a>
                  </td></tr></table>
                <p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#7a8c80">Si el botón no funciona, copia este enlace: <a href="{E(m.Enlace)}" style="color:#2b7d3c;word-break:break-all">{E(m.Enlace)}</a></p>
                """);
        if (m.Nota is not null)
            h.Append($"""<p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#617868">{E(m.Nota)}</p>""");
        h.Append($"""
              <p style="margin:16px 0 0;font-size:13.5px;line-height:1.5;color:#2f4437">Un saludo,<br><b style="color:#11261a">Coordinación de Tutoría · UNAS</b></p>
            </td></tr>
            </table>
            </div>
            <!--[if mso]></td></tr></table><![endif]-->
            <p style="max-width:580px;margin:12px auto 0;padding:0 4px;font-family:{Cuerpo};font-size:11.5px;line-height:1.6;color:#5b7363;text-align:left">Universidad Nacional Agraria de la Selva · Tingo María · Mensaje automático, no respondas a este correo.</p>
            </td></tr></table>
            </body></html>
            """);

        return new(h.ToString(), [
            new("franja", "franja.png", "image/png", Recurso("franja.png")),
            new("escudo", "escudo.png", "image/png", Recurso("escudo.png")),
            new("marca", "marca.png", "image/png", Recurso("marca.png")),
            new("sello", $"sello-{m.Tipo}.gif", "image/gif", Recurso($"sello-{m.Tipo}.gif")),
            new("titulo", $"titulo-{m.Tipo}.png", "image/png", Recurso($"titulo-{m.Tipo}.png")),
        ]);
    }

    /// <summary>Un ejemplo ficticio de cada aviso, para revisar la plantilla en un buzón real (--probar-plantillas) y en las pruebas.</summary>
    public static IEnumerable<(string Asunto, MensajeCorreo Mensaje)> Ejemplos(string url) =>
    [
        ("Verifica tu cuenta · Tutoría UNAS", new("verificacion", "Ana", "Ingresa este código en Tutoría UNAS para verificar tu cuenta.", Codigo: "482915", Vigencia: "10 minutos · un solo uso", Nota: "Si no solicitaste esta operación, ignora este correo. No compartas este código con nadie.")),
        ("Recupera tu contraseña · Tutoría UNAS", new("recuperacion", "Ana", "Ingresa este código en la página de recuperación para elegir una contraseña nueva.", Codigo: "730264", Vigencia: "10 minutos · un solo uso", Nota: "Si no solicitaste esta operación, ignora este correo: tu contraseña actual sigue funcionando.")),
        ("Tu acceso temporal · Tutoría UNAS", new("acceso", "Ana", "Coordinación preparó tu acceso a Tutoría UNAS. Ingresa, pulsa «Verificar cuenta», confirma el código que llegará a este correo y elige tu contraseña personal.",
            [new("Perfil", "Estudiante"), new("Usuario", "ana.perez@unas.edu.pe"), new("Contraseña temporal", "UNAS-7F3A9C21B4D8", Mono: true), new("Vigencia", "48 horas")], Boton: "Ir a Tutoría UNAS", Enlace: url, Nota: "No compartas tus credenciales con nadie.")),
        ("Cuenta verificada · Tutoría UNAS", new("verificada", "Ana", "Tu cuenta institucional de Tutoría UNAS se verificó y tu contraseña quedó establecida. Ya puedes ingresar.", Boton: "Ingresar al portal", Enlace: url, Nota: "Si no realizaste esta operación, comunícate con coordinación.")),
        ("Tu cuenta fue habilitada · Tutoría UNAS", new("habilitada", "Carlos", "Coordinación habilitó tu acceso a Tutoría UNAS (perfil docente). Ingresa con tu correo y tu contraseña de siempre.", Boton: "Ingresar al portal", Enlace: url, Nota: "Si no recuerdas tu contraseña, usa «¿Olvidaste tu clave?» en la página de acceso.")),
        ("Tu cuenta fue rehabilitada · Tutoría UNAS", new("rehabilitada", "Ana", "Coordinación volvió a habilitar tu acceso a Tutoría UNAS (perfil estudiante). Ingresa con tu correo y tu contraseña de siempre.", Boton: "Ingresar al portal", Enlace: url, Nota: "Si no esperabas este mensaje, comunícate con la coordinación de tu escuela.")),
        ("Tu cuenta fue deshabilitada · Tutoría UNAS", new("baja", "Ana", "Coordinación deshabilitó tu acceso a Tutoría UNAS (perfil estudiante). Mientras esté deshabilitada no podrás iniciar sesión ni recibirás avisos del sistema.", [new("Este aviso", "Es el único que recibirás por este motivo")], Nota: "Si crees que se trata de un error, comunícate con la coordinación de tu escuela.")),
        ("Fuiste designado coordinador de escuela · Tutoría UNAS", new("coordinador", "Carlos", "La administración te designó coordinador de escuela. Además de tu panel de docente, ahora tienes el módulo «Monitoreo de escuela», de solo lectura.", [new("Podrás ver", "Avance de estudiantes y docentes"), new("También", "Formatos y derivaciones de tu escuela")], Boton: "Ver el monitoreo", Enlace: url, Nota: "Vuelve a iniciar sesión para que aparezca el módulo.")),
        ("Ya no eres coordinador de escuela · Tutoría UNAS", new("coordinador-retirado", "Carlos", "La administración retiró tu designación como coordinador de escuela. Sigues con tu panel de docente tutor.", Nota: "Gracias por acompañar el monitoreo de tu escuela.")),
        ("Tienes actividades pendientes · Tutoría UNAS", new("pendientes", "Ana", "Estas tareas esperan tu atención en Tutoría UNAS. El plazo es de 7 días desde el primer aviso.",
            [new("Venció el 25 nov", "Evaluación de la sesión del 18 de noviembre", Alerta: true), new("Vence hoy", "Entrevista inicial (Formato 03)", Alerta: true), new("Vence el 4 dic", "Ficha de seguimiento")], Boton: "Completar ahora", Enlace: url, Nota: "Es un aviso automático. Dejará de llegar cuando completes estas tareas.")),
        ("Ya tienes una cuenta · Tutoría UNAS", new("cuenta-existente", null, "Recibimos una solicitud para crear una cuenta con este correo, pero ya existe una con el perfil de estudiante.", Boton: "Iniciar sesión", Enlace: url, Nota: "Si no hiciste esta solicitud, ignora este correo: no se cambió nada en tu cuenta.")),
        ("Recuperación de contraseña · Tutoría UNAS", new("sin-cuenta", null, "Recibimos una solicitud para recuperar la contraseña de este correo, pero no hay una cuenta activa asociada a él.", [new("Sin cuenta aún", "Créala desde la página de acceso"), new("Deshabilitada", "Comunícate con coordinación")], Boton: "Crear mi cuenta", Enlace: url, Nota: "Si no hiciste esta solicitud, ignora este correo. No se cambió nada.")),
        ("Solicitud de cuenta · Tutoría UNAS", new("fuera-padron", null, "Recibimos una solicitud para crear una cuenta con este correo, pero no hay una ficha activa de estudiante asociada a él en el padrón de la universidad.", [new("Qué hacer", "Pide a la coordinación de tutoría de tu escuela que verifique tu registro"), new("Después", "Cuando figures en el padrón podrás crear tu cuenta")], Nota: "Si no hiciste esta solicitud, ignora este correo. No se cambió nada.")),
    ];

    /// <summary>«482915» se lee mejor como «482 915».</summary>
    private static string Agrupar(string codigo) => codigo.Length == 6 && codigo.All(char.IsAsciiDigit) ? codigo[..3] + " " + codigo[3..] : codigo;

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
