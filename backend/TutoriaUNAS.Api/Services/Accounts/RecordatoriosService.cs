using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services.Accounts;

public sealed record PendienteCalculado(string Clave, string Texto, DateOnly? VenceFijo);
public sealed record ResumenRecordatorios(int Evaluados, int ConPendientes, int Correos, List<string> Detalle);

/// <summary>
/// Recordatorios por correo de actividades pendientes del estudiante (entrevista inicial y evaluaciones de sesión)
/// y del docente (sesiones sin cerrar, informes F02/F09 y entrevistas de sus tutorados).
/// Solo a cuentas verificadas; el correo lista actividades y fechas, sin datos personales ni de salud.
/// </summary>
public sealed class RecordatoriosService(TutoriaDbContext db, ColaCorreoCuenta cola, IOptions<RecordatoriosOptions> opciones,
    IOptions<CuentasOptions> cuentas, TimeProvider clock)
{
    private static readonly TimeSpan Lima = TimeSpan.FromHours(-5); // Perú no usa horario de verano.
    private static readonly string[] Cerrados = ["enviado", "aprobado"];
    public static DateOnly HoyLima(DateTimeOffset ahora) => DateOnly.FromDateTime(ahora.ToOffset(Lima).DateTime);
    private static string Fecha(DateOnly f) => f.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private sealed record Registro(string UsuarioId, string Clave, DateTimeOffset PrimerAviso, DateTimeOffset UltimoAviso, int Veces, DateOnly Vence);
    private sealed class FilaRegistro
    {
        public string UsuarioId { get; set; } = ""; public string Clave { get; set; } = "";
        public DateTimeOffset PrimerAviso { get; set; } public DateTimeOffset UltimoAviso { get; set; }
        public int Veces { get; set; } public DateOnly Vence { get; set; }
    }

    /// <param name="simular">No envía ni guarda nada.</param>
    /// <param name="solo">Limita a una cuenta (correo).</param>
    /// <param name="destino">Redirige el correo a otra dirección (prueba); implica no guardar estado.</param>
    public async Task<ResumenRecordatorios> Ejecutar(bool simular, string? solo, string? destino, CancellationToken ct)
    {
        var o = opciones.Value;
        var ahora = clock.GetUtcNow();
        var hoy = HoyLima(ahora);
        var registrar = !simular && destino is null;
        var detalle = new List<string>();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (registrar)
        {
            var bloqueo = await db.Database.SqlQueryRaw<bool>("SELECT pg_try_advisory_xact_lock(20261117) AS \"Value\"").SingleAsync(ct);
            if (!bloqueo) return new(0, 0, 0, ["Otro proceso ya está ejecutando los recordatorios."]);
        }

        var periodos = await db.Periodos.AsNoTracking().Where(p => p.Activo).ToArrayAsync(ct);
        var semestres = periodos.Select(p => p.SemestreId).Distinct().ToArray();
        var escuelasActivas = periodos.Select(p => (p.EscuelaId, p.SemestreId)).ToHashSet();
        var configuraciones = (await db.ConfiguracionPeriodos.AsNoTracking().ToArrayAsync(ct)).ToDictionary(c => c.PeriodoId, StringComparer.Ordinal);

        // Destinatarios: cuentas verificadas y activas del portal (estudiantes y docentes).
        var cuentasActivas = await (from c in db.CredencialesCuenta.AsNoTracking()
                                    join u in db.Usuarios.AsNoTracking() on c.UsuarioId equals u.Id
                                    join p in db.Personas.AsNoTracking() on u.PersonaId equals p.Id
                                    where c.Verificada && !c.CambioObligatorio && u.Activo && p.Activa && u.Issuer == SeguridadCuenta.Issuer &&
                                          (u.Rol == "estudiante" || u.Rol == "tutor") && (solo == null || c.CorreoNormalizado == solo)
                                    select new { Usuario = u, Persona = p, Correo = c.CorreoNormalizado }).ToArrayAsync(ct);
        var asignaciones = await db.Asignaciones.AsNoTracking().Where(a => a.Activa && semestres.Contains(a.SemestreId)).ToArrayAsync(ct);
        var desde = hoy.AddDays(-30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var hastaHoy = hoy.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        // Las fechas son texto ISO (yyyy-MM-dd): se filtran en memoria para no depender de la traducción SQL.
        var sesiones = (await db.Sesiones.AsNoTracking().Include(s => s.Asistentes)
            .Where(s => semestres.Contains(s.SemestreId)).ToArrayAsync(ct)).Where(s => string.CompareOrdinal(s.Fecha, desde) >= 0).ToArray();
        var instrumentos = await db.Instrumentos.AsNoTracking()
            .Where(i => semestres.Contains(i.SemestreId) && Cerrados.Contains(i.Estado) && (i.Formato == "F02" || i.Formato == "F03" || i.Formato == "F04" ||
                i.Formato == "F05" || i.Formato == "F09" || i.Formato == "F10" || i.Formato == "F11"))
            .Select(i => new { i.Id, i.Formato, i.SemestreId, i.EstudianteId, i.TutorId }).ToArrayAsync(ct);
        var cerradosPorId = instrumentos.Select(i => i.Id).ToHashSet(StringComparer.Ordinal);
        var entrevistasHechas = instrumentos.Where(i => i.Formato is "F03" or "F04" or "F05" && i.EstudianteId != null)
            .Select(i => (i.EstudianteId!, i.SemestreId, i.Formato)).ToHashSet();
        var informesHechos = instrumentos.Where(i => i.Formato is "F02" or "F09").Select(i => (i.TutorId, i.SemestreId, i.Formato)).ToHashSet();
        var personasPorId = (await db.Personas.AsNoTracking().Where(p => p.Tipo == "estudiante" && p.Activa).Select(p => new { p.Id, p.Ciclo }).ToArrayAsync(ct))
            .ToDictionary(p => p.Id, p => p.Ciclo, StringComparer.Ordinal);

        bool EntrevistaPendiente(string estudiante, string semestre, int? ciclo) =>
            ciclo is not null && EtapasTutoria.EsCicloValido(ciclo.Value) && !entrevistasHechas.Contains((estudiante, semestre, EtapasTutoria.FormatoEntrevistaInicial(ciclo.Value)));

        var registros = (await db.Database.SqlQueryRaw<FilaRegistro>(
            "SELECT \"UsuarioId\", \"Clave\", \"PrimerAviso\", \"UltimoAviso\", \"Veces\", \"Vence\" FROM \"RecordatoriosPendientes\"").ToArrayAsync(ct))
            .ToDictionary(r => (r.UsuarioId, r.Clave), r => new Registro(r.UsuarioId, r.Clave, r.PrimerAviso, r.UltimoAviso, r.Veces, r.Vence));

        int conPendientes = 0, correos = 0;
        foreach (var cuenta in cuentasActivas)
        {
            var u = cuenta.Usuario; var persona = cuenta.Persona;
            var pendientes = new List<PendienteCalculado>();
            foreach (var asignacion in asignaciones.Where(a => (u.Rol == "estudiante" ? a.EstudianteId == persona.Id : a.TutorId == persona.Id) && escuelasActivas.Contains((a.EscuelaId, a.SemestreId))))
            {
                if (u.Rol == "estudiante")
                {
                    personasPorId.TryGetValue(persona.Id, out var ciclo);
                    if (EntrevistaPendiente(persona.Id, asignacion.SemestreId, ciclo))
                        pendientes.Add(new($"ENT:{asignacion.SemestreId}", $"Completar tu entrevista inicial ({EtapasTutoria.FormatoEntrevistaInicial(ciclo!.Value)})", null));
                }
            }
            if (u.Rol == "estudiante")
            {
                foreach (var s in sesiones.Where(s => s.Estado == "realizada" && s.AsistenciaConfirmada && s.Asistentes.Any(a => a.EstudianteId == persona.Id && a.Estado == "asistio")))
                    if (!cerradosPorId.Contains(DocumentosService.IdEvaluacion(s, persona.Id)))
                        pendientes.Add(new($"EVAL:{s.Id}", $"Evaluar la tutoría {(s.Tipo == "individual" ? "individual" : "grupal")} del {FechaTexto(s.Fecha)} ({(s.Tipo == "individual" ? "F10" : "F11")})", null));
            }
            else
            {
                foreach (var s in sesiones.Where(s => s.TutorId == persona.Id && s.Estado == "programada" && string.CompareOrdinal(s.Fecha, hastaHoy) < 0))
                    pendientes.Add(new($"SES:{s.Id}", $"Cerrar la sesión del {FechaTexto(s.Fecha)} y confirmar la asistencia", null));
                foreach (var grupo in asignaciones.Where(a => a.TutorId == persona.Id && escuelasActivas.Contains((a.EscuelaId, a.SemestreId))).GroupBy(a => (a.SemestreId, a.EscuelaId)))
                {
                    var sinEntrevista = grupo.Count(a => personasPorId.TryGetValue(a.EstudianteId, out var c) && EntrevistaPendiente(a.EstudianteId, a.SemestreId, c));
                    if (sinEntrevista > 0)
                        pendientes.Add(new($"TUT-ENT:{grupo.Key.SemestreId}", $"{sinEntrevista} de tus tutorados aún no completan su entrevista inicial", null));
                    if (configuraciones.TryGetValue($"{grupo.Key.SemestreId}|{grupo.Key.EscuelaId}", out var cfg) && DateOnly.TryParse(cfg.InformesHasta, CultureInfo.InvariantCulture, out var limite) &&
                        hoy >= limite.AddDays(-o.DiasAntesInformes))
                        foreach (var (formato, titulo) in new[] { ("F02", "Informe de actividades del tutor"), ("F09", "Autoevaluación de la actividad tutorial") })
                            if (!informesHechos.Contains((persona.Id, grupo.Key.SemestreId, formato)))
                                pendientes.Add(new($"INF:{formato}:{grupo.Key.SemestreId}", $"{titulo} ({formato})", limite));
                }
            }

            var claves = pendientes.Select(p => p.Clave).ToHashSet(StringComparer.Ordinal);
            if (registrar)
                foreach (var obsoleto in registros.Values.Where(r => r.UsuarioId == u.Id && !claves.Contains(r.Clave)).ToArray())
                {
                    await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"RecordatoriosPendientes\" WHERE \"UsuarioId\" = {u.Id} AND \"Clave\" = {obsoleto.Clave}", ct);
                    registros.Remove((u.Id, obsoleto.Clave));
                }
            if (pendientes.Count == 0) continue;
            conPendientes++;

            var items = pendientes.Select(p =>
            {
                registros.TryGetValue((u.Id, p.Clave), out var previo);
                var vence = previo?.Vence ?? p.VenceFijo ?? hoy.AddDays(o.DiasPlazo);
                return (Pendiente: p, Previo: previo, Vence: vence);
            }).OrderBy(i => i.Vence).ToArray();

            var ultimoCorreo = registros.Values.Where(r => r.UsuarioId == u.Id).Select(r => (DateTimeOffset?)r.UltimoAviso).DefaultIfEmpty(null).Max();
            var hayNuevos = items.Any(i => i.Previo is null);
            var aTiempo = ultimoCorreo is null || ultimoCorreo <= ahora.AddDays(-1);
            var frecuenciaCumplida = ultimoCorreo is null || ultimoCorreo <= ahora.AddDays(-o.FrecuenciaDias);
            var aAvisar = items.Where(i => (i.Previo?.Veces ?? 0) < o.MaxAvisosPorPendiente).ToArray();
            if (aAvisar.Length == 0 || !aTiempo || !(hayNuevos || frecuenciaCumplida)) continue;

            var nombre = JsonDatos.Texto(persona.DatosJson, "nombres").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
            var cuerpo = Redactar(nombre, aAvisar.Select(i => (i.Pendiente.Texto, i.Vence)).ToArray(), hoy, cuentas.Value.UrlAcceso, o.DiasPlazo);
            var para = destino ?? cuenta.Correo;
            detalle.Add($"{u.Rol,-10} {Enmascarar(cuenta.Correo)} → {aAvisar.Length} pendiente(s)");
            if (simular) { correos++; continue; }
            cola.Agregar(para, "Tienes actividades pendientes · Tutoría UNAS", cuerpo, ahora.AddDays(1), destino is null ? u.Id : null);
            correos++;
            if (!registrar) continue;
            foreach (var i in aAvisar)
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "RecordatoriosPendientes" ("UsuarioId","Clave","PrimerAviso","UltimoAviso","Veces","Vence")
                    VALUES ({u.Id},{i.Pendiente.Clave},{ahora},{ahora},1,{i.Vence})
                    ON CONFLICT ("UsuarioId","Clave") DO UPDATE SET "UltimoAviso" = {ahora}, "Veces" = "RecordatoriosPendientes"."Veces" + 1
                    """, ct);
            foreach (var i in aAvisar) registros[(u.Id, i.Pendiente.Clave)] = new(u.Id, i.Pendiente.Clave, i.Previo?.PrimerAviso ?? ahora, ahora, (i.Previo?.Veces ?? 0) + 1, i.Vence);
        }
        if (registrar && solo is null)
        {
            var vigentes = cuentasActivas.Select(c => c.Usuario.Id).ToArray();
            await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"RecordatoriosPendientes\" WHERE NOT (\"UsuarioId\" = ANY({vigentes}))", ct);
        }
        if (!simular && destino is null)
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "RecordatoriosControl" ("Clave","Valor") VALUES ('ultima-ejecucion', {hoy.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)})
                ON CONFLICT ("Clave") DO UPDATE SET "Valor" = EXCLUDED."Valor"
                """, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(cuentasActivas.Length, conPendientes, correos, detalle);
    }

    public async Task<bool> YaEjecutadoHoy(CancellationToken ct)
    {
        var valor = await db.Database.SqlQueryRaw<string>("SELECT \"Valor\" AS \"Value\" FROM \"RecordatoriosControl\" WHERE \"Clave\" = 'ultima-ejecucion'").SingleOrDefaultAsync(ct);
        return valor == HoyLima(clock.GetUtcNow()).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string FechaTexto(string iso) => DateOnly.TryParse(iso, CultureInfo.InvariantCulture, out var f) ? Fecha(f) : iso;
    private static string Enmascarar(string correo) { var i = correo.IndexOf('@'); return i <= 2 ? correo : correo[..2] + "***" + correo[i..]; }

    public static string Redactar(string nombre, (string Texto, DateOnly Vence)[] items, DateOnly hoy, string url, int diasPlazo)
    {
        var sb = new StringBuilder();
        sb.Append(nombre.Length > 0 ? $"Hola, {nombre}.\n\n" : "Hola.\n\n");
        sb.Append("Tienes actividades pendientes en Tutoría UNAS:\n\n");
        foreach (var (texto, vence) in items)
            sb.Append("• ").Append(texto).Append(vence < hoy ? $" — venció el {Fecha(vence)}" : vence == hoy ? " — vence hoy" : $" — vence el {Fecha(vence)}").Append('\n');
        sb.Append($"\nPuedes completarlas ingresando a: {url}\n");
        sb.Append($"El plazo es de {diasPlazo} días desde el primer aviso.\n\n");
        sb.Append("Este es un aviso automático del sistema. No respondas a este correo ni compartas tu contraseña con nadie.\nTutoría UNAS");
        return sb.ToString();
    }
}

/// <summary>Ejecuta el barrido diario a partir de la hora configurada (hora de Lima).</summary>
public sealed class DespachadorRecordatorios(IServiceScopeFactory scopes, IOptions<RecordatoriosOptions> opciones, TimeProvider clock, ILogger<DespachadorRecordatorios> logger) : BackgroundService
{
    private DateOnly _simulacionHoy;
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var o = opciones.Value;
        if (o.Modo is not ("simulacion" or "activo")) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var ahora = clock.GetUtcNow();
                var hoy = RecordatoriosService.HoyLima(ahora);
                if (ahora.ToOffset(TimeSpan.FromHours(-5)).Hour >= o.HoraLima)
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var servicio = scope.ServiceProvider.GetRequiredService<RecordatoriosService>();
                    var simular = o.Modo == "simulacion";
                    if (simular ? _simulacionHoy != hoy : !await servicio.YaEjecutadoHoy(stoppingToken))
                    {
                        var r = await servicio.Ejecutar(simular, null, null, stoppingToken);
                        _simulacionHoy = hoy;
                        if (logger.IsEnabled(LogLevel.Information))
                            logger.LogInformation("Recordatorios ({Modo}): {Evaluados} cuentas evaluadas, {Con} con pendientes, {Correos} correos.", o.Modo, r.Evaluados, r.ConPendientes, r.Correos);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) when (ex is System.Data.Common.DbException or DbUpdateException or InvalidOperationException)
            { logger.LogWarning("No se pudo ejecutar el barrido de recordatorios; se reintentará."); }
            try { await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
