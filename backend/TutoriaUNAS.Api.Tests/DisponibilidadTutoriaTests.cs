using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Services;

namespace TutoriaUNAS.Api.Tests;

public sealed class DisponibilidadTutoriaTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static readonly int[] DiasJueves = [4];

    [PostgresFact]
    public async Task PreviewAndSaveUseTheSameWeekAndConflictsForTheSchoolCoordinatorAsTutor()
    {
        const string tutorId = "DOC-0421";
        const string otroTutor = "DOC-0422";
        const string semestre = "2026-II";
        var dia = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14));
        var lunes = dia.AddDays(-(((int)dia.DayOfWeek + 6) % 7));
        string Fecha(int i) => lunes.AddDays(i).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        string[] alumnos;
        string ajeno;
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutoriaDbContext>();
            var usuario = await db.Usuarios.SingleAsync(u => u.PersonaId == tutorId && u.Rol == "tutor");
            usuario.CoordinadorEscuela = true;
            alumnos = await db.Asignaciones.Where(a => a.TutorId == tutorId && a.SemestreId == semestre && a.Activa)
                .OrderBy(a => a.EstudianteId).Select(a => a.EstudianteId).Take(2).ToArrayAsync();
            ajeno = await db.Asignaciones.Where(a => a.TutorId != tutorId && a.SemestreId == semestre && a.Activa)
                .Select(a => a.EstudianteId).FirstAsync();
            db.Horarios.AddRange(
                new HorarioAcademicoEntity { Id = "CLASE-DISPONIBILIDAD-LUN", EstudianteId = alumnos[0], SemestreId = semestre, Dia = 1, HoraInicio = "02:00", HoraFin = "02:20" },
                new HorarioAcademicoEntity { Id = "CLASE-DISPONIBILIDAD-MAR", EstudianteId = alumnos[1], SemestreId = semestre, Dia = 2, HoraInicio = "02:00", HoraFin = "02:20" });
            db.CalendarioDocente.Add(new CalendarioDocenteEntity
            {
                Id = "CURSO-DISPONIBILIDAD", EscuelaId = usuario.EscuelaId, TutorId = tutorId, SemestreId = semestre,
                DatosJson = JsonDatos.Serializar(new { kind = "curso", days = DiasJueves, dateFrom = Fecha(3), dateTo = Fecha(3), startTime = "02:00", endTime = "02:20" })
            });
            db.Sesiones.Add(new SesionEntity
            {
                Id = "SES-OTRO-TUTOR-DISPONIBILIDAD", TutorId = otroTutor, EscuelaId = usuario.EscuelaId, SemestreId = semestre,
                Fecha = Fecha(2), HoraInicio = "02:00", HoraFin = "02:20", Estado = "programada",
                FinUtc = DateTimeOffset.Parse(Fecha(2) + "T02:20:00-05:00", CultureInfo.InvariantCulture).ToUniversalTime(),
                Asistentes = [new AsistenciaEntity { EstudianteId = alumnos[1] }]
            });
            await db.SaveChangesAsync();
        }

        using var tutor = await fixture.Login(tutorId, "tutor");
        using var otro = await fixture.Login(otroTutor, "tutor");
        const string consulta = "/api/sesiones/disponibilidad";
        Assert.Equal(HttpStatusCode.Forbidden, (await tutor.PostAsJsonAsync(consulta, new ConsultarDisponibilidadDto(Fecha(0), [ajeno]))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await otro.GetAsync("/api/monitoreo/escuela")).StatusCode);
        using var escuela = await tutor.GetAsync("/api/monitoreo/escuela");
        escuela.EnsureSuccessStatusCode();
        Assert.Contains("SES-OTRO-TUTOR-DISPONIBILIDAD", await escuela.Content.ReadAsStringAsync());

        async Task<DisponibilidadTutoriaDto> Ver(string[] ids)
        {
            using var response = await tutor.PostAsJsonAsync(consulta, new ConsultarDisponibilidadDto(Fecha(1), ids));
            response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<DisponibilidadTutoriaDto>())!;
        }
        var individual = await Ver([alumnos[0]]);
        var grupo = await Ver(alumnos);
        Assert.Equal(Fecha(0), grupo.Lunes);
        Assert.Equal(0, grupo.SinHorario);
        Assert.DoesNotContain(individual.Bloques, b => b.Fecha == Fecha(1) && b.HoraInicio == "02:00");
        Assert.Contains(grupo.Bloques, b => b.Fecha == Fecha(0) && b.Origen == "clase-estudiante" && b.HoraInicio == "02:00");
        Assert.Contains(grupo.Bloques, b => b.Fecha == Fecha(1) && b.Origen == "clase-estudiante" && b.HoraInicio == "02:00");
        Assert.Contains(grupo.Bloques, b => b.Fecha == Fecha(2) && b.Origen == "sesion" && b.HoraInicio == "02:00");
        Assert.Contains(grupo.Bloques, b => b.Fecha == Fecha(3) && b.Origen == "clase-tutor" && b.HoraInicio == "02:00");

        var nueva = new ProgramarSesionDto("grupal", Fecha(1), "02:10", "02:30", "presencial", "Aula ficticia",
            "Tutoría de prueba", "Verificar que el horario no se superponga.", alumnos);
        Assert.Equal(HttpStatusCode.Conflict, (await tutor.PostAsJsonAsync("/api/sesiones", nueva)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await tutor.PostAsJsonAsync("/api/sesiones", nueva with { Fecha = Fecha(2) })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await tutor.PostAsJsonAsync("/api/sesiones", nueva with { Fecha = Fecha(3) })).StatusCode);
        using var guardada = await tutor.PostAsJsonAsync("/api/sesiones", nueva with { HoraInicio = "02:20" });
        guardada.EnsureSuccessStatusCode();
        Assert.Contains((await Ver(alumnos)).Bloques, b => b.Fecha == Fecha(1) && b.Origen == "sesion" && b.HoraInicio == "02:20");
    }
}
