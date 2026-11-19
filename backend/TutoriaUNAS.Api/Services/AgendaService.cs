using System.Globalization;
using System.IO.Compression;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services;

public sealed class AgendaService(TutoriaDbContext db, TutoriaContext context, CatalogoFormatos catalogo)
{
    public async Task<DisponibilidadTutoriaDto> Disponibilidad(ConsultarDisponibilidadDto request, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "tutor", "Solo el docente tutor consulta disponibilidad de sus convocados.", 403);
        TutoriaError.Exigir(DateOnly.TryParseExact(request.Fecha, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var fecha) &&
            fecha.Year is >= 1900 and <= 9998, "Elige una fecha válida.");
        TutoriaError.Exigir(request.Estudiantes is { Length: > 0 and <= 100 } && request.Estudiantes.Distinct().Count() == request.Estudiantes.Length, "Selecciona los participantes sin duplicados.");
        var periodo = await context.Periodo(actor, ct);
        await Participantes(db, actor, request.Estudiantes!, periodo.SemestreId, ct);
        var lunes = fecha.AddDays(1 - DiaSemana(fecha));
        return await CargarOcupacion(db, actor, request.Estudiantes!, periodo.SemestreId, lunes, 7, null, ct);
    }

    public async Task<SesionDto> Programar(ProgramarSesionDto request, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        var periodo = await context.Periodo(actor, ct);
        await using var tx = await context.Transaccion(actor, ct);
        var s = await ProgramarInterno(db, context, actor, request, periodo.SemestreId, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return JsonDatos.Dto(s);
    }
    public static async Task<SesionEntity> ProgramarInterno(TutoriaDbContext db, TutoriaContext context, ActorTutoria actor, ProgramarSesionDto r, string semestre, CancellationToken ct, string? reemplazaId = null)
    {
        TutoriaError.Exigir(actor.Rol == "tutor", "Solo el docente tutor puede programar sesiones.", 403);
        await context.ExigirPeriodoAbierto(actor, ct);
        TutoriaError.Exigir(r.Tipo is "individual" or "grupal" && r.Modalidad is "presencial" or "virtual" or "mixta", "Tipo o modalidad inválidos.");
        TutoriaError.Exigir(DateOnly.TryParseExact(r.Fecha, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var fecha) &&
            TimeOnly.TryParseExact(r.HoraInicio, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) &&
            TimeOnly.TryParseExact(r.HoraFin, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) && string.CompareOrdinal(r.HoraFin, r.HoraInicio) > 0, "Fecha u horario inválidos.");
        var inicio = DateTimeOffset.ParseExact($"{r.Fecha}T{r.HoraInicio}:00-05:00", "yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);
        TutoriaError.Exigir(inicio > context.Ahora, "Programa una fecha y hora futuras.");
        TutoriaError.Exigir(!string.IsNullOrWhiteSpace(r.Lugar) && r.Lugar.Length <= 300 && !string.IsNullOrWhiteSpace(r.Tema) && r.Tema.Length <= 200 && !string.IsNullOrWhiteSpace(r.Objetivo) && r.Objetivo.Length <= 2000, "Completa el lugar, tema y objetivo de la sesión.");
        TutoriaError.Exigir(r.Modalidad != "virtual" ||
            (Uri.TryCreate(r.Lugar.Trim(), UriKind.Absolute, out var enlace) && enlace.Scheme is "https" or "http" && enlace.Host.Length > 0 && enlace.UserInfo.Length == 0),
            "Escribe el enlace completo de la sesión virtual (https://…).");
        TutoriaError.Exigir(r.Estudiantes is { Length: > 0 and <= 100 } && r.Estudiantes.Distinct().Count() == r.Estudiantes.Length && (r.Tipo == "individual" ? r.Estudiantes.Length == 1 : r.Estudiantes.Length >= 2), "Selecciona los participantes sin duplicados.");
        // Serializa las convocatorias del mismo tutor, incluso desde dos procesos de la API.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({actor.Id}, 0))", ct);
        await Participantes(db, actor, r.Estudiantes!, semestre, ct);
        var disponibilidad = await CargarOcupacion(db, actor, r.Estudiantes!, semestre, fecha, 1, reemplazaId, ct);
        var cruce = disponibilidad.Bloques.FirstOrDefault(b => string.CompareOrdinal(b.HoraInicio, r.HoraFin) < 0 && string.CompareOrdinal(r.HoraInicio, b.HoraFin) < 0);
        if (cruce is not null)
            throw new TutoriaError(409, cruce.Origen switch
            {
                "clase-estudiante" => "El horario coincide con una clase de los estudiantes.",
                "clase-tutor" => "El horario coincide con una clase del tutor.",
                _ => "El tutor o un estudiante ya tiene otra sesión en ese horario."
            });
        var nueva = new SesionEntity { Id = "SES-" + Guid.NewGuid(), TutorId = actor.Id, EscuelaId = actor.EscuelaId, SemestreId = semestre, Tipo = r.Tipo, Fecha = r.Fecha, HoraInicio = r.HoraInicio, HoraFin = r.HoraFin, FinUtc = DateTimeOffset.Parse($"{r.Fecha}T{r.HoraFin}:00-05:00", CultureInfo.InvariantCulture).ToUniversalTime(), Modalidad = r.Modalidad, Lugar = r.Lugar.Trim(), Tema = r.Tema.Trim(), Objetivo = r.Objetivo.Trim(), Asistentes = r.Estudiantes.Select(id => new AsistenciaEntity { EstudianteId = id, Observacion = "Asistencia pendiente de registro" }).ToList() };
        db.Sesiones.Add(nueva); context.Auditar(actor, "programar-sesion", nueva.Id, nueva.Version);
        await ComunicacionService.Notificar(db, context, actor.EscuelaId, r.Estudiantes!, "estudiante", "sesion-programada:" + nueva.Id, "sesion", "Nueva sesión de tutoría", $"{nueva.Tema} · {nueva.Fecha} {nueva.HoraInicio}", "/estudiante/sesiones", ct);
        return nueva;
    }

    private static int DiaSemana(DateOnly fecha) => fecha.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)fecha.DayOfWeek;
    private static string Iso(DateOnly fecha) => fecha.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static async Task<DisponibilidadTutoriaDto> CargarOcupacion(
        TutoriaDbContext db, ActorTutoria actor, string[] ids, string semestre, DateOnly inicio, int dias,
        string? reemplazaId, CancellationToken ct)
    {
        var fechas = Enumerable.Range(0, dias).Select(inicio.AddDays).ToDictionary(DiaSemana, Iso);
        var desde = Iso(inicio);
        var hasta = Iso(inicio.AddDays(dias - 1));
        var filasAcademicas = await db.Horarios.AsNoTracking()
            .Where(h => ids.Contains(h.EstudianteId) && h.SemestreId == semestre)
            .Select(h => new { h.EstudianteId, h.Dia, h.HoraInicio, h.HoraFin }).ToArrayAsync(ct);
        var clases = filasAcademicas.Where(h => h.Dia is >= 1 and <= 7 && IntervaloValido(h.HoraInicio, h.HoraFin)).ToArray();
        var ocupados = clases.Where(h => fechas.ContainsKey(h.Dia)).Select(h =>
            new BloqueOcupadoDto(fechas[h.Dia], h.HoraInicio, h.HoraFin, "clase-estudiante")).ToList();

        var agenda = await db.CalendarioDocente.AsNoTracking().Where(c => c.TutorId == actor.Id && c.SemestreId == semestre)
            .Select(c => c.DatosJson).ToArrayAsync(ct);
        foreach (var curso in agenda.Select(JsonDatos.Leer<CalendarioInput>).Where(c => c.Kind == "curso"))
            foreach (var (dia, fecha) in fechas)
                if (curso.Days.Contains(dia) && string.CompareOrdinal(curso.DateFrom, fecha) <= 0 && string.CompareOrdinal(fecha, curso.DateTo) <= 0)
                    ocupados.Add(new(fecha, curso.StartTime, curso.EndTime, "clase-tutor"));

        var oficiales = await db.Fuentes.AsNoTracking().Where(f => f.Tipo == "horariosDocentes" && f.TutorId == actor.Id &&
            (f.SemestreId == null || f.SemestreId == semestre)).Select(f => f.DatosJson).ToArrayAsync(ct);
        foreach (var hora in oficiales.Select(JsonDatos.Elemento))
            if (hora.TryGetProperty("dia", out var dia) && dia.ValueKind == System.Text.Json.JsonValueKind.Number &&
                dia.TryGetInt32(out var numero) && fechas.TryGetValue(numero, out var fecha) &&
                hora.TryGetProperty("horaInicio", out var empieza) && empieza.ValueKind == System.Text.Json.JsonValueKind.String &&
                hora.TryGetProperty("horaFin", out var termina) && termina.ValueKind == System.Text.Json.JsonValueKind.String)
                ocupados.Add(new(fecha, empieza.GetString()!, termina.GetString()!, "clase-tutor"));

        var sesiones = db.Sesiones.AsNoTracking().Where(s => s.Id != reemplazaId && s.Estado != "cancelada" && s.Estado != "reprogramada" &&
            (s.TutorId == actor.Id || s.Asistentes.Any(a => ids.Contains(a.EstudianteId))));
        sesiones = dias == 1 ? sesiones.Where(s => s.Fecha == desde) : sesiones.Where(s => s.Fecha.CompareTo(desde) >= 0 && s.Fecha.CompareTo(hasta) <= 0);
        ocupados.AddRange(await sesiones.Select(s => new BloqueOcupadoDto(s.Fecha, s.HoraInicio, s.HoraFin, "sesion")).ToArrayAsync(ct));

        return new(desde, ids.Length - clases.Select(h => h.EstudianteId).Distinct().Count(), ocupados
            .Where(b => IntervaloValido(b.HoraInicio, b.HoraFin))
            .Distinct().OrderBy(b => b.Fecha, StringComparer.Ordinal).ThenBy(b => b.HoraInicio, StringComparer.Ordinal).ToArray());
    }

    private static bool IntervaloValido(string inicio, string fin) =>
        TimeOnly.TryParseExact(inicio, "HH:mm", out _) && TimeOnly.TryParseExact(fin, "HH:mm", out _) &&
        string.CompareOrdinal(inicio, fin) < 0;
    public async Task<SesionDto> Asistencia(string id, RegistrarAsistenciaDto request, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "tutor", "Solo el tutor confirma la asistencia.", 403);
        await context.ExigirPeriodoAbierto(actor, ct);
        await using var tx = await context.Transaccion(actor, ct);
        var s = await db.Sesiones.Include(s => s.Asistentes).SingleOrDefaultAsync(s => s.Id == id && s.TutorId == actor.Id && s.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Sesión no disponible.");
        TutoriaError.Exigir(s.SemestreId == (await context.Periodo(actor, ct)).SemestreId, "La sesión pertenece a un semestre anterior.", 409);
        TutoriaContext.Version(request.Version, s.Version);
        TutoriaError.Exigir(s.Estado is "programada" or "realizada" && s.FinUtc <= context.Ahora, "Registra la asistencia después de finalizar la sesión.", 409);
        TutoriaError.Exigir(request.Mensaje.Length <= 2000 && request.TipoTutoria is "Académica" or "Personal" or "Social", "Acuerdo o tipo de tutoría inválido.");
        if (request.Evidencia is not null) await GuardarEvidencia(s, request.Evidencia, ct);
        TutoriaError.Exigir(request.Asistentes is not null && request.Asistentes.Length == s.Asistentes.Count && request.Asistentes.All(a => a is not null) && request.Asistentes.Select(a => a.EstudianteId).Distinct().Count() == s.Asistentes.Count && request.Asistentes.All(a => s.Asistentes.Any(original => original.EstudianteId == a.EstudianteId) && a.Estado is "asistio" or "tarde" or "falto" or "justificado" && (a.HoraRegistro is null || TimeOnly.TryParseExact(a.HoraRegistro, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) && (a.Observacion?.Length ?? 0) <= 1000), "La lista debe incluir una sola vez a cada participante convocado.");
        var ids = s.Asistentes.Select(a => a.EstudianteId).ToArray();
        var participantes = await Participantes(db, actor, ids, s.SemestreId, ct);
        var ausentes = request.Asistentes!.Where(a => a.Estado is "falto" or "justificado").Select(a => a.EstudianteId).ToArray();
        if (ausentes.Length > 0)
            TutoriaError.Exigir(!await db.Instrumentos.AnyAsync(d => d.SesionId == id && ausentes.Contains(d.EstudianteId!) && (d.Formato == "F10" || d.Formato == "F11") && (d.Estado == "enviado" || d.Estado == "aprobado"), ct), "Hay una evaluación enviada; su asistencia requiere una revisión institucional antes de modificarla.", 409);
        var convocados = s.Asistentes.ToDictionary(a => a.EstudianteId);
        foreach (var a in request.Asistentes!)
        {
            var actual = convocados[a.EstudianteId];
            actual.Estado = a.Estado; actual.HoraRegistro = a.HoraRegistro; actual.Observacion = a.Observacion;
        }
        s.AsistenciaConfirmada = true; s.Estado = "realizada"; s.Version++;
        if (!string.IsNullOrWhiteSpace(request.Mensaje))
        {
            var acuerdos = JsonDatos.Leer<List<Dictionary<string, object?>>>(s.AcuerdosJson);
            acuerdos.Add(new() { ["id"] = Guid.NewGuid().ToString(), ["descripcion"] = request.Mensaje.Trim(), ["responsable"] = "ambos", ["fechaCompromiso"] = null, ["estado"] = "pendiente" });
            s.AcuerdosJson = JsonDatos.Serializar(acuerdos);
        }
        var fid = "INST-ASISTENCIA-" + s.Id;
        var f = await db.Instrumentos.FindAsync([fid], ct);
        TutoriaError.Exigir(f?.Estado != "aprobado", "El formato de asistencia ya fue aprobado. Solicita su revisión antes de modificarlo.", 409);
        if (f is null) { f = DocumentosService.Nuevo(fid, s.Tipo == "individual" ? "F06" : "F07", s.TutorId, s.EscuelaId, s.SemestreId, null, context.Ahora, s.Id); db.Instrumentos.Add(f); }
        var filas = new List<Dictionary<string, string>>();
        foreach (var a in s.Asistentes.Where(a => a.Estado is "asistio" or "tarde"))
        {
            var (e, grupo) = participantes[a.EstudianteId];
            filas.Add(new() { ["estudianteId"] = e.Id, ["nombre"] = DocumentosService.Nombre(e), ["ciclo"] = e.Ciclo?.ToString(CultureInfo.InvariantCulture) ?? "", ["grupo"] = grupo, ["tipo"] = request.TipoTutoria });
        }
        var respuestas = JsonDatos.Leer<Dictionary<string, string>>(f.RespuestasJson);
        foreach (var (campo, valor) in new Dictionary<string, string> { ["nombreTutor"] = actor.Dto.Name, ["fecha"] = s.Fecha, ["horaInicio"] = s.HoraInicio, ["horaFin"] = s.HoraFin, ["tema"] = s.Tema, ["grupo"] = string.Join(", ", filas.Select(f => f["grupo"]).Distinct()), ["asistentes"] = JsonDatos.Serializar(filas) }) respuestas[campo] = valor;
        f.RespuestasJson = JsonDatos.Serializar(respuestas);
        await CompletarFormatoAsistencia(f, ct);
        s.InstrumentoId = fid;
        context.Auditar(actor, "confirmar-asistencia", s.Id, s.Version);
        context.Auditar(actor, "generar-formato-asistencia", fid, f.Version);
        await ComunicacionService.Notificar(db, context, actor.EscuelaId, s.Asistentes.Select(a => a.EstudianteId).ToArray(), "estudiante", $"asistencia:{s.Id}:{s.Version}", "sesion", "Asistencia registrada", "Tu tutor confirmó la asistencia. Consulta el registro y la evaluación de esta sesión.", "/estudiante/instrumentos?sesion=" + s.Id, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return JsonDatos.Dto(s, incluirEvidencia: true);
    }

    private static async Task<Dictionary<string, (PersonaEntity Estudiante, string Grupo)>> Participantes(
        TutoriaDbContext db, ActorTutoria actor, string[] ids, string semestre, CancellationToken ct)
    {
        var asignados = await (from asignacion in db.Asignaciones.AsNoTracking()
            join estudiante in db.Personas.AsNoTracking() on asignacion.EstudianteId equals estudiante.Id
            where ids.Contains(estudiante.Id) && asignacion.SemestreId == semestre && asignacion.Activa
                && asignacion.TutorId == actor.Id && asignacion.EscuelaId == actor.EscuelaId
                && estudiante.Tipo == "estudiante" && estudiante.Activa && estudiante.EscuelaId == actor.EscuelaId
            select new { Estudiante = estudiante, asignacion.Grupo }).ToListAsync(ct);
        TutoriaError.Exigir(asignados.Count == ids.Length, "Todos los participantes deben tener una asignación y una ficha activa de tu escuela.", 403);
        return asignados.ToDictionary(a => a.Estudiante.Id, a => (a.Estudiante, a.Grupo));
    }

    private async Task GuardarEvidencia(SesionEntity sesion, EvidenciaAsistenciaDto entrada, CancellationToken ct)
    {
        TutoriaError.Exigir(entrada.Contenido is { Length: > 0 and <= 8 * 1024 * 1024 }, "La evidencia debe pesar hasta 8 MB.");
        var pdf = entrada.Tipo == "application/pdf" && entrada.Contenido.AsSpan().StartsWith("%PDF-"u8);
        var foto = entrada.Tipo == "image/jpeg" && entrada.Contenido.AsSpan().StartsWith(new byte[] { 0xff, 0xd8, 0xff });
        TutoriaError.Exigir(pdf || (foto && sesion.Tipo == "grupal"), sesion.Tipo == "individual"
            ? "La evidencia de tutoría individual debe ser un PDF válido."
            : "Adjunta un PDF o una foto JPEG válida.");
        var nombre = Path.GetFileNameWithoutExtension(entrada.Nombre.Replace('\\', '/'));
        nombre = string.Concat(nombre.Where(c => !char.IsControl(c))).Trim();
        if (nombre.Length > 100) nombre = nombre[..100];
        sesion.EvidenciaNombre = (nombre.Length == 0 ? "Evidencia" : nombre) + (pdf ? ".pdf" : ".jpg");
        var evidencia = await db.EvidenciasSesion.FindAsync([sesion.Id], ct);
        if (evidencia is null)
        {
            evidencia = new() { SesionId = sesion.Id };
            db.EvidenciasSesion.Add(evidencia);
        }
        using var destino = new MemoryStream();
        using (var compresor = new BrotliStream(destino, CompressionLevel.Fastest, leaveOpen: true))
            await compresor.WriteAsync(entrada.Contenido, ct);
        evidencia.Tipo = entrada.Tipo;
        evidencia.Comprimido = destino.Length < entrada.Contenido.Length;
        evidencia.Contenido = evidencia.Comprimido ? destino.ToArray() : entrada.Contenido;
    }

    public async Task<EvidenciaAsistenciaDto> Evidencia(string id, CancellationToken ct)
    {
        var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "tutor", "Solo el tutor responsable consulta la evidencia.", 403);
        var resultado = await (from sesion in db.Sesiones.AsNoTracking()
            join evidencia in db.EvidenciasSesion.AsNoTracking() on sesion.Id equals evidencia.SesionId
            where sesion.Id == id && sesion.TutorId == actor.Id && sesion.EscuelaId == actor.EscuelaId
            select new { Nombre = sesion.EvidenciaNombre, Evidencia = evidencia }).SingleOrDefaultAsync(ct)
            ?? throw new TutoriaError(404, "Evidencia no disponible.");
        var archivo = resultado.Evidencia;
        if (!archivo.Comprimido) return new(resultado.Nombre!, archivo.Tipo, archivo.Contenido);
        using var origen = new MemoryStream(archivo.Contenido, writable: false);
        using var compresor = new BrotliStream(origen, CompressionMode.Decompress);
        using var destino = new MemoryStream();
        await compresor.CopyToAsync(destino, ct);
        return new(resultado.Nombre!, archivo.Tipo, destino.ToArray());
    }
    private async Task CompletarFormatoAsistencia(InstrumentoEntity formato, CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtextextended('catalogo-formatos', 0))", ct);
        await catalogo.Actualizar(db, formato.Formato, formato.DefinicionJson, ct);
        var pendiente = formato.Enviado is null && catalogo.TieneCamposAdicionales(formato.Formato);
        formato.Estado = pendiente ? "borrador" : "enviado";
        formato.Avance = pendiente ? catalogo.Avance(formato.Formato, JsonDatos.Leer<Dictionary<string, string>>(formato.RespuestasJson), context.Hoy, []) : 100;
        if (!pendiente)
        {
            formato.DefinicionJson ??= catalogo.Definicion(formato.Formato).GetRawText();
            formato.Enviado = context.Ahora;
        }
        formato.Actualizado = context.Ahora;
        formato.Version++;
    }
    public async Task<object> CambiarEstado(string id, EstadoSesionInput r, CancellationToken ct)
    {
        var actor = await context.Actor(ct); await using var tx = await context.Transaccion(actor, ct);
        await context.ExigirPeriodoAbierto(actor, ct);
        var s = await db.Sesiones.Include(s => s.Asistentes).SingleOrDefaultAsync(s => s.Id == id && s.TutorId == actor.Id && s.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Sesión no disponible.");
        TutoriaError.Exigir(s.SemestreId == (await context.Periodo(actor, ct)).SemestreId, "La convocatoria pertenece a un semestre anterior.", 409);
        TutoriaContext.Version(r.Version, s.Version);
        TutoriaError.Exigir(s.Estado == "programada" && !s.AsistenciaConfirmada, "Solo puedes cancelar o reprogramar una sesión sin asistencia confirmada.", 409);
        TutoriaError.Exigir(r.Accion is "cancelar" or "reprogramar" && r.Motivo.Trim().Length is >= 3 and <= 1000, "Indica la acción y su motivo.");
        s.Estado = r.Accion == "cancelar" ? "cancelada" : "reprogramada"; s.Version++;
        SesionEntity? nueva = null;
        if (r.Accion == "reprogramar") nueva = await ProgramarInterno(db, context, actor, new(s.Tipo, r.Fecha ?? "", r.HoraInicio ?? "", r.HoraFin ?? "", s.Modalidad, s.Lugar, s.Tema, s.Objetivo, s.Asistentes.Select(a => a.EstudianteId).ToArray()), s.SemestreId, ct, s.Id);
        var acuerdos = JsonDatos.Leer<List<object>>(s.AcuerdosJson); acuerdos.Add(new { id = Guid.NewGuid().ToString(), descripcion = r.Motivo.Trim(), responsable = "tutor", fechaCompromiso = (string?)null, estado = "cumplido" }); s.AcuerdosJson = JsonDatos.Serializar(acuerdos);
        context.Auditar(actor, "sesion-" + s.Estado, s.Id, s.Version);
        await ComunicacionService.Notificar(db, context, actor.EscuelaId, s.Asistentes.Select(a => a.EstudianteId).ToArray(), "estudiante", $"estado-sesion:{s.Id}:{s.Version}", "sesion", "Sesión " + s.Estado, "Se actualizó la convocatoria de tutoría. Consulta los acuerdos.", "/estudiante/sesiones", ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new { sesion = JsonDatos.Dto(s), nueva = nueva is null ? null : JsonDatos.Dto(nueva) };
    }
}
