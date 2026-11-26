using System.Globalization;
using System.IO.Compression;
using System.Xml;
using TutoriaUNAS.Api.Domain;

namespace TutoriaUNAS.Api.Services.Padron;

/// <summary>
/// Lector mínimo de libros .xlsx (Office Open XML) sin dependencias externas. Recorre cada hoja fila por fila con
/// <see cref="XmlReader"/> (sin DTD ni entidades externas), así una hoja que no se usa nunca se carga en memoria.
/// Solo los textos compartidos se conservan, porque las celdas los referencian por índice.
/// Los límites cuentan los bytes realmente descomprimidos, no el tamaño que declara el ZIP (que puede mentir).
/// </summary>
public sealed class LectorXlsx : IDisposable
{
    public const long MaxBytesDescomprimidos = 400L * 1024 * 1024;
    public const int MaxFilasPorHoja = 300_000;
    public const int MaxColumnas = 64;
    private const int MaxEntradasZip = 500;
    private const int MaxTextosCompartidos = 2_000_000;
    private const string Relaciones = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XmlReaderSettings Seguro = new()
    {
        DtdProcessing = DtdProcessing.Prohibit,
        XmlResolver = null,
        CloseInput = true,
        IgnoreComments = true,
        IgnoreProcessingInstructions = true,
        IgnoreWhitespace = true,
    };

    private readonly ZipArchive _zip;
    private readonly Dictionary<string, string> _rutas = new(StringComparer.Ordinal);
    private readonly List<string> _compartidos = [];
    private readonly CancellationToken _ct;
    private long _bytesRestantes;

    /// <summary>Nombres de las hojas en el orden del libro.</summary>
    public IReadOnlyList<string> Hojas { get; }

    public LectorXlsx(Stream libro, CancellationToken ct = default, long maxBytesDescomprimidos = MaxBytesDescomprimidos)
    {
        _ct = ct;
        _bytesRestantes = maxBytesDescomprimidos;
        _zip = new ZipArchive(libro, ZipArchiveMode.Read, leaveOpen: true);
        try
        {
            TutoriaError.Exigir(_zip.Entries.Count <= MaxEntradasZip, "El archivo no parece un libro de Excel válido.", 400);
            LeerTextosCompartidos();
            var destinos = new Dictionary<string, string>(StringComparer.Ordinal);
            using (var rels = Abrir("xl/_rels/workbook.xml.rels"))
                while (rels?.Read() == true)
                    if (rels.NodeType == XmlNodeType.Element && rels.LocalName == "Relationship" && rels.GetAttribute("Id") is { } id && rels.GetAttribute("Target") is { } destino)
                        destinos[id] = destino.StartsWith('/') ? destino.TrimStart('/') : "xl/" + destino;
            var hojas = new List<string>();
            using (var libroXml = Abrir("xl/workbook.xml") ?? throw new TutoriaError(400, "El archivo no es un libro de Excel (.xlsx) válido."))
                while (libroXml.Read())
                    if (libroXml.NodeType == XmlNodeType.Element && libroXml.LocalName == "sheet" && libroXml.GetAttribute("name") is { } nombre &&
                        libroXml.GetAttribute("id", Relaciones) is { } rid && destinos.TryGetValue(rid, out var ruta) && _rutas.TryAdd(nombre, ruta))
                        hojas.Add(nombre);
            TutoriaError.Exigir(hojas.Count > 0, "El libro no tiene hojas.", 400);
            Hojas = hojas;
        }
        catch
        {
            _zip.Dispose();
            throw;
        }
    }

    public void Dispose() => _zip.Dispose();

    /// <summary>
    /// Filas con al menos una celda con texto, en orden. Cada fila trae <see cref="MaxColumnas"/> celdas («» si está vacía).
    /// El arreglo se reutiliza entre filas: quien necesite conservarlo debe copiarlo.
    /// </summary>
    public IEnumerable<(int Fila, string[] Celdas)> Filas(string hoja)
    {
        using var xml = Abrir(_rutas[hoja]) ?? throw new TutoriaError(400, "El libro está incompleto: falta una hoja.");
        var celdas = new string[MaxColumnas];
        var anterior = 0;
        var leidas = 0;
        while (xml.Read())
        {
            if (xml.NodeType != XmlNodeType.Element || xml.LocalName != "row") continue;
            _ct.ThrowIfCancellationRequested();
            var numero = int.TryParse(xml.GetAttribute("r"), NumberStyles.None, CultureInfo.InvariantCulture, out var r) ? r : anterior + 1;
            anterior = numero;
            if (xml.IsEmptyElement) continue;
            Array.Fill(celdas, "");
            var conTexto = false;
            var columna = -1;
            var profundidad = xml.Depth;
            xml.Read();
            while (xml.Depth > profundidad)
            {
                if (xml.NodeType != XmlNodeType.Element || xml.LocalName != "c") { xml.Read(); continue; }
                // La referencia («B7») es opcional: sin ella la celda va en la columna siguiente.
                columna = IndiceColumna(xml.GetAttribute("r")) ?? columna + 1;
                var compartido = xml.GetAttribute("t") == "s";
                var texto = LeerTexto(xml);
                if (compartido) texto = TextoCompartido(texto);
                if (columna >= MaxColumnas || string.IsNullOrWhiteSpace(texto)) continue;   // las columnas sobrantes no forman parte del padrón
                celdas[columna] = texto;
                conTexto = true;
            }
            if (!conTexto) continue;
            TutoriaError.Exigir(++leidas <= MaxFilasPorHoja, $"La hoja «{hoja}» supera las {MaxFilasPorHoja:N0} filas.", 413);
            yield return (numero, celdas);
        }
    }

    private void LeerTextosCompartidos()
    {
        using var xml = Abrir("xl/sharedStrings.xml");
        if (xml is null) return;
        xml.Read();
        while (!xml.EOF)
        {
            if (xml.NodeType == XmlNodeType.Element && xml.LocalName == "si")
            {
                TutoriaError.Exigir(_compartidos.Count < MaxTextosCompartidos, "El libro tiene demasiados textos.", 413);
                _compartidos.Add(LeerTexto(xml));
                continue;
            }
            xml.Read();
        }
    }

    private string TextoCompartido(string indice) =>
        int.TryParse(indice, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) && i >= 0 && i < _compartidos.Count
            ? _compartidos[i]
            : throw new TutoriaError(400, "El archivo de Excel está dañado: una celda apunta a un texto inexistente.");

    /// <summary>
    /// Texto visible de un elemento (celda o texto compartido): une sus nodos de texto y omite la fórmula
    /// (&lt;f&gt;), la lectura fonética (&lt;rPh&gt;) y las extensiones. Deja el lector después del cierre del elemento.
    /// </summary>
    private static string LeerTexto(XmlReader xml)
    {
        if (xml.IsEmptyElement) { xml.Read(); return ""; }
        var profundidad = xml.Depth;
        string? texto = null;
        System.Text.StringBuilder? varios = null;   // solo con texto enriquecido (varios tramos)
        xml.Read();
        while (xml.Depth > profundidad)
        {
            if (xml.NodeType == XmlNodeType.Element && xml.LocalName is "f" or "rPh" or "extLst") { xml.Skip(); continue; }
            if (xml.NodeType is XmlNodeType.Text or XmlNodeType.CDATA or XmlNodeType.SignificantWhitespace)
            {
                if (texto is null) texto = xml.Value;
                else (varios ??= new System.Text.StringBuilder(texto)).Append(xml.Value);
            }
            xml.Read();
        }
        xml.Read();
        return varios?.ToString() ?? texto ?? "";
    }

    private XmlReader? Abrir(string ruta)
    {
        var entrada = _zip.GetEntry(ruta);
        return entrada is null ? null : XmlReader.Create(new FlujoLimitado(entrada.Open(), this), Seguro);
    }

    /// <summary>«AB12» → 27 (base cero); nulo si la referencia falta o no es válida.</summary>
    private static int? IndiceColumna(string? referencia)
    {
        if (string.IsNullOrEmpty(referencia)) return null;
        var indice = 0;
        var letras = 0;
        foreach (var c in referencia)
        {
            if (c is < 'A' or > 'Z') break;
            if (++letras > 3) return null;
            indice = indice * 26 + (c - 'A' + 1);
        }
        return letras == 0 ? null : indice - 1;
    }

    /// <summary>Cuenta los bytes descomprimidos de todas las partes del libro y corta al pasar el límite (bomba ZIP).</summary>
    private sealed class FlujoLimitado(Stream interno, LectorXlsx dueno) : Stream
    {
        public override int Read(byte[] buffer, int offset, int count) => Contar(interno.Read(buffer, offset, count));
        public override int Read(Span<byte> buffer) => Contar(interno.Read(buffer));
        private int Contar(int leidos)
        {
            dueno._bytesRestantes -= leidos;
            TutoriaError.Exigir(dueno._bytesRestantes >= 0, "El archivo descomprimido es demasiado grande.", 413);
            return leidos;
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) interno.Dispose();
            base.Dispose(disposing);
        }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
