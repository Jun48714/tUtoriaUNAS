using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Data;

/// <summary>Datos de práctica explícitos, solo para cuentas de la semilla local.</summary>
public static class FormatosPruebaDesarrollo
{
    public static async Task<int> Preparar(TutoriaDbContext db, string codigo, string seedPath, TimeProvider clock, CancellationToken ct = default)
    {
        using var seed = JsonDocument.Parse(await File.ReadAllTextAsync(seedPath, ct));
        var ficticio = seed.RootElement.GetProperty("estudiantes").EnumerateArray()
            .FirstOrDefault(e => e.GetProperty("codigo").GetString() == codigo);
        if (ficticio.ValueKind == JsonValueKind.Undefined) throw new InvalidOperationException("Solo se admiten alumnos ficticios de la semilla de desarrollo.");
        var estudianteId = ficticio.GetProperty("id").GetString()!;
        var usuario = await db.Usuarios.SingleOrDefaultAsync(u => u.PersonaId == estudianteId && u.Identificador == codigo && u.Rol == "estudiante" && u.Activo && u.Issuer == "local-development", ct)
            ?? throw new InvalidOperationException("La cuenta debe ser ficticia, local y estar activa.");
        var asignacion = await (from a in db.Asignaciones join p in db.Periodos on new { a.SemestreId, a.EscuelaId } equals new { p.SemestreId, p.EscuelaId }
            where a.EstudianteId == estudianteId && a.Activa && p.Activo select a).SingleAsync(ct);
        var idsFicticios = seed.RootElement.GetProperty("estudiantes").EnumerateArray().Select(e => e.GetProperty("id").GetString()!).ToArray();
        var companero = await db.Asignaciones.Where(a => a.TutorId == asignacion.TutorId && a.SemestreId == asignacion.SemestreId && a.EscuelaId == asignacion.EscuelaId && a.Activa && a.EstudianteId != estudianteId && idsFicticios.Contains(a.EstudianteId)).Select(a => a.EstudianteId).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("Se necesita otro participante ficticio del mismo tutor para las prácticas grupales.");
        var ahora = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var total = 0;
        for (var i = 1; i <= 8; i++)
        {
            var sesionId = $"SES-PRACTICA-CIERRES-V3-{estudianteId}-{i:00}";
            if (await db.Sesiones.AnyAsync(s => s.Id == sesionId, ct)) continue;
            var individual = i % 2 == 1;
            var fecha = JsonDatos.Fecha(ahora.AddDays(-i));
            var sesion = new SesionEntity
            {
                Id = sesionId, Tipo = individual ? "individual" : "grupal", TutorId = asignacion.TutorId,
                EscuelaId = asignacion.EscuelaId, SemestreId = asignacion.SemestreId, Fecha = fecha,
                HoraInicio = "06:00", HoraFin = "06:30", FinUtc = DateTimeOffset.Parse($"{fecha}T06:30:00-05:00", CultureInfo.InvariantCulture).ToUniversalTime(),
                Lugar = "Entorno local de pruebas", Tema = $"Práctica {i:00} · {(individual ? "Evaluación individual" : "Evaluación grupal")}",
                Objetivo = "Datos ficticios para probar el llenado y la celebración del envío. No representan una atención real.",
                Estado = "realizada", AsistenciaConfirmada = true,
                Asistentes = (individual ? new[] { estudianteId } : new[] { estudianteId, companero }).Select(id => new AsistenciaEntity { EstudianteId = id, Estado = "asistio", HoraRegistro = "06:00", Observacion = "Participación ficticia de práctica local." }).ToList(),
            };
            db.Sesiones.Add(sesion);
            db.Instrumentos.Add(DocumentosService.Nuevo(DocumentosService.IdEvaluacion(sesion, estudianteId), individual ? "F10" : "F11", asignacion.TutorId, asignacion.EscuelaId, asignacion.SemestreId, estudianteId, ahora, sesionId));
            db.Auditoria.Add(new() { Fecha = ahora, UsuarioId = "development-cli", EscuelaId = asignacion.EscuelaId, Accion = "crear-practica-ficticia", RecursoId = sesionId, Version = 1, Dispositivo = "CLI local · pedido del usuario · datos de semilla" });
            total++;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return total;
    }
}
