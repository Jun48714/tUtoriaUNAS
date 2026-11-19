namespace TutoriaUNAS.Api.Entities;

public sealed class BorradorFormatoEntity
{
    public string Codigo { get; set; } = "";
    public string DefinicionJson { get; set; } = "{}";
    public int Version { get; set; }
    public int VersionPublicada { get; set; }
    public DateTimeOffset Actualizado { get; set; }
    public string UsuarioId { get; set; } = "";
}

public sealed class PublicacionFormatoEntity
{
    public string Codigo { get; set; } = "";
    public int Revision { get; set; }
    public string DefinicionJson { get; set; } = "{}";
    public DateTimeOffset Publicado { get; set; }
    public string UsuarioId { get; set; } = "";
}
