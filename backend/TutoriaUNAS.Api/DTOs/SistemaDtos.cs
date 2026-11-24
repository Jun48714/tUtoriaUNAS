using System.Text.Json;
using System.Text.Json.Serialization;

namespace TutoriaUNAS.Api.DTOs;

public sealed record PerfilContactoDto(string Correo, string Telefono, int Version);
public sealed record PreferenciasDto(Dictionary<string, bool> Avisos, Dictionary<string, bool> Pantalla, int Version);
public sealed record SistemaDto(Dictionary<string, JsonElement[]> Catalogos, Dictionary<string, JsonElement[]> Fuentes,
    PerfilContactoDto Contacto, PreferenciasDto Preferencias, JsonElement[] Mensajes, JsonElement[] Notificaciones,
    JsonElement[] SolicitudesCambio, JsonElement[] ActividadesPlan, JsonElement[] Cuentas,
    JsonElement[] Permisos, JsonElement? ConfiguracionPeriodo, JsonElement[]? ActividadCuenta = null, bool AccesoLocal = false, JsonElement[]? DestinatariosDisponibles = null,
    PeriodoEscuelaDto[]? PeriodosEscuela = null);
public sealed record PeriodoEscuelaDto(string EscuelaId, string SemestreId, string Momento, string? Inicio, string? Fin, bool Cerrado);
public sealed record ContactoInput([property: JsonRequired] int Version, string Correo, string Telefono);
public sealed record PreferenciasInput([property: JsonRequired] int Version, Dictionary<string, bool> Avisos, Dictionary<string, bool> Pantalla);
public sealed record LecturaInput(string[] Ids, bool Leida = true);
public sealed record MensajeInput([property: JsonRequired] int Version, string Asunto, string Cuerpo, string Canal, string[] Destinatarios,
    string Estado, string Plantilla = "redaccion-libre", DateTimeOffset? ProgramadoPara = null);
public sealed record SolicitudCambioInput(string Motivo);
public sealed record ResolverSolicitudInput([property: JsonRequired] int Version, string Decision, string Respuesta, string? TutorId = null, int? AsignacionVersion = null);
public sealed record AccesoInput([property: JsonRequired] int Version, [property: JsonRequired] bool Activo);
public sealed record ActividadInput([property: JsonRequired] int Version, string Problematica, string Objetivo, string Actividad, string Meta,
    string FechaInicio, string FechaFin, string ResponsableId, string Evidencia, string Aprobacion, [property: JsonRequired] int Avance, string Estado);
public sealed record PeriodoInput([property: JsonRequired] int Version, string Inicio, string Fin, string EntrevistasHasta, string InformesHasta, [property: JsonRequired] bool Cerrado);
public sealed record SeguimientoInput([property: JsonRequired] int Version, string Estado, string Nota, string ResponsableArea, string SiguienteAccion,
    string? FechaCita = null, string? RecomendacionComunicable = null, string? VigenciaRecomendacion = null);
public sealed record InsumoInput([property: JsonRequired] int Version, string Estado, string Responsable, string Observacion, string? FechaRespuesta);
public sealed record EstadoSesionInput([property: JsonRequired] int Version, string Accion, string Motivo, string? Fecha = null, string? HoraInicio = null, string? HoraFin = null);
public sealed record CalendarioInput(int? Version, string Kind, string Title, string SemesterId, int[] Days, string DateFrom,
    string DateTo, string StartTime, string EndTime, string Location, string Modality, int? Capacity = null);
