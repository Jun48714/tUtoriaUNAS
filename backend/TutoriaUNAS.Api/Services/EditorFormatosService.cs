using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services;

public sealed class EditorFormatosService(TutoriaDbContext db, TutoriaContext context)
{
    private const string TipoCatalogo = "formatos";

    private async Task<ActorTutoria> Administrador(CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.AdminInstitucional, "Solo administración institucional edita los formatos compartidos por todas las escuelas.", 403);
        actor.Exigir("formularios", "editar");
        return actor;
    }

    private async Task<CatalogoEntity> Catalogo(string codigo, CancellationToken ct) =>
        await db.Catalogos.SingleOrDefaultAsync(c => c.Tipo == TipoCatalogo && c.Id == codigo, ct)
        ?? throw new TutoriaError(404, "Formato no disponible.");

    public async Task<EditorFormatoDto> Leer(string codigo, CancellationToken ct)
    {
        await Administrador(ct);
        var publicada = await Catalogo(codigo, ct);
        return await Estado(publicada, ct);
    }

    private async Task<EditorFormatoDto> Estado(CatalogoEntity publicada, CancellationToken ct)
    {
        var borrador = await db.BorradoresFormato.AsNoTracking().SingleOrDefaultAsync(b => b.Codigo == publicada.Id, ct);
        var historial = await db.PublicacionesFormato.AsNoTracking().Where(p => p.Codigo == publicada.Id)
            .OrderByDescending(p => p.Revision).Select(p => new PublicacionFormatoDto(p.Revision, p.Publicado, p.UsuarioId)).ToArrayAsync(ct);
        return new(JsonDatos.Elemento(publicada.DatosJson), publicada.Version,
            borrador is null ? null : JsonDatos.Elemento(borrador.DefinicionJson), borrador?.Version ?? 0, borrador?.Actualizado, historial, ValidacionDefinicionFormato.Integrados.ToArray());
    }

    public async Task<EditorFormatoDto> Guardar(string codigo, GuardarFormatoInput input, CancellationToken ct)
    {
        var actor = await Administrador(ct);
        await using var tx = await context.Transaccion(actor, ct, "catalogo-formatos");
        var publicada = await Catalogo(codigo, ct);
        var borrador = await db.BorradoresFormato.SingleOrDefaultAsync(b => b.Codigo == codigo, ct);
        TutoriaContext.Version(input.VersionPublicada, publicada.Version);
        TutoriaContext.Version(input.Version, borrador?.Version ?? 0);
        Validar(input.Definicion, publicada);
        if (borrador is null)
        {
            borrador = new() { Codigo = codigo };
            db.BorradoresFormato.Add(borrador);
        }
        borrador.DefinicionJson = input.Definicion.GetRawText();
        borrador.VersionPublicada = publicada.Version;
        borrador.Version++;
        borrador.Actualizado = context.Ahora;
        borrador.UsuarioId = actor.Usuario.Id;
        context.Auditar(actor, "guardar-borrador-formato", codigo, borrador.Version);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await Estado(publicada, ct);
    }

    public async Task<EditorFormatoDto> Publicar(string codigo, PublicarFormatoInput input, CancellationToken ct)
    {
        var actor = await Administrador(ct);
        await using var tx = await context.Transaccion(actor, ct, "catalogo-formatos");
        var publicada = await Catalogo(codigo, ct);
        var borrador = await db.BorradoresFormato.SingleOrDefaultAsync(b => b.Codigo == codigo, ct);
        TutoriaContext.Version(input.Version, borrador?.Version ?? 0);
        TutoriaContext.Version(input.VersionPublicada, publicada.Version);
        var definicion = input.Definicion ?? (borrador is null
            ? throw new TutoriaError(409, "Completa la definición del formato antes de publicar.")
            : JsonDatos.Elemento(borrador.DefinicionJson));
        if (input.Definicion is null) TutoriaContext.Version(borrador!.VersionPublicada, publicada.Version);
        Validar(definicion, publicada);
        if (!await db.PublicacionesFormato.AnyAsync(p => p.Codigo == codigo && p.Revision == publicada.Version, ct))
            RegistrarPublicacion(publicada, actor);
        // Incluye envíos antiguos y asistencias generadas. Las respuestas jamás se modifican.
        await db.Instrumentos.Where(i => i.Formato == codigo && i.Enviado != null && i.DefinicionJson == null)
            .ExecuteUpdateAsync(set => set.SetProperty(i => i.DefinicionJson, publicada.DatosJson), ct);
        publicada.Version++;
        var nueva = JsonNode.Parse(definicion.GetRawText())!.AsObject();
        nueva["revision"] = publicada.Version;
        publicada.DatosJson = nueva.ToJsonString(JsonDatos.Options);
        RegistrarPublicacion(publicada, actor);
        if (borrador is not null)
        {
            // Se conserva el contador para rechazar escrituras de clientes anteriores.
            borrador.DefinicionJson = publicada.DatosJson;
            borrador.VersionPublicada = publicada.Version;
            borrador.Version++;
            borrador.Actualizado = context.Ahora;
        }
        context.Auditar(actor, "publicar-formato", codigo, publicada.Version);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await Estado(publicada, ct);
    }

    public async Task<JsonElement> Version(string codigo, int revision, CancellationToken ct)
    {
        await Administrador(ct);
        var version = await db.PublicacionesFormato.AsNoTracking().SingleOrDefaultAsync(p => p.Codigo == codigo && p.Revision == revision, ct)
            ?? throw new TutoriaError(404, "Versión no disponible.");
        return JsonDatos.Elemento(version.DefinicionJson);
    }

    private static void Validar(JsonElement definicion, CatalogoEntity publicada) =>
        ValidacionDefinicionFormato.Validar(definicion, JsonDatos.Elemento(publicada.DatosJson), new CatalogoFormatos().Definicion(publicada.Id));

    private void RegistrarPublicacion(CatalogoEntity publicada, ActorTutoria actor) => db.PublicacionesFormato.Add(new()
    {
        Codigo = publicada.Id, Revision = publicada.Version, DefinicionJson = publicada.DatosJson,
        Publicado = context.Ahora, UsuarioId = actor.Usuario.Id
    });
}
