using System.Data.Common;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;
using Xunit.Abstractions;

namespace TutoriaUNAS.Api.Tests;

/// <summary>
/// Presupuesto de rendimiento del estado de tutoría. El portal lo vuelve a consultar
/// periódicamente, así que su costo en consultas SQL no debe crecer con cada formulario
/// y una consulta sin cambios debe resolverse con 304, sin volver a enviar el cuerpo.
/// </summary>
public sealed class RendimientoTests(PostgresFixture fixture, ITestOutputHelper output) : IClassFixture<PostgresFixture>
{
    private const string Estado = "/api/tutoria/estado";

    [PostgresFact]
    public async Task EstadoNoRepiteConsultasPorFormulario()
    {
        var excesos = new List<string>();
        // Instancia propia de la aplicación (mismo esquema aislado) con un interceptor que cuenta
        // los comandos SQL; así el conteo no depende de otras pruebas que corren en paralelo.
        var contador = new ContadorConsultas();
        await using var app = fixture.App.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.ConfigureDbContext<TutoriaDbContext>(o => o.AddInterceptors(contador))));
        async Task<HttpClient> Login(string identifier, string role)
        {
            var client = app.CreateClient();
            var response = await client.PostAsJsonAsync("/api/auth/login", new { identifier, role, password = "tutoria2026" });
            response.EnsureSuccessStatusCode();
            client.DefaultRequestHeaders.Authorization = new("Bearer", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString());
            return client;
        }
        async Task<int> Medir(HttpClient client, string rol)
        {
            (await client.GetAsync(Estado)).EnsureSuccessStatusCode();
            var antes = contador.Total;
            var response = await client.GetAsync(Estado);
            response.EnsureSuccessStatusCode();
            var consultas = contador.Total - antes;
            var bytes = (await response.Content.ReadAsByteArrayAsync()).Length;
            var reloj = Stopwatch.StartNew();
            for (var i = 0; i < 10; i++) (await client.GetAsync(Estado)).EnsureSuccessStatusCode();
            output.WriteLine($"{rol}: {consultas} consultas SQL, {reloj.ElapsedMilliseconds / 10.0:0.0} ms promedio, {bytes / 1024.0:0.0} KB");
            Assert.True(consultas >= 5, $"{rol}: el contador no registró las consultas ({consultas}).");
            return consultas;
        }
        // Presupuesto fijo por rol: una consulta por colección, nunca una por formulario o sesión.
        foreach (var (identificador, rol, maximo) in new[] { ("DOC-0421", "tutor", 40), ("2023010456", "estudiante", 40), ("coordinacion.tutoria", "coordinacion", 36) })
        {
            using var client = await Login(identificador, rol);
            var consultas = await Medir(client, rol);
            if (consultas > maximo) excesos.Add($"{rol}: el estado ejecutó {consultas} consultas SQL (máximo {maximo}).");
        }
        Assert.Empty(excesos);

        // Más formularios del tutor no agregan consultas al estado.
        using var tutor = await Login("DOC-0421", "tutor");
        var inicial = await Medir(tutor, "tutor antes de registrar 3 atenciones");
        for (var i = 0; i < 3; i++)
        {
            var creado = await tutor.PostAsJsonAsync("/api/formularios", new CrearInstrumentoDto("F08", "EST-2023010456"));
            Assert.True(creado.IsSuccessStatusCode, await creado.Content.ReadAsStringAsync());
        }
        Assert.Equal(inicial, await Medir(tutor, "tutor después de registrar 3 atenciones"));
    }

    [PostgresFact]
    public async Task LoginMideTiempoYConsultasConYSinEstado()
    {
        // Una aplicación por modalidad: cada una tiene su propio límite de 30 accesos por minuto.
        foreach (var incluirEstado in new[] { false, true })
        {
            var contador = new ContadorConsultas();
            await using var app = fixture.App.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
                s.ConfigureDbContext<TutoriaDbContext>(o => o.AddInterceptors(contador))));
            using var client = app.CreateClient();
            var tiempos = new List<double>();
            var consultas = 0; var bytes = 0;
            for (var i = 0; i < 21; i++)
            {
                var antes = contador.Total;
                var reloj = Stopwatch.StartNew();
                var response = await client.PostAsJsonAsync("/api/auth/login", new LoginLocalDto("DOC-0421", "tutoria2026", "tutor", incluirEstado));
                var cuerpo = await response.Content.ReadAsByteArrayAsync();
                reloj.Stop();
                response.EnsureSuccessStatusCode();
                if (i == 0) continue; // la primera llamada calienta JIT, conexiones y modelo de EF
                tiempos.Add(reloj.Elapsed.TotalMilliseconds); consultas = contador.Total - antes; bytes = cuerpo.Length;
            }
            tiempos.Sort();
            output.WriteLine($"login {(incluirEstado ? "con estado" : "sin estado")}: {consultas} consultas SQL, p50 {tiempos[tiempos.Count / 2]:0.0} ms, p95 {tiempos[(int)(tiempos.Count * 0.95)]:0.0} ms, máx {tiempos[^1]:0.0} ms, {bytes / 1024.0:0.0} KB");
        }
    }

    [PostgresFact]
    public async Task EstadoSinCambiosResponde304YCambiaTrasEscribir()
    {
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        var primera = await tutor.GetAsync(Estado);
        primera.EnsureSuccessStatusCode();
        var etag = primera.Headers.ETag;
        Assert.NotNull(etag);
        Assert.Contains("no-store", primera.Headers.CacheControl?.ToString() ?? "", StringComparison.Ordinal);

        using var condicional = new HttpRequestMessage(HttpMethod.Get, Estado);
        condicional.Headers.IfNoneMatch.Add(etag);
        var sinCambios = await tutor.SendAsync(condicional);
        Assert.Equal(HttpStatusCode.NotModified, sinCambios.StatusCode);
        Assert.Empty(await sinCambios.Content.ReadAsByteArrayAsync());

        // Otra identidad nunca reutiliza la etiqueta del tutor como válida.
        using var estudiante = await fixture.Login("2023010456", "estudiante");
        using var ajena = new HttpRequestMessage(HttpMethod.Get, Estado);
        ajena.Headers.IfNoneMatch.Add(etag);
        Assert.Equal(HttpStatusCode.OK, (await estudiante.SendAsync(ajena)).StatusCode);

        var creado = await tutor.PostAsJsonAsync("/api/formularios", new CrearInstrumentoDto("F08", "EST-2023010456"));
        Assert.True(creado.IsSuccessStatusCode, await creado.Content.ReadAsStringAsync());
        using var trasEscribir = new HttpRequestMessage(HttpMethod.Get, Estado);
        trasEscribir.Headers.IfNoneMatch.Add(etag);
        var actualizado = await tutor.SendAsync(trasEscribir);
        Assert.Equal(HttpStatusCode.OK, actualizado.StatusCode);
        Assert.NotEqual(etag, actualizado.Headers.ETag);
    }

    [PostgresFact]
    public async Task ConsultasGetSeComprimen()
    {
        using var coordinacion = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var plano = new HttpRequestMessage(HttpMethod.Get, Estado);
        var original = (await (await coordinacion.SendAsync(plano)).Content.ReadAsByteArrayAsync()).Length;
        using var request = new HttpRequestMessage(HttpMethod.Get, Estado);
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
        var response = await coordinacion.SendAsync(request);
        response.EnsureSuccessStatusCode();
        Assert.Contains(response.Content.Headers.ContentEncoding, e => e is "br" or "gzip");
        var comprimido = (await response.Content.ReadAsByteArrayAsync()).Length;
        output.WriteLine($"estado coordinación: {original / 1024.0:0.0} KB → {comprimido / 1024.0:0.0} KB comprimido");
        Assert.True(comprimido * 3 < original, $"La compresión no redujo lo esperado: {original} → {comprimido} bytes.");
    }

    [PostgresFact]
    public async Task VistasSqlMantienenPresupuestoEnEstadoInstitucionalYMonitoreo()
    {
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            var docente = await db.Usuarios.SingleAsync(u => u.Identificador == "DOC-0421" && u.Rol == "tutor");
            docente.CoordinadorEscuela = true;
            docente.Version++;
            await db.SaveChangesAsync();
        }

        var contador = new ContadorConsultas();
        await using var app = fixture.App.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.ConfigureDbContext<TutoriaDbContext>(o => o.AddInterceptors(contador))));
        async Task<HttpClient> Login(string identifier, string role)
        {
            var client = app.CreateClient();
            var response = await client.PostAsJsonAsync("/api/auth/login", new { identifier, role, password = "tutoria2026" });
            response.EnsureSuccessStatusCode();
            client.DefaultRequestHeaders.Authorization = new("Bearer", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString());
            return client;
        }

        using var coordEscuela = await Login("DOC-0421", "tutor");
        using var admin = await Login("coordinacion.tutoria", "coordinacion");

        (await admin.GetAsync("/api/tutoria/estado?ambitoInstitucional=true")).EnsureSuccessStatusCode();
        var antesInstitucional = contador.Total;
        var estadoInstitucional = await admin.GetAsync("/api/tutoria/estado?ambitoInstitucional=true");
        estadoInstitucional.EnsureSuccessStatusCode();
        var consultasInstitucional = contador.Total - antesInstitucional;
        output.WriteLine($"estado institucional (todas las escuelas): {consultasInstitucional} consultas SQL");
        Assert.True(consultasInstitucional <= 32, $"El estado institucional ejecutó demasiadas consultas ({consultasInstitucional}).");

        (await coordEscuela.GetAsync("/api/monitoreo/escuela")).EnsureSuccessStatusCode();
        var antesMonitoreo = contador.Total;
        var monitoreo = await coordEscuela.GetAsync("/api/monitoreo/escuela");
        monitoreo.EnsureSuccessStatusCode();
        var consultasMonitoreo = contador.Total - antesMonitoreo;
        output.WriteLine($"monitoreo coordinador de escuela: {consultasMonitoreo} consultas SQL");
        Assert.True(consultasMonitoreo <= 14, $"El monitoreo de escuela ejecutó demasiadas consultas ({consultasMonitoreo}).");
    }

    /// <summary>Interceptor de EF que cuenta cada comando SQL ejecutado por la aplicación de la prueba.</summary>
    private sealed class ContadorConsultas : DbCommandInterceptor
    {
        private int total;
        public int Total => Volatile.Read(ref total);
        private void Contar() => Interlocked.Increment(ref total);
        public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result) { Contar(); return result; }
        public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default) { Contar(); return ValueTask.FromResult(result); }
        public override object? ScalarExecuted(DbCommand command, CommandExecutedEventData eventData, object? result) { Contar(); return result; }
        public override ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData, object? result, CancellationToken cancellationToken = default) { Contar(); return ValueTask.FromResult(result); }
        public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result) { Contar(); return result; }
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default) { Contar(); return ValueTask.FromResult(result); }
    }
}
