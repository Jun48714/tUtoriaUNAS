using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Data;

namespace TutoriaUNAS.Api.Tests;

public sealed class FormatosPruebaDesarrolloTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task PracticesAreFictionalIdempotentAndPreserveExistingDocuments()
    {
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
        var seed = Path.Combine(scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Data", "semilla-desarrollo.json");
        var antes = await db.Instrumentos.AsNoTracking().ToArrayAsync();
        var serialized = System.Text.Json.JsonSerializer.Serialize(antes.OrderBy(d => d.Id));
        Assert.Equal(8, await FormatosPruebaDesarrollo.Preparar(db, "2023010457", seed, TimeProvider.System));
        Assert.Equal(0, await FormatosPruebaDesarrollo.Preparar(db, "2023010457", seed, TimeProvider.System));
        var ids = antes.Select(d => d.Id).ToArray();
        var despues = await db.Instrumentos.AsNoTracking().Where(d => ids.Contains(d.Id)).ToArrayAsync();
        Assert.Equal(serialized, System.Text.Json.JsonSerializer.Serialize(despues.OrderBy(d => d.Id)));
        var creados = await db.Instrumentos.Where(d => d.SesionId != null && d.SesionId.StartsWith("SES-PRACTICA-CIERRES-V3-")).ToArrayAsync();
        Assert.Equal(4, creados.Count(d => d.Formato == "F10"));
        Assert.Equal(4, creados.Count(d => d.Formato == "F11"));
        Assert.All(creados, d => { Assert.Equal("EST-2023010457", d.EstudianteId); Assert.Equal("no-iniciado", d.Estado); Assert.Null(d.Enviado); });
        var sesiones = await db.Sesiones.Include(s => s.Asistentes).Where(s => s.Id.StartsWith("SES-PRACTICA-CIERRES-V3-")).ToArrayAsync();
        Assert.All(sesiones, s => { Assert.True(s.AsistenciaConfirmada); Assert.Equal("realizada", s.Estado); Assert.Contains("ficticios", s.Objetivo); Assert.All(s.Asistentes, a => Assert.Equal("asistio", a.Estado)); });
        await Assert.ThrowsAsync<InvalidOperationException>(() => FormatosPruebaDesarrollo.Preparar(db, "NO-ES-SEMILLA", seed, TimeProvider.System));
    }
}
