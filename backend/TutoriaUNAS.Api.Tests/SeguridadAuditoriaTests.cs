using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Tests;

/// <summary>Regresiones de la auditoría de seguridad del 16 de noviembre de 2026 (A-1, A-4 y asistencia por semestre).</summary>
public sealed class SeguridadAuditoriaTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static async Task<EstadoTutoriaDto> Estado(HttpClient c) => (await c.GetFromJsonAsync<EstadoTutoriaDto>("/api/tutoria/estado"))!;
    private static async Task<T> Ok<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
    private static async Task SinContenido(HttpResponseMessage r) => Assert.True(r.StatusCode == HttpStatusCode.NoContent, $"{r.StatusCode}: {await r.Content.ReadAsStringAsync()}");

    [PostgresFact]
    public async Task RecipientsOnlySeeTheirOwnEntryInSharedNotices()
    {
        using var tutor = await fixture.Login("DOC-0421", "tutor"); using var student = await fixture.Login("2023010456", "estudiante");
        var input = new MensajeInput(0, "Aviso compartido QA", "Contenido ficticio para dos destinatarios", "sistema", ["EST-2023010456", "EST-2023010457"], "enviado");
        var id = (await Ok<JsonElement>(await tutor.PostAsJsonAsync("/api/sistema/mensajes", input))).GetProperty("id").GetString()!;
        var propio = Assert.Single((await Estado(tutor)).Sistema!.Mensajes, m => m.GetProperty("id").GetString() == id);
        Assert.Equal(2, propio.GetProperty("destinatarios").GetArrayLength());
        Assert.Equal(2, propio.GetProperty("destinatarioIds").GetArrayLength());
        var recibido = await Estado(student);
        var aviso = Assert.Single(recibido.Sistema!.Mensajes, m => m.GetProperty("id").GetString() == id);
        var notificado = Assert.Single(recibido.Sistema.Notificaciones, n => n.TryGetProperty("aviso", out var a) && a.ValueKind == JsonValueKind.Object && a.GetProperty("id").GetString() == id).GetProperty("aviso");
        foreach (var visible in new[] { aviso, notificado })
        {
            Assert.Equal("EST-2023010456", Assert.Single(visible.GetProperty("destinatarioIds").EnumerateArray()).GetString());
            Assert.Single(visible.GetProperty("destinatarios").EnumerateArray());
            Assert.Equal(2, visible.GetProperty("totalDestinatarios").GetInt32());
            Assert.DoesNotContain("2023010457", visible.GetRawText(), StringComparison.Ordinal);
        }
    }

    [PostgresFact]
    public async Task ReviewRespectsClosedPeriod()
    {
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion"); using var tutor = await fixture.Login("DOC-0421", "tutor");
        var borrador = await Ok<InstrumentoDto>(await tutor.PostAsJsonAsync("/api/formularios", new { formato = "F08", estudianteId = "EST-2023010456" }));
        var respuestas = new Dictionary<string, string> { ["fecha"] = JsonDatos.Fecha(DateTimeOffset.UtcNow), ["motivo"] = "Organización del tiempo", ["resultado"] = "Se resuelve con la asesoría" };
        var enviado = await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + borrador.Id, new { version = borrador.Version, respuestas, enviar = true }));
        var cfg = (await Estado(coord)).Sistema!.ConfiguracionPeriodo!.Value.Deserialize<ConfiguracionPeriodoEntity>(JsonDatos.Options)!;
        var periodo = new PeriodoInput(cfg.Version, cfg.Inicio, cfg.Fin, cfg.EntrevistasHasta, cfg.InformesHasta, true);
        var revision = new { version = enviado.Version, decision = "aprobado", comentario = "Conforme" };
        await SinContenido(await coord.PutAsJsonAsync("/api/sistema/periodo", periodo));
        try { Assert.Equal(HttpStatusCode.Conflict, (await coord.PostAsJsonAsync($"/api/formularios/{enviado.Id}/revision", revision)).StatusCode); }
        finally { await SinContenido(await coord.PutAsJsonAsync("/api/sistema/periodo", periodo with { Version = cfg.Version + 1, Cerrado = false })); }
        Assert.Equal("aprobado", (await Ok<InstrumentoDto>(await coord.PostAsJsonAsync($"/api/formularios/{enviado.Id}/revision", revision))).Estado);
    }

    // C-3: la derivación F12 que nace de una atención F08 sigue a la atención mientras no se haya enviado.
    private static async Task<InstrumentoDto> EnviarAtencion(HttpClient tutor, Dictionary<string, string> respuestas)
    {
        var borrador = await Ok<InstrumentoDto>(await tutor.PostAsJsonAsync("/api/formularios", new { formato = "F08", estudianteId = "EST-2023010456" }));
        return await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + borrador.Id, new { version = borrador.Version, respuestas, enviar = true }));
    }
    private static async Task<InstrumentoDto> ObservarYReenviar(HttpClient coord, HttpClient tutor, InstrumentoDto enviado, Dictionary<string, string> cambios)
    {
        var observado = await Ok<InstrumentoDto>(await coord.PostAsJsonAsync($"/api/formularios/{enviado.Id}/revision", new { version = enviado.Version, decision = "observado", comentario = "Precisa la atención registrada" }));
        var respuestas = new Dictionary<string, string>(observado.Respuestas);
        foreach (var (campo, valor) in cambios) respuestas[campo] = valor;
        return await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + enviado.Id, new { version = observado.Version, respuestas, enviar = true }));
    }
    private static Dictionary<string, string> Derivacion(string detalle) => new()
    {
        ["fecha"] = JsonDatos.Fecha(DateTimeOffset.UtcNow), ["motivo"] = "Situación personal", ["detalleMotivo"] = detalle,
        ["resultado"] = "Se deriva a:", ["areaDerivacion"] = "Psicología"
    };

    [PostgresFact]
    public async Task UnsentReferralFollowsTheCorrectedAttention()
    {
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion"); using var tutor = await fixture.Login("DOC-0421", "tutor");
        var enviado = await EnviarAtencion(tutor, Derivacion("Detalle original ficticio"));
        var ficha = "/api/formularios/INST-F12-desde-" + enviado.Id;
        var inicial = await Ok<InstrumentoDto>(await tutor.GetAsync(ficha));
        Assert.Equal("Detalle original ficticio", inicial.Respuestas["detalle"]);
        var corregido = await ObservarYReenviar(coord, tutor, enviado, new() { ["detalleMotivo"] = "Detalle corregido ficticio", ["motivo"] = "Riesgo académico", ["areaDerivacion"] = "Psicopedagogía" });
        var sincronizada = await Ok<InstrumentoDto>(await tutor.GetAsync(ficha));
        Assert.Equal("no-iniciado", sincronizada.Estado);
        Assert.True(sincronizada.Version > inicial.Version);
        Assert.Equal("Detalle corregido ficticio", sincronizada.Respuestas["detalle"]);
        Assert.Equal("Psicopedagogía", sincronizada.Respuestas["area"]);
        Assert.Equal("Dificultades de aprendizaje", sincronizada.Respuestas["motivo"]);
        var aprobado = await Ok<InstrumentoDto>(await coord.PostAsJsonAsync($"/api/formularios/{enviado.Id}/revision", new { version = corregido.Version, decision = "aprobado", comentario = "Conforme" }));
        Assert.Equal(aprobado.Respuestas["detalleMotivo"], (await Ok<InstrumentoDto>(await tutor.GetAsync(ficha))).Respuestas["detalle"]);

        // Si la atención corregida ya no deriva, la ficha sin enviar deja de existir.
        var otra = await EnviarAtencion(tutor, Derivacion("Derivación ficticia que se retira"));
        var huerfana = "/api/formularios/INST-F12-desde-" + otra.Id;
        Assert.Equal(HttpStatusCode.OK, (await tutor.GetAsync(huerfana)).StatusCode);
        await ObservarYReenviar(coord, tutor, otra, new() { ["resultado"] = "Se resuelve con la asesoría" });
        Assert.Equal(HttpStatusCode.NotFound, (await tutor.GetAsync(huerfana)).StatusCode);
    }

    [PostgresFact]
    public async Task SentReferralIsKeptAndCoordinationIsWarnedWhenTheAttentionChanges()
    {
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion"); using var tutor = await fixture.Login("DOC-0421", "tutor");
        var enviado = await EnviarAtencion(tutor, Derivacion("Detalle ficticio de una ficha ya enviada"));
        var ficha = "/api/formularios/INST-F12-desde-" + enviado.Id;
        var borrador = await Ok<InstrumentoDto>(await tutor.GetAsync(ficha));
        var fichaEnviada = await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync(ficha, new { version = borrador.Version, respuestas = borrador.Respuestas, enviar = true }));
        const string aviso = "Atención corregida con derivación ya enviada";
        Assert.DoesNotContain((await Estado(coord)).Sistema!.Notificaciones, n => n.GetProperty("titulo").GetString() == aviso);
        await ObservarYReenviar(coord, tutor, enviado, new() { ["detalleMotivo"] = "Detalle corregido después del envío" });
        var intacta = await Ok<InstrumentoDto>(await tutor.GetAsync(ficha));
        Assert.Equal("enviado", intacta.Estado);
        Assert.Equal(fichaEnviada.Version, intacta.Version);
        Assert.Equal("Detalle ficticio de una ficha ya enviada", intacta.Respuestas["detalle"]);
        Assert.Contains((await Estado(coord)).Sistema!.Notificaciones, n => n.GetProperty("titulo").GetString() == aviso);
    }

    [PostgresFact]
    public async Task ResendingAnAttentionDoesNotScheduleItsFollowUpTwice()
    {
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion"); using var tutor = await fixture.Login("DOC-0421", "tutor");
        var cita = JsonDatos.Fecha(DateTimeOffset.UtcNow.AddDays(6));
        var enviado = await EnviarAtencion(tutor, new()
        {
            ["fecha"] = JsonDatos.Fecha(DateTimeOffset.UtcNow), ["motivo"] = "Organización del tiempo", ["resultado"] = "Se programa nueva cita para seguimiento",
            ["proximaCita"] = cita, ["horaCita"] = "02:00", ["horaFinCita"] = "02:30"
        });
        bool Seguimiento(SesionDto s) => s.Fecha == cita && s.HoraInicio == "02:00" && s.Estado == "programada";
        Assert.Single((await Estado(tutor)).Sesiones, Seguimiento);
        await ObservarYReenviar(coord, tutor, enviado, new() { ["detalleMotivo"] = "Precisión ficticia sin cambiar la cita" });
        Assert.Single((await Estado(tutor)).Sesiones, Seguimiento);
    }

    [PostgresFact]
    public async Task AttendanceIsLimitedToSessionsOfTheActiveSemester()
    {
        const string sesionId = "SES-SEMESTRE-ANTERIOR";
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            db.Sesiones.Add(new SesionEntity { Id = sesionId, TutorId = "DOC-0421", EscuelaId = "E-IIS", SemestreId = "2026-I", Tipo = "individual", Fecha = JsonDatos.Fecha(DateTimeOffset.UtcNow.AddDays(-200)), HoraInicio = "09:00", HoraFin = "10:00", FinUtc = DateTimeOffset.UtcNow.AddDays(-200), Tema = "Sesión ficticia de un semestre anterior", Asistentes = [new() { EstudianteId = "EST-2023010456" }] });
            await db.SaveChangesAsync();
        }
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        var sesion = (await Estado(tutor)).Sesiones.Single(s => s.Id == sesionId);
        var asistentes = sesion.Asistentes.Select(a => a with { Estado = "asistio" }).ToArray();
        Assert.Equal(HttpStatusCode.Conflict, (await tutor.PutAsJsonAsync($"/api/sesiones/{sesionId}/asistencia", new { version = sesion.Version, asistentes })).StatusCode);
        Assert.DoesNotContain((await Estado(tutor)).Registros, r => r.SesionId == sesionId);
    }
}

/// <summary>Regresiones de identidad: el bloqueo de una credencial no revela si la contraseña probada es la correcta.</summary>
public sealed class SeguridadCuentasTests(CuentasFixture fixture) : IClassFixture<CuentasFixture>
{
    private async Task CrearPerfil(string email, string rol, string password)
    {
        var personaId = await fixture.Persona(email, rol);
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
        var persona = await db.Personas.FindAsync(personaId);
        scope.ServiceProvider.GetRequiredService<TutoriaUNAS.Api.Services.Accounts.CredencialesCuentaService>().Crear(persona!, email, rol, password, false);
        await db.SaveChangesAsync();
    }
    private static async Task<string> Titulo(HttpResponseMessage r) => (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString()!;

    [PostgresFact]
    public async Task LockedCredentialAnswersTheSameForRightAndWrongPasswords()
    {
        const string password = "Una frase segura para el bloqueo 2026!";
        var email = "bloqueo-" + Guid.NewGuid().ToString("N") + "@unas.edu.pe";
        await CrearPerfil(email, "estudiante", password);
        using var c = fixture.App.CreateClient();
        Task<HttpResponseMessage> Entrar(string clave, string? rol = "estudiante") => c.PostAsJsonAsync("/api/auth/login", new LoginLocalDto(email, clave, rol));
        for (var intento = 0; intento < 5; intento++) Assert.Equal(HttpStatusCode.Unauthorized, (await Entrar("clave incorrecta " + intento)).StatusCode);
        DateTimeOffset? bloqueadaHasta = null;
        await fixture.Modificar(async db =>
        {
            var cred = await db.CredencialesCuenta.AsNoTracking().SingleAsync(x => x.CorreoNormalizado == email);
            Assert.True(cred.BloqueadaHasta > DateTimeOffset.UtcNow);
            bloqueadaHasta = cred.BloqueadaHasta;
        });
        // La misma respuesta se exige en el acceso unificado y al indicar un perfil.
        foreach (var rol in new string?[] { null, "estudiante" })
        {
            using var incorrecta = await Entrar("otra clave incorrecta", rol);
            using var correcta = await Entrar(password, rol);
            Assert.Equal(HttpStatusCode.Unauthorized, incorrecta.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, correcta.StatusCode);
            var tituloIncorrecto = await Titulo(incorrecta);
            Assert.Equal("Datos de acceso incorrectos.", tituloIncorrecto);
            Assert.Equal(tituloIncorrecto, await Titulo(correcta));
        }
        await fixture.Modificar(async db =>
        {
            var cred = await db.CredencialesCuenta.SingleAsync(x => x.CorreoNormalizado == email);
            Assert.Equal(bloqueadaHasta, cred.BloqueadaHasta);
            Assert.Equal(0, cred.IntentosFallidos);
            cred.BloqueadaHasta = DateTimeOffset.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.OK, (await Entrar(password)).StatusCode);
        await fixture.Modificar(async db =>
        {
            var cred = await db.CredencialesCuenta.AsNoTracking().SingleAsync(x => x.CorreoNormalizado == email);
            Assert.Null(cred.BloqueadaHasta);
            Assert.Equal(0, cred.IntentosFallidos);
        });
    }

    [PostgresFact]
    public async Task LockedProfilesDoNotRevealAPasswordCollisionOrPreventAnUnlockedProfileFromEntering()
    {
        const string password = "Frase compartida para perfiles de prueba 2026!";
        var email = "bloqueo-perfiles-" + Guid.NewGuid().ToString("N") + "@unas.edu.pe";
        await CrearPerfil(email, "estudiante", password);
        await CrearPerfil(email, "tutor", password);
        using var c = fixture.App.CreateClient();
        Task<HttpResponseMessage> Entrar(string clave, string? rol = null) => c.PostAsJsonAsync("/api/auth/login", new LoginLocalDto(email, clave, rol, IncluirEstado: true));
        for (var intento = 0; intento < 5; intento++) Assert.Equal(HttpStatusCode.Unauthorized, (await Entrar("clave incorrecta " + intento)).StatusCode);
        // La comprobación de claves duplicadas también debe excluir los perfiles bloqueados.
        foreach (var rol in new string?[] { null, "estudiante", "tutor" })
        {
            using var incorrecta = await Entrar("otra clave incorrecta", rol);
            using var correcta = await Entrar(password, rol);
            Assert.Equal(HttpStatusCode.Unauthorized, incorrecta.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, correcta.StatusCode);
            Assert.Equal(await Titulo(incorrecta), await Titulo(correcta));
        }
        await fixture.Modificar(async db =>
        {
            var perfiles = await db.CredencialesCuenta.Where(x => x.CorreoNormalizado == email).ToArrayAsync();
            Assert.Equal(2, perfiles.Length);
            Assert.All(perfiles, perfil => Assert.True(perfil.BloqueadaHasta > DateTimeOffset.UtcNow));
            perfiles.Single(x => x.Rol == "tutor").BloqueadaHasta = DateTimeOffset.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        });
        using var acceso = await Entrar(password);
        Assert.Equal(HttpStatusCode.OK, acceso.StatusCode);
        var body = await acceso.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("tutor", body.GetProperty("estado").GetProperty("usuario").GetProperty("role").GetString());
    }
}
