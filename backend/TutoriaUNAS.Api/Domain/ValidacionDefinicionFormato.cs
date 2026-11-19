using System.Text.Json;
using System.Text.RegularExpressions;

namespace TutoriaUNAS.Api.Domain;

/// <summary>Contrato del catálogo compartido por formularios, validación y exportaciones.</summary>
public static partial class ValidacionDefinicionFormato
{
    private static readonly HashSet<string> Tipos = ["texto", "texto-largo", "numero", "fecha", "hora", "seleccion", "multiple", "booleano", "tabla", "escala"];
    private static readonly HashSet<string> TiposOpcion = ["seleccion", "multiple", "escala"];
    // Identidades y datos que participan en cálculos o producen sesiones/derivaciones.
    public static readonly IReadOnlySet<string> Integrados = new HashSet<string>(StringComparer.Ordinal)
    {
        "nombreEstudiante", "codigo", "ciclo", "escuela", "nombreTutor", "telefonoTutor", "semestre", "grupo",
        "correo", "telefono", "facultad", "comision", "fecha", "horaInicio", "horaFin", "asistentes", "tema",
        "actividades", "atendidosIndividual", "ciclosIndividual", "individuales", "atendidosGrupal", "ciclosGrupal", "grupales",
        "resultado", "proximaCita", "horaCita", "horaFinCita", "areaDerivacion", "area", "motivo", "detalleMotivo", "detalle",
        "cursosDificiles", "materiasFaciles", "administracionTiempo", "horasEstudio", "promedioSecundaria"
    };

    [GeneratedRegex("^[a-zA-Z][a-zA-Z0-9_-]{0,79}$", RegexOptions.CultureInvariant)]
    private static partial Regex Codigo();

    public static void Validar(JsonElement definicion, JsonElement publicada, JsonElement oficial)
    {
        Exigir(definicion.ValueKind == JsonValueKind.Object, "definicion", "El formulario debe ser un objeto.");
        foreach (var propiedad in new[] { "codigo", "numero", "actor", "actorEtiqueta" })
            Exigir(Texto(definicion, propiedad) == Texto(publicada, propiedad), propiedad, "Conserva la identidad y el responsable normativo del formato.");
        foreach (var propiedad in new[] { "nombre", "proposito", "momento", "periodicidad", "destinatario", "version", "vigencia", "aprobacion" })
            Cadena(definicion, propiedad, 1000);
        Exigir(definicion.TryGetProperty("obligatorio", out var obligatorio) && obligatorio.ValueKind is JsonValueKind.True or JsonValueKind.False, "obligatorio", "Indica la aplicación del formato.");
        Opciones(definicion, "visaciones", "visaciones");
        var secciones = Array(definicion, "secciones", "secciones", 30);
        var campos = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var titulos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var seccion in secciones)
        {
            Cadena(seccion, "titulo", 200);
            Exigir(titulos.Add(Texto(seccion, "titulo").Trim()), "secciones", "Cada sección necesita un título diferente.");
            foreach (var campo in Array(seccion, "campos", "campos", 150))
            {
                var codigo = Texto(campo, "codigo");
                Exigir(Codigo().IsMatch(codigo) && !codigo.EndsWith("__otro", StringComparison.Ordinal) && codigo is not ("constructor" or "prototype"), "codigo", "Usa un identificador válido y estable.");
                Exigir(campos.TryAdd(codigo, campo), codigo, "No repitas el identificador de una pregunta.");
                ValidarCampo(campo, codigo);
            }
        }
        Exigir(campos.Count <= 300, "secciones", "El formato admite como máximo 300 preguntas.");
        ValidarCondiciones(campos);
        ValidarIntegrados(campos, oficial);
    }

    private static void ValidarCampo(JsonElement campo, string codigo)
    {
        Cadena(campo, "etiqueta", 500);
        Exigir(Tipos.Contains(Texto(campo, "tipo")), codigo, "Elige un tipo de respuesta admitido.");
        Exigir(campo.TryGetProperty("obligatorio", out var valor) && valor.ValueKind is JsonValueKind.True or JsonValueKind.False, codigo, "Indica si la pregunta es obligatoria.");
        if (campo.TryGetProperty("ayuda", out _)) Cadena(campo, "ayuda", 1000, false);
        if (TiposOpcion.Contains(Texto(campo, "tipo"))) Opciones(campo, "opciones", codigo);
        ValidarRotulos(campo, codigo);
        if (Texto(campo, "tipo") == "tabla") ValidarColumnas(campo, codigo);
    }

    private static void ValidarRotulos(JsonElement campo, string codigo)
    {
        if (campo.TryGetProperty("rotulosOpciones", out var rotulos))
        {
            Exigir(rotulos.ValueKind == JsonValueKind.Object, codigo, "Revisa los textos de las opciones.");
            var opciones = Texto(campo, "tipo") == "booleano" ? ["Sí", "No"] : Lista(campo, "opciones");
            foreach (var rotulo in rotulos.EnumerateObject())
                Exigir(opciones.Contains(rotulo.Name) && rotulo.Value.ValueKind == JsonValueKind.String && rotulo.Value.GetString()!.Trim().Length is > 0 and <= 200, codigo, "Cada texto debe corresponder a una opción válida.");
        }
    }

    private static void ValidarColumnas(JsonElement campo, string codigo)
    {
        var columnas = Array(campo, "columnas", codigo, 20);
        var codigos = new HashSet<string>();
        foreach (var columna in columnas)
        {
            Exigir(Codigo().IsMatch(Texto(columna, "codigo")) && codigos.Add(Texto(columna, "codigo")), codigo, "Cada columna necesita un identificador único.");
            Cadena(columna, "etiqueta", 200);
            var tipo = Texto(columna, "tipo");
            Exigir(tipo is "" or "texto" or "numero" or "fecha" or "seleccion", codigo, "Tipo de columna inválido.");
            if (tipo == "seleccion") Opciones(columna, "opciones", codigo);
        }
    }

    private static void ValidarCondiciones(Dictionary<string, JsonElement> campos)
    {
        foreach (var (codigo, campo) in campos)
        {
            if (!campo.TryGetProperty("visibleSi", out var condicion)) continue;
            var padre = Texto(condicion, "campo");
            Exigir(padre != codigo && campos.ContainsKey(padre), codigo, "La condición debe referirse a otra pregunta existente.");
            var anterior = campos[padre];
            var opciones = Texto(anterior, "tipo") == "booleano" ? ["Sí", "No"] : Lista(anterior, "opciones");
            Exigir(Texto(anterior, "tipo") is "seleccion" or "escala" or "booleano", codigo, "La condición requiere una pregunta de respuesta única.");
            Opciones(condicion, "valores", codigo);
            Exigir(Lista(condicion, "valores").All(opciones.Contains), codigo, "La condición contiene respuestas inexistentes.");
            ValidarSinCiclos(codigo, campo, campos);
        }
    }

    private static void ValidarSinCiclos(string codigo, JsonElement actual, Dictionary<string, JsonElement> campos)
    {
        var visitados = new HashSet<string> { codigo };
        while (actual.TryGetProperty("visibleSi", out var cuando))
        {
            var referencia = Texto(cuando, "campo");
            Exigir(visitados.Add(referencia), codigo, "Las condiciones no pueden formar un ciclo.");
            Exigir(campos.TryGetValue(referencia, out actual), codigo, "La condición contiene una referencia inexistente.");
        }
    }

    private static void ValidarIntegrados(Dictionary<string, JsonElement> campos, JsonElement oficial)
    {
        foreach (var original in oficial.GetProperty("secciones").EnumerateArray().SelectMany(s => s.GetProperty("campos").EnumerateArray()))
        {
            var codigo = Texto(original, "codigo");
            if (!Integrados.Contains(codigo)) continue;
            Exigir(campos.TryGetValue(codigo, out var campo), codigo, "Esta pregunta está vinculada al sistema; puedes editar su texto y ayuda, pero debe conservarse.");
            Exigir(Texto(campo, "tipo") == Texto(original, "tipo"), codigo, "Conserva el tipo de una pregunta vinculada al sistema.");
            Exigir(MismaCondicion(campo, original), codigo, "Conserva la condición de una pregunta que interviene en las automatizaciones.");
            if (original.TryGetProperty("columnas", out var columnas))
                ValidarColumnasIntegradas(campo, columnas, codigo);
            if (codigo is "resultado" or "areaDerivacion" or "area" or "motivo")
                Exigir(Lista(original, "opciones").SequenceEqual(Lista(campo, "opciones")), codigo, "Edita el texto visible de estas opciones conservando sus valores de automatización.");
        }
    }

    private static JsonElement[] Array(JsonElement elemento, string propiedad, string ruta, int limite)
    {
        Exigir(elemento.ValueKind == JsonValueKind.Object && elemento.TryGetProperty(propiedad, out var dato) && dato.ValueKind == JsonValueKind.Array, ruta, "Completa la lista requerida.");
        var lista = elemento.GetProperty(propiedad).EnumerateArray().ToArray();
        Exigir(lista.Length > 0 && lista.Length <= limite, ruta, $"Usa entre 1 y {limite} elementos.");
        return lista;
    }
    private static void Cadena(JsonElement elemento, string propiedad, int limite, bool requerida = true)
    {
        Exigir(elemento.ValueKind == JsonValueKind.Object && elemento.TryGetProperty(propiedad, out var valor) && valor.ValueKind == JsonValueKind.String, propiedad, "Introduce un texto válido.");
        var texto = Texto(elemento, propiedad);
        Exigir(texto.Length <= limite && (!requerida || texto.Trim().Length > 0), propiedad, $"Revisa este texto (máximo {limite} caracteres).");
    }
    private static void ValidarColumnasIntegradas(JsonElement campo, JsonElement originales, string codigo)
    {
        var nuevas = Array(campo, "columnas", codigo, 20);
        var columnas = originales.EnumerateArray().ToArray();
        Exigir(nuevas.Length == columnas.Length, codigo, "Conserva las columnas vinculadas al sistema.");
        for (var i = 0; i < columnas.Length; i++)
            Exigir(Texto(nuevas[i], "codigo") == Texto(columnas[i], "codigo") && Texto(nuevas[i], "tipo") == Texto(columnas[i], "tipo") && Lista(nuevas[i], "opciones").SequenceEqual(Lista(columnas[i], "opciones")), codigo, "Conserva el identificador y el tipo de las columnas vinculadas al sistema.");
    }
    private static bool MismaCondicion(JsonElement campo, JsonElement original)
    {
        var existe = original.TryGetProperty("visibleSi", out var anterior);
        var nueva = campo.TryGetProperty("visibleSi", out var condicion);
        return existe == nueva && (!existe || JsonElement.DeepEquals(anterior, condicion));
    }
    private static void Opciones(JsonElement elemento, string propiedad, string ruta)
    {
        var lista = Array(elemento, propiedad, ruta, 100);
        Exigir(lista.All(v => v.ValueKind == JsonValueKind.String && v.GetString()!.Trim().Length is > 0 and <= 200), ruta, "Las opciones deben tener texto (máximo 200 caracteres).");
        var textos = lista.Select(v => v.GetString()!.Trim()).ToArray();
        Exigir(textos.Distinct(StringComparer.OrdinalIgnoreCase).Count() == textos.Length, ruta, "No repitas opciones.");
    }
    private static string Texto(JsonElement elemento, string propiedad) => elemento.ValueKind == JsonValueKind.Object && elemento.TryGetProperty(propiedad, out var valor) && valor.ValueKind == JsonValueKind.String ? valor.GetString()! : "";
    private static string[] Lista(JsonElement elemento, string propiedad) => elemento.TryGetProperty(propiedad, out var lista) && lista.ValueKind == JsonValueKind.Array ? lista.EnumerateArray().Where(v => v.ValueKind == JsonValueKind.String).Select(v => v.GetString()!).ToArray() : [];
    private static void Exigir(bool condicion, string campo, string mensaje)
    {
        if (!condicion) throw new TutoriaError(400, mensaje, new() { [campo] = [mensaje] });
    }
}
