using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using TutoriaUNAS.Api.Domain;

namespace TutoriaUNAS.Api.Services.Padron;

/// <summary>
/// Lee y valida el padrón (hojas de alumnos y docentes). Toda la validación ocurre aquí, antes de tocar la base:
/// una fila con problemas se excluye con su motivo y el resto se importa; solo los errores del archivo completo
/// (columnas ausentes, varios semestres, archivo dañado) detienen el análisis.
/// Los identificadores son deterministas (mismos datos → mismo Id), por eso reimportar no duplica registros.
/// </summary>
public static partial class AnalizadorPadron
{
    private static readonly Dictionary<string, (string Id, string Nombre)> EscuelasConocidas = new(StringComparer.Ordinal)
    {
        ["ADMINISTRACION"] = ("E-ADM", "Administración"),
        ["CONTABILIDAD"] = ("E-CON", "Contabilidad"),
        ["ECONOMIA"] = ("E-ECO", "Economía"),
        ["INGENIERIA EN INFORMATICA Y SISTEMAS"] = ("E-IIS", "Ingeniería en Informática y Sistemas"),
        ["AGRONOMIA"] = ("E-AGR", "Ingeniería Agronómica"),
        ["INGENIERIA FORESTAL"] = ("E-FOR", "Ingeniería Forestal"),
        ["ZOOTECNIA"] = ("E-ZOO", "Zootecnia"),
        ["INGENIERIA EN CONSERVACION DE SUELOS Y AGUA"] = ("E-CSA", "Ingeniería en Conservación de Suelos y Agua"),
        ["INGENIERIA EN INDUSTRIAS ALIMENTARIAS"] = ("E-IIA", "Ingeniería en Industrias Alimentarias"),
        ["INGENIERIA MECANICA ELECTRICA"] = ("E-IME", "Ingeniería Mecánica Eléctrica"),
        ["INGENIERIA EN RECURSOS NATURALES RENOVABLES"] = ("E-RNR", "Ingeniería en Recursos Naturales Renovables"),
        ["INGENIERIA AMBIENTAL"] = ("E-AMB", "Ingeniería Ambiental"),
        ["INGENIERIA EN CIBERSEGURIDAD"] = ("E-CIB", "Ingeniería en Ciberseguridad"),
        ["TURISMO Y HOTELERIA"] = ("E-TUH", "Turismo y Hotelería"),
        ["INGENIERIA CIVIL"] = ("E-CIV", "Ingeniería Civil"),
    };
    private static readonly string[] ColumnasAlumnos =
    [
        "COD SEM", "COD ALUMNO", "APE PAT ALUMNO", "APE MAT ALUMNO", "NOMBRES", "ESCUELA ALUMNO", "ESTADO", "PPA", "TCA",
        "EMAIL UNAS", "CELULAR", "COD CURSO", "NOMBRE CURSO", "GRUPO CURSO", "NOMBRE AULA", "COD AULA", "DOCENTE", "DIA SEMANA",
        "DURACION HORAS", "HORAS", "ES HORA TEORICA",
    ];
    private static readonly string[] ColumnasDocentes = ["APELLIDO PATERNO", "APELLIDO MATERNO", "NOMBRES", "EMAIL", "DEPARTAMENTO ACADEMICO"];
    // Valores que el Excel usa para decir «no hay dato». Se comparan sin tildes, en mayúsculas y sin signos.
    private static readonly HashSet<string> SinDato = new(StringComparer.Ordinal)
    {
        "NO SE DEFINE", "NO DEFINIDO", "NO DEFINIDA", "NO DEFINE", "SIN DEFINIR", "POR DEFINIR", "NO SE ESPECIFICA", "NO ESPECIFICADO",
        "SIN DATO", "SIN DATOS", "NO REGISTRA", "NO TIENE", "NO APLICA", "NINGUNO", "NINGUNA", "NA", "ND", "SD", "NULL", "NONE", "VACIO", "XXX", "NN",
    };
    private static readonly CultureInfo Peru = CultureInfo.GetCultureInfo("es-PE");
    private const int MaxFilasCabecera = 40;
    private const int MaxExcluidasEnDetalle = 5000;

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")] private static partial Regex CorreoValido();
    [GeneratedRegex(@"^(\d{1,2})\s*-\s*(\d{1,2})\s*([ap])m\.?$", RegexOptions.IgnoreCase)] private static partial Regex Horas();
    [GeneratedRegex(@"^\d{4}-[12]$")] private static partial Regex Semestre();
    [GeneratedRegex(@"^[0-9A-Za-z-]{1,40}$")] private static partial Regex Codigo();
    [GeneratedRegex(@"\d{4}-[12]")] private static partial Regex SemestreEnNombre();

    /// <summary>Quita espacios al borde y une los repetidos. Si el texto ya está limpio lo devuelve tal cual, sin copiarlo.</summary>
    public static string Texto(string? valor)
    {
        if (string.IsNullOrEmpty(valor)) return "";
        var limpio = !char.IsWhiteSpace(valor[0]) && !char.IsWhiteSpace(valor[^1]);
        for (var i = 1; limpio && i < valor.Length; i++)
            limpio = !char.IsWhiteSpace(valor[i]) || (valor[i] == ' ' && !char.IsWhiteSpace(valor[i - 1]));
        return limpio ? valor : string.Join(' ', valor.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>Mayúsculas sin tildes ni espacios sobrantes: «Ingeniería  Civil » → «INGENIERIA CIVIL».</summary>
    public static string Normalizado(string? valor)
    {
        var descompuesto = Texto(valor).ToUpperInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(descompuesto.Length);
        foreach (var c in descompuesto)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString();
    }

    /// <summary>
    /// Un valor «no definido»: vacío, un marcador como «NO SE DEFINE» o algo sin ningún carácter útil. Con
    /// <paramref name="exigirLetras"/> también se rechaza lo que solo trae dígitos o signos (un nombre «123» es raro).
    /// </summary>
    public static bool SinDefinir(string? valor, bool exigirLetras = false)
    {
        var limpio = Normalizado(valor);
        if (!limpio.Any(char.IsLetterOrDigit)) return true;
        if (exigirLetras && !limpio.Any(char.IsLetter)) return true;
        var palabras = new string(limpio.Select(c => char.IsLetterOrDigit(c) ? c : ' ').ToArray());
        var compacto = new string(limpio.Where(char.IsLetterOrDigit).ToArray());   // «N/A» → «NA», «S/D» → «SD»
        return SinDato.Contains(string.Join(' ', palabras.Split(' ', StringSplitOptions.RemoveEmptyEntries))) || (compacto.Length <= 3 && SinDato.Contains(compacto));
    }

    /// <summary>Bloque horario a partir de «09-01 pm.» y una duración: ("09:00","13:00"), o nulo si no se puede deducir.</summary>
    public static (string Inicio, string Fin)? Bloque(string crudo, int? duracion)
    {
        var m = Horas().Match(Texto(crudo));
        if (!m.Success || duracion is not > 0) return null;
        var fin = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) % 12 + (string.Equals(m.Groups[3].Value, "p", StringComparison.OrdinalIgnoreCase) ? 12 : 0);
        var inicio = fin - duracion.Value;
        if (inicio < 0 || inicio >= fin || inicio % 12 != int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) % 12) return null;
        return ($"{inicio:00}:00", $"{fin:00}:00");
    }

    private static string IdEstable(string prefijo, params string[] valores) =>
        prefijo + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('|', valores))))[..24];

    private static string SemestreInterno(string fuente) => fuente[..^1] + (fuente[^1] == '1' ? "I" : "II");      // 2026-2 → 2026-II
    private static string SemestreFuente(string interno) => interno.EndsWith("-II", StringComparison.Ordinal) ? interno[..^2] + "2" : interno[..^1] + "1";

    private static double? Numero(string valor) =>
        valor.Length > 0 && double.TryParse(valor.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n) ? n : null;

    private static bool CorreoAceptable(string correo) => correo.Length <= 254 && CorreoValido().IsMatch(correo);

    public static AnalisisPadron Analizar(Stream libro, string archivo, string sha256, CancellationToken ct = default)
    {
        try
        {
            using var xlsx = new LectorXlsx(libro, ct);
            var r = new AnalisisPadron();
            var origen = new OrigenPadron { Archivo = archivo, Sha256 = sha256 };
            var alumnos = BuscarHoja(xlsx, "COD SEM");
            var docentes = BuscarHoja(xlsx, "APELLIDO PATERNO");
            TutoriaError.Exigir(alumnos is not null || docentes is not null,
                "No se reconocieron las hojas del padrón. Se esperan columnas como «COD SEM / COD ALUMNO…» (alumnos) y «APELLIDO PATERNO / EMAIL…» (docentes).", 400);
            if (alumnos is { } a) LeerAlumnos(r, xlsx, a.Hoja, a.Cabecera, a.Columnas, origen);
            if (docentes is { } d) LeerDocentes(r, xlsx, d.Hoja, d.Cabecera, d.Columnas, origen);
            var resumen = r.Resumen;
            resumen.Archivo = archivo;
            resumen.Sha256 = sha256;
            resumen.TieneAlumnos = alumnos is not null;
            resumen.TieneDocentes = docentes is not null;
            resumen.Alumnos = r.Estudiantes.Count;
            resumen.Docentes = r.Docentes.Count;
            resumen.Escuelas = r.Escuelas.Count;
            resumen.Cursos = r.Cursos.Count;
            resumen.Matriculas = r.Matriculas.Count;
            resumen.CursosMatriculados = r.Matriculas.Sum(m => m.Cursos.Count);
            resumen.Horarios = r.Horarios.Count;
            resumen.SinPpa = r.Estudiantes.Count(e => e.PromedioPonderado is null);
            resumen.SinCelular = r.Estudiantes.Count(e => e.Telefono.Length == 0);
            TutoriaError.Exigir(r.Estudiantes.Count + r.Docentes.Count > 0,
                "Ninguna fila del archivo tiene los datos mínimos para importarse. Revisa el detalle de filas excluidas.", 422);
            return r;
        }
        catch (InvalidDataException) { throw new TutoriaError(400, "El archivo no es un libro de Excel (.xlsx) válido o está dañado."); }
        catch (XmlException) { throw new TutoriaError(400, "El archivo de Excel está dañado o tiene un formato no admitido."); }
    }

    /// <summary>Primera hoja cuyas primeras filas contienen la columna <paramref name="ancla"/>; nombre de cabecera → índice.</summary>
    private static (string Hoja, int Cabecera, Dictionary<string, int> Columnas)? BuscarHoja(LectorXlsx xlsx, string ancla)
    {
        foreach (var hoja in xlsx.Hojas)
            foreach (var (fila, celdas) in xlsx.Filas(hoja).Take(MaxFilasCabecera))
            {
                var columnas = new Dictionary<string, int>(StringComparer.Ordinal);
                for (var i = 0; i < celdas.Length; i++)
                    if (celdas[i].Length > 0) columnas.TryAdd(Normalizado(celdas[i]), i);
                if (columnas.ContainsKey(ancla)) return (hoja, fila, columnas);
            }
        return null;
    }

    private static Dictionary<string, int> Exigir(Dictionary<string, int> columnas, string[] requeridas, string hoja)
    {
        var faltan = requeridas.Where(c => !columnas.ContainsKey(c)).ToArray();
        TutoriaError.Exigir(faltan.Length == 0, $"A la hoja de {hoja} le faltan columnas: {string.Join(", ", faltan)}.", 400);
        return columnas;
    }

    /// <summary>Asigna un Id estable a cada escuela del Excel. Las 15 conocidas conservan su Id y nombre oficial.</summary>
    private sealed class Escuelas(List<EscuelaPadron> destino)
    {
        private readonly Dictionary<string, string> _porTexto = new(StringComparer.Ordinal);       // texto tal cual → Id
        private readonly Dictionary<string, string> _porNormalizado = new(StringComparer.Ordinal);
        public List<string> Nuevas { get; } = [];

        public string Id(string texto)
        {
            if (_porTexto.TryGetValue(texto, out var id)) return id;
            var clave = Normalizado(texto);
            if (!_porNormalizado.TryGetValue(clave, out id))
            {
                string nombre;
                if (EscuelasConocidas.TryGetValue(clave, out var conocida)) (id, nombre) = conocida;
                else
                {
                    nombre = TituloEspanol(texto);
                    id = IdNueva(clave);
                    Nuevas.Add(nombre);
                }
                _porNormalizado[clave] = id;
                destino.Add(new EscuelaPadron { Id = id, Nombre = nombre, Abreviatura = id[2..] });
            }
            return _porTexto[texto] = id;
        }

        private string IdNueva(string clave)
        {
            var iniciales = string.Concat(clave.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(p => p.Length > 2 && p is not ("DEL" or "LAS" or "LOS" or "POR" or "CON")).Select(p => p[0]).Where(char.IsAsciiLetterUpper));
            iniciales = iniciales.Length >= 2 ? iniciales[..Math.Min(4, iniciales.Length)] : "ESC";
            var ocupados = destino.Select(e => e.Id).Concat(EscuelasConocidas.Values.Select(e => e.Id)).ToHashSet(StringComparer.Ordinal);
            var id = "E-" + iniciales;
            for (var n = 2; ocupados.Contains(id); n++) id = $"E-{iniciales}{n}";
            return id;
        }
    }

    private static void LeerAlumnos(AnalisisPadron r, LectorXlsx xlsx, string hoja, int cabecera, Dictionary<string, int> columnas, OrigenPadron origenLibro)
    {
        var col = Exigir(columnas, ColumnasAlumnos, "alumnos");
        int cSem = col["COD SEM"], cCod = col["COD ALUMNO"], cPat = col["APE PAT ALUMNO"], cMat = col["APE MAT ALUMNO"], cNom = col["NOMBRES"],
            cEsc = col["ESCUELA ALUMNO"], cEst = col["ESTADO"], cPpa = col["PPA"], cTca = col["TCA"], cCorreo = col["EMAIL UNAS"], cCel = col["CELULAR"],
            cCurso = col["COD CURSO"], cNomCurso = col["NOMBRE CURSO"], cGrupo = col["GRUPO CURSO"], cAula = col["NOMBRE AULA"], cCodAula = col["COD AULA"],
            cDoc = col["DOCENTE"], cDia = col["DIA SEMANA"], cDur = col["DURACION HORAS"], cHoras = col["HORAS"], cTeo = col["ES HORA TEORICA"];
        var origen = new OrigenPadron { Archivo = origenLibro.Archivo, Sha256 = origenLibro.Sha256, Hoja = hoja };
        var escuelas = new Escuelas(r.Escuelas);
        var estudiantes = new Dictionary<string, (EstudiantePadron Estudiante, string Escuela, MatriculaPadron Matricula)>(StringComparer.Ordinal);
        var cursos = new Dictionary<(string Escuela, string Codigo), CursoPadron>();
        var inscritos = new Dictionary<(string Estudiante, string Curso, string Grupo), CursoMatriculado>();
        var horarios = new Dictionary<string, HorarioPadron>(StringComparer.Ordinal);
        var excluidos = new HashSet<string>(StringComparer.Ordinal);
        string? semestre = null;
        int filas = 0, contradicciones = 0, cursosContradictorios = 0, sinBloque = 0, repetidos = 0, numerosInvalidos = 0, otroDominio = 0;
        var ejemplosDominio = new List<string>();

        foreach (var (numero, celdas) in xlsx.Filas(hoja))
        {
            if (numero <= cabecera) continue;
            filas++;
            string Celda(int c) => Texto(celdas[c]);
            var cod = Celda(cCod);
            var paterno = Celda(cPat);
            var materno = Celda(cMat);
            var nombres = Celda(cNom);
            var correo = Celda(cCorreo).ToLowerInvariant();
            var escuela = Celda(cEsc);
            var estado = Celda(cEst);
            var ppa = Celda(cPpa);
            var tca = Celda(cTca);
            var celular = Celda(cCel);
            // Un alumno ocupa una fila por cada bloque de clase: sus datos personales solo se validan cuando cambian.
            var conocido = estudiantes.TryGetValue(cod, out var previo);
            var mismosDatos = conocido && previo.Estudiante.ApellidoPaterno == paterno && previo.Estudiante.ApellidoMaterno == materno &&
                previo.Estudiante.Nombres == nombres && previo.Estudiante.Correo == correo && previo.Escuela == escuela &&
                previo.Estudiante.EstadoFuente == estado && previo.Estudiante.PpaFuente == ppa && previo.Estudiante.TcaFuente == tca && previo.Estudiante.Telefono == celular;
            var fuenteSemestre = Celda(cSem);
            var codCurso = Celda(cCurso);
            var nombreCurso = Celda(cNomCurso);
            var motivo = MotivoExclusion(mismosDatos, cod, paterno, materno, nombres, correo, escuela, estado, fuenteSemestre, codCurso, nombreCurso);
            if (motivo is { } m)
            {
                if (cod.Length > 0) excluidos.Add(cod);
                r.Resumen.FilasAlumnosExcluidas++;
                if (r.Excluidas.Count < MaxExcluidasEnDetalle) r.Excluidas.Add(new FilaExcluida("Alumnos", numero, m.Motivo, m.Detalle));
                continue;
            }
            var semestreFila = SemestreInterno(fuenteSemestre);
            TutoriaError.Exigir(semestre is null || semestre == semestreFila,
                $"El padrón debe corresponder a un único semestre; se encontraron: {semestre}, {semestreFila}.", 422);
            semestre = semestreFila;
            var escuelaId = escuelas.Id(escuela);

            if (!conocido)
            {
                var promedio = Numero(ppa);
                var creditos = Numero(tca);
                if ((ppa.Length > 0 && promedio is not (>= 0 and <= 20)) || (tca.Length > 0 && creditos is not >= 0)) numerosInvalidos++;
                var estudiante = new EstudiantePadron
                {
                    Id = "PAD-ALU-" + cod,
                    Codigo = cod,
                    Apellidos = Texto(paterno + " " + materno),
                    ApellidoPaterno = paterno,
                    ApellidoMaterno = materno,
                    Nombres = nombres,
                    EscuelaId = escuelaId,
                    EstadoFuente = estado,
                    Correo = correo,
                    Telefono = celular,
                    PpaFuente = ppa,
                    TcaFuente = tca,
                    PromedioPonderado = promedio is >= 0 and <= 20 ? promedio : null,
                    CreditosAprobados = creditos is >= 0 ? creditos : null,
                    Origen = origen.ConFilas(numero),
                };
                previo = (estudiante, escuela, new MatriculaPadron { EstudianteId = estudiante.Id, SemestreId = semestreFila, Origen = origen });
                estudiantes[cod] = previo;
                r.Estudiantes.Add(estudiante);
                r.Matriculas.Add(previo.Matricula);
                if (!correo.EndsWith("@unas.edu.pe", StringComparison.Ordinal) && ++otroDominio <= 3) ejemplosDominio.Add(correo);
            }
            else
            {
                if (!mismosDatos) contradicciones++;   // se conservan los datos de la primera fila del alumno
                previo.Estudiante.Origen.Filas!.Add(numero);
            }
            var sid = previo.Estudiante.Id;

            if (!cursos.TryGetValue((escuelaId, codCurso), out var curso))
            {
                curso = new CursoPadron { Id = IdEstable("PAD-CUR-", escuelaId, codCurso), Codigo = codCurso, Nombre = nombreCurso, EscuelaId = escuelaId, Origen = origen };
                cursos[(escuelaId, codCurso)] = curso;
                r.Cursos.Add(curso);
            }
            else if (curso.Nombre != nombreCurso) cursosContradictorios++;

            var grupo = Celda(cGrupo);
            var docente = Celda(cDoc);
            if (!inscritos.TryGetValue((sid, curso.Id, grupo), out var inscrito))
            {
                inscrito = new CursoMatriculado { CursoId = curso.Id, Seccion = grupo, Docente = docente };
                inscritos[(sid, curso.Id, grupo)] = inscrito;
                previo.Matricula.Cursos.Add(inscrito);
            }
            else if (inscrito.Docente != docente && !inscrito.Docente.Split(" / ").Contains(docente))
                inscrito.Docente = string.Join(" / ", inscrito.Docente.Split(" / ").Append(docente).Order(StringComparer.Ordinal));

            var original = new HorarioOriginal
            {
                Fila = numero,
                Dia = Celda(cDia),
                Horas = Celda(cHoras),
                Duracion = Celda(cDur),
                Aula = Celda(cAula),
                CodigoAula = Celda(cCodAula),
                EsHoraTeorica = Celda(cTeo),
                Docente = docente,
            };
            inscrito.HorariosOriginales.Add(original);
            var dia = original.Dia is [>= '1' and <= '7'] ? original.Dia[0] - '0' : 0;
            int? duracion = original.Duracion.Length is > 0 and <= 2 && original.Duracion.All(char.IsAsciiDigit) ? int.Parse(original.Duracion, CultureInfo.InvariantCulture) : null;
            if (dia == 0 || Bloque(original.Horas, duracion) is not { } bloque) { sinBloque++; continue; }   // queda su texto original en la matrícula
            var hid = IdEstable("PAD-HOR-", sid, semestreFila, curso.Id, grupo, dia.ToString(CultureInfo.InvariantCulture), bloque.Inicio, bloque.Fin, original.CodigoAula, original.EsHoraTeorica);
            if (horarios.TryGetValue(hid, out var existente)) { existente.Origen.Filas!.Add(numero); repetidos++; continue; }
            var horario = new HorarioPadron
            {
                Id = hid,
                Titulo = grupo.Length > 0 ? nombreCurso + " · " + grupo : nombreCurso,
                Dia = dia,
                HoraInicio = bloque.Inicio,
                HoraFin = bloque.Fin,
                Lugar = original.Aula,
                EstudianteId = sid,
                CursoId = curso.Id,
                SemestreId = semestreFila,
                Origen = origen.ConFilas(numero),
            };
            horarios[hid] = horario;
            r.Horarios.Add(horario);
        }

        r.Escuelas.Sort((x, y) => string.Compare(x.Nombre, y.Nombre, Peru, CompareOptions.IgnoreCase));
        var resumen = r.Resumen;
        resumen.FilasAlumnos = filas;
        resumen.AlumnosExcluidos = excluidos.Count(c => !estudiantes.ContainsKey(c));
        resumen.HorariosDuplicados = repetidos;
        resumen.HorariosSinNormalizar = sinBloque;
        if (semestre is not null)
        {
            resumen.Semestre = semestre;
            resumen.SemestreFuente = SemestreFuente(semestre);
            var pestana = SemestreEnNombre().Match(hoja);
            if (pestana.Success && SemestreInterno(pestana.Value) != semestre)
                r.Advertencias.Add($"La pestaña «{hoja}» dice {pestana.Value}, pero las filas traen el código {resumen.SemestreFuente}. Se usa el de las filas: {semestre}.");
        }
        if (resumen.FilasAlumnosExcluidas > 0) r.Advertencias.Add($"{resumen.FilasAlumnosExcluidas} filas de alumnos no se importan (ver el detalle de filas excluidas).");
        if (escuelas.Nuevas.Count > 0) r.Advertencias.Add("Se crearán escuelas nuevas en el catálogo (sin facultad asignada): " + string.Join(", ", escuelas.Nuevas) + ".");
        if (contradicciones > 0) r.Advertencias.Add($"{contradicciones} filas traen datos personales distintos a los de otra fila del mismo alumno; se conservaron los de la primera.");
        if (cursosContradictorios > 0) r.Advertencias.Add($"{cursosContradictorios} filas nombran distinto a un curso ya registrado con el mismo código; se conservó el primer nombre.");
        if (numerosInvalidos > 0) r.Advertencias.Add($"{numerosInvalidos} alumnos tienen PPA o TCA fuera de rango o ilegibles; se dejaron como «Sin informar».");
        if (otroDominio > 0) r.Advertencias.Add($"{otroDominio} alumnos tienen un correo fuera de @unas.edu.pe (por ejemplo {string.Join(", ", ejemplosDominio)}). Se importan tal como vienen; corrígelos en el Excel si es un error.");
        if (sinBloque > 0) r.Advertencias.Add($"{sinBloque} filas de horario no tienen día u horas interpretables; se conservan con su texto original en la ficha del alumno, sin bloque en el calendario.");
    }

    /// <summary>Motivo por el que una fila de alumno no se importa, o nulo si es válida. El orden de las reglas define el mensaje.</summary>
    private static (string Motivo, string Detalle)? MotivoExclusion(bool datosYaValidados, string cod, string paterno, string materno, string nombres,
        string correo, string escuela, string estado, string semestre, string codCurso, string nombreCurso)
    {
        if (!datosYaValidados)
        {
            var faltan = new List<string>(4);
            if (SinDefinir(cod)) faltan.Add("código de alumno");
            if (SinDefinir(paterno, true) && SinDefinir(materno, true)) faltan.Add("apellidos");
            if (SinDefinir(nombres, true)) faltan.Add("nombres");
            if (!CorreoAceptable(correo)) faltan.Add(correo.Length == 0 ? "correo" : "correo válido");
            if (faltan.Count > 0) return ("Datos incompletos", "Falta o no es válido: " + string.Join(", ", faltan));
        }
        if (!Semestre().IsMatch(semestre)) return ("Semestre inválido", $"«{semestre}» no tiene el formato AAAA-1 o AAAA-2");
        if (datosYaValidados) return codCurso.Length == 0 || nombreCurso.Length == 0 ? ("Curso incompleto", "Falta el código o el nombre del curso") : null;
        if (!Codigo().IsMatch(cod)) return ("Código de alumno inválido", $"«{cod}» tiene caracteres no permitidos");
        if (SinDefinir(escuela)) return ("Datos incompletos", "Falta la escuela del alumno");
        if (Normalizado(estado) != "MATRICULADO") return ("Estado no admitido", $"Estado «{estado}»; solo se importan alumnos matriculados");
        if (codCurso.Length == 0 || nombreCurso.Length == 0) return ("Curso incompleto", "Falta el código o el nombre del curso");
        return null;
    }

    private static void LeerDocentes(AnalisisPadron r, LectorXlsx xlsx, string hoja, int cabecera, Dictionary<string, int> columnas, OrigenPadron origenLibro)
    {
        var col = Exigir(columnas, ColumnasDocentes, "docentes");
        int cPat = col["APELLIDO PATERNO"], cMat = col["APELLIDO MATERNO"], cNom = col["NOMBRES"], cCorreo = col["EMAIL"], cDep = col["DEPARTAMENTO ACADEMICO"];
        var origen = new OrigenPadron { Archivo = origenLibro.Archivo, Sha256 = origenLibro.Sha256, Hoja = hoja };
        var docentes = new Dictionary<string, DocentePadron>(StringComparer.Ordinal);
        var correos = new Dictionary<string, string>(StringComparer.Ordinal);
        var porMotivo = new SortedDictionary<string, int>(StringComparer.Ordinal);
        int filas = 0, excluidas = 0, repetidos = 0, correosContradictorios = 0, correosCompartidos = 0;

        foreach (var (numero, celdas) in xlsx.Filas(hoja))
        {
            if (numero <= cabecera) continue;
            filas++;
            var paterno = Texto(celdas[cPat]);
            var materno = Texto(celdas[cMat]);
            var nombres = Texto(celdas[cNom]);
            var correo = Texto(celdas[cCorreo]).ToLowerInvariant();
            var departamento = Texto(celdas[cDep]);
            // Regla del padrón: los cinco campos deben existir y ser reales. «NO SE DEFINE», vacío o un valor sin
            // letras («-», «?», «0») significa que la fila no identifica a un docente y no se importa.
            var problemas = new List<string>(4);
            if (SinDefinir(paterno, true) || SinDefinir(materno, true) || SinDato.Contains(Normalizado(paterno + " " + materno))) problemas.Add("apellidos");
            if (SinDefinir(nombres, true)) problemas.Add("nombres");
            if (SinDefinir(correo) || !CorreoAceptable(correo)) problemas.Add("correo");
            if (SinDefinir(departamento, true)) problemas.Add("departamento académico");
            if (problemas.Count > 0)
            {
                excluidas++;
                var motivo = "No se define: " + string.Join(", ", problemas);
                porMotivo[motivo] = porMotivo.GetValueOrDefault(motivo) + 1;
                if (r.Excluidas.Count < MaxExcluidasEnDetalle)
                    r.Excluidas.Add(new FilaExcluida("Docentes", numero, "Datos no definidos", $"{motivo} · {Texto(paterno + " " + materno + " " + nombres)}".Trim(' ', '·')));
                continue;
            }
            var tid = IdEstable("PAD-DOC-", Normalizado(paterno), Normalizado(materno), Normalizado(nombres), Normalizado(departamento));
            if (docentes.TryGetValue(tid, out var docente))
            {
                repetidos++;
                if (docente.Correo != correo) correosContradictorios++;   // se conserva el primero
                docente.Origen.Filas!.Add(numero);
                continue;
            }
            docente = new DocentePadron
            {
                Id = tid,
                Apellidos = Texto(paterno + " " + materno),
                ApellidoPaterno = paterno,
                ApellidoMaterno = materno,
                Nombres = nombres,
                Departamento = departamento,
                Correo = correo,
                Origen = origen.ConFilas(numero),
            };
            docentes[tid] = docente;
            r.Docentes.Add(docente);
            if (!correos.TryAdd(correo, tid)) correosCompartidos++;
        }

        r.Resumen.FilasDocentes = filas;
        r.Resumen.FilasDocentesExcluidas = excluidas;
        r.Resumen.DuplicadosDocentes = repetidos;
        if (excluidas > 0)
            r.Advertencias.Add($"{excluidas} filas de docentes no se importan porque no definen sus datos: " +
                string.Join("; ", porMotivo.Select(p => $"{p.Value} con «{p.Key}»")) + ".");
        if (repetidos > 0) r.Advertencias.Add($"{repetidos} filas de docentes repiten a otro docente (mismos apellidos, nombres y departamento) y se unificaron.");
        if (correosContradictorios > 0) r.Advertencias.Add($"{correosContradictorios} docentes repetidos traen correos distintos; se conservó el primero.");
        if (correosCompartidos > 0) r.Advertencias.Add($"{correosCompartidos} docentes distintos comparten el mismo correo; revisa el Excel antes de crear sus cuentas.");
    }

    private static string TituloEspanol(string texto)
    {
        var menores = new HashSet<string>(StringComparer.Ordinal) { "de", "del", "la", "las", "los", "y", "e", "en", "el", "a" };
        return string.Join(' ', Texto(texto).ToLower(Peru).Split(' ')
            .Select((p, i) => i > 0 && menores.Contains(p) ? p : char.ToUpper(p[0], Peru) + p[1..]));
    }
}
