using System.Text.Json;

namespace TutoriaUNAS.Api.DTOs;

public sealed record GuardarFormatoInput(int Version, int VersionPublicada, JsonElement Definicion);
public sealed record PublicarFormatoInput(int Version, int VersionPublicada, JsonElement? Definicion = null);
public sealed record PublicacionFormatoDto(int Revision, DateTimeOffset Publicado, string UsuarioId);
public sealed record EditorFormatoDto(JsonElement Publicada, int VersionPublicada, JsonElement? Borrador,
    int Version, DateTimeOffset? Actualizado, PublicacionFormatoDto[] Historial, string[] CamposIntegrados);
