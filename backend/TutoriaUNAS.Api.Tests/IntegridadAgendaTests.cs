using Npgsql;

namespace TutoriaUNAS.Api.Tests;

public sealed class IntegridadAgendaTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private const string Estudiante = "EST-2023010456";
    private const string Tutor = "DOC-0421";
    private const string OtroTutor = "DOC-0422";

    [PostgresFact]
    public async Task RechazaHorariosYRolesInvalidosEnSqlDirecto()
    {
        await using var cn = await Abrir();
        foreach (var (sql, restriccion) in new[]
        {
            ("""UPDATE "Sesiones" SET "Fecha" = '2026-02-30' WHERE "Id" = 'SES-PRUEBA-individual'""", "CK_Sesiones_Horario"),
            ("""UPDATE "Sesiones" SET "FinUtc" = "FinUtc" + interval '1 hour' WHERE "Id" = 'SES-PRUEBA-individual'""", "CK_Sesiones_Horario"),
            ("""UPDATE "Horarios" SET "HoraFin" = '25:00'""", "CK_Horarios_Bloque"),
            ("""UPDATE "Asistencias" SET "Estado" = 'inventado'""", "CK_Asistencias_Registro"),
            ("""UPDATE "Usuarios" SET "CoordinadorEscuela" = true WHERE "Rol" = 'estudiante'""", "CK_Usuarios_RolCoordinadorEscuela"),
        })
        {
            var error = await Assert.ThrowsAsync<PostgresException>(() => Ejecutar(cn, sql));
            Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
            Assert.Equal(restriccion, error.ConstraintName);
        }
    }

    [PostgresFact]
    public async Task BloqueaCrucesPermiteHorasContiguasYLiberaLaSesionReprogramada()
    {
        await using var cn = await Abrir();
        const string fecha = "2090-06-07";
        await using (var tx = await cn.BeginTransactionAsync())
        {
            await Sesion(cn, "RESERVA-A", Tutor, fecha, "09:00", "10:00");
            await Asistente(cn, "RESERVA-A");
            await tx.CommitAsync();
        }
        var errorTutor = await Assert.ThrowsAsync<PostgresException>(() =>
            Sesion(cn, "CRUCE-TUTOR", Tutor, fecha, "09:30", "10:30"));
        AssertCruce(errorTutor);

        await Sesion(cn, "RESERVA-B", OtroTutor, fecha, "08:30", "09:30");
        var errorEstudiante = await Assert.ThrowsAsync<PostgresException>(() => Asistente(cn, "RESERVA-B"));
        AssertCruce(errorEstudiante);

        await using (var tx = await cn.BeginTransactionAsync())
        {
            await Sesion(cn, "RESERVA-C", Tutor, fecha, "10:00", "10:30");
            await Asistente(cn, "RESERVA-C");
            await tx.CommitAsync();
        }

        await using (var tx = await cn.BeginTransactionAsync())
        {
            await Sesion(cn, "REEMPLAZO-A", Tutor, fecha, "09:15", "10:00");
            await Asistente(cn, "REEMPLAZO-A");
            await Ejecutar(cn, """UPDATE "Sesiones" SET "Estado" = 'reprogramada' WHERE "Id" = 'RESERVA-A'""");
            await tx.CommitAsync();
        }

        var errorMover = await Assert.ThrowsAsync<PostgresException>(() => Ejecutar(cn, """
            UPDATE "Sesiones" SET "HoraInicio" = '09:45' WHERE "Id" = 'RESERVA-C'
            """));
        AssertCruce(errorMover);
    }

    [PostgresFact]
    public async Task ConfirmaSoloUnaReservaSimultaneaDelMismoEstudiante()
    {
        await using var primera = await Abrir();
        await using var segunda = await Abrir();
        await using var consulta = await Abrir();
        await using var tx1 = await primera.BeginTransactionAsync();
        await using var tx2 = await segunda.BeginTransactionAsync();
        const string fecha = "2090-06-08";
        await Sesion(primera, "SIMULTANEA-A", Tutor, fecha, "09:00", "10:00");
        await Asistente(primera, "SIMULTANEA-A");
        await Sesion(segunda, "SIMULTANEA-B", OtroTutor, fecha, "09:30", "10:30");
        await Asistente(segunda, "SIMULTANEA-B");

        await Ejecutar(primera, "SET CONSTRAINTS ALL IMMEDIATE");
        var confirmacion = tx2.CommitAsync();
        using var plazo = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var espera = new NpgsqlCommand("SELECT @primera = ANY(pg_blocking_pids(@segunda))", consulta);
        espera.Parameters.AddWithValue("primera", primera.ProcessID);
        espera.Parameters.AddWithValue("segunda", segunda.ProcessID);
        while (!confirmacion.IsCompleted && (bool)(await espera.ExecuteScalarAsync(plazo.Token))! == false)
            await Task.Delay(20, plazo.Token);
        Assert.False(confirmacion.IsCompleted);

        await tx1.CommitAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(() => confirmacion.WaitAsync(TimeSpan.FromSeconds(5)));
        AssertCruce(error);
    }

    private static void AssertCruce(PostgresException error)
    {
        Assert.Equal(PostgresErrorCodes.ExclusionViolation, error.SqlState);
        Assert.Equal("EX_Sesiones_Ocupacion", error.ConstraintName);
    }

    private async Task<NpgsqlConnection> Abrir()
    {
        var cn = new NpgsqlConnection(fixture.Connection);
        await cn.OpenAsync();
        return cn;
    }

    private static Task Sesion(NpgsqlConnection cn, string id, string tutor, string fecha, string inicio, string fin) =>
        Ejecutar(cn, """
            INSERT INTO "Sesiones" ("Id", "TutorId", "EscuelaId", "SemestreId", "Tipo", "Fecha",
                "HoraInicio", "HoraFin", "FinUtc", "Modalidad", "Lugar", "Tema", "Objetivo", "Estado",
                "AsistenciaConfirmada", "AcuerdosJson", "Version")
            VALUES (@id, @tutor, 'E-IIS', '2026-II', 'individual', @fecha,
                @inicio, @fin, (@fecha || 'T' || @fin || ':00-05:00')::timestamptz,
                'presencial', 'Sala ficticia', 'Tema ficticio', 'Objetivo ficticio', 'programada', false, '[]', 1)
            """, ("id", id), ("tutor", tutor), ("fecha", fecha), ("inicio", inicio), ("fin", fin));

    private static Task Asistente(NpgsqlConnection cn, string sesion) =>
        Ejecutar(cn, """
            INSERT INTO "Asistencias" ("SesionId", "EstudianteId", "Estado") VALUES (@sesion, @estudiante, 'justificado')
            """, ("sesion", sesion), ("estudiante", Estudiante));

    private static async Task Ejecutar(NpgsqlConnection cn, string sql, params (string Nombre, string Valor)[] valores)
    {
        await using var cmd = new NpgsqlCommand(sql, cn);
        foreach (var (nombre, valor) in valores)
            cmd.Parameters.AddWithValue(nombre, valor);
        await cmd.ExecuteNonQueryAsync();
    }
}
