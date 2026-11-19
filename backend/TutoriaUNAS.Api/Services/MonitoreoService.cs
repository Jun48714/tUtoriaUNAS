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
    private static bool Asistio(string estado) => estado is "asistio" or "tarde";

    public async Task<object> Escuela(CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.CoordinadorEscuela || actor.AdminInstitucional, "El monitoreo de escuela es solo para coordinadores de escuela.", 403);
        actor.ExigirEscuelaParaGestion();
        var periodo = await context.Periodo(actor, ct);
        var escuela = actor.EscuelaId; var semestre = periodo.SemestreId;

        var personas = await db.Personas.AsNoTracking().Where(p => p.EscuelaId == escuela && p.Activa).ToArrayAsync(ct);
        var estudiantes = personas.Where(p => p.Tipo == "estudiante").ToArray();
        var docentes = personas.Where(p => p.Tipo == "tutor").ToArray();
        var asignaciones = await db.Asignaciones.AsNoTracking().Where(a => a.EscuelaId == escuela && a.SemestreId == semestre && a.Activa).ToArrayAsync(ct);
        var instrumentos = await db.Instrumentos.AsNoTracking().Where(i => i.EscuelaId == escuela && i.SemestreId == semestre).ToArrayAsync(ct);
        var sesiones = await db.Sesiones.AsNoTracking().Include(s => s.Asistentes).Where(s => s.EscuelaId == escuela && s.SemestreId == semestre).ToArrayAsync(ct);
        var seguimientos = (await db.Seguimientos.AsNoTracking().Where(s => s.EscuelaId == escuela && s.SemestreId == semestre && s.InstrumentoId != null).ToArrayAsync(ct))
            .ToDictionary(s => s.InstrumentoId!, StringComparer.Ordinal);

        var tutorDe = asignaciones.ToDictionary(a => a.EstudianteId, a => a.TutorId, StringComparer.Ordinal);
        var cerrados = instrumentos.Where(i => Cerrados.Contains(i.Estado)).ToArray();
        var realizadas = sesiones.Where(s => s.Estado == "realizada" && s.AsistenciaConfirmada).ToArray();
        var ahora = context.Ahora;

        // ---- Avance por estudiante (los que tienen tutor asignado en el semestre)
        var avanceEstudiantes = asignaciones.Select(a =>
        {
            var e = estudiantes.FirstOrDefault(p => p.Id == a.EstudianteId);
            var entrevista = instrumentos.FirstOrDefault(i => i.EstudianteId == a.EstudianteId && i.Formato is "F03" or "F04" or "F05");
            var asistidas = realizadas.Where(s => s.Asistentes.Any(x => x.EstudianteId == a.EstudianteId && Asistio(x.Estado))).Select(s => s.Id).ToHashSet();
            var evaluadas = cerrados.Count(i => i.EstudianteId == a.EstudianteId && i.Formato is "F10" or "F11" && i.SesionId != null && asistidas.Contains(i.SesionId));
            var propios = instrumentos.Where(i => i.EstudianteId == a.EstudianteId).ToArray();
            return new
            {
                estudianteId = a.EstudianteId, tutorId = a.TutorId, grupo = a.Grupo, ciclo = e?.Ciclo,
                entrevistaFormato = entrevista?.Formato, entrevistaEstado = entrevista?.Estado ?? "sin-habilitar", entrevistaAvance = entrevista?.Avance ?? 0,
                sesionesAsistidas = asistidas.Count, evaluacionesEnviadas = evaluadas, evaluacionesPendientes = Math.Max(0, asistidas.Count - evaluadas),
                formatosEnviados = propios.Count(i => Cerrados.Contains(i.Estado)),
                derivaciones = cerrados.Count(i => i.Formato == "F12" && i.EstudianteId == a.EstudianteId),
                ultimaActividad = propios.Length == 0 ? null : JsonDatos.Fecha(propios.Max(i => i.Actualizado)),
            };
        }).ToArray();

        // ---- Avance por docente
        var avanceDocentes = docentes.Select(d =>
        {
            var suyos = asignaciones.Where(a => a.TutorId == d.Id).Select(a => a.EstudianteId).ToHashSet();
            var sesionesDocente = sesiones.Where(s => s.TutorId == d.Id).ToArray();
            var entrevistas = instrumentos.Where(i => i.Formato is "F03" or "F04" or "F05" && i.EstudianteId != null && suyos.Contains(i.EstudianteId)).ToArray();
            var propios = instrumentos.Where(i => i.TutorId == d.Id && i.Formato is not ("F03" or "F04" or "F05" or "F10" or "F11")).ToArray();
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
        var registros = instrumentos.Select(i => Cerrados.Contains(i.Estado) ? JsonDatos.Dto(i) : JsonDatos.Dto(i) with { Respuestas = [] }).ToArray();
        var porFormato = Enumerable.Range(1, 12).Select(n => $"F{n:00}").Select(f => new
        {
            formato = f,
            total = instrumentos.Count(i => i.Formato == f),
            enviados = instrumentos.Count(i => i.Formato == f && i.Estado == "enviado"),
            aprobados = instrumentos.Count(i => i.Formato == f && i.Estado == "aprobado"),
            observados = instrumentos.Count(i => i.Formato == f && i.Estado == "observado"),
            enCurso = instrumentos.Count(i => i.Formato == f && i.Estado is "borrador" or "no-iniciado"),
        }).ToArray();

        // ---- Derivaciones (formato 12) con su seguimiento
        var derivaciones = cerrados.Where(i => i.Formato == "F12").Select(i =>
        {
            var r = JsonDatos.Leer<Dictionary<string, string>>(i.RespuestasJson); var s = seguimientos.GetValueOrDefault(i.Id);
            return new
            {
                id = i.Id, estudianteId = i.EstudianteId, tutorId = i.TutorId,
                area = r.GetValueOrDefault("area", ""), motivo = r.GetValueOrDefault("motivo", ""), fecha = r.GetValueOrDefault("fecha", JsonDatos.Fecha(i.Actualizado)),
                prioridad = s?.Prioridad ?? "media", estado = s?.Estado ?? "registrada", responsableArea = s?.ResponsableArea ?? "Pendiente de recepción por el área",
                siguienteAccion = s?.SiguienteAccion ?? "El área debe comunicar la recepción.", fechaCita = s?.FechaCita,
            };
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
            estudiantes = estudiantes.Select(p => new { p.Id, codigo = JsonDatos.Texto(p.DatosJson, "codigo"), nombres = JsonDatos.Texto(p.DatosJson, "nombres"),
                apellidos = JsonDatos.Texto(p.DatosJson, "apellidos"), correo = JsonDatos.Texto(p.DatosJson, "correo"), p.Ciclo, p.EscuelaId }).ToArray(),
            docentes = docentes.Select(p => new { p.Id, codigo = JsonDatos.Texto(p.DatosJson, "codigo"), nombres = JsonDatos.Texto(p.DatosJson, "nombres"),
                apellidos = JsonDatos.Texto(p.DatosJson, "apellidos"), correo = JsonDatos.Texto(p.DatosJson, "correo"), p.EscuelaId }).ToArray(),
            avanceEstudiantes, avanceDocentes, porFormato, registros, derivaciones,
            sesiones = sesiones.Select(s => JsonDatos.Dto(s)).ToArray(),
        };
    }
}
