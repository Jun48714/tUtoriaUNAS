using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.DTOs;

namespace TutoriaUNAS.Api.Tests;

/// <summary>Editar datos y eliminar estudiantes desde Gestión de cuentas, con su sincronización con formularios y asignaciones.</summary>
public sealed class CuentasEdicionTests(CuentasFixture fixture) : IClassFixture<CuentasFixture>
{
    private static string Email(string prefijo) => prefijo + Guid.NewGuid().ToString("N") + "@unas.edu.pe";
    private static async Task<T> Ok<T>(HttpResponseMessage r)
    { Assert.True(r.IsSuccessStatusCode, $"{r.StatusCode}: {await r.Content.ReadAsStringAsync()}"); return (await r.Content.ReadFromJsonAsync<T>())!; }

    private static async Task<JsonElement> Cuenta(HttpClient admin, string id)
    {
        var lista = await Ok<JsonElement>(await admin.GetAsync("/api/cuentas"));
        return lista.EnumerateArray().Single(c => c.GetProperty("id").GetString() == id);
    }
    private async Task<(string Id, string PersonaId)> CrearEstudiante(HttpClient admin, string email, int? ciclo = null)
    {
        var creada = await Ok<CuentaCreadaDto>(await admin.PostAsJsonAsync("/api/cuentas", new CrearCuentaInput(email, "estudiante", "Estudiante ficticio", "Fuera del padrón", Codigo: "X-1", Ciclo: ciclo)));
        string persona = "";
        await fixture.Modificar(async db => persona = (await db.Usuarios.SingleAsync(u => u.Id == creada.Id)).PersonaId);
        return (creada.Id, persona);
    }
    private static async Task Asignar(HttpClient admin, string personaId)
    {
        var r = await admin.PostAsJsonAsync("/api/tutoria/asignaciones", new AsignarTutorDto(personaId, "DOC-0421", null, null));
        Assert.Equal(HttpStatusCode.NoContent, r.StatusCode);
    }
    private async Task<string[]> Entrevistas(string personaId)
    {
        string[] formatos = [];
        await fixture.Modificar(async db => formatos = await db.Instrumentos.Where(i => i.EstudianteId == personaId && (i.Formato == "F03" || i.Formato == "F04" || i.Formato == "F05"))
            .Select(i => i.Formato).OrderBy(f => f).ToArrayAsync());
        return formatos;
    }
    private static EditarCuentaInput Datos(JsonElement c, string? correo = null, int? ciclo = null, string nombres = "Nombre corregido") =>
        new(c.GetProperty("version").GetInt32(), correo ?? c.GetProperty("correo").GetString()!, nombres, "Apellido corregido", "COD-77", ciclo);

    [PostgresFact]
    public async Task EditarElCicloGeneraYReemplazaLaEntrevistaInicialDelEstudianteAsignado()
    {
        using var admin = await fixture.Admin();
        var email = Email("edit-");
        var (id, persona) = await CrearEstudiante(admin, email);
        await Asignar(admin, persona);
        Assert.Empty(await Entrevistas(persona));   // sin ciclo no hay formulario: es lo que veía el estudiante

        var c = await Cuenta(admin, id);
        Assert.Equal(JsonValueKind.Null, c.GetProperty("ciclo").ValueKind);
        var editada = await Ok<CuentaEditadaDto>(await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, ciclo: 2)));
        Assert.Null(editada.PasswordTemporal);
        Assert.Equal(["F03"], await Entrevistas(persona));
        c = await Cuenta(admin, id);
        Assert.Equal("Nombre corregido", c.GetProperty("nombres").GetString());
        Assert.Equal("Apellido corregido", c.GetProperty("apellidos").GetString());
        Assert.Equal("COD-77", c.GetProperty("codigo").GetString());
        Assert.Equal(2, c.GetProperty("ciclo").GetInt32());

        await Ok<CuentaEditadaDto>(await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, ciclo: 5)));
        Assert.Equal(["F04"], await Entrevistas(persona));   // la del ciclo anterior no se había empezado: se reemplaza
        string etapa = "";
        await fixture.Modificar(async db => etapa = JsonDocument.Parse((await db.Personas.SingleAsync(p => p.Id == persona)).DatosJson).RootElement.GetProperty("etapa").GetString()!);
        Assert.Equal("intermedio", etapa);
    }

    [PostgresFact]
    public async Task CambiarElCorreoDeUnaCuentaSinVerificarEmiteUnAccesoNuevoYRechazaDuplicados()
    {
        using var admin = await fixture.Admin();
        var anterior = Email("anterior-"); var nuevo = Email("nuevo-"); var otro = Email("otro-");
        var (id, _) = await CrearEstudiante(admin, anterior);
        await CrearEstudiante(admin, otro);
        var c = await Cuenta(admin, id);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, correo: otro))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, correo: "alguien@example.invalid"))).StatusCode);

        var editada = await Ok<CuentaEditadaDto>(await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, correo: nuevo)));
        Assert.Equal(nuevo, editada.Identifier);
        Assert.False(string.IsNullOrEmpty(editada.PasswordTemporal));
        using var anon = fixture.App.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/auth/login", new LoginLocalDto(anterior, "cualquiera-123456", "estudiante"))).StatusCode);
        Assert.True((await Ok<ActivacionRequeridaDto>(await anon.PostAsJsonAsync("/api/auth/login", new LoginLocalDto(nuevo, editada.PasswordTemporal!, "estudiante")))).ActivacionRequerida);
        // Una edición con una versión vieja se rechaza.
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/cuentas/{id}/datos", Datos(c, correo: nuevo))).StatusCode);
    }

    [PostgresFact]
    public async Task EliminarUnEstudianteSinHistorialLimpiaSusDatosYUnoConFormulariosEnviadosSeConserva()
    {
        using var admin = await fixture.Admin();
        var correo = Email("borrar-");
        var (id, persona) = await CrearEstudiante(admin, correo, ciclo: 1);
        await Asignar(admin, persona);
        // Una cuenta que pidió un código de verificación tiene un reto y un correo que lo referencia.
        await Ok<CodigoEnCaminoDto>(await fixture.App.CreateClient().PostAsJsonAsync("/api/auth/codigo", new SolicitarCodigoInput(correo, "registro", "estudiante")));
        await fixture.Modificar(async db => Assert.True(await db.RetosCorreo.AnyAsync(r => r.Correo == correo)));
        Assert.Equal(["F03"], await Entrevistas(persona));
        var c = await Cuenta(admin, id);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/cuentas/{id}?version={c.GetProperty("version").GetInt32() + 9}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/cuentas/{id}?version={c.GetProperty("version").GetInt32()}")).StatusCode);
        await fixture.Modificar(async db =>
        {
            Assert.False(await db.Personas.AnyAsync(p => p.Id == persona));
            Assert.False(await db.Usuarios.AnyAsync(u => u.Id == id));
            Assert.False(await db.CredencialesCuenta.AnyAsync(x => x.UsuarioId == id));
            Assert.False(await db.Asignaciones.AnyAsync(a => a.EstudianteId == persona));
            Assert.False(await db.Instrumentos.AnyAsync(i => i.EstudianteId == persona));
            Assert.False(await db.RetosCorreo.AnyAsync(r => r.Correo == correo));
            Assert.False(await db.CorreosCuenta.AnyAsync(m => m.UsuarioId == id));
        });
        Assert.DoesNotContain((await Ok<JsonElement>(await admin.GetAsync("/api/cuentas"))).EnumerateArray(), x => x.GetProperty("id").GetString() == id);

        var (idConHistorial, personaConHistorial) = await CrearEstudiante(admin, Email("historial-"), ciclo: 1);
        await Asignar(admin, personaConHistorial);
        await fixture.Modificar(async db =>
        {
            var entrevista = await db.Instrumentos.SingleAsync(i => i.EstudianteId == personaConHistorial);
            entrevista.Estado = "enviado"; entrevista.Enviado = DateTimeOffset.UtcNow; await db.SaveChangesAsync();
        });
        var conservada = await Cuenta(admin, idConHistorial);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/cuentas/{idConHistorial}?version={conservada.GetProperty("version").GetInt32()}")).StatusCode);
        await fixture.Modificar(async db => Assert.True(await db.Personas.AnyAsync(p => p.Id == personaConHistorial)));
    }

    [PostgresFact]
    public async Task UnaFichaDelPadronSinCicloLoRecibeAlCrearLaCuenta()
    {
        using var admin = await fixture.Admin();
        var email = Email("padron-");
        var persona = await fixture.Persona(email);
        await fixture.Modificar(async db => { var p = await db.Personas.SingleAsync(x => x.Id == persona); p.Ciclo = null; await db.SaveChangesAsync(); });
        await Ok<CuentaCreadaDto>(await admin.PostAsJsonAsync("/api/cuentas", new CrearCuentaInput(email, "estudiante", "", "", persona, Ciclo: 4)));
        await fixture.Modificar(async db =>
        {
            var p = await db.Personas.SingleAsync(x => x.Id == persona);
            Assert.Equal(4, p.Ciclo);
            Assert.Equal("intermedio", JsonDocument.Parse(p.DatosJson).RootElement.GetProperty("etapa").GetString());
        });
    }
}
