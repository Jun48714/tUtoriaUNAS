using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Security;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Services.Padron;

namespace TutoriaUNAS.Api.Tests;

/// <summary>Arma libros .xlsx mínimos en memoria (sin datos reales) para probar el lector y las reglas del padrón.</summary>
internal static class LibroPrueba
{
    public static readonly string[] CabeceraAlumnos =
    [
        "COD SEM", "COD ALUMNO", "APE PAT ALUMNO", "APE MAT ALUMNO", "NOMBRES", "ESCUELA ALUMNO", "ESTADO", "PPA", "TCA", "EMAIL UNAS", "CELULAR",
        "COD CURSO", "NOMBRE CURSO", "GRUPO CURSO", "NOMBRE AULA", "COD AULA", "DOCENTE ", "DIA SEMANA", "DURACION HORAS", "HORAS", "ES HORA TEORICA",
    ];
    public static readonly string[] CabeceraDocentes = ["APELLIDO PATERNO", "APELLIDO MATERNO", "NOMBRES", "EMAIL", "DEPARTAMENTO ACADEMICO"];

    public static string[] Alumno(string codigo = "0020250001", string paterno = "PEREZ", string materno = "LOPEZ", string nombres = "ANA", string escuela = "ZOOTECNIA",
        string estado = "MATRICULADO", string ppa = "13.5", string tca = "40", string correo = "ana.perez@unas.edu.pe", string celular = "999888777",
        string curso = "SA050306", string nombreCurso = "FISICA I", string grupo = "", string dia = "1", string duracion = "4", string horas = "09-01 pm.", string semestre = "2026-2") =>
        [semestre, codigo, paterno, materno, nombres, escuela, estado, ppa, tca, correo, celular, curso, nombreCurso, grupo, "AULA 1", "032", "DOCENTE UNO", dia, duracion, horas, "1"];

    public static MemoryStream Crear(params (string Hoja, string[][] Filas)[] hojas)
    {
        var memoria = new MemoryStream();
        using (var zip = new ZipArchive(memoria, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Entrada(string ruta, string xml)
            {
                using var w = new StreamWriter(zip.CreateEntry(ruta).Open(), new UTF8Encoding(false));
                w.Write(xml);
            }
            var hojasXml = string.Concat(hojas.Select((h, i) => $"""<sheet name="{SecurityElement.Escape(h.Hoja)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>"""));
            Entrada("xl/workbook.xml", $"""<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{hojasXml}</sheets></workbook>""");
            Entrada("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                string.Concat(hojas.Select((_, i) => $"""<Relationship Id="rId{i + 1}" Type="x" Target="worksheets/sheet{i + 1}.xml"/>""")) + "</Relationships>");
            for (var i = 0; i < hojas.Length; i++)
            {
                var filas = new StringBuilder();
                for (var f = 0; f < hojas[i].Filas.Length; f++)
                {
                    filas.Append($"<row r=\"{f + 1}\">");
                    var celdas = hojas[i].Filas[f];
                    for (var c = 0; c < celdas.Length; c++)
                    {
                        if (celdas[c] is null) continue;   // celda vacía: no se escribe
                        filas.Append($"""<c r="{Columna(c)}{f + 1}" t="inlineStr"><is><t>{SecurityElement.Escape(celdas[c])}</t></is></c>""");
                    }
                    filas.Append("</row>");
                }
                Entrada($"xl/worksheets/sheet{i + 1}.xml", $"""<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{filas}</sheetData></worksheet>""");
            }
        }
        memoria.Position = 0;
        return memoria;
    }

    /// <summary>Libro de una hoja «H» con el XML de la hoja y, opcionalmente, el de los textos compartidos, tal cual.</summary>
    public static MemoryStream Crudo(string filasXml, string? compartidosXml = null, string? prologo = null)
    {
        var memoria = new MemoryStream();
        using (var zip = new ZipArchive(memoria, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Entrada(string ruta, string xml)
            {
                using var w = new StreamWriter(zip.CreateEntry(ruta).Open(), new UTF8Encoding(false));
                w.Write(xml);
            }
            Entrada("xl/workbook.xml", """<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>""");
            Entrada("xl/_rels/workbook.xml.rels", """<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="/xl/worksheets/sheet1.xml"/></Relationships>""");
            Entrada("xl/worksheets/sheet1.xml", $"""<?xml version="1.0"?>{prologo}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{filasXml}</sheetData></worksheet>""");
            if (compartidosXml is not null)
                Entrada("xl/sharedStrings.xml", $"""<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{compartidosXml}</sst>""");
        }
        memoria.Position = 0;
        return memoria;
    }

    private static string Columna(int i) => i < 26 ? ((char)('A' + i)).ToString() : "A" + (char)('A' + i - 26);

    /// <summary>Un libro con las dos hojas como las entrega la oficina: título, filas vacías y cabecera en la fila 4 (alumnos) o 3 (docentes).</summary>
    public static MemoryStream Padron(string[][] alumnos, string[][] docentes) => Crear(
        ("ALUMNOS 2026-1", [["REGISTRO DE ALUMNOS"], [], [], CabeceraAlumnos, .. alumnos]),
        ("DOCENTES 2026-1", [["REGISTRO DE DOCENTES ACTIVOS"], [], CabeceraDocentes, .. docentes]));
}

public sealed class PadronImportacionTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static AnalisisPadron Analizar(MemoryStream libro) => AnalizadorPadron.Analizar(libro, "prueba.xlsx", "sha");

    [Fact]
    public void ImportaAlumnosConGrupoVacioYBloquesDeHorario()
    {
        var a = Analizar(LibroPrueba.Padron([
            LibroPrueba.Alumno(),
            LibroPrueba.Alumno(curso: "MA010101", nombreCurso: "MATEMATICA", dia: "3", duracion: "3", horas: "02-05 pm."),
            LibroPrueba.Alumno(codigo: "0020250002", correo: "luis@unas.edu.pe", ppa: "", tca: ""),
        ], []));
        Assert.Equal(2, a.Estudiantes.Count);
        Assert.Equal(2, a.Matriculas.Count);
        Assert.Equal(2, a.Cursos.Count);
        Assert.Equal(3, a.Horarios.Count);
        Assert.Equal("2026-II", a.Resumen.Semestre);
        Assert.Equal("E-ZOO", a.Estudiantes[0].EscuelaId);
        Assert.Equal(("09:00", "13:00"), (a.Horarios[0].HoraInicio, a.Horarios[0].HoraFin));
        Assert.Equal(1, a.Resumen.SinPpa);
        Assert.Empty(a.Excluidas);
        Assert.Contains(a.Advertencias, w => w.Contains("2026-1") && w.Contains("2026-II"));
    }

    [Fact]
    public void ElDocenteSinTodosSusCamposNoSeImportaYQuedaElMotivo()
    {
        string[][] docentes =
        [
            new[] { "PRUEBA", "DOCENTE", "CARLOS", "carlos.prueba@unas.edu.pe", "CIENCIAS FORESTALES" },
            new[] { "NO SE", "DEFINE", "FOREST. PROF.4", null!, "CIENCIAS FORESTALES" },                 // marcador y sin correo
            new[] { "RAMOS", "DIAZ", "LUIS", null!, "CIENCIAS AGRARIAS" },                              // sin correo
            new[] { "TORRES", "VEGA", "ROSA", "rosa.torres@unas.edu.pe", null! },                       // sin departamento
            new[] { "-", "SOTO", "ELENA", "elena@unas.edu.pe", "HUMANIDADES" },                         // algo raro: solo un guion
            new[] { "LUNA", "PAZ", "123", "pedro@unas.edu.pe", "HUMANIDADES" },                         // nombre sin letras
            new[] { "CRUZ", "REYES", "ANA", "no es un correo", "HUMANIDADES" },                         // correo inválido
            new[] { "N/A", "N/A", "N/A", "n/a", "N/A" },
        ];
        var a = Analizar(LibroPrueba.Padron([LibroPrueba.Alumno()], docentes));
        var docente = Assert.Single(a.Docentes);
        Assert.Equal("PRUEBA DOCENTE", docente.Apellidos);
        Assert.Equal("CIENCIAS FORESTALES", docente.Departamento);
        Assert.Equal(7, a.Resumen.FilasDocentesExcluidas);
        Assert.Equal(8, a.Resumen.FilasDocentes);
        Assert.Equal(7, a.Excluidas.Count(x => x.Hoja == "Docentes"));
        Assert.Contains(a.Excluidas, x => x.Detalle.Contains("apellidos") && x.Detalle.Contains("correo"));
        Assert.Contains(a.Excluidas, x => x.Detalle.Contains("departamento académico"));
    }

    [Fact]
    public void ReconoceLasHojasAunqueLaCabeceraNoEmpiezeEnLaColumnaA()
    {
        string[] corrida = [null!, .. LibroPrueba.CabeceraDocentes];      // columna A vacía
        var libro = LibroPrueba.Crear(("Docentes", [corrida, [null!, "SOTO", "RIOS", "MARIA", "maria@unas.edu.pe", "CIENCIAS EXACTAS"]]));
        var a = Analizar(libro);
        Assert.Single(a.Docentes);
        Assert.Empty(a.Estudiantes);
        Assert.False(a.Resumen.TieneAlumnos);
        Assert.True(a.Resumen.TieneDocentes);
    }

    [Fact]
    public void ExcluyeSoloLasFilasDeAlumnosIncompletasSinDetenerElResto()
    {
        var a = Analizar(LibroPrueba.Padron([
            LibroPrueba.Alumno(),
            LibroPrueba.Alumno(codigo: "0020250003", correo: "sin-arroba"),
            LibroPrueba.Alumno(codigo: "0020250004", nombres: ""),
            LibroPrueba.Alumno(codigo: "0020250005", estado: "RETIRADO"),
            LibroPrueba.Alumno(codigo: "0020250006", nombreCurso: ""),
            LibroPrueba.Alumno(codigo: "0020250007", escuela: "ESCUELA NUEVA DE PRUEBA"),
        ], []));
        Assert.Equal(2, a.Estudiantes.Count);
        Assert.Equal(4, a.Excluidas.Count);
        Assert.Contains(a.Excluidas, x => x.Motivo == "Estado no admitido");
        Assert.Contains(a.Escuelas, e => e.Nombre == "Escuela Nueva de Prueba");
        Assert.Contains(a.Advertencias, w => w.Contains("escuelas nuevas"));
    }

    [Fact]
    public void RechazaArchivosQueNoSonUnPadronValido()
    {
        var sinDatos = Assert.Throws<TutoriaError>(() => Analizar(LibroPrueba.Crear(("Otra", [["a", "b"], ["1", "2"]]))));
        Assert.Equal(400, sinDatos.Status);
        var incompleto = Assert.Throws<TutoriaError>(() => Analizar(LibroPrueba.Crear(("Alumnos", [["COD SEM", "COD ALUMNO"]]))));
        Assert.Contains("faltan columnas", incompleto.Message);
        Assert.Throws<TutoriaError>(() => Analizar(new MemoryStream(Encoding.UTF8.GetBytes("no soy un zip"))));
        var variosSemestres = Assert.Throws<TutoriaError>(() => Analizar(LibroPrueba.Padron(
            [LibroPrueba.Alumno(), LibroPrueba.Alumno(codigo: "0020250009", semestre: "2026-1")], [])));
        Assert.Contains("único semestre", variosSemestres.Message);
    }

    [Fact]
    public void LeeTextosCompartidosEnriquecidosCeldasAutocerradasYSinReferencia()
    {
        const string compartidos = "<si><t>COD SEM</t></si><si/><si><r><t>Pé</t></r><r><t>rez</t></r><rPh><t>ペレス</t></rPh></si><si><t xml:space=\"preserve\">  dos  espacios </t></si>";
        const string filas = """
            <row r="1">
              <c r="A1" t="s"><v>0</v></c>
              <c r="B1" t="s"><v>1</v></c>
              <c t="s"><v>2</v></c>
              <c r="E1" s="3"/>
              <c r="F1"><f>1+1</f><v>2</v></c>
              <c r="G1" t="s"><v>3</v></c>
            </row>
            <row r="2"/>
            <row r="3"><c r="A3" t="inlineStr"><is><t>   </t></is></c></row>
            <row><c r="B4" t="inlineStr"><is><t>sin número de fila</t></is></c></row>
            """;
        using var xlsx = new LectorXlsx(LibroPrueba.Crudo(filas, compartidos));
        var leidas = xlsx.Filas("H").Select(f => (f.Fila, Celdas: f.Celdas.ToArray())).ToList();
        Assert.Equal([1, 4], leidas.Select(f => f.Fila));            // la fila vacía y la de solo espacios no cuentan
        var c = leidas[0].Celdas;
        Assert.Equal("COD SEM", c[0]);
        Assert.Equal("", c[1]);                                         // <si/> vacío no desplaza los índices
        Assert.Equal("Pérez", c[2]);                                    // sin referencia: va en la columna siguiente; sin la lectura fonética
        Assert.Equal("", c[4]);
        Assert.Equal("2", c[5]);                                        // valor calculado, no la fórmula
        Assert.Equal("  dos  espacios ", c[6]);
        Assert.Equal("sin número de fila", leidas[1].Celdas[1]);
    }

    [Fact]
    public void RechazaXmlConDtdYTextosCompartidosInexistentes()
    {
        const string dtd = """<!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>""";
        var conDtd = Assert.Throws<TutoriaError>(() => Analizar(LibroPrueba.Crudo("""<row r="1"><c r="A1" t="inlineStr"><is><t>&b;</t></is></c></row>""", prologo: dtd)));
        Assert.Equal(400, conDtd.Status);
        var indice = Assert.Throws<TutoriaError>(() => Analizar(LibroPrueba.Crudo("""<row r="1"><c r="A1" t="s"><v>7</v></c></row>""", "<si><t>x</t></si>")));
        Assert.Equal(400, indice.Status);
        Assert.Equal(400, Assert.Throws<TutoriaError>(() => Analizar(new MemoryStream())).Status);
    }

    [Fact]
    public void CortaElArchivoQueSeDescomprimeMasDeLoPermitido()
    {
        // 20 000 filas comprimen a unos KB pero ocupan más de 1 MB al descomprimirse.
        var filas = string.Concat(Enumerable.Range(1, 20_000).Select(i => $"""<row r="{i}"><c r="A{i}" t="inlineStr"><is><t>relleno</t></is></c></row>"""));
        var libro = LibroPrueba.Crudo(filas);
        Assert.True(libro.Length < 200_000);
        using var xlsx = new LectorXlsx(libro, maxBytesDescomprimidos: 1_000_000);
        var error = Assert.Throws<TutoriaError>(() => xlsx.Filas("H").Count());
        Assert.Equal(413, error.Status);
    }

    [Fact]
    public void LimpiaEspaciosUnicodeYConservaLaPrimeraVersionDeUnAlumnoContradictorio()
    {
        var a = Analizar(LibroPrueba.Padron([
            LibroPrueba.Alumno(paterno: "\u00a0PEREZ\u00a0", nombres: "ANA\u2003 MARIA", ppa: "25"),
            LibroPrueba.Alumno(nombres: "OTRO NOMBRE", curso: "MA010101", nombreCurso: "MATEMATICA"),
        ], []));
        var alumno = Assert.Single(a.Estudiantes);
        Assert.Equal("PEREZ", alumno.ApellidoPaterno);
        Assert.Equal("ANA MARIA", alumno.Nombres);
        Assert.Null(alumno.PromedioPonderado);                         // 25 está fuera de 0–20
        Assert.Equal("25", alumno.PpaFuente);                          // el valor original se conserva
        Assert.Equal(2, Assert.Single(a.Matriculas).Cursos.Count);
        Assert.Contains(a.Advertencias, w => w.Contains("datos personales distintos"));
        Assert.Contains(a.Advertencias, w => w.Contains("PPA o TCA"));
    }

    [Theory]
    [InlineData("09-01 pm.", 4, "09:00", "13:00")]
    [InlineData("02-05 pm.", 3, "14:00", "17:00")]
    [InlineData("08-10 am.", 2, "08:00", "10:00")]
    [InlineData("11-01 pm.", 2, "11:00", "13:00")]
    public void InterpretaLasHorasDelExcel(string crudo, int duracion, string inicio, string fin) =>
        Assert.Equal((inicio, fin), AnalizadorPadron.Bloque(crudo, duracion));

    [Theory]
    [InlineData("", 4)]
    [InlineData("texto", 4)]
    [InlineData("09-01 pm.", 0)]
    [InlineData("09-10 pm.", 4)]
    public void NoInventaHorasQueNoSePuedenDeducir(string crudo, int duracion) => Assert.Null(AnalizadorPadron.Bloque(crudo, duracion));

    [Theory]
    [InlineData("NO SE DEFINE", true)]
    [InlineData("  no   se  define ", true)]
    [InlineData("N/A", true)]
    [InlineData("-", true)]
    [InlineData("", true)]
    [InlineData("JORGE", false)]
    [InlineData("DACME PROF.11 (MEC.ELECT)", false)]
    public void ReconoceLosValoresSinDefinir(string valor, bool esperado) => Assert.Equal(esperado, AnalizadorPadron.SinDefinir(valor));

    [PostgresFact]
    public async Task SoloLaAdministracionImportaYElPadronQuedaEnLaBase()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        using var alumno = await fixture.Login("2023010456", "estudiante");
        var libro = LibroPrueba.Padron(
            [LibroPrueba.Alumno(), LibroPrueba.Alumno(curso: "MA010101", nombreCurso: "MATEMATICA", dia: "3", duracion: "3", horas: "02-05 pm.")],
            [["PRUEBA", "DOCENTE", "CARLOS", "carlos.prueba@unas.edu.pe", "CIENCIAS FORESTALES"], ["NO SE", "DEFINE", "PROF.4", null!, "CIENCIAS FORESTALES"]]);
        HttpContent Contenido()
        {
            var form = new MultipartFormDataContent();
            var bytes = new ByteArrayContent(libro.ToArray());
            form.Add(bytes, "archivo", "padron.xlsx");
            return form;
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await tutor.PostAsync("/api/padron/importar/analizar", Contenido())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await alumno.PostAsync("/api/padron/importar/analizar", Contenido())).StatusCode);
        var invalido = new MultipartFormDataContent { { new ByteArrayContent("hola"u8.ToArray()), "archivo", "padron.txt" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/padron/importar/analizar", invalido)).StatusCode);

        var respuesta = await admin.PostAsync("/api/padron/importar/analizar", Contenido());
        Assert.Equal(HttpStatusCode.OK, respuesta.StatusCode);
        var vista = await respuesta.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, vista.GetProperty("alumnos").GetProperty("importables").GetInt32());
        Assert.Equal(1, vista.GetProperty("docentes").GetProperty("importables").GetInt32());
        Assert.Equal(1, vista.GetProperty("docentes").GetProperty("excluidos").GetInt32());
        // La vista previa no escribe nada.
        Assert.Equal(0, (await admin.GetFromJsonAsync<JsonElement>("/api/padron?tipo=tutor")).GetProperty("total").GetInt32());

        var token = vista.GetProperty("token").GetString();
        Assert.Equal(HttpStatusCode.Gone, (await admin.PostAsJsonAsync("/api/padron/importar/confirmar", new { token = "inexistente" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tutor.PostAsJsonAsync("/api/padron/importar/confirmar", new { token })).StatusCode);
        var confirmada = await admin.PostAsJsonAsync("/api/padron/importar/confirmar", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmada.StatusCode);
        var resultado = await confirmada.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, resultado.GetProperty("alumnos").GetInt32());
        Assert.Equal(2, resultado.GetProperty("horarios").GetInt32());

        var docentes = await admin.GetFromJsonAsync<JsonElement>("/api/padron?tipo=tutor");
        Assert.Equal(1, docentes.GetProperty("total").GetInt32());
        Assert.Equal("PRUEBA DOCENTE", docentes.GetProperty("filas")[0].GetProperty("apellidos").GetString());
        var alumnos = await admin.GetFromJsonAsync<JsonElement>("/api/padron?tipo=estudiante&buscar=perez");
        Assert.Equal(1, alumnos.GetProperty("total").GetInt32());
        Assert.Equal(1, alumnos.GetProperty("importaciones").GetArrayLength());
        // Repetir el mismo archivo no duplica nada.
        var repetida = await (await admin.PostAsync("/api/padron/importar/analizar", Contenido())).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(repetida.GetProperty("yaImportado").GetBoolean());
        Assert.Equal(1, repetida.GetProperty("alumnos").GetProperty("actualizados").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/padron/importar/confirmar", new { token = repetida.GetProperty("token").GetString() })).StatusCode);
        Assert.Equal(1, (await admin.GetFromJsonAsync<JsonElement>("/api/padron?tipo=tutor")).GetProperty("total").GetInt32());
    }
}

/// <summary>Reimportación, concurrencia y reversión contra PostgreSQL. Esquema propio, separado de las demás pruebas del padrón.</summary>
public sealed class PadronReimportacionTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static async Task<JsonElement> Analizar(HttpClient cliente, MemoryStream libro)
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(libro.ToArray()), "archivo", "padron.xlsx" } };
        var respuesta = await cliente.PostAsync("/api/padron/importar/analizar", form);
        Assert.Equal(HttpStatusCode.OK, respuesta.StatusCode);
        return await respuesta.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static Task<HttpResponseMessage> Confirmar(HttpClient cliente, string token) =>
        cliente.PostAsJsonAsync("/api/padron/importar/confirmar", new { token });

    private async Task<T> EnBase<T>(Func<TutoriaUNAS.Api.Data.TutoriaDbContext, Task<T>> accion)
    {
        await using var scope = fixture.App.Services.CreateAsyncScope();
        return await accion(scope.ServiceProvider.GetRequiredService<TutoriaUNAS.Api.Data.TutoriaDbContext>());
    }

    [PostgresFact]
    public async Task ReimportarUnPadronModificadoRetiraHorariosViejosYConservaLoQueAdministraElSistema()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        const string codigo = "0020259001";
        const string alumnoId = "PAD-ALU-" + codigo;
        string[] docente = ["REIMPORT", "PRUEBA", "LUCIA", "lucia.reimport@unas.edu.pe", "CIENCIAS EXACTAS"];
        var v1 = LibroPrueba.Padron(
            [LibroPrueba.Alumno(codigo: codigo), LibroPrueba.Alumno(codigo: codigo, curso: "MA010101", nombreCurso: "MATEMATICA", dia: "3", duracion: "3", horas: "02-05 pm.")],
            [docente]);
        var primera = await Confirmar(admin, (await Analizar(admin, v1)).GetProperty("token").GetString()!);
        Assert.Equal(HttpStatusCode.OK, primera.StatusCode);
        var docenteId = (await EnBase(db => db.Personas.AsNoTracking().Where(p => p.Tipo == "tutor" && p.Id.StartsWith("PAD-DOC-")).ToListAsync()))
            .Single(p => p.DatosJson.Contains("lucia.reimport", StringComparison.Ordinal)).Id;

        // Lo que tutoría y coordinación administran después de importar.
        await EnBase(db => db.Database.ExecuteSqlRawAsync("""
            UPDATE "Personas" SET "Ciclo" = 5, "DatosJson" = "DatosJson" || CAST({1} AS jsonb) WHERE "Id" = {0};
            UPDATE "Personas" SET "EscuelaId" = 'E-ECO', "DatosJson" = "DatosJson" || CAST({3} AS jsonb) WHERE "Id" = {2};
            """, alumnoId, """{"ciclo":5,"etapa":"intermedio"}""", docenteId, """{"escuelaId":"E-ECO","aforoMaximo":12,"categoria":"principal"}"""));

        // El nuevo Excel: el alumno cambió de nombre y perdió un curso; el docente cambió de correo.
        string[] docenteNuevo = ["REIMPORT", "PRUEBA", "LUCIA", "lucia.nueva@unas.edu.pe", "CIENCIAS EXACTAS"];
        var v2 = LibroPrueba.Padron([LibroPrueba.Alumno(codigo: codigo, nombres: "ANA MARIA")], [docenteNuevo]);
        var segunda = await Confirmar(admin, (await Analizar(admin, v2)).GetProperty("token").GetString()!);
        Assert.Equal(HttpStatusCode.OK, segunda.StatusCode);
        Assert.Equal(1, (await segunda.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("horariosRetirados").GetInt32());

        var (alumno, profesor, bloques) = await EnBase(async db => (
            await db.Personas.AsNoTracking().SingleAsync(p => p.Id == alumnoId),
            await db.Personas.AsNoTracking().SingleAsync(p => p.Id == docenteId),
            await db.Horarios.CountAsync(h => h.EstudianteId == alumnoId)));
        var datosAlumno = JsonDocument.Parse(alumno.DatosJson).RootElement;
        Assert.Equal("ANA MARIA", datosAlumno.GetProperty("nombres").GetString());       // dato del Excel: se actualiza
        Assert.Equal(5, datosAlumno.GetProperty("ciclo").GetInt32());                    // datos del sistema: se conservan
        Assert.Equal("intermedio", datosAlumno.GetProperty("etapa").GetString());
        Assert.Equal(5, alumno.Ciclo);
        Assert.Equal(1, bloques);                                                        // el curso retirado ya no deja horario
        var datosDocente = JsonDocument.Parse(profesor.DatosJson).RootElement;
        Assert.Equal("lucia.nueva@unas.edu.pe", datosDocente.GetProperty("correo").GetString());
        Assert.Equal("E-ECO", datosDocente.GetProperty("escuelaId").GetString());
        Assert.Equal(12, datosDocente.GetProperty("aforoMaximo").GetInt32());
        Assert.Equal("principal", datosDocente.GetProperty("categoria").GetString());
        Assert.False(datosDocente.TryGetProperty("ciclo", out _));
        Assert.Equal("E-ECO", profesor.EscuelaId);
    }

    [PostgresFact]
    public async Task ConfirmarDosVecesALaVezImportaUnaSolaVez()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        var vista = await Analizar(admin, LibroPrueba.Padron([LibroPrueba.Alumno(codigo: "0020259002")], []));
        var token = vista.GetProperty("token").GetString()!;
        var respuestas = await Task.WhenAll(Confirmar(admin, token), Confirmar(admin, token));
        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Gone], respuestas.Select(r => r.StatusCode).Order());
        var recurso = vista.GetProperty("sha256").GetString()![..16];
        Assert.Equal(1, await EnBase(db => db.Auditoria.CountAsync(a => a.Accion == "padron-importar" && a.RecursoId == recurso)));
    }

    [PostgresFact]
    public async Task SiFallaLaEscrituraNoQuedaNadaYSePuedeReintentarConLaMismaVistaPrevia()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        const string alumnoId = "PAD-ALU-0020259003";
        var vista = await Analizar(admin, LibroPrueba.Padron([LibroPrueba.Alumno(codigo: "0020259003")], [["FALLA", "PRUEBA", "PEDRO", "pedro.falla@unas.edu.pe", "HUMANIDADES"]]));
        var token = vista.GetProperty("token").GetString()!;
        // Un disparador de prueba hace fallar la escritura de horarios, que ocurre después de guardar las personas.
        await EnBase(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION falla_horarios_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falla de prueba'; END $$;
            CREATE TRIGGER falla_horarios_prueba BEFORE INSERT ON "Horarios" FOR EACH ROW EXECUTE FUNCTION falla_horarios_prueba();
            """));
        try
        {
            Assert.True((int)(await Confirmar(admin, token)).StatusCode >= 500);
            var personas = await EnBase(db => db.Personas.AsNoTracking().Where(p => p.Id.StartsWith("PAD-")).ToListAsync());
            Assert.DoesNotContain(personas, p => p.Id == alumnoId || p.DatosJson.Contains("pedro.falla", StringComparison.Ordinal));
            var sha = vista.GetProperty("sha256").GetString();
            Assert.False(await EnBase(db => db.Fuentes.AnyAsync(f => f.Tipo == "importacionesPadron" && f.Id == sha)));
        }
        finally
        {
            await EnBase(db => db.Database.ExecuteSqlRawAsync("""
                DROP TRIGGER falla_horarios_prueba ON "Horarios"; DROP FUNCTION falla_horarios_prueba();
                """));
        }
        Assert.Equal(HttpStatusCode.OK, (await Confirmar(admin, token)).StatusCode);      // la vista previa no se perdió
        Assert.True(await EnBase(db => db.Personas.AnyAsync(p => p.Id == alumnoId)));
    }
}
