using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services.Padron;

/// <summary>
/// Archivos subidos que esperan confirmación. Se guarda el archivo (unos MB), no su análisis (decenas de MB):
/// al confirmar se vuelve a analizar, lo que además garantiza que se importa exactamente lo que se revisó.
/// Vive en memoria del proceso: tras un reinicio basta con subir el archivo otra vez.
/// </summary>
public sealed class ImportacionesPendientes(TimeProvider reloj)
{
    public sealed record Pendiente(string UsuarioId, byte[] Contenido, string Archivo, string Sha256, DateTimeOffset Expira);
    private const int MaxPendientes = 4;                       // a lo sumo 4 × 30 MB retenidos
    private static readonly TimeSpan Vigencia = TimeSpan.FromMinutes(20);
    private readonly Lock _cerrojo = new();
    private readonly Dictionary<string, Pendiente> _porToken = new(StringComparer.Ordinal);

    public (string Token, DateTimeOffset Expira) Guardar(string usuarioId, byte[] contenido, string archivo, string sha256)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var ahora = reloj.GetUtcNow();
        lock (_cerrojo)
        {
            // Una sola pendiente por persona; se descartan las vencidas y, si aún sobran, las más antiguas.
            foreach (var (clave, p) in _porToken.ToArray())
                if (p.Expira <= ahora || p.UsuarioId == usuarioId) _porToken.Remove(clave);
            foreach (var (clave, _) in _porToken.OrderBy(x => x.Value.Expira).Take(Math.Max(0, _porToken.Count - MaxPendientes + 1)).ToArray())
                _porToken.Remove(clave);
            _porToken[token] = new Pendiente(usuarioId, contenido, archivo, sha256, ahora + Vigencia);
        }
        return (token, ahora + Vigencia);
    }

    /// <summary>Retira la pendiente de forma atómica: dos confirmaciones del mismo token no pueden ejecutarse a la vez.</summary>
    public Pendiente? Tomar(string token, string usuarioId)
    {
        lock (_cerrojo)
        {
            if (!_porToken.TryGetValue(token, out var p) || p.UsuarioId != usuarioId) return null;
            _porToken.Remove(token);
            return p.Expira > reloj.GetUtcNow() ? p : null;
        }
    }

    /// <summary>Repone una pendiente cuya importación falló, para poder reintentar sin volver a subir el archivo.</summary>
    public void Devolver(string token, Pendiente p)
    {
        lock (_cerrojo)
            if (p.Expira > reloj.GetUtcNow()) _porToken.TryAdd(token, p);
    }
}

public sealed record ResultadoImportacion(bool Importado, int Alumnos, int Docentes, int Matriculas, int Cursos, int Horarios, int HorariosRetirados,
    int Escuelas, double Segundos, string Semestre);

/// <summary>Valida el libro y lo guarda en PostgreSQL con instrucciones por lotes dentro de una sola transacción.</summary>
public sealed class ImportadorPadronService(TutoriaDbContext db, ImportacionesPendientes pendientes, TimeProvider reloj, ILogger<ImportadorPadronService> log)
{
    private const int Lote = 2000;
    private const long ClaveBloqueo = 20261104;

    /// <summary>Lee el archivo, lo valida y devuelve la vista previa. No escribe nada en la base.</summary>
    public async Task<object> Analizar(byte[] contenido, string archivo, string usuarioId, CancellationToken ct)
    {
        TutoriaError.Exigir(contenido is [0x50, 0x4B, ..], "El archivo no es un libro de Excel (.xlsx).", 400);
        var sha = Convert.ToHexStringLower(SHA256.HashData(contenido));
        var cronometro = Stopwatch.StartNew();
        var analisis = AnalizadorPadron.Analizar(new MemoryStream(contenido, writable: false), archivo, sha, ct);
        var segundos = Math.Round(cronometro.Elapsed.TotalSeconds, 1);

        var ids = analisis.Estudiantes.Select(e => e.Id).Concat(analisis.Docentes.Select(d => d.Id)).ToArray();
        var existentes = await db.Personas.AsNoTracking().Where(p => ids.Contains(p.Id)).GroupBy(p => p.Tipo)
            .Select(g => new { g.Key, Cantidad = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Cantidad, ct);
        var escuelasRegistradas = await db.Catalogos.AsNoTracking().Where(c => c.Tipo == "escuelas").Select(c => c.Id).ToListAsync(ct);
        var yaImportado = await db.Fuentes.AsNoTracking().AnyAsync(f => f.Tipo == "importacionesPadron" && f.Id == sha, ct);
        var alumnosPorEscuela = analisis.Estudiantes.CountBy(e => e.EscuelaId).ToDictionary();
        var (token, expira) = pendientes.Guardar(usuarioId, contenido, archivo, sha);
        var r = analisis.Resumen;
        var alumnosExistentes = existentes.GetValueOrDefault("estudiante");
        var docentesExistentes = existentes.GetValueOrDefault("tutor");
        return new
        {
            token,
            expira,
            archivo,
            tamano = contenido.Length,
            sha256 = sha,
            r.Semestre,
            r.SemestreFuente,
            yaImportado,
            segundosLectura = segundos,
            hojas = new { alumnos = r.TieneAlumnos, docentes = r.TieneDocentes },
            alumnos = new { filas = r.FilasAlumnos, importables = r.Alumnos, filasExcluidas = r.FilasAlumnosExcluidas, nuevos = r.Alumnos - alumnosExistentes, actualizados = alumnosExistentes, r.SinPpa, r.SinCelular },
            r.Matriculas,
            r.Cursos,
            r.CursosMatriculados,
            r.Horarios,
            r.HorariosDuplicados,
            r.HorariosSinNormalizar,
            docentes = new { filas = r.FilasDocentes, importables = r.Docentes, excluidos = r.FilasDocentesExcluidas, duplicados = r.DuplicadosDocentes, nuevos = r.Docentes - docentesExistentes, actualizados = docentesExistentes },
            escuelas = analisis.Escuelas.Select(e => new EscuelaResumen(e.Id, e.Nombre, alumnosPorEscuela.GetValueOrDefault(e.Id), !escuelasRegistradas.Contains(e.Id))),
            advertencias = analisis.Advertencias,
            excluidas = analisis.Excluidas,
            totalExcluidas = r.FilasAlumnosExcluidas + r.FilasDocentesExcluidas,
        };
    }

    /// <summary>Importa el archivo revisado. Todo o nada: ante cualquier fallo se revierte y la vista previa sigue disponible.</summary>
    public async Task<ResultadoImportacion> Confirmar(string token, ActorTutoria actor, CancellationToken ct)
    {
        var pendiente = pendientes.Tomar(token, actor.Usuario.Id)
            ?? throw new TutoriaError(410, "La vista previa venció o ya se importó. Sube el archivo de nuevo.");
        try
        {
            var analisis = AnalizadorPadron.Analizar(new MemoryStream(pendiente.Contenido, writable: false), pendiente.Archivo, pendiente.Sha256, ct);
            return await Guardar(analisis, actor, ct);
        }
        catch
        {
            pendientes.Devolver(token, pendiente);
            throw;
        }
    }

    private async Task<ResultadoImportacion> Guardar(AnalisisPadron analisis, ActorTutoria actor, CancellationToken ct)
    {
        var cronometro = Stopwatch.StartNew();
        var r = analisis.Resumen;
        var tiempoAnterior = db.Database.GetCommandTimeout();
        db.Database.SetCommandTimeout(TimeSpan.FromMinutes(10));
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // El bloqueo es de PostgreSQL, así que también excluye importaciones desde otra instancia de la API.
            var libre = await db.Database.SqlQueryRaw<bool>("""SELECT pg_try_advisory_xact_lock({0}) AS "Value" """, ClaveBloqueo).SingleAsync(ct);
            TutoriaError.Exigir(libre, "Ya hay una importación del padrón en curso. Espera a que termine.", 409);

            if (analisis.Escuelas.Count > 0)
            {
                // Las escuelas ya registradas conservan su nombre y facultad.
                await Lotes("""
                    INSERT INTO "Catalogos" ("Tipo","Id","DatosJson","Version")
                    SELECT 'escuelas', j->>'id', j, 1 FROM jsonb_array_elements(@p) j
                    ON CONFLICT ("Tipo","Id") DO NOTHING
                    """, analisis.Escuelas, [], ct);
                await Lotes("""
                    INSERT INTO "Periodos" ("Id","EscuelaId","SemestreId","Momento","Activo","Version")
                    SELECT @sem || '|' || (j->>'id'), j->>'id', @sem, 'durante', true, 1 FROM jsonb_array_elements(@p) j
                    WHERE NOT EXISTS (SELECT 1 FROM "Periodos" p WHERE p."EscuelaId" = j->>'id' AND p."Activo")
                    ON CONFLICT DO NOTHING
                    """, analisis.Escuelas, [() => new NpgsqlParameter("sem", r.Semestre)], ct);
            }
            await Lotes(SqlPersonas, analisis.Estudiantes, [() => new NpgsqlParameter("tipo", "estudiante"), () => Campos(EstudiantePadron.CamposDelSistema)], ct);
            await Lotes(SqlPersonas, analisis.Docentes, [() => new NpgsqlParameter("tipo", "tutor"), () => Campos(DocentePadron.CamposDelSistema)], ct);
            await Lotes("""
                INSERT INTO "Catalogos" ("Tipo","Id","DatosJson","Version")
                SELECT 'cursos', j->>'id', j, 1 FROM jsonb_array_elements(@p) j
                ON CONFLICT ("Tipo","Id") DO UPDATE SET "DatosJson" = "Catalogos"."DatosJson" || EXCLUDED."DatosJson", "Version" = "Catalogos"."Version" + 1
                WHERE "Catalogos"."DatosJson" IS DISTINCT FROM ("Catalogos"."DatosJson" || EXCLUDED."DatosJson")
                """, analisis.Cursos, [], ct);
            await Lotes("""
                INSERT INTO "Matriculas" ("Id","EstudianteId","SemestreId","DatosJson")
                SELECT (j->>'estudianteId') || '|' || (j->>'semestreId'), j->>'estudianteId', j->>'semestreId', j FROM jsonb_array_elements(@p) j
                ON CONFLICT ("Id") DO UPDATE SET "DatosJson" = EXCLUDED."DatosJson" WHERE "Matriculas"."DatosJson" IS DISTINCT FROM EXCLUDED."DatosJson"
                """, analisis.Matriculas, [], ct);
            await Lotes("""
                INSERT INTO "Horarios" ("Id","EstudianteId","SemestreId","Dia","HoraInicio","HoraFin","DatosJson")
                SELECT j->>'id', j->>'estudianteId', j->>'semestreId', (j->>'dia')::int, j->>'horaInicio', j->>'horaFin', j FROM jsonb_array_elements(@p) j
                ON CONFLICT ("Id") DO UPDATE SET "DatosJson" = EXCLUDED."DatosJson", "Dia" = EXCLUDED."Dia", "HoraInicio" = EXCLUDED."HoraInicio", "HoraFin" = EXCLUDED."HoraFin"
                WHERE "Horarios"."DatosJson" IS DISTINCT FROM EXCLUDED."DatosJson"
                """, analisis.Horarios, [], ct);

            var estudiantes = analisis.Estudiantes.Select(e => e.Id).ToArray();
            var retirados = 0;
            if (estudiantes.Length > 0)
            {
                // Si el padrón cambió, los bloques que ya no figuran para estos alumnos y este semestre se retiran.
                // Solo se tocan horarios creados por un padrón (PAD-HOR-); los registrados a mano no.
                retirados = await db.Database.ExecuteSqlRawAsync("""
                    DELETE FROM "Horarios" WHERE "SemestreId" = @sem AND "Id" LIKE 'PAD-HOR-%' AND "EstudianteId" = ANY(@estudiantes) AND "Id" <> ALL(@vigentes)
                    """, [new NpgsqlParameter("sem", r.Semestre), Textos("estudiantes", estudiantes), Textos("vigentes", analisis.Horarios.Select(h => h.Id).ToArray())], ct);
                var resumenes = analisis.Estudiantes.Select(e => new
                {
                    estudianteId = e.Id,
                    semestreId = r.Semestre,
                    promedioPonderado = e.PromedioPonderado,
                    creditosAprobados = e.CreditosAprobados,
                    creditosMatriculados = (double?)null,
                    avanceCurricular = (double?)null,
                    posicion = (int?)null,
                    fuente = "Padrón Excel autorizado · " + r.Archivo,
                    fechaCorte = "",
                });
                await Lotes("""
                    INSERT INTO "Fuentes" ("Tipo","Id","EscuelaId","EstudianteId","TutorId","DatosJson","SemestreId","Fuente","FechaCorte","Version")
                    SELECT 'resumenesAcademicos', (j->>'estudianteId') || '|' || (j->>'semestreId'), p."EscuelaId", j->>'estudianteId', NULL, j, j->>'semestreId', j->>'fuente', now(), 1
                    FROM jsonb_array_elements(@p) j JOIN "Personas" p ON p."Id" = j->>'estudianteId'
                    ON CONFLICT ("Tipo","Id") DO UPDATE SET "DatosJson" = EXCLUDED."DatosJson", "Version" = "Fuentes"."Version" + 1
                    WHERE "Fuentes"."DatosJson" IS DISTINCT FROM EXCLUDED."DatosJson"
                    """, resumenes, [], ct);
            }

            var ahora = reloj.GetUtcNow();
            r.ImportadoPor = actor.Persona.Id;
            r.ImportadoEn = ahora;
            await db.Database.ExecuteSqlRawAsync("""
                INSERT INTO "Fuentes" ("Tipo","Id","EscuelaId","EstudianteId","TutorId","DatosJson","Fuente","FechaCorte","Version")
                VALUES ('importacionesPadron', @id, NULL, NULL, NULL, @p, 'Excel autorizado', now(), 1)
                ON CONFLICT ("Tipo","Id") DO UPDATE SET "DatosJson" = EXCLUDED."DatosJson", "FechaCorte" = now(), "Version" = "Fuentes"."Version" + 1
                """, [Json(r), new NpgsqlParameter("id", r.Sha256)], ct);

            await Conciliar(analisis, estudiantes, ct);
            db.Auditoria.Add(new AuditoriaEntity { Fecha = ahora, UsuarioId = actor.Usuario.Id, EscuelaId = actor.EscuelaId, Accion = "padron-importar", RecursoId = r.Sha256[..16], Version = 1 });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            log.LogInformation("Padrón importado: {Alumnos} alumnos, {Docentes} docentes, {Matriculas} matrículas, {Horarios} horarios ({Retirados} retirados) en {Segundos:0.0} s",
                r.Alumnos, r.Docentes, r.Matriculas, r.Horarios, retirados, cronometro.Elapsed.TotalSeconds);
            return new ResultadoImportacion(true, r.Alumnos, r.Docentes, r.Matriculas, r.Cursos, r.Horarios, retirados, r.Escuelas,
                Math.Round(cronometro.Elapsed.TotalSeconds, 1), r.Semestre);
        }
        finally
        {
            db.Database.SetCommandTimeout(tiempoAnterior);
        }
    }

    // Al actualizar, los campos del Excel reemplazan a los guardados y los del sistema (@sistema) se conservan.
    private const string SqlPersonas = """
        INSERT INTO "Personas" ("Id","Tipo","EscuelaId","Ciclo","Activa","DatosJson")
        SELECT j->>'id', @tipo, j->>'escuelaId', NULL, true, j FROM jsonb_array_elements(@p) j
        ON CONFLICT ("Id") DO UPDATE SET
            "DatosJson" = "Personas"."DatosJson" || (EXCLUDED."DatosJson" - @sistema),
            "EscuelaId" = CASE WHEN EXCLUDED."EscuelaId" = '' THEN "Personas"."EscuelaId" ELSE EXCLUDED."EscuelaId" END
        WHERE "Personas"."DatosJson" IS DISTINCT FROM ("Personas"."DatosJson" || (EXCLUDED."DatosJson" - @sistema))
           OR (EXCLUDED."EscuelaId" <> '' AND "Personas"."EscuelaId" <> EXCLUDED."EscuelaId")
        """;

    /// <summary>
    /// Comprueba que todo lo enviado quedó en la base. En horarios la comparación es exacta: para estos alumnos y este
    /// semestre deben existir exactamente los bloques del archivo, ni uno más (los retirados) ni uno menos.
    /// </summary>
    private async Task Conciliar(AnalisisPadron a, string[] estudiantes, CancellationToken ct)
    {
        var personas = estudiantes.Concat(a.Docentes.Select(d => d.Id)).ToArray();
        await Contar("""SELECT count(*)::int AS "Value" FROM "Personas" WHERE "Id" = ANY(@ids)""", personas.Length, "personas", [Textos("ids", personas)], ct);
        if (estudiantes.Length == 0) return;
        var matriculas = a.Matriculas.Select(m => m.EstudianteId + "|" + m.SemestreId).ToArray();
        await Contar("""SELECT count(*)::int AS "Value" FROM "Matriculas" WHERE "Id" = ANY(@ids)""", matriculas.Length, "matrículas", [Textos("ids", matriculas)], ct);
        await Contar("""SELECT count(*)::int AS "Value" FROM "Horarios" WHERE "SemestreId" = @sem AND "Id" LIKE 'PAD-HOR-%' AND "EstudianteId" = ANY(@ids)""",
            a.Horarios.Count, "horarios", [Textos("ids", estudiantes), new NpgsqlParameter("sem", a.Resumen.Semestre)], ct);
    }

    private async Task Contar(string sql, int esperado, string que, object[] parametros, CancellationToken ct)
    {
        var hay = await db.Database.SqlQueryRaw<int>(sql, parametros).SingleAsync(ct);
        if (hay != esperado) throw new InvalidOperationException($"La conciliación de {que} falló: se esperaban {esperado} y hay {hay}. No se guardó nada.");
    }

    /// <summary>Envía los registros como un arreglo JSON por lote: una instrucción por cada 2000 filas, no una por fila.</summary>
    private async Task Lotes<T>(string sql, IEnumerable<T> filas, Func<NpgsqlParameter>[] extra, CancellationToken ct)
    {
        foreach (var lote in filas.Chunk(Lote))
            await db.Database.ExecuteSqlRawAsync(sql, [Json(lote), .. extra.Select(f => f())], ct);
    }

    private static NpgsqlParameter Json<T>(T valor) => new("p", NpgsqlDbType.Jsonb) { Value = JsonSerializer.Serialize(valor, JsonDatos.Options) };
    private static NpgsqlParameter Textos(string nombre, string[] valores) => new(nombre, NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = valores };
    private static NpgsqlParameter Campos(string[] campos) => Textos("sistema", campos);
}
