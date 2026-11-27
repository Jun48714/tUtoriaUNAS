using System.Globalization;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Correo;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services.Accounts;

public sealed class CuentasAdminService(TutoriaDbContext db, TutoriaContext context, CredencialesCuentaService credenciales,
    SeguridadCuenta seguridad, ColaCorreoCuenta cola, TimeProvider clock, IOptions<CuentasOptions> options)
{
    private async Task<ActorTutoria> Actor(string accion, CancellationToken ct)
    {
        credenciales.ExigirDisponible(); var actor = await context.Actor(ct);
        TutoriaError.Exigir(actor.Rol == "coordinacion", "Solo coordinación administra cuentas.", 403);
        actor.Exigir("cuentas", accion); return actor;
    }
    public async Task<object[]> Listar(CancellationToken ct)
    {
        var actor = await Actor("ver", ct);
        var escuelasActivas = actor.ConsultaInstitucional
            ? await db.Periodos.AsNoTracking().Where(p => p.Activo).Select(p => p.EscuelaId).ToArrayAsync(ct)
            : [];
        var users = await db.Usuarios.AsNoTracking().Where(u => (!u.AdminInstitucional || u.Id == actor.Usuario.Id) &&
            ((actor.ConsultaInstitucional && escuelasActivas.Contains(u.EscuelaId)) || u.EscuelaId == actor.EscuelaId || (u.EscuelaId == "" && u.Issuer == SeguridadCuenta.Issuer))).ToArrayAsync(ct);
        var ids = users.Select(u => u.Id).ToArray(); var pids = users.Select(u => u.PersonaId).ToArray();
        var personas = await db.VistaPersonasResumen.AsNoTracking().Where(p => pids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
        var cred = await db.CredencialesCuenta.AsNoTracking().Where(c => ids.Contains(c.UsuarioId)).ToDictionaryAsync(c => c.UsuarioId, ct);
        var mails = (await db.CorreosCuenta.AsNoTracking().Where(m => ids.Contains(m.UsuarioId!)).OrderByDescending(m => m.Creado).ToArrayAsync(ct))
            .ToLookup(m => m.UsuarioId);
        return users.Select(u => {
            var p = personas[u.PersonaId]; var c = cred.GetValueOrDefault(u.Id); var mail = mails[u.Id].FirstOrDefault();
            return (object)new { u.Id, u.PersonaId, u.EscuelaId, rol = u.Rol, identifier = u.Identificador, nombre = p.NombreCompleto, u.Activo, u.Version,
                coordinadorEscuela = u.CoordinadorEscuela, nombres = p.Nombres, apellidos = p.Apellidos, codigo = p.Codigo, ciclo = p.Ciclo, verificada = c?.Verificada, cambioObligatorio = c?.CambioObligatorio ?? false, pendienteVinculacion = u.EscuelaId == "", propia = u.Id == actor.Usuario.Id,
                correo = c?.CorreoNormalizado ?? p.Correo,
                correoEstado = mail is null ? "sin-envio" : mail.Enviado is not null ? "enviado" : mail.Cancelado is not null ? "no-entregado" : "pendiente" };
        }).ToArray();
    }
    public async Task<object[]> Candidatos(string rol, string buscar, CancellationToken ct)
    {
        var actor = await Actor("crear", ct);
        actor.ExigirEscuelaParaGestion();
        TutoriaError.Exigir(rol is "estudiante" or "tutor" && buscar.Length <= 150, "Filtros inválidos.");
        if (buscar.Trim().Length < 2) return [];
        var tipo = rol == "estudiante" ? "estudiante" : "tutor";
        var personas = await db.VistaPersonasResumen.AsNoTracking().Where(p => p.Activa && p.Tipo == tipo && (p.EscuelaId == actor.EscuelaId || (tipo == "tutor" && p.EscuelaId == ""))).ToArrayAsync(ct);
        var existentes = await db.Usuarios.Where(u => u.Issuer == SeguridadCuenta.Issuer && u.Rol == rol).Select(u => u.PersonaId).ToArrayAsync(ct);
        var texto = buscar.Trim();
        var comparador = CultureInfo.GetCultureInfo("es-PE").CompareInfo;
        return personas.Where(p => !existentes.Contains(p.Id) && comparador.IndexOf($"{p.Codigo} {p.Nombres} {p.Apellidos} {p.Correo}", texto, CompareOptions.IgnoreCase | CompareOptions.IgnoreNonSpace) >= 0)
            .Take(20).Select(p => (object)new { p.Id, nombre = p.NombreCompleto, nombres = p.Nombres, apellidos = p.Apellidos, correo = p.Correo, p.EscuelaId, p.Ciclo }).ToArray();
    }
    public async Task<CuentaCreadaDto> Crear(CrearCuentaInput input, CancellationToken ct)
    {
        var actor = await Actor("crear", ct); var email = seguridad.Correo(input.Correo);
        actor.ExigirEscuelaParaGestion();
        TutoriaError.Exigir(input.Rol is "estudiante" or "tutor", "Elige un perfil válido: estudiante o docente.");
        TutoriaError.Exigir(input.Ciclo is null or >= 1 and <= 10 && (input.Codigo?.Length ?? 0) <= 40, "Revisa el código y ciclo del alumno.");
        await using var tx = await credenciales.Bloquear(email, ct);
        TutoriaError.Exigir(!await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == email && c.Rol == input.Rol, ct), "Ya existe una cuenta con este correo y perfil.", 409);
        var tipo = input.Rol == "estudiante" ? "estudiante" : "tutor";
        var candidatos = await db.Personas.Where(p => p.Tipo == tipo).ToArrayAsync(ct);
        var porCorreo = candidatos.Where(p => JsonDatos.Texto(p.DatosJson, "correo").Trim().Equals(email, StringComparison.OrdinalIgnoreCase)).ToArray();
        PersonaEntity persona;
        if (input.PersonaId is not null)
            persona = candidatos.SingleOrDefault(p => p.Id == input.PersonaId && JsonDatos.Texto(p.DatosJson, "correo").Trim().Equals(email, StringComparison.OrdinalIgnoreCase)) ?? throw new TutoriaError(400, "El correo no corresponde a la persona seleccionada.");
        else if (porCorreo.Length == 1) persona = porCorreo[0];
        else
        {
            TutoriaError.Exigir(porCorreo.Length == 0, "El correo coincide con varias fichas. Selecciona la persona del padrón.", 409);
            TutoriaError.Exigir(input.Nombres.Trim().Length is >= 2 and <= 150 && input.Apellidos.Trim().Length is >= 2 and <= 150, "Completa los nombres y apellidos.");
            persona = new() { Id = "PER-" + Guid.NewGuid().ToString("N"), Tipo = tipo, EscuelaId = actor.EscuelaId, Ciclo = tipo == "estudiante" ? input.Ciclo : null };
            var datos = new Dictionary<string, object?> { ["id"] = persona.Id, ["nombres"] = input.Nombres.Trim(), ["apellidos"] = input.Apellidos.Trim(), ["correo"] = email,
                ["codigo"] = input.Codigo?.Trim() ?? "", ["telefono"] = "", ["escuelaId"] = actor.EscuelaId };
            if (tipo == "estudiante") { datos["ciclo"] = input.Ciclo; datos["etapa"] = input.Ciclo is null ? "sin-informar" : input.Ciclo <= 3 ? "ingresante" : input.Ciclo <= 7 ? "intermedio" : "final";
                datos["estado"] = "regular"; datos["ingreso"] = ""; datos["promedioPonderado"] = null; datos["creditosAprobados"] = null; datos["creditosTotales"] = null; datos["alertas"] = Array.Empty<object>(); }
            else { datos["departamento"] = ""; datos["categoria"] = null; datos["dedicacion"] = null; datos["activo"] = true; datos["aforoMaximo"] = null; datos["cursosAsignados"] = Array.Empty<string>(); }
            persona.DatosJson = JsonDatos.Serializar(datos); db.Personas.Add(persona);
        }
        TutoriaError.Exigir(persona.Activa && (persona.EscuelaId == actor.EscuelaId || (tipo == "tutor" && persona.EscuelaId == "")), "La persona no pertenece al ámbito de tu escuela.", 403);
        if (tipo == "estudiante" && persona.Ciclo is null && input.Ciclo is not null)
        {   // Una ficha del padrón llega sin ciclo: se completa aquí para que su entrevista inicial exista al asignarle tutor.
            persona.Ciclo = input.Ciclo; var fichaDatos = JsonDatos.Leer<Dictionary<string, object?>>(persona.DatosJson);
            fichaDatos["ciclo"] = input.Ciclo; fichaDatos["etapa"] = EtapaDeCiclo(input.Ciclo); persona.DatosJson = JsonDatos.Serializar(fichaDatos);
        }
        if (persona.EscuelaId.Length == 0)
        { persona.EscuelaId = actor.EscuelaId; var datos = JsonDatos.Leer<Dictionary<string, object?>>(persona.DatosJson); datos["escuelaId"] = actor.EscuelaId; persona.DatosJson = JsonDatos.Serializar(datos); }
        TutoriaError.Exigir(!await db.Usuarios.AnyAsync(u => u.PersonaId == persona.Id && u.Rol == input.Rol && u.Issuer == SeguridadCuenta.Issuer, ct), "La persona ya tiene una cuenta de este perfil.", 409);
        var password = "UNAS-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12));
        TutoriaError.Exigir(!input.CoordinadorEscuela || (actor.AdminInstitucional && input.Rol == "tutor"), "Solo la administración institucional designa coordinadores de escuela, y deben ser docentes.", 403);
        var user = credenciales.Crear(persona, email, input.Rol, password, true);
        user.CoordinadorEscuela = input.CoordinadorEscuela;
        // La contraseña temporal solo se muestra a coordinación, que la entrega en persona: no se envía por correo.
        context.Auditar(actor, "crear-cuenta-" + input.Rol, user.Id, user.Version);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(user.Id, user.Identificador, password, 172800, "sin-envio");
    }
    public async Task<CuentaCreadaDto> RenovarTemporal(string id, int version, CancellationToken ct)
    {
        var actor = await Actor("editar", ct);
        var email = await db.CredencialesCuenta.Where(c => c.UsuarioId == id).Select(c => c.CorreoNormalizado).SingleOrDefaultAsync(ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        await using var tx = await credenciales.Bloquear(email, ct);
        var user = await db.Usuarios.SingleAsync(u => u.Id == id, ct); var cred = await db.CredencialesCuenta.SingleAsync(c => c.UsuarioId == id, ct);
        actor = actor.ParaEscuela(user.EscuelaId);
        TutoriaError.Exigir(!user.AdminInstitucional && user.Id != actor.Usuario.Id && user.EscuelaId == actor.EscuelaId && user.Activo && !cred.Verificada && cred.CambioObligatorio, "Solo se renuevan accesos temporales pendientes de tu escuela.", 403);
        TutoriaContext.Version(version, user.Version);
        var ahora = clock.GetUtcNow(); var password = "UNAS-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12));
        credenciales.CambiarPassword(cred, password); cred.TemporalHasta = ahora.AddHours(48); cred.IntentosFallidos = 0; cred.BloqueadaHasta = null; user.Version++;
        await cola.CancelarRetos(email, "activacion", ahora, ct);
        foreach (var pendiente in await db.CorreosCuenta.Where(m => m.UsuarioId == id && m.Enviado == null && m.Cancelado == null).ToArrayAsync(ct)) { pendiente.Cancelado = ahora; pendiente.ContenidoProtegido = ""; }
        context.Auditar(actor, "renovar-acceso-temporal", id, user.Version);   // sin correo: coordinación la entrega en persona
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(user.Id, user.Identificador, password, 172800, "sin-envio");
    }
    public async Task Vincular(string id, int version, CancellationToken ct)
    {
        var actor = await Actor("editar", ct);
        actor.ExigirEscuelaParaGestion();
        var email = await db.CredencialesCuenta.Where(c => c.UsuarioId == id).Select(c => c.CorreoNormalizado).SingleOrDefaultAsync(ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        await using var tx = await credenciales.Bloquear(email, ct);
        var u = await db.Usuarios.SingleAsync(u => u.Id == id, ct); var p = await db.Personas.SingleAsync(p => p.Id == u.PersonaId, ct);
        TutoriaError.Exigir(u.EscuelaId == "" && u.Rol == "tutor" && (p.EscuelaId == "" || p.EscuelaId == actor.EscuelaId), "La cuenta ya está vinculada o pertenece a otra escuela.", 409);
        TutoriaContext.Version(version, u.Version); u.EscuelaId = actor.EscuelaId; u.Activo = true; u.Version++; p.EscuelaId = actor.EscuelaId;
        await cola.AvisarHabilitacion(u, options.Value.UrlAcceso, rehabilitada: false, ct);
        var datos = JsonDatos.Leer<Dictionary<string, object?>>(p.DatosJson); datos["escuelaId"] = actor.EscuelaId; p.DatosJson = JsonDatos.Serializar(datos);
        context.Auditar(actor, "vincular-cuenta-a-escuela", id, u.Version); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    /// <summary>La administración institucional designa (o retira) a un docente como coordinador de su escuela. Es solo lectura.</summary>
    public async Task Coordinador(string id, int version, bool activo, CancellationToken ct)
    {
        var actor = await Actor("editar", ct);
        TutoriaError.Exigir(actor.AdminInstitucional, "Solo la administración institucional designa coordinadores de escuela.", 403);
        if (actor.ConsultaInstitucional)
            actor = actor.ParaEscuela(await db.Usuarios.AsNoTracking().Where(u => u.Id == id).Select(u => u.EscuelaId).SingleOrDefaultAsync(ct));
        await using var tx = await context.Transaccion(actor, ct);
        var u = await db.Usuarios.SingleOrDefaultAsync(u => u.Id == id && u.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        TutoriaError.Exigir(u.Rol == "tutor", "Solo se designa a docentes.", 409);
        TutoriaContext.Version(version, u.Version);
        var cambio = u.CoordinadorEscuela != activo;
        u.CoordinadorEscuela = activo; u.Version++;   // al subir la versión, su sesión se renueva y toma el cambio
        if (cambio && u.Activo) await cola.AvisarCoordinador(u, activo, options.Value.UrlAcceso, ct);
        context.Auditar(actor, activo ? "designar-coordinador-escuela" : "retirar-coordinador-escuela", id, u.Version);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }

    private static string EtapaDeCiclo(int? ciclo) => ciclo is null ? "sin-informar" : ciclo <= 3 ? "ingresante" : ciclo <= 7 ? "intermedio" : "final";

    /// <summary>
    /// Edita los mismos datos que se registran al crear la cuenta. Si cambia el ciclo del estudiante, su entrevista inicial
    /// (F03, F04 o F05) se genera o se reemplaza para sus asignaciones vigentes, de modo que el formulario le aparezca.
    /// </summary>
    public async Task<CuentaEditadaDto> Editar(string id, EditarCuentaInput input, CancellationToken ct)
    {
        var actor = await Actor("editar", ct);
        if (actor.ConsultaInstitucional)
            actor = actor.ParaEscuela(await db.Usuarios.AsNoTracking().Where(u => u.Id == id).Select(u => u.EscuelaId).SingleOrDefaultAsync(ct));
        var email = seguridad.Correo(input.Correo);
        var nombres = input.Nombres.Trim(); var apellidos = input.Apellidos.Trim(); var codigo = input.Codigo?.Trim() ?? "";
        TutoriaError.Exigir(nombres.Length is >= 2 and <= 150 && apellidos.Length is >= 2 and <= 150, "Completa los nombres y apellidos.");
        TutoriaError.Exigir(codigo.Length <= 40 && input.Ciclo is null or >= 1 and <= 10, "Revisa el código y ciclo del alumno.");
        var emailActual = await db.CredencialesCuenta.Where(c => c.UsuarioId == id).Select(c => c.CorreoNormalizado).SingleOrDefaultAsync(ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        await using var tx = await credenciales.Bloquear(emailActual, ct);
        if (email != emailActual) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"cuenta:" + email}, 0))", ct);
        var u = await db.Usuarios.SingleOrDefaultAsync(u => u.Id == id && u.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        TutoriaError.Exigir(!u.AdminInstitucional && u.Id != actor.Usuario.Id, "Tu cuenta y la de administración institucional no se editan aquí.", 403);
        TutoriaError.Exigir(u.Rol is "estudiante" or "tutor", "Solo se editan cuentas de estudiantes y docentes.", 409);
        TutoriaContext.Version(input.Version, u.Version);
        var p = await db.Personas.SingleAsync(p => p.Id == u.PersonaId, ct);
        var cred = await db.CredencialesCuenta.SingleAsync(c => c.UsuarioId == id, ct);
        var cambioCorreo = email != emailActual;
        TutoriaError.Exigir(!cambioCorreo || !await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == email && c.Rol == u.Rol && c.UsuarioId != id, ct), "Ya existe una cuenta con este correo y perfil.", 409);
        var datos = JsonDatos.Leer<Dictionary<string, object?>>(p.DatosJson);
        datos["nombres"] = nombres; datos["apellidos"] = apellidos; datos["correo"] = email; datos["codigo"] = codigo;
        var cicloCambio = false;
        if (p.Tipo == "estudiante")
        {
            cicloCambio = p.Ciclo != input.Ciclo;
            p.Ciclo = input.Ciclo; datos["ciclo"] = input.Ciclo; datos["etapa"] = EtapaDeCiclo(input.Ciclo);
        }
        p.DatosJson = JsonDatos.Serializar(datos);
        var contacto = await db.Contactos.SingleOrDefaultAsync(c => c.PersonaId == p.Id, ct);
        if (contacto is not null && contacto.Correo != email) { contacto.Correo = email; contacto.Actualizado = clock.GetUtcNow(); contacto.Version++; }
        var ahora = clock.GetUtcNow(); string? temporal = null;
        if (cambioCorreo)
        {
            u.Identificador = email; cred.CorreoNormalizado = email;
            await cola.CancelarRetos(emailActual, "activacion", ahora, ct);
            if (cred.Verificada == false)
            {   // Con el correo corregido se emite un acceso temporal nuevo; se muestra a coordinación y no se envía por correo.
                temporal = "UNAS-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12));
                credenciales.CambiarPassword(cred, temporal); cred.TemporalHasta = ahora.AddHours(48); cred.IntentosFallidos = 0; cred.BloqueadaHasta = null;
                foreach (var pendiente in await db.CorreosCuenta.Where(m => m.UsuarioId == id && m.Enviado == null && m.Cancelado == null).ToArrayAsync(ct)) { pendiente.Cancelado = ahora; pendiente.ContenidoProtegido = ""; }
            }
        }
        u.Version++;   // al subir la versión, su sesión se renueva y toma los datos nuevos
        if (cicloCambio) await SincronizarEntrevistaInicial(p, ahora, ct);
        context.Auditar(actor, "editar-cuenta-" + u.Rol, id, u.Version);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(u.Id, u.Identificador, temporal, 172800);
    }

    /// <summary>Genera la entrevista del ciclo vigente en cada asignación activa y retira la del ciclo anterior si no se empezó.</summary>
    private async Task SincronizarEntrevistaInicial(PersonaEntity estudiante, DateTimeOffset ahora, CancellationToken ct)
    {
        var asignaciones = await db.Asignaciones.Where(a => a.EstudianteId == estudiante.Id && a.Activa).ToArrayAsync(ct);
        foreach (var a in asignaciones)
        {
            var formatoNuevo = estudiante.Ciclo is { } c && EtapasTutoria.EsCicloValido(c) ? EtapasTutoria.FormatoEntrevistaInicial(c) : null;
            foreach (var vieja in await db.Instrumentos.Where(d => d.EstudianteId == a.EstudianteId && d.SemestreId == a.SemestreId
                && (d.Formato == "F03" || d.Formato == "F04" || d.Formato == "F05") && d.Formato != formatoNuevo && d.Estado == "no-iniciado").ToArrayAsync(ct))
                db.Instrumentos.Remove(vieja);
            if (formatoNuevo is null) continue;
            var iid = DocumentosService.IdEntrevista(a, estudiante.Ciclo!.Value);
            if (!await db.Instrumentos.AnyAsync(d => d.Id == iid, ct))
                db.Instrumentos.Add(DocumentosService.Nuevo(iid, formatoNuevo, a.TutorId, a.EscuelaId, a.SemestreId, a.EstudianteId, ahora));
        }
    }

    /// <summary>
    /// Elimina por completo a un estudiante y todo lo que depende de él. Se rechaza si ya tiene formularios enviados o
    /// sesiones realizadas: ese historial se conserva y la cuenta se deshabilita en su lugar.
    /// </summary>
    public async Task Eliminar(string id, int version, CancellationToken ct)
    {
        var actor = await Actor("eliminar", ct);
        if (actor.ConsultaInstitucional)
            actor = actor.ParaEscuela(await db.Usuarios.AsNoTracking().Where(u => u.Id == id).Select(u => u.EscuelaId).SingleOrDefaultAsync(ct));
        var emailActual = await db.CredencialesCuenta.Where(c => c.UsuarioId == id).Select(c => c.CorreoNormalizado).SingleOrDefaultAsync(ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        await using var tx = await credenciales.Bloquear(emailActual, ct);
        var u = await db.Usuarios.SingleOrDefaultAsync(u => u.Id == id && u.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        TutoriaError.Exigir(u.Rol == "estudiante" && !u.AdminInstitucional && u.Id != actor.Usuario.Id, "Solo se eliminan cuentas de estudiantes.", 409);
        TutoriaContext.Version(version, u.Version);
        var pid = u.PersonaId;
        TutoriaError.Exigir(!await db.Usuarios.AnyAsync(x => x.PersonaId == pid && x.Id != id, ct), "La persona tiene otra cuenta asociada; no se puede eliminar desde aquí.", 409);
        TutoriaError.Exigir(!await db.Instrumentos.AnyAsync(d => d.EstudianteId == pid && (d.Estado == "enviado" || d.Estado == "aprobado" || d.Estado == "observado"), ct)
            && !await db.Asistencias.AnyAsync(a => a.EstudianteId == pid && (a.Estado == "asistio" || a.Estado == "tarde")
                && db.Sesiones.Any(s => s.Id == a.SesionId && s.Estado == "realizada"), ct)
            && !await db.Mensajes.AnyAsync(m => m.EmisorId == id, ct),
            "Este estudiante ya tiene formularios enviados o sesiones realizadas. Para conservar su historial, deshabilita su acceso en lugar de eliminarlo.", 409);
        var sesiones = await db.Asistencias.Where(a => a.EstudianteId == pid).Select(a => a.SesionId).Distinct().ToArrayAsync(ct);
        // Orden: primero lo que cuelga de formularios y sesiones, luego la ficha y la cuenta.
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Seguimientos\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Instrumentos\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Asistencias\" WHERE \"EstudianteId\" = {pid}", ct);
        // Una sesión individual que se quedó sin asistentes ya no tiene razón de existir.
        await db.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""EvidenciasSesion"" WHERE ""SesionId"" = ANY({sesiones}) AND NOT EXISTS (SELECT 1 FROM ""Asistencias"" a WHERE a.""SesionId"" = ""EvidenciasSesion"".""SesionId"") AND EXISTS (SELECT 1 FROM ""Sesiones"" s WHERE s.""Id"" = ""EvidenciasSesion"".""SesionId"" AND s.""Tipo"" = 'individual')", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""Instrumentos"" i WHERE i.""SesionId"" = ANY({sesiones}) AND NOT EXISTS (SELECT 1 FROM ""Asistencias"" a WHERE a.""SesionId"" = i.""SesionId"") AND EXISTS (SELECT 1 FROM ""Sesiones"" s WHERE s.""Id"" = i.""SesionId"" AND s.""Tipo"" = 'individual')", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""Sesiones"" s WHERE s.""Id"" = ANY({sesiones}) AND s.""Tipo"" = 'individual' AND NOT EXISTS (SELECT 1 FROM ""Asistencias"" a WHERE a.""SesionId"" = s.""Id"")", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Asignaciones\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"SolicitudesCambio\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Matriculas\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Horarios\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Expediente\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"InscripcionesCampana\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Fuentes\" WHERE \"EstudianteId\" = {pid}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Contactos\" WHERE \"PersonaId\" = {pid}", ct);
        // Los correos de verificación apuntan a sus retos: se quitan antes que ellos.
        await db.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""CorreosCuenta"" WHERE ""UsuarioId"" = {id} OR ""RetoId"" IN (SELECT ""Id"" FROM ""RetosCorreo"" WHERE ""PersonaId"" = {pid} OR ""UsuarioId"" = {id} OR ""Correo"" = {emailActual})", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"RetosCorreo\" WHERE \"PersonaId\" = {pid} OR \"UsuarioId\" = {id} OR \"Correo\" = {emailActual}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Destinatarios\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Notificaciones\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Preferencias\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"BorradoresFormato\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"PublicacionesFormato\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"CorreosCuenta\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"CredencialesCuenta\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"RecordatoriosPendientes\" WHERE \"UsuarioId\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Usuarios\" WHERE \"Id\" = {id}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Personas\" WHERE \"Id\" = {pid}", ct);
        db.ChangeTracker.Clear();
        context.Auditar(actor, "eliminar-estudiante", pid, version);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task Estado(string id, int version, bool activo, CancellationToken ct)
    {
        var actor = await Actor("editar", ct);
        if (actor.ConsultaInstitucional)
            actor = actor.ParaEscuela(await db.Usuarios.AsNoTracking().Where(u => u.Id == id).Select(u => u.EscuelaId).SingleOrDefaultAsync(ct));
        await using var tx = await context.Transaccion(actor, ct);
        var u = await db.Usuarios.SingleOrDefaultAsync(u => u.Id == id && u.EscuelaId == actor.EscuelaId, ct) ?? throw new TutoriaError(404, "Cuenta no disponible.");
        TutoriaError.Exigir(u.Id != actor.Usuario.Id, "No puedes deshabilitar tu propia cuenta.", 409);
        TutoriaError.Exigir(!u.AdminInstitucional, "La cuenta de administración institucional está protegida.", 403);
        TutoriaContext.Version(version, u.Version); var habilitada = activo && !u.Activo; var deshabilitada = u.Activo; u.Activo = activo; u.Version++;
        if (habilitada) await cola.AvisarHabilitacion(u, options.Value.UrlAcceso, rehabilitada: true, ct);
        else if (!activo && deshabilitada) await cola.AvisarBaja(u, ct);
        context.Auditar(actor, activo ? "habilitar-cuenta" : "deshabilitar-cuenta", id, u.Version); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
