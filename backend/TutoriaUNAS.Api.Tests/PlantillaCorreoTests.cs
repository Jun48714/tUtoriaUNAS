using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Correo;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Services.Accounts;

namespace TutoriaUNAS.Api.Tests;

public sealed partial class PlantillaCorreoTests
{
    [GeneratedRegex("cid:([a-z]+)")]
    private static partial Regex Cid();

    [Fact]
    public void CadaTipoTieneSuTituloYSinSelloNiAnimacion()
    {
        foreach (var tipo in PlantillaCorreo.Tipos.Keys)
        {
            var html = PlantillaCorreo.Renderizar(new MensajeCorreo(tipo, "Ana", "Texto ficticio"), "Asunto ficticio");
            Assert.Equal(["escudo", "franja", "marca", "titulo"], html.Recursos.Select(r => r.Id).Order());
            Assert.DoesNotContain(html.Recursos, r => r.TipoMime == "image/gif");
            Assert.Contains("background:#ffffff", html.Html);
            Assert.All(html.Recursos, r => Assert.True(r.Datos.Length > 100, r.Nombre));
            // Todo cid: del HTML tiene su imagen incrustada.
            Assert.All(Cid().Matches(html.Html).Select(m => m.Groups[1].Value).Distinct(), id => Assert.Contains(html.Recursos, r => r.Id == id));
            Assert.Contains($"alt=\"{System.Net.WebUtility.HtmlEncode(PlantillaCorreo.Tipos[tipo])}\"", html.Html);
        }
    }

    [Fact]
    public void LosEjemplosCubrenTodosLosAvisosYMuestranSusDatos()
    {
        var ejemplos = PlantillaCorreo.Ejemplos("https://tutoria.example.invalid/login").ToArray();
        Assert.Equal(PlantillaCorreo.Tipos.Keys.Where(t => t != "prueba").Order(), ejemplos.Select(e => e.Mensaje.Tipo).Order());
        var codigo = PlantillaCorreo.Renderizar(ejemplos.Single(e => e.Mensaje.Tipo == "verificacion").Mensaje, "Verifica tu cuenta").Html;
        Assert.Contains(">482915<", codigo);
        Assert.Contains("href=\"https://tutoria.example.invalid/copiar-codigo.html#482915\"", codigo);
        Assert.True(codigo.IndexOf("Copiar código", StringComparison.Ordinal) < codigo.IndexOf(">482915<", StringComparison.Ordinal), "el botón va antes del código");
        Assert.DoesNotContain("Hola", codigo);
        var acceso = PlantillaCorreo.Renderizar(ejemplos.Single(e => e.Mensaje.Tipo == "acceso").Mensaje, "Tu acceso").Html;
        Assert.Contains("UNAS-7F3A9C21B4D8E5A0C1B2D3F4", acceso);   // la contraseña temporal sí: sin ella no se puede entrar
        Assert.Contains("href=\"https://tutoria.example.invalid/copiar-codigo.html#clave=UNAS-7F3A9C21B4D8E5A0C1B2D3F4\"", acceso);
        Assert.True(acceso.IndexOf("Copiar contraseña", StringComparison.Ordinal) < acceso.IndexOf(">UNAS-7F3A9C21B4D8E5A0C1B2D3F4<", StringComparison.Ordinal), "el botón va antes de la contraseña");
        Assert.DoesNotContain("ana.perez", acceso);
        Assert.DoesNotContain("Perfil", acceso);
        Assert.Contains("href=\"https://tutoria.example.invalid/login\"", acceso);
    }

    [Fact]
    public void LosDatosSeEscapanYUnTipoDesconocidoSeRechaza()
    {
        var html = PlantillaCorreo.Renderizar(new MensajeCorreo("habilitada", null, "<script>x</script> a & b", [new("<b>", "\"valor\"")],
            Boton: "Entrar", Enlace: "https://x.invalid/?a=1&b=\"2\""), "<asunto>").Html;
        Assert.DoesNotContain("<script>x", html);
        Assert.Contains("&lt;script&gt;x&lt;/script&gt;", html);
        Assert.Contains("a &amp; b", html);
        Assert.Contains("&lt;b&gt;", html);
        Assert.Contains("&lt;asunto&gt;", html);
        Assert.Contains("a=1&amp;b=&quot;2&quot;", html);
        Assert.Throws<KeyNotFoundException>(() => PlantillaCorreo.Renderizar(new MensajeCorreo("otro", null, "x"), "x"));
    }

    [Theory]
    [InlineData("https://tutoria.unas.edu.pe:8443/login", "https://tutoria.unas.edu.pe:8443/copiar-codigo.html#123456")]
    [InlineData("https://tutoria.unas.edu.pe/login", "https://tutoria.unas.edu.pe/copiar-codigo.html#123456")]
    [InlineData("no es una url", null)]
    public void ElEnlaceDeCopiarUsaElOrigenDelPortal(string url, string? esperado) =>
        Assert.Equal(esperado, PlantillaCorreo.EnlaceCopiar(url, "123456"));

    [Fact]
    public void LaColaGuardaTextoYPlantillaYSigueLeyendoMensajesAntiguos()
    {
        var mensaje = new MensajeCorreo("verificacion", "Ana", "Ingresa el código", Codigo: "123456", Vigencia: "10 minutos");
        var (texto, plantilla) = PlantillaCorreo.Leer(PlantillaCorreo.Serializar("Tu código es 123456", mensaje));
        Assert.Equal("Tu código es 123456", texto);
        Assert.Equal(mensaje.Codigo, plantilla!.Codigo);
        Assert.Equal("verificacion", plantilla.Tipo);
        var (antiguo, sinPlantilla) = PlantillaCorreo.Leer("Texto plano de un mensaje encolado antes del cambio");
        Assert.Equal("Texto plano de un mensaje encolado antes del cambio", antiguo);
        Assert.Null(sinPlantilla);
    }
}

/// <summary>Los avisos reales se encolan con la plantilla Postal y conservan su texto alternativo.</summary>
public sealed class PlantillaCorreoColaTests(CuentasFixture fixture) : IClassFixture<CuentasFixture>
{
    [PostgresFact]
    public async Task ElCodigoDeVerificacionSeEncolaConLaPlantillaYElTextoAlternativo()
    {
        using var admin = await fixture.Admin();
        var correo = "postal-" + Guid.NewGuid().ToString("N") + "@unas.edu.pe";
        var creada = await admin.PostAsJsonAsync("/api/cuentas", new CrearCuentaInput(correo, "estudiante", "María José", "Ficticia Prueba"));
        Assert.True(creada.IsSuccessStatusCode, await creada.Content.ReadAsStringAsync());
        var reto = await fixture.App.CreateClient().PostAsJsonAsync("/api/auth/codigo", new SolicitarCodigoInput(correo, "registro", "estudiante"));
        Assert.True(reto.IsSuccessStatusCode, await reto.Content.ReadAsStringAsync());

        var leidos = new List<(string Asunto, string Texto, MensajeCorreo? Plantilla)>();
        await fixture.Modificar(async db =>
        {
            var protector = fixture.App.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(ColaCorreoCuenta.Purpose);
            foreach (var m in await db.CorreosCuenta.Where(m => m.Destinatario == correo && m.Enviado == null).ToArrayAsync())
            {
                var (texto, plantilla) = PlantillaCorreo.Leer(protector.Unprotect(m.ContenidoProtegido));
                leidos.Add((m.Asunto, texto, plantilla));
            }
        });
        var acceso = Assert.Single(leidos, l => l.Asunto.StartsWith("Tu acceso temporal", StringComparison.Ordinal));
        Assert.Equal("acceso", acceso.Plantilla!.Tipo);
        Assert.Null(acceso.Plantilla.Nombre);
        Assert.DoesNotContain(acceso.Plantilla.Renglones!, r => r.Valor == correo);
        Assert.Contains(acceso.Plantilla.Renglones!, r => r.Etiqueta == "Contraseña temporal" && r.Mono && r.EnlaceCopiar!.Contains("#clave=UNAS-", StringComparison.Ordinal));
        var verificacion = leidos.SingleOrDefault(l => l.Asunto.StartsWith("Verifica tu cuenta", StringComparison.Ordinal));
        if (verificacion.Plantilla is not null)
        {
            Assert.Equal("verificacion", verificacion.Plantilla.Tipo);
            Assert.Contains(verificacion.Plantilla.Codigo!, verificacion.Texto);   // el texto alternativo lleva el mismo código
            var html = PlantillaCorreo.Renderizar(verificacion.Plantilla, verificacion.Asunto).Html;
            Assert.Contains(">" + verificacion.Plantilla.Codigo + "<", html);
            Assert.Contains("/copiar-codigo.html#" + verificacion.Plantilla.Codigo, html);
        }
        // El despachador entrega el texto alternativo a un remitente sin soporte HTML (el de las pruebas).
        await fixture.Drenar();
        Assert.Contains(fixture.Correo.Mensajes, m => m.Para == correo && m.Contenido.Contains("Contraseña temporal", StringComparison.Ordinal));
    }
}
