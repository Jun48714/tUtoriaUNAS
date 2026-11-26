using System.Text.Json.Serialization;

namespace TutoriaUNAS.Api.Services.Padron;

// Registros del padrón tal como se guardan en los campos JSON de PostgreSQL. Sus nombres de propiedad son el
// contrato que leen el resto de la API y el portal: no se renombran.

/// <summary>Procedencia de un registro. <see cref="Filas"/> solo se escribe en personas y horarios.</summary>
public sealed class OrigenPadron
{
    public string Archivo { get; init; } = "";
    public string Sha256 { get; init; } = "";
    public string Hoja { get; init; } = "";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public List<int>? Filas { get; init; }
    public OrigenPadron ConFilas(int fila) => new() { Archivo = Archivo, Sha256 = Sha256, Hoja = Hoja, Filas = [fila] };
}

public sealed class EstudiantePadron
{
    /// <summary>Campos que administra el sistema (tutoría, coordinación): al reimportar se conservan los guardados.</summary>
    public static readonly string[] CamposDelSistema = ["ciclo", "etapa", "estado", "alertas", "ingreso", "creditosTotales"];
    public string Id { get; init; } = "";
    public string Codigo { get; init; } = "";
    public string Apellidos { get; init; } = "";
    public string ApellidoPaterno { get; init; } = "";
    public string ApellidoMaterno { get; init; } = "";
    public string Nombres { get; init; } = "";
    public string EscuelaId { get; init; } = "";
    public int? Ciclo { get; init; }
    public string Etapa { get; init; } = "sin-informar";
    public string Estado { get; init; } = "regular";
    public string EstadoFuente { get; init; } = "";
    public string Correo { get; init; } = "";
    public string Telefono { get; init; } = "";
    public string Ingreso { get; init; } = "";
    public string PpaFuente { get; init; } = "";
    public string TcaFuente { get; init; } = "";
    public double? PromedioPonderado { get; init; }
    public double? CreditosAprobados { get; init; }
    public double? CreditosTotales { get; init; }
    public string[] Alertas { get; init; } = [];
    public required OrigenPadron Origen { get; init; }
}

public sealed class DocentePadron
{
    /// <summary>Campos que el Excel no trae (escuela tutorial, aforo, categoría…): al reimportar se conservan.</summary>
    public static readonly string[] CamposDelSistema = ["codigo", "escuelaId", "categoria", "dedicacion", "telefono", "activo", "aforoMaximo", "cursosAsignados"];
    public string Id { get; init; } = "";
    public string Codigo { get; init; } = "";
    public string Apellidos { get; init; } = "";
    public string ApellidoPaterno { get; init; } = "";
    public string ApellidoMaterno { get; init; } = "";
    public string Nombres { get; init; } = "";
    public string EscuelaId { get; init; } = "";
    public string Departamento { get; init; } = "";
    public string? Categoria { get; init; }
    public string? Dedicacion { get; init; }
    public string Correo { get; init; } = "";
    public string Telefono { get; init; } = "";
    public bool Activo { get; init; } = true;
    public int? AforoMaximo { get; init; }
    public string[] CursosAsignados { get; init; } = [];
    public required OrigenPadron Origen { get; init; }
}

public sealed class EscuelaPadron
{
    public string Id { get; init; } = "";
    public string Nombre { get; init; } = "";
    public string Abreviatura { get; init; } = "";
    public string FacultadId { get; init; } = "";
}

public sealed class CursoPadron
{
    public string Id { get; init; } = "";
    public string Codigo { get; init; } = "";
    public string Nombre { get; init; } = "";
    public int? Creditos { get; init; }
    public int? Ciclo { get; init; }
    public string EscuelaId { get; init; } = "";
    public required OrigenPadron Origen { get; init; }
}

/// <summary>Una fila de horario tal como vino en el Excel; se conserva aunque no se pueda interpretar.</summary>
public sealed class HorarioOriginal
{
    public int Fila { get; init; }
    public string Dia { get; init; } = "";
    public string Horas { get; init; } = "";
    public string Duracion { get; init; } = "";
    public string Aula { get; init; } = "";
    public string CodigoAula { get; init; } = "";
    public string EsHoraTeorica { get; init; } = "";
    public string Docente { get; init; } = "";
}

public sealed class CursoMatriculado
{
    public string CursoId { get; init; } = "";
    public string Seccion { get; init; } = "";
    public int? Creditos { get; init; }
    public string Docente { get; set; } = "";
    /// <summary>Resumen legible («Día 1 09-01 pm. · Día 3 02-05 pm.»), sin repetir bloques.</summary>
    public string Horario => string.Join(" · ", HorariosOriginales.Select(h => $"Día {h.Dia} {h.Horas}").Distinct(StringComparer.Ordinal));
    public List<HorarioOriginal> HorariosOriginales { get; } = [];
}

public sealed class MatriculaPadron
{
    public string EstudianteId { get; init; } = "";
    public string SemestreId { get; init; } = "";
    public string Fecha { get; init; } = "";
    public string Estado { get; init; } = "matriculado";
    public string PlanEstudios { get; init; } = "";
    public int? Ciclo { get; init; }
    public required OrigenPadron Origen { get; init; }
    public List<CursoMatriculado> Cursos { get; } = [];
}

public sealed class HorarioPadron
{
    public string Id { get; init; } = "";
    public string Titulo { get; init; } = "";
    public int Dia { get; init; }
    public string HoraInicio { get; init; } = "";
    public string HoraFin { get; init; } = "";
    public string Modalidad { get; init; } = "presencial";
    public string Lugar { get; init; } = "";
    public string Tipo { get; init; } = "academico";
    public string EstudianteId { get; init; } = "";
    public string CursoId { get; init; } = "";
    public string SemestreId { get; init; } = "";
    public required OrigenPadron Origen { get; init; }
}

/// <summary>Fila del libro que no se importa y el motivo, para mostrarlo a quien revisa.</summary>
public sealed record FilaExcluida(string Hoja, int Fila, string Motivo, string Detalle);
public sealed record EscuelaResumen(string Id, string Nombre, int Alumnos, bool Nueva);

/// <summary>Resumen que se guarda en Fuentes (tipo importacionesPadron) y que muestra «Padrón importado».</summary>
public sealed class ResumenPadron
{
    public string Archivo { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public string Semestre { get; set; } = "";
    public string SemestreFuente { get; set; } = "";
    public int FilasAlumnos { get; set; }
    public int Alumnos { get; set; }
    public int AlumnosExcluidos { get; set; }
    public int FilasAlumnosExcluidas { get; set; }
    public int FilasDocentes { get; set; }
    public int Docentes { get; set; }
    public int FilasDocentesExcluidas { get; set; }
    public int DuplicadosDocentes { get; set; }
    public int Escuelas { get; set; }
    public int Cursos { get; set; }
    public int Matriculas { get; set; }
    public int CursosMatriculados { get; set; }
    public int Horarios { get; set; }
    public int HorariosDuplicados { get; set; }
    public int HorariosSinNormalizar { get; set; }
    public int SinPpa { get; set; }
    public int SinCelular { get; set; }
    public bool TieneAlumnos { get; set; }
    public bool TieneDocentes { get; set; }
    public string? ImportadoPor { get; set; }
    public DateTimeOffset? ImportadoEn { get; set; }
}

public sealed class AnalisisPadron
{
    public List<EstudiantePadron> Estudiantes { get; } = [];
    public List<DocentePadron> Docentes { get; } = [];
    public List<EscuelaPadron> Escuelas { get; } = [];
    public List<CursoPadron> Cursos { get; } = [];
    public List<MatriculaPadron> Matriculas { get; } = [];
    public List<HorarioPadron> Horarios { get; } = [];
    public List<FilaExcluida> Excluidas { get; } = [];
    public List<string> Advertencias { get; } = [];
    public ResumenPadron Resumen { get; } = new();
}
