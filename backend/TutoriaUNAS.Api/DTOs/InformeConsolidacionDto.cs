namespace TutoriaUNAS.Api.DTOs;

public sealed record InformeFuenteDto(string Id, string Formato, int Version, string Estado, DateTimeOffset Actualizado);
public sealed record InformeMotivoDto(string Motivo, int Atenciones);
public sealed record InformeCoberturaDto(string Formato, int Enviados, int Aprobados);

/// <summary>Indicadores consultados en el momento actual, independientes del documento enviado.</summary>
public sealed record InformeConsolidacionDto
{
    public required string Formato { get; init; }
    public required string EscuelaId { get; init; }
    public required string SemestreId { get; init; }
    public DateTimeOffset Consultado { get; init; }
    public bool EsCorteActual { get; init; }
    public int EstudiantesAsignados { get; init; }
    public int TutoresAsignados { get; init; }
    public int SesionesIndividuales { get; init; }
    public int SesionesGrupales { get; init; }
    public int AtendidosIndividuales { get; init; }
    public int AtendidosGrupales { get; init; }
    public int AtendidosUnicos { get; init; }
    public int AtencionesEnviadas { get; init; }
    public int InformesEsperados { get; init; }
    public int InformesEnviados { get; init; }
    public int InformesAprobados { get; init; }
    public InformeMotivoDto[] Motivos { get; init; } = [];
    public InformeCoberturaDto[] CoberturaFormatos { get; init; } = [];
    public InformeFuenteDto[] Fuentes { get; init; } = [];
}
