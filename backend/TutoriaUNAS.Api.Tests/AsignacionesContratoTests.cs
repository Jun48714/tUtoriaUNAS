using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;

namespace TutoriaUNAS.Api.Tests;

public sealed class AsignacionesContratoTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task AsignacionesHistoricasMantienenElContratoEnLosTresPortalesYSePuedenActualizar()
    {
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        using var estudiante = await fixture.Login("2023010456", "estudiante");
        foreach (var json in new[] { "{}", "{\"historial\":null}", "{\"historial\":{}}" })
        {
            await using (var scope = fixture.App.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
                var asignacion = await db.Asignaciones.SingleAsync(a => a.EstudianteId == "EST-2023010456");
                asignacion.DatosJson = json;
                await db.SaveChangesAsync();
            }
            foreach (var cliente in new[] { coord, tutor, estudiante })
            {
                var estado = (await cliente.GetFromJsonAsync<EstadoTutoriaDto>("/api/tutoria/estado"))!;
                var a = Assert.Single(estado.Asignaciones, a => a.GetProperty("estudianteId").GetString() == "EST-2023010456");
                Assert.Equal("DOC-0421", a.GetProperty("tutorId").GetString());
                Assert.Equal("E-IIS", a.GetProperty("escuelaId").GetString());
                Assert.Equal("2026-II", a.GetProperty("semestreId").GetString());
                Assert.Equal("activa", a.GetProperty("estado").GetString());
                Assert.True(a.GetProperty("version").GetInt32() > 0);
                Assert.Equal(JsonValueKind.Array, a.GetProperty("historial").ValueKind);
                Assert.Empty(a.GetProperty("historial").EnumerateArray());
                Assert.Equal("", a.GetProperty("fechaInicio").GetString());
                Assert.Equal("", a.GetProperty("criterio").GetString());
                Assert.Equal("", a.GetProperty("referenciaAprobacion").GetString());
                Assert.Equal(JsonValueKind.Null, a.GetProperty("fechaFin").ValueKind);
            }
            var antes = (await coord.GetFromJsonAsync<EstadoTutoriaDto>("/api/tutoria/estado"))!;
            var actual = antes.Asignaciones.Single(a => a.GetProperty("estudianteId").GetString() == "EST-2023010456");
            var response = await coord.PostAsJsonAsync("/api/tutoria/asignaciones", new AsignarTutorDto(
                "EST-2023010456", "DOC-0421", "Grupo ficticio", "Acuerdo ficticio", actual.GetProperty("version").GetInt32()));
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            var despues = (await coord.GetFromJsonAsync<EstadoTutoriaDto>("/api/tutoria/estado"))!;
            var actualizado = despues.Asignaciones.Single(a => a.GetProperty("estudianteId").GetString() == "EST-2023010456");
            Assert.Equal("Acuerdo ficticio", Assert.Single(actualizado.GetProperty("historial").EnumerateArray()).GetProperty("motivo").GetString());
        }
    }
}
