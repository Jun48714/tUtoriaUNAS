namespace TutoriaUNAS.Api.Entities;

public sealed class VistaPersonaResumenEntity
{
    public string Id { get; set; } = "";
    public string Tipo { get; set; } = "";
    public string EscuelaId { get; set; } = "";
    public int? Ciclo { get; set; }
    public bool Activa { get; set; }
    public string Codigo { get; set; } = "";
    public string Nombres { get; set; } = "";
    public string Apellidos { get; set; } = "";
    public string NombreCompleto { get; set; } = "";
    public string Correo { get; set; } = "";
}

public sealed class VistaPersonaEstadoEntity
{
    public string Id { get; set; } = "";
    public string Tipo { get; set; } = "";
    public string EscuelaId { get; set; } = "";
    public int? Ciclo { get; set; }
    public bool Activa { get; set; }
    public string DatosEstado { get; set; } = "{}";
}

public sealed class VistaMatriculaEstadoEntity
{
    public string Id { get; set; } = "";
    public string EstudianteId { get; set; } = "";
    public string SemestreId { get; set; } = "";
    public string DatosEstado { get; set; } = "{}";
}

public sealed class VistaDirectorioUsuarioEntity
{
    public string Id { get; set; } = "";
    public string PersonaId { get; set; } = "";
    public string EscuelaId { get; set; } = "";
    public string PersonaEscuelaId { get; set; } = "";
    public string Rol { get; set; } = "";
    public string Identificador { get; set; } = "";
    public bool Activo { get; set; }
    public int Version { get; set; }
    public bool AdminInstitucional { get; set; }
    public string Nombre { get; set; } = "";
    public string NombreCompleto { get; set; } = "";
    public string Correo { get; set; } = "";
}

public sealed class VistaDerivacionSeguimientoEntity
{
    public string InstrumentoId { get; set; } = "";
    public string? EstudianteId { get; set; }
    public string TutorId { get; set; } = "";
    public string EscuelaId { get; set; } = "";
    public string SemestreId { get; set; } = "";
    public string AreaTexto { get; set; } = "";
    public string AreaCodigo { get; set; } = "";
    public string MotivoTexto { get; set; } = "";
    public string MotivoSistema { get; set; } = "";
    public string Detalle { get; set; } = "";
    public string? FechaRespuesta { get; set; }
    public string NombreTutor { get; set; } = "";
    public string? Prioridad { get; set; }
    public string? Estado { get; set; }
    public string? ResponsableArea { get; set; }
    public string? SiguienteAccion { get; set; }
    public string? FechaCita { get; set; }
    public string? RecomendacionComunicable { get; set; }
    public string? VigenciaRecomendacion { get; set; }
    public DateTimeOffset InstrumentoActualizado { get; set; }
    public DateTimeOffset Actualizado { get; set; }
    public string? Historial { get; set; }
    public int Version { get; set; }
    public bool TieneSeguimiento { get; set; }
}

public sealed class VistaMonitoreoEstudianteEntity
{
    public string EscuelaId { get; set; } = "";
    public string SemestreId { get; set; } = "";
    public string EstudianteId { get; set; } = "";
    public string TutorId { get; set; } = "";
    public string? Grupo { get; set; }
    public int? Ciclo { get; set; }
    public string? EntrevistaFormato { get; set; }
    public string EntrevistaEstado { get; set; } = "sin-habilitar";
    public int EntrevistaAvance { get; set; }
    public int SesionesAsistidas { get; set; }
    public int EvaluacionesEnviadas { get; set; }
    public int EvaluacionesPendientes { get; set; }
    public int FormatosEnviados { get; set; }
    public int Derivaciones { get; set; }
    public DateTimeOffset? UltimaActividadUtc { get; set; }
}
