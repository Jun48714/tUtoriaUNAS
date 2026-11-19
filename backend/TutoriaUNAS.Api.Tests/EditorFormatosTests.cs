using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Identity;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Tests;

public sealed class ValidacionEditorFormatosTests
{
    [Theory]
    [InlineData("F01"), InlineData("F02"), InlineData("F03"), InlineData("F04"), InlineData("F05"), InlineData("F06")]
    [InlineData("F07"), InlineData("F08"), InlineData("F09"), InlineData("F10"), InlineData("F11"), InlineData("F12")]
    public void AdmiteLosDoceAnexosOriginales(string codigo)
    {
        var definicion = new CatalogoFormatos().Definicion(codigo);
        ValidacionDefinicionFormato.Validar(definicion, definicion, definicion);
    }

    [Theory]
    [InlineData("duplicada"), InlineData("tipo"), InlineData("referencia"), InlineData("ciclo"), InlineData("integrado"), InlineData("opcion"), InlineData("rotulo"), InlineData("condicion-integrada")]
    public void RechazaDefinicionesQueRompenElContrato(string caso)
    {
        var original = new CatalogoFormatos().Definicion("F03");
        var nodo = JsonNode.Parse(original.GetRawText())!;
        var campos = nodo["secciones"]![0]!["campos"]!.AsArray();
        var pregunta = new JsonObject { ["codigo"] = "extra", ["etiqueta"] = "Pregunta adicional", ["tipo"] = "escala", ["obligatorio"] = false, ["opciones"] = new JsonArray("Uno", "Dos") };
        campos.Add(pregunta);
        switch (caso)
        {
            case "duplicada": pregunta["codigo"] = "correo"; break;
            case "tipo": pregunta["tipo"] = "script"; break;
            case "referencia": pregunta["visibleSi"] = new JsonObject { ["campo"] = "inexistente", ["valores"] = new JsonArray("Uno") }; break;
            case "ciclo": pregunta["visibleSi"] = new JsonObject { ["campo"] = "extra", ["valores"] = new JsonArray("Uno") }; break;
            case "integrado": campos.RemoveAt(0); break;
            case "opcion": pregunta["opciones"] = new JsonArray("Uno", "uno"); break;
            case "rotulo": pregunta["rotulosOpciones"] = new JsonObject { ["inexistente"] = "Texto" }; break;
            case "condicion-integrada": campos[0]!["visibleSi"] = new JsonObject { ["campo"] = "extra", ["valores"] = new JsonArray("Uno") }; break;
        }
        Assert.Throws<TutoriaError>(() => ValidacionDefinicionFormato.Validar(JsonSerializer.SerializeToElement(nodo), original, original));
    }
}

public sealed class EditorFormatosTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task AsistenciasConPreguntasNuevasSeCompletanSinAlterarParticipantes()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        var inicial = await Ok<EditorFormatoDto>(await admin.GetAsync("/api/formatos/F07/editor"));
        var nodo = JsonNode.Parse(inicial.Publicada.GetRawText())!;
        nodo["secciones"]![0]!["campos"]!.AsArray().Add(new JsonObject { ["codigo"] = "acuerdoAdicional", ["etiqueta"] = "Acuerdo adicional de la sesión", ["tipo"] = "texto", ["obligatorio"] = true });
        var borrador = await Ok<EditorFormatoDto>(await admin.PutAsJsonAsync("/api/formatos/F07/borrador", new GuardarFormatoInput(inicial.Version, inicial.VersionPublicada, JsonSerializer.SerializeToElement(nodo))));
        var publicada = await Ok<EditorFormatoDto>(await admin.PostAsJsonAsync("/api/formatos/F07/publicar", new PublicarFormatoInput(borrador.Version, borrador.VersionPublicada)));
        const string sesionId = "SES-EDITOR-ADICIONAL";
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            db.Sesiones.Add(new SesionEntity { Id = sesionId, TutorId = "DOC-0421", EscuelaId = "E-IIS", SemestreId = "2026-II", Tipo = "grupal", Fecha = JsonDatos.Fecha(DateTimeOffset.UtcNow.AddDays(-1)), HoraInicio = "09:00", HoraFin = "10:00", FinUtc = DateTimeOffset.UtcNow.AddDays(-1), Tema = "Prueba ficticia del editor", Asistentes = [new() { EstudianteId = "EST-2023010456" }] });
            await db.SaveChangesAsync();
        }
        var estado = await Ok<EstadoTutoriaDto>(await tutor.GetAsync("/api/tutoria/estado"));
        var sesion = estado.Sesiones.Single(s => s.Id == sesionId);
        var asistentes = sesion.Asistentes.Select(a => a with { Estado = "asistio" }).ToArray();
        await Ok<SesionDto>(await tutor.PutAsJsonAsync($"/api/sesiones/{sesionId}/asistencia", new RegistrarAsistenciaDto(sesion.Version, asistentes)));
        var doc = (await Ok<EstadoTutoriaDto>(await tutor.GetAsync("/api/tutoria/estado"))).Registros.Single(r => r.SesionId == sesionId && r.Formato == "F07");
        Assert.Equal("borrador", doc.Estado);
        Assert.Null(doc.Enviado);
        Assert.Equal(HttpStatusCode.BadRequest, (await tutor.PutAsJsonAsync("/api/formularios/" + doc.Id, new GuardarInstrumentoDto(doc.Version, doc.Respuestas, true, publicada.VersionPublicada))).StatusCode);
        var respuestas = new Dictionary<string, string>(doc.Respuestas) { ["acuerdoAdicional"] = "Revisar el material de práctica", ["asistentes"] = "[]" };
        var enviado = await Ok<InstrumentoDto>(await tutor.PutAsJsonAsync("/api/formularios/" + doc.Id, new GuardarInstrumentoDto(doc.Version, respuestas, true, publicada.VersionPublicada)));
        Assert.Equal("enviado", enviado.Estado);
        Assert.Equal("Revisar el material de práctica", enviado.Respuestas["acuerdoAdicional"]);
        Assert.Single(CatalogoFormatos.Filas(enviado.Respuestas["asistentes"]));
    }

    [PostgresFact]
    public async Task CoordinacionDeEscuelaNoPuedeEditarElCatalogoGlobal()
    {
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            var usuario = new UsuarioEntity { Id = "COORD-EDITOR-ESCUELA", Subject = "COORD-EDITOR-ESCUELA", Issuer = "local-development", Rol = "coordinacion", PersonaId = "DOC-0422", EscuelaId = "E-IIS", Identificador = "coordinacion.editor.escuela" };
            usuario.PasswordHashDesarrollo = new PasswordHasher<UsuarioEntity>().HashPassword(usuario, "tutoria2026");
            db.Usuarios.Add(usuario); await db.SaveChangesAsync();
        }
        using var coordinador = await fixture.Login("coordinacion.editor.escuela", "coordinacion");
        Assert.Equal(HttpStatusCode.Forbidden, (await coordinador.GetAsync("/api/formatos/F01/editor")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coordinador.PostAsJsonAsync("/api/formatos/F01/publicar", new PublicarFormatoInput(1, 1))).StatusCode);
    }

    [PostgresFact]
    public async Task DosAdministradoresNoSobrescribenElMismoBorrador()
    {
        using var primero = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var segundo = await fixture.Login("coordinacion.tutoria", "coordinacion");
        var estado = await Ok<EditorFormatoDto>(await primero.GetAsync("/api/formatos/F04/editor"));
        var input = new GuardarFormatoInput(estado.Version, estado.VersionPublicada, estado.Publicada);
        var resultados = await Task.WhenAll(primero.PutAsJsonAsync("/api/formatos/F04/borrador", input), segundo.PutAsJsonAsync("/api/formatos/F04/borrador", input));
        Assert.Single(resultados, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(resultados, r => r.StatusCode == HttpStatusCode.Conflict);
    }

    private static async Task<T> Ok<T>(HttpResponseMessage respuesta)
    {
        Assert.True(respuesta.IsSuccessStatusCode, $"{respuesta.StatusCode}: {await respuesta.Content.ReadAsStringAsync()}");
        return (await respuesta.Content.ReadFromJsonAsync<T>())!;
    }

    [PostgresFact]
    public async Task PublicarPropagaATodosLosRolesConservaEnviosYRechazaEdicionesAntiguas()
    {
        using var admin = await fixture.Login("coordinacion.tutoria", "coordinacion");
        using var estudiante = await fixture.Login("2023010456", "estudiante");
        using var tutor = await fixture.Login("DOC-0421", "tutor");
        const string ruta = "/api/formatos/F03";
        Assert.Equal(HttpStatusCode.Forbidden, (await tutor.GetAsync(ruta + "/editor")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await estudiante.PutAsJsonAsync(ruta + "/borrador", new { version = 0, versionPublicada = 1, definicion = new { } })).StatusCode);
        var inicial = await Ok<EditorFormatoDto>(await admin.GetAsync(ruta + "/editor"));
        var nodo = JsonNode.Parse(inicial.Publicada.GetRawText())!;
        nodo["nombre"] = "Entrevista editable ficticia";
        nodo["secciones"]![0]!["campos"]!.AsArray().Add(new JsonObject { ["codigo"] = "apoyoNuevo", ["etiqueta"] = "¿Qué apoyo adicional necesitas?", ["tipo"] = "texto", ["obligatorio"] = true, ["personalizado"] = true });
        var input = new GuardarFormatoInput(inicial.Version, inicial.VersionPublicada, JsonSerializer.SerializeToElement(nodo));
        var borrador = await Ok<EditorFormatoDto>(await admin.PutAsJsonAsync(ruta + "/borrador", input));
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync(ruta + "/borrador", input)).StatusCode);
        var estado = await Ok<EstadoTutoriaDto>(await estudiante.GetAsync("/api/tutoria/estado"));
        Assert.DoesNotContain(estado.Sistema!.Catalogos["formatos"], f => f.GetProperty("nombre").GetString() == "Entrevista editable ficticia");
        const string historicoId = "INST-ENVIO-HISTORICO-EDITOR";
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            var historico = DocumentosService.Nuevo(historicoId, "F03", "DOC-0421", "E-IIS", "2026-II", "EST-2023010456", DateTimeOffset.UtcNow);
            historico.Estado = "enviado"; historico.Enviado = DateTimeOffset.UtcNow; historico.RespuestasJson = "{\"colegio\":\"Colegio ficticio conservado\"}";
            db.Instrumentos.Add(historico); await db.SaveChangesAsync();
        }
        var publicada = await Ok<EditorFormatoDto>(await admin.PostAsJsonAsync(ruta + "/publicar", new PublicarFormatoInput(borrador.Version, borrador.VersionPublicada)));
        Assert.Equal(inicial.VersionPublicada + 1, publicada.VersionPublicada);
        Assert.Equal(2, publicada.Historial.Length);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync(ruta + "/publicar", new PublicarFormatoInput(borrador.Version, borrador.VersionPublicada))).StatusCode);
        foreach (var cliente in new[] { admin, estudiante, tutor })
        {
            var actualizado = await Ok<EstadoTutoriaDto>(await cliente.GetAsync("/api/tutoria/estado"));
            Assert.Contains(actualizado.Sistema!.Catalogos["formatos"], f => f.GetProperty("nombre").GetString() == "Entrevista editable ficticia");
        }
        var antiguo = await Ok<InstrumentoDto>(await estudiante.GetAsync("/api/formularios/" + historicoId));
        Assert.Equal("Colegio ficticio conservado", antiguo.Respuestas["colegio"]);
        Assert.Equal(inicial.Publicada.GetProperty("nombre").GetString(), antiguo.Definicion!.Value.GetProperty("nombre").GetString());
        var entrevista = estado.Registros.First(i => i.Formato == "F03" && i.Estado is "no-iniciado" or "borrador");
        Assert.Equal(HttpStatusCode.Conflict, (await estudiante.PutAsJsonAsync("/api/formularios/" + entrevista.Id, new GuardarInstrumentoDto(entrevista.Version, [], false, inicial.VersionPublicada))).StatusCode);
        var rechazo = await estudiante.PutAsJsonAsync("/api/formularios/" + entrevista.Id, new GuardarInstrumentoDto(entrevista.Version, [], true, publicada.VersionPublicada));
        Assert.Equal(HttpStatusCode.BadRequest, rechazo.StatusCode);
        Assert.Contains("apoyoNuevo", await rechazo.Content.ReadAsStringAsync());
        var original = await Ok<JsonElement>(await admin.GetAsync(ruta + "/versiones/1"));
        Assert.Equal(inicial.Publicada.GetProperty("nombre").GetString(), original.GetProperty("nombre").GetString());
    }
}
