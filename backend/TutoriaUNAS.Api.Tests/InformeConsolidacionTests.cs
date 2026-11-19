using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Tests;

public sealed class InformeConsolidacionTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static async Task<T> Ok<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    [PostgresFact]
    public async Task ConsolidacionRespectsOwnershipAndIncludesAllCategoriesWithoutPersonalNarratives()
    {
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        using var other = await fixture.Login("DOC-0422", "tutor");
        using var student = await fixture.Login("2023010456", "estudiante");
        using var coord = await fixture.Login("coordinacion.tutoria", "coordinacion");
        var atencion = await Ok<InstrumentoDto>(await tutor.PostAsJsonAsync("/api/formularios", new { formato = "F08", estudianteId = "EST-2023010456" }));
        atencion.Respuestas["motivo"] = "Otro";
        atencion.Respuestas["motivo__otro"] = "Otro motivo privado de prueba";
        atencion.Respuestas["resultado"] = "Se resuelve con la asesoría";
        atencion.Respuestas["detalleMotivo"] = "Relato privado que no debe aparecer";
        await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + atencion.Id, new { version = atencion.Version, respuestas = atencion.Respuestas, enviar = true }));
        var informe = await Ok<InstrumentoDto>(await tutor.PostAsJsonAsync("/api/formularios", new { formato = "F02" }));
        var resumen = await Ok<InformeConsolidacionDto>(await tutor.GetAsync($"/api/formularios/{informe.Id}/consolidacion"));
        Assert.True(resumen.EsCorteActual);
        Assert.Contains(resumen.Motivos, motivo => motivo.Motivo == "Otro" && motivo.Atenciones >= 1);
        Assert.Contains(resumen.Fuentes, fuente => fuente.Id == atencion.Id && fuente.Formato == "F08");
        Assert.DoesNotContain("Relato privado", JsonSerializer.Serialize(resumen));
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/formularios/{informe.Id}/consolidacion")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync($"/api/formularios/{informe.Id}/consolidacion")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync($"/api/formularios/{informe.Id}/propuesta")).StatusCode);
        var propuesta = await Ok<InstrumentoDto>(await tutor.GetAsync($"/api/formularios/{informe.Id}/propuesta"));
        Assert.Equal(informe.Version, propuesta.Version);
        Assert.Contains("Otro", propuesta.Respuestas["observaciones"]);
        var sinGuardar = await Ok<InstrumentoDto>(await tutor.GetAsync($"/api/formularios/{informe.Id}"));
        Assert.Equal(informe.Version, sinGuardar.Version);
        Assert.Equal(informe.Respuestas, sinGuardar.Respuestas);
        var guardado = await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + informe.Id, new { version = informe.Version, respuestas = new { }, enviar = false }));
        Assert.Contains("Otro", guardado.Respuestas["observaciones"]);
        guardado.Respuestas["observaciones"] = "Observación redactada por el tutor";
        guardado.Respuestas["dificultadesAcademicas"] = "[{\"dificultad\":\"Texto propio\",\"actividad\":\"Actividad propia\",\"resultado\":\"Resultado propio\"}]";
        guardado = await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + informe.Id, new { version = guardado.Version, respuestas = guardado.Respuestas, enviar = false }));
        propuesta = await Ok<InstrumentoDto>(await tutor.GetAsync($"/api/formularios/{informe.Id}/propuesta"));
        Assert.Equal("Observación redactada por el tutor", propuesta.Respuestas["observaciones"]);
        Assert.Contains("Texto propio", propuesta.Respuestas["dificultadesAcademicas"]);
        var escuela = await Ok<InstrumentoDto>(await coord.PostAsJsonAsync("/api/formularios", new { formato = "F01" }));
        var consolidado = await Ok<InformeConsolidacionDto>(await coord.GetAsync($"/api/formularios/{escuela.Id}/consolidacion"));
        Assert.Contains(consolidado.Motivos, motivo => motivo.Motivo == "Otro");
        Assert.All(consolidado.Fuentes, fuente => Assert.Equal("F02", fuente.Formato));

        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
        var publicado = DocumentosService.Nuevo("QA-F02-SNAPSHOT", "F02", informe.TutorId, informe.EscuelaId!, informe.SemestreId, null, DateTimeOffset.UtcNow);
        publicado.Estado = "enviado";
        publicado.Version = 9;
        publicado.RespuestasJson = JsonDatos.Serializar(new Dictionary<string, string> { ["observaciones"] = "Fotografía anterior" });
        var fueraAmbito = DocumentosService.Nuevo("QA-F01-SIN-ESCUELA", "F01", informe.TutorId, "ESCUELA-SIN-PERIODO-ACTIVO", informe.SemestreId, null, DateTimeOffset.UtcNow);
        db.Instrumentos.AddRange(publicado, fueraAmbito);
        await db.SaveChangesAsync();
        try
        {
            var historico = await Ok<InstrumentoDto>(await coord.GetAsync($"/api/formularios/{publicado.Id}/propuesta?ambitoInstitucional=true"));
            Assert.Single(historico.Respuestas);
            Assert.Equal("Fotografía anterior", historico.Respuestas["observaciones"]);
            Assert.Equal(9, historico.Version);
            var actualizado = await Ok<InformeConsolidacionDto>(await coord.GetAsync($"/api/formularios/{escuela.Id}/consolidacion?ambitoInstitucional=true"));
            Assert.Contains(actualizado.Fuentes, fuente => fuente.Id == publicado.Id && fuente.Version == 9 && fuente.Estado == "enviado");
            Assert.Equal(HttpStatusCode.NotFound, (await coord.GetAsync($"/api/formularios/{fueraAmbito.Id}/consolidacion?ambitoInstitucional=true")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await coord.GetAsync($"/api/formularios/{fueraAmbito.Id}/propuesta?ambitoInstitucional=true")).StatusCode);
        }
        finally
        {
            db.Instrumentos.RemoveRange(publicado, fueraAmbito);
            await db.SaveChangesAsync();
        }
    }

}
