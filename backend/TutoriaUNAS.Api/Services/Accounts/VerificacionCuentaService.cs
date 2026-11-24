using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TutoriaUNAS.Api.Configuration;
using TutoriaUNAS.Api.Data;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.DTOs;
using TutoriaUNAS.Api.Entities;

namespace TutoriaUNAS.Api.Services.Accounts;

public sealed class VerificacionCuentaService(TutoriaDbContext db, CredencialesCuentaService credenciales,
    SeguridadCuenta seguridad, ColaCorreoCuenta cola, TimeProvider clock, IOptions<CuentasOptions> options)
{
    public async Task<CodigoEnCaminoDto> Solicitar(SolicitarCodigoInput input, CancellationToken ct)
    {
        credenciales.ExigirDisponible();
        TutoriaError.Exigir(input.Proposito is "registro" or "activacion" or "recuperacion", "Solicitud de verificación inválida.");
        TutoriaError.Exigir(input.Proposito == "recuperacion" || input.Rol is "estudiante" or "tutor" or "coordinacion", "Solicitud de verificación inválida.");
        TutoriaError.Exigir(input.Proposito != "registro" || input.Rol != "coordinacion", "Coordinación crea las cuentas de este perfil.", 403);
        RetoCorreoEntity? activacion = null;
        if (input.Proposito == "activacion") activacion = await Activacion(input.TokenActivacion, ct);
        var email = activacion?.Correo ?? seguridad.Correo(input.Correo);
        if (activacion is null && options.Value.RevelarExistencia && input.Proposito is "registro" or "recuperacion")
        {
            var d = await Diagnosticar(input.Proposito, input.Rol, email, ct);
            TutoriaError.Exigir(d.Estado == "ok", d.Mensaje, 409);
        }
        await using var tx = await credenciales.Bloquear(email, ct);
        var ahora = clock.GetUtcNow();
        var ultimo = await db.RetosCorreo.Where(r => r.Correo == email && r.UltimoEnvio != null).MaxAsync(r => r.UltimoEnvio, ct);
        TutoriaError.Exigir(ultimo is null || ultimo <= ahora.AddSeconds(-60), "Espera un minuto antes de solicitar otro código.", 429);
        var envios = await db.RetosCorreo.Where(r => r.Correo == email && r.Creado > ahora.AddHours(-1)).SumAsync(r => r.Envios, ct);
        TutoriaError.Exigir(envios < 5, "Se alcanzó el límite de códigos. Inténtalo nuevamente en una hora.", 429);
        RetoCorreoEntity reto;
        var baja = await BajaCorreo.Consultar(db, email, ct); // dado de baja: no se le escribe nada
        string? aviso = null; // motivo por el que no se emite código: igual se informa por correo a la dirección solicitada
        if (activacion is not null)
        {
            // Releer tras obtener la exclusión; nunca reutilizar una prueba invalidada concurrentemente.
            await db.Entry(activacion).ReloadAsync(ct);
            ExigirActivacion(activacion, input.TokenActivacion, ahora);
            var user = await db.Usuarios.SingleAsync(u => u.Id == activacion.UsuarioId, ct);
            var cred = await db.CredencialesCuenta.SingleAsync(c => c.UsuarioId == user.Id, ct);
            TutoriaError.Exigir(user.Activo && user.Version == activacion.VersionUsuario && cred.TemporalHasta > ahora, "Vuelve a ingresar con tu contraseña temporal.", 409);
            reto = activacion;
            foreach (var pendiente in await db.CorreosCuenta.Where(m => m.RetoId == reto.Id && m.Enviado == null && m.Cancelado == null).ToArrayAsync(ct)) { pendiente.Cancelado = ahora; pendiente.ContenidoProtegido = ""; }
        }
        else
        {
            await cola.CancelarRetos(email, input.Proposito, ahora, ct);
            reto = new() { Id = SeguridadCuenta.Aleatorio(), Correo = email, Rol = input.Rol, Proposito = input.Proposito, Creado = ahora };
            if (input.Proposito == "registro")
            {
                var tipo = input.Rol == "estudiante" ? "estudiante" : "tutor";
                var personas = await PersonasPorCorreo(email, tipo, ct);
                var existeCuenta = await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == email && c.Rol == input.Rol, ct);
                if (personas.Length == 1 && !existeCuenta) reto.PersonaId = personas[0].Id;
                else aviso = existeCuenta ? "cuenta-existente" : "sin-padron";
            }
            else
            {
                var usuario = (await UsuariosRecuperables(email, ct)).FirstOrDefault();
                if (usuario is not null) { reto.Rol = usuario.Rol; reto.UsuarioId = usuario.Id; reto.PersonaId = usuario.PersonaId; reto.VersionUsuario = usuario.Version; }
                else aviso = "sin-cuenta";
            }
            db.RetosCorreo.Add(reto);
        }
        var codigo = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
        reto.CodigoHash = seguridad.HashCodigo(reto.Id, codigo); reto.Expira = ahora.AddMinutes(10); reto.UltimoEnvio = ahora;
        reto.Verificado = null; reto.TicketHash = null; reto.Intentos = 0; reto.Envios++;
        if (baja) { /* sin correo: la respuesta de la página es la misma */ }
        else if (reto.PersonaId is not null)
        {
            var recuperacion = reto.Proposito == "recuperacion";
            var asunto = recuperacion ? "Recupera tu contraseña · Tutoría UNAS" : "Verifica tu cuenta · Tutoría UNAS";
            var instruccion = recuperacion ? "Tu código para recuperar tu contraseña es" : "Tu código de verificación es";
            cola.Agregar(email, asunto,
                $"{instruccion}: {codigo}\n\nVence en 10 minutos y solo puede utilizarse una vez. No lo compartas.\nSi no solicitaste esta operación, ignora este correo.\n\nTutoría UNAS", reto.Expira, reto.UsuarioId, reto.Id);
        }
        else if (aviso is not null)
        {
            // La respuesta de la página es idéntica en todos los casos. Quien sí controla el buzón recibe
            // una explicación; nadie más aprende si la cuenta o la ficha existen.
            var (asuntoAviso, cuerpoAviso) = MensajeSinCodigo(aviso, input.Proposito, input.Rol);
            cola.Agregar(email, asuntoAviso, cuerpoAviso, ahora.AddMinutes(30), null, reto.Id);
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(reto.Id, 600, 60, options.Value.RevelarExistencia ? "Código enviado." : "Si está registrado, recibirás un mensaje.");
    }

    private async Task<UsuarioEntity[]> UsuariosRecuperables(string email, CancellationToken ct) =>
        await (from c in db.CredencialesCuenta join u in db.Usuarios on c.UsuarioId equals u.Id
            where c.CorreoNormalizado == email && c.Verificada && u.Activo orderby u.Rol select u).ToArrayAsync(ct);

    private async Task<PersonaEntity[]> PersonasPorCorreo(string email, string tipo, CancellationToken ct) =>
        await db.Personas.FromSqlInterpolated($"SELECT * FROM \"Personas\" WHERE \"Tipo\" = {tipo} AND \"Activa\" AND lower(trim(\"DatosJson\"::json->>'correo')) = {email}")
            .AsNoTracking().ToArrayAsync(ct);

    /// <summary>Consulta rápida para la pantalla: dice si el correo puede continuar. Con RevelarExistencia=false siempre responde "ok".</summary>
    public async Task<EstadoCorreoDto> ValidarCorreo(ValidarCorreoInput input, CancellationToken ct)
    {
        credenciales.ExigirDisponible();
        TutoriaError.Exigir(input.Proposito is "registro" or "recuperacion" && input.Rol is "estudiante" or "tutor" or "coordinacion", "Solicitud inválida.");
        if (!options.Value.RevelarExistencia) return new("ok", "");
        return await Diagnosticar(input.Proposito, input.Rol, seguridad.Correo(input.Correo), ct);
    }

    private async Task<EstadoCorreoDto> Diagnosticar(string proposito, string rol, string email, CancellationToken ct)
    {
        if (await BajaCorreo.Consultar(db, email, ct)) return new("deshabilitada", "Esta cuenta está deshabilitada. Consulta a coordinación.");
        if (proposito == "registro")
        {
            var perfil = rol == "tutor" ? "docente" : rol == "coordinacion" ? "coordinación" : "estudiante";
            if (rol == "coordinacion") return new("no-aplica", "Coordinación crea estas cuentas.");
            if (await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == email && c.Rol == rol, ct))
                return new("cuenta-existente", $"Ya existe una cuenta de {perfil} con este correo. Inicia sesión.");
            var personas = await PersonasPorCorreo(email, rol == "estudiante" ? "estudiante" : "tutor", ct);
            return personas.Length == 1 ? new("ok", "Correo encontrado.") : new("sin-padron", $"Este correo no figura como {perfil} en el sistema.");
        }
        var cuentas = await (from c in db.CredencialesCuenta.AsNoTracking() join u in db.Usuarios.AsNoTracking() on c.UsuarioId equals u.Id
            where c.CorreoNormalizado == email select new { c.Verificada, u.Activo }).ToArrayAsync(ct);
        if (cuentas.Length == 0) return new("sin-cuenta", "No hay una cuenta con este correo.");
        if (!cuentas.Any(c => c.Verificada)) return new("sin-verificar", "Tu cuenta aún no está activada. Ingresa con tu contraseña temporal.");
        return cuentas.Any(c => c.Verificada && c.Activo) ? new("ok", "Cuenta encontrada.") : new("deshabilitada", "Esta cuenta está deshabilitada. Consulta a coordinación.");
    }

    private (string Asunto, string Cuerpo) MensajeSinCodigo(string aviso, string proposito, string rol)
    {
        var login = options.Value.UrlAcceso;
        var crear = login.EndsWith("/login", StringComparison.Ordinal) ? login[..^"/login".Length] + "/crear-cuenta" : login;
        var perfil = rol == "tutor" ? "docente" : rol == "coordinacion" ? "coordinación" : "estudiante";
        const string cierre = "\n\nSi no hiciste esta solicitud, ignora este correo. No se realizó ningún cambio en tu cuenta.\n\nTutoría UNAS";
        return aviso switch
        {
            "cuenta-existente" => ("Ya tienes una cuenta · Tutoría UNAS",
                $"Recibimos una solicitud para crear una cuenta con este correo, pero ya existe una con el perfil de {perfil}.\n\nInicia sesión aquí: {login}\nSi olvidaste tu contraseña, usa «¿Olvidaste tu clave?» en esa misma página." + cierre),
            "sin-cuenta" => ("Recuperación de contraseña · Tutoría UNAS",
                $"Recibimos una solicitud para recuperar la contraseña de este correo, pero no hay una cuenta activa asociada a él.\n\n• Si aún no creaste tu cuenta, hazlo aquí: {crear}\n• Si tu cuenta está deshabilitada, comunícate con coordinación." + cierre),
            _ => ("Solicitud de cuenta · Tutoría UNAS",
                $"Recibimos una solicitud para crear una cuenta con este correo, pero no encontramos una ficha activa de {perfil} asociada a él en el padrón de la universidad.\n\nComunícate con la coordinación de tutoría de tu escuela profesional para que verifiquen tu registro. Cuando figures en el padrón podrás crear tu cuenta en {crear}." + cierre),
        };
    }

    private async Task<RetoCorreoEntity> Activacion(string? prueba, CancellationToken ct)
    {
        TutoriaError.Exigir(prueba is { Length: 64 }, "Vuelve a ingresar con tu contraseña temporal.", 401);
        var hash = SeguridadCuenta.Hash(prueba!);
        var reto = await db.RetosCorreo.SingleOrDefaultAsync(r => r.PruebaHash == hash && r.Proposito == "activacion", ct)
            ?? throw new TutoriaError(401, "Vuelve a ingresar con tu contraseña temporal.");
        ExigirActivacion(reto, prueba, clock.GetUtcNow()); return reto;
    }
    private static void ExigirActivacion(RetoCorreoEntity r, string? prueba, DateTimeOffset ahora) =>
        TutoriaError.Exigir(r.Consumido is null && r.Creado.AddMinutes(15) > ahora && prueba is { Length: 64 } && SeguridadCuenta.Iguales(r.PruebaHash, SeguridadCuenta.Hash(prueba)), "Vuelve a ingresar con tu contraseña temporal.", 401);

    public async Task<CodigoValidadoDto> Confirmar(ConfirmarCodigoInput input, CancellationToken ct)
    {
        credenciales.ExigirDisponible();
        var existente = await db.RetosCorreo.AsNoTracking().SingleOrDefaultAsync(r => r.Id == input.RetoId, ct)
            ?? throw new TutoriaError(400, SeguridadCuenta.CodigoInvalido);
        await using var tx = await credenciales.Bloquear(existente.Correo, ct);
        var reto = await db.RetosCorreo.SingleAsync(r => r.Id == input.RetoId, ct);
        var ahora = clock.GetUtcNow();
        if (reto.Proposito == "activacion") ExigirActivacion(reto, input.TokenActivacion, ahora);
        TutoriaError.Exigir(reto.Consumido is null && reto.Verificado is null && reto.Expira > ahora && reto.Intentos < 5 && reto.UltimoEnvio is not null, SeguridadCuenta.CodigoInvalido);
        reto.Intentos++;
        var valido = input.Codigo.Length == 6 && SeguridadCuenta.Iguales(reto.CodigoHash, seguridad.HashCodigo(reto.Id, input.Codigo)) && reto.PersonaId is not null;
        if (!valido) { await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); throw new TutoriaError(400, SeguridadCuenta.CodigoInvalido); }
        var ticket = SeguridadCuenta.Aleatorio(); reto.TicketHash = SeguridadCuenta.Hash(ticket); reto.Verificado = ahora; reto.Expira = ahora.AddMinutes(5);
        // El código ya no permite emitir otro ticket, incluso si aún no se cambió la contraseña.
        reto.CodigoHash = "";
        var perfiles = reto.Proposito == "recuperacion" ? (await UsuariosRecuperables(reto.Correo, ct)).Select(u => u.Rol).ToArray() : [];
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(ticket, 300, perfiles.Length > 1 ? perfiles : null);
    }

    public async Task<CuentaCompletadaDto> Completar(CompletarCuentaInput input, CancellationToken ct)
    {
        credenciales.ExigirDisponible(); SeguridadCuenta.Password(input.Password, input.Confirmacion);
        var existente = await db.RetosCorreo.AsNoTracking().SingleOrDefaultAsync(r => r.Id == input.RetoId, ct)
            ?? throw new TutoriaError(400, "La verificación venció. Solicita un nuevo código.");
        await using var tx = await credenciales.Bloquear(existente.Correo, ct);
        var reto = await db.RetosCorreo.SingleAsync(r => r.Id == input.RetoId, ct);
        var ahora = clock.GetUtcNow();
        TutoriaError.Exigir(reto.Verificado is not null && reto.Consumido is null && reto.Expira > ahora && input.Ticket.Length == 64 && SeguridadCuenta.Iguales(reto.TicketHash, SeguridadCuenta.Hash(input.Ticket)), "La verificación venció. Solicita un nuevo código.");
        UsuarioEntity? destino = null;
        if (reto.Proposito == "recuperacion")
        {
            var usuarios = await UsuariosRecuperables(reto.Correo, ct);
            destino = usuarios.Length == 1 ? usuarios[0] : usuarios.SingleOrDefault(u => u.Rol == input.Rol);
            TutoriaError.Exigir(destino is not null || usuarios.Length > 1, "La cuenta cambió. Vuelve a iniciar la verificación.", 409);
            TutoriaError.Exigir(destino is not null, "Elige el perfil cuya contraseña vas a recuperar.");
        }
        var persona = await db.Personas.SingleAsync(p => p.Id == (destino != null ? destino.PersonaId : reto.PersonaId), ct);
        TutoriaError.Exigir(persona.Activa && JsonDatos.Texto(persona.DatosJson, "correo").Trim().Equals(reto.Correo, StringComparison.OrdinalIgnoreCase), "La vinculación institucional cambió. Consulta a coordinación.", 409);
        UsuarioEntity user;
        if (reto.Proposito == "registro")
        {
            TutoriaError.Exigir(reto.Rol is "estudiante" or "tutor" && persona.Tipo == reto.Rol, "El perfil no corresponde al padrón.", 403);
            TutoriaError.Exigir(!await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == reto.Correo && c.Rol == reto.Rol, ct) &&
                !await db.Usuarios.AnyAsync(u => u.PersonaId == persona.Id && u.Rol == reto.Rol && u.Issuer == SeguridadCuenta.Issuer, ct), "Ya existe una cuenta para este correo y perfil. Inicia sesión o recupera tu contraseña.", 409);
            user = credenciales.Crear(persona, reto.Correo, reto.Rol, input.Password, false);
        }
        else
        {
            user = destino ?? await db.Usuarios.SingleAsync(u => u.Id == reto.UsuarioId, ct);
            var cred = await db.CredencialesCuenta.SingleAsync(c => c.UsuarioId == user.Id, ct);
            TutoriaError.Exigir(user.Activo && (user.Id != reto.UsuarioId || user.Version == reto.VersionUsuario) && (reto.Proposito != "activacion" || cred.TemporalHasta > ahora), "La cuenta cambió. Vuelve a iniciar la verificación.", 409);
            TutoriaError.Exigir(!credenciales.PasswordValida(cred, input.Password), "Elige una contraseña diferente de la anterior.");
            credenciales.CambiarPassword(cred, input.Password); cred.Verificada = true; cred.CambioObligatorio = false; cred.TemporalHasta = null;
            cred.IntentosFallidos = 0; cred.BloqueadaHasta = null; user.Version++;
        }
        reto.Consumido = ahora; reto.TicketHash = null; reto.PruebaHash = null;
        db.Auditoria.Add(new() { Fecha = ahora, UsuarioId = user.Id, EscuelaId = user.EscuelaId, Accion = "completar-" + reto.Proposito, RecursoId = user.Id, Version = user.Version });
        cola.Agregar(reto.Correo, "Cuenta verificada · Tutoría UNAS", $"Tu cuenta institucional de Tutoría UNAS se verificó y su contraseña quedó establecida.\n\nAcceso: {options.Value.UrlAcceso}\nNo respondas este correo con tu contraseña. Si no realizaste la operación, comunícate con coordinación.", ahora.AddDays(1), user.Id);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(user.Identificador, user.Rol, !user.Activo || user.EscuelaId.Length == 0);
    }
}
