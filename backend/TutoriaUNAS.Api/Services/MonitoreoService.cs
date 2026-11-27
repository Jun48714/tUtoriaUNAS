using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services;

/// <summary>
/// Monitoreo de solo lectura de una escuela: avance de estudiantes y docentes, formatos y derivaciones.
/// Lo usa el coordinador de escuela (docente designado por la administración) y la administración institucional
/// cuando elige una escuela. No modifica nada y solo muestra el contenido de los formatos ya enviados.
/// </summary>
public sealed class MonitoreoService(TutoriaDbContext db, TutoriaContext context)
{
    private static readonly string[] Cerrados = ["enviado", "aprobado"];

    public async Task<object> Escuela(CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.CoordinadorEscuela || actor.AdminInstitucional, "El monitoreo de escuela es solo para coordinadores de escuela.", 403);
        actor.ExigirEscuelaParaGestion();
        var periodo = await context.Periodo(actor, ct);
        var escuela = actor.EscuelaId; var semestre = periodo.SemestreId;

        var personas = await db.VistaPersonasResumen.AsNoTracking().Where(p => p.EscuelaId == escuela && p.Activa).ToArrayAsync(ct);
        var estudiantes = personas.Where(p => p.Tipo == "estudiante").ToArray();
        var docentes = personas.Where(p => p.Tipo == "tutor").ToArray();
        var asignaciones = await db.Asignaciones.AsNoTracking().Where(a => a.EscuelaId == escuela && a.SemestreId == semestre && a.Activa).ToArrayAsync(ct);
        var instrumentos = await db.Instrumentos.AsNoTracking().Where(i => i.EscuelaId == escuela && i.SemestreId == semestre).ToArrayAsync(ct);
        var sesiones = await db.Sesiones.AsNoTracking().Include(s => s.Asistentes).Where(s => s.EscuelaId == escuela && s.SemestreId == semestre).ToArrayAsync(ct);
        var monitoreoEstudiantes = await db.VistaMonitoreoEstudiantes.AsNoTracking().Where(m => m.EscuelaId == escuela && m.SemestreId == semestre).ToArrayAsync(ct);
        var derivacionesVista = await db.VistaDerivacionesSeguimiento.AsNoTracking().Where(d => d.EscuelaId == escuela && d.SemestreId == semestre).ToArrayAsync(ct);

        var cerrados = instrumentos.Where(i => Cerrados.Contains(i.Estado)).ToArray();
        var realizadas = sesiones.Where(s => s.Estado == "realizada" && s.AsistenciaConfirmada).ToArray();
        var ahora = context.Ahora;

        // ---- Avance por estudiante desde vw_monitoreo_estudiantes
        var avanceEstudiantes = monitoreoEstudiantes.Select(a => new
        {
            estudianteId = a.EstudianteId, tutorId = a.TutorId, grupo = a.Grupo, ciclo = a.Ciclo,
            entrevistaFormato = a.EntrevistaFormato, entrevistaEstado = a.EntrevistaEstado, entrevistaAvance = a.EntrevistaAvance,
            sesionesAsistidas = a.SesionesAsistidas, evaluacionesEnviadas = a.EvaluacionesEnviadas, evaluacionesPendientes = a.EvaluacionesPendientes,
            formatosEnviados = a.FormatosEnviados, derivaciones = a.Derivaciones,
            ultimaActividad = a.UltimaActividadUtc is { } fecha ? JsonDatos.Fecha(fecha) : null,
        }).ToArray();

        var asignacionesPorTutor = asignaciones.ToLookup(a => a.TutorId, a => a.EstudianteId, StringComparer.Ordinal);
        var sesionesPorTutor = sesiones.ToLookup(s => s.TutorId, StringComparer.Ordinal);
        var entrevistasPorEstudiante = instrumentos.Where(i => i.Formato is "F03" or "F04" or "F05" && i.EstudianteId != null)
            .ToLookup(i => i.EstudianteId!, StringComparer.Ordinal);
        var propiosPorTutor = instrumentos.Where(i => i.Formato is not ("F03" or "F04" or "F05" or "F10" or "F11"))
            .ToLookup(i => i.TutorId, StringComparer.Ordinal);

        // ---- Avance por docente (indexado en O(1) por tutor)
        var avanceDocentes = docentes.Select(d =>
        {
            var suyos = asignacionesPorTutor[d.Id].ToHashSet(StringComparer.Ordinal);
            var sesionesDocente = sesionesPorTutor[d.Id].ToArray();
            var entrevistas = suyos.SelectMany(id => entrevistasPorEstudiante[id]).ToArray();
            var propios = propiosPorTutor[d.Id].ToArray();
            string EstadoDe(string formato) => propios.FirstOrDefault(i => i.Formato == formato)?.Estado ?? "sin-iniciar";
            return new
            {
                docenteId = d.Id, tutorados = suyos.Count,
                sesionesRealizadas = sesionesDocente.Count(s => s.Estado == "realizada" && s.AsistenciaConfirmada),
                sesionesProgramadas = sesionesDocente.Count(s => s.Estado == "programada" && s.FinUtc > ahora),
                sesionesSinCerrar = sesionesDocente.Count(s => s.Estado == "programada" && s.FinUtc <= ahora && !s.AsistenciaConfirmada),
                entrevistasEnviadas = entrevistas.Count(i => Cerrados.Contains(i.Estado)), entrevistasAprobadas = entrevistas.Count(i => i.Estado == "aprobado"),
                entrevistasObservadas = entrevistas.Count(i => i.Estado == "observado"),
                formatosEnviados = propios.Count(i => Cerrados.Contains(i.Estado)), atenciones = propios.Count(i => i.Formato == "F08" && Cerrados.Contains(i.Estado)),
                derivaciones = propios.Count(i => i.Formato == "F12" && Cerrados.Contains(i.Estado)),
                informeF02 = EstadoDe("F02"), autoevaluacionF09 = EstadoDe("F09"),
            };
        }).ToArray();

        // ---- Formatos: contenido solo de lo enviado o aprobado; el borrador muestra únicamente su estado
        var registros = instrumentos.Select(i => JsonDatos.Dto(i, incluirRespuestas: Cerrados.Contains(i.Estado))).ToArray();
        var instrumentosPorFormato = instrumentos.ToLookup(i => i.Formato, StringComparer.Ordinal);
        var porFormato = Enumerable.Range(1, 12).Select(n => $"F{n:00}").Select(f =>
        {
            var grupo = instrumentosPorFormato[f].ToArray();
            return new
            {
                formato = f,
                total = grupo.Length,
                enviados = grupo.Count(i => i.Estado == "enviado"),
                aprobados = grupo.Count(i => i.Estado == "aprobado"),
                observados = grupo.Count(i => i.Estado == "observado"),
                enCurso = grupo.Count(i => i.Estado is "borrador" or "no-iniciado"),
            };
        }).ToArray();

        // ---- Derivaciones (formato 12) desde vw_derivaciones_seguimiento
        var derivaciones = derivacionesVista.Select(d => new
        {
            id = d.InstrumentoId, estudianteId = d.EstudianteId, tutorId = d.TutorId,
            area = d.AreaTexto, motivo = d.MotivoTexto, fecha = d.FechaRespuesta ?? JsonDatos.Fecha(d.InstrumentoActualizado),
            prioridad = d.Prioridad ?? "media", estado = d.Estado ?? "registrada",
            responsableArea = d.ResponsableArea ?? "Pendiente de recepción por el área",
            siguienteAccion = d.SiguienteAccion ?? "El área debe comunicar la recepción.",
            fechaCita = d.FechaCita,
        }).OrderByDescending(d => d.fecha).ToArray();

        var entrevistasHechas = avanceEstudiantes.Count(a => a.entrevistaEstado is "enviado" or "aprobado");
        return new
        {
            escuelaId = escuela, semestreId = semestre, momento = periodo.Momento, generado = ahora.ToString("O"),
            resumen = new
            {
                estudiantes = estudiantes.Length, conTutor = asignaciones.Length, entrevistasCompletadas = entrevistasHechas,
                entrevistasPendientes = asignaciones.Length - entrevistasHechas, docentes = docentes.Length,
                docentesConTutorados = avanceDocentes.Count(d => d.tutorados > 0),
                sesionesRealizadas = realizadas.Length, sesionesProgramadas = sesiones.Count(s => s.Estado == "programada" && s.FinUtc > ahora),
                formatosEnviados = cerrados.Length, derivaciones = derivaciones.Length,
            },
            estudiantes = estudiantes.Select(p => new { p.Id, codigo = p.Codigo, nombres = p.Nombres,
                apellidos = p.Apellidos, correo = p.Correo, p.Ciclo, p.EscuelaId }).ToArray(),
            docentes = docentes.Select(p => new { p.Id, codigo = p.Codigo, nombres = p.Nombres,
                apellidos = p.Apellidos, correo = p.Correo, p.EscuelaId }).ToArray(),
            avanceEstudiantes, avanceDocentes, porFormato, registros, derivaciones,
            sesiones = sesiones.Select(s => JsonDatos.Dto(s)).ToArray(),
        };
    }
}
