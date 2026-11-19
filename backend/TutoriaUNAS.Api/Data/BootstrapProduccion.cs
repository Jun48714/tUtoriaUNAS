using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Domain;
using TutoriaUNAS.Api.Entities;
using TutoriaUNAS.Api.Services;
using TutoriaUNAS.Api.Services.Accounts;

namespace TutoriaUNAS.Api.Data;

/// <summary>
/// Preparación inicial de una instalación real (sin datos ficticios): catálogos estructurales de la
/// universidad, periodos activos por escuela y la primera cuenta de administración institucional.
/// Es idempotente: se puede ejecutar de nuevo sin duplicar ni pisar lo ya creado.
/// El padrón de estudiantes y tutores se importa después desde el propio sistema.
/// </summary>
public static class BootstrapProduccion
{
    // Solo estructura académica. Se excluyen cursos, servicios de bienestar y fuentes: son datos de ejemplo.
    private static readonly string[] CatalogosEstructurales = ["facultades", "escuelas", "semestres", "reglasTutoria"];

    public static async Task Ejecutar(IServiceProvider services, string semillaSistema, IConfiguration config, CancellationToken ct = default)
    {
        var db = services.GetRequiredService<TutoriaDbContext>();
        var credenciales = services.GetRequiredService<CredencialesCuentaService>();
        var seguridad = services.GetRequiredService<SeguridadCuenta>();
        var clock = services.GetRequiredService<TimeProvider>();

        var correo = seguridad.Correo(Requerido(config, "TUTORIA_ADMIN_EMAIL"));
        var password = Requerido(config, "TUTORIA_ADMIN_PASSWORD");
        SeguridadCuenta.Password(password, password);
        var nombres = Requerido(config, "TUTORIA_ADMIN_NOMBRES");
        var apellidos = Requerido(config, "TUTORIA_ADMIN_APELLIDOS");
        var escuelaAdmin = config["TUTORIA_ADMIN_ESCUELA"] is { Length: > 0 } e ? e : "E-IIS";
        var semestreActivo = config["TUTORIA_SEMESTRE_ACTIVO"] is { Length: > 0 } s ? s : "2026-II";

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(20261031)", ct);

        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(semillaSistema, ct));
        var catalogos = json.RootElement.GetProperty("catalogos");
        foreach (var grupo in CatalogosEstructurales)
            foreach (var item in catalogos.GetProperty(grupo).EnumerateArray())
            {
                var id = item.TryGetProperty("id", out var v) ? v.GetString()! : item.GetProperty("codigo").GetString()!;
                if (grupo == "escuelas" && id == "E-BIO") continue; // retirada en la migración 010
                if (!await db.Catalogos.AnyAsync(c => c.Tipo == grupo && c.Id == id, ct))
                    db.Catalogos.Add(new() { Tipo = grupo, Id = id, DatosJson = item.GetRawText() });
            }
        await db.SaveChangesAsync(ct);

        var semestre = catalogos.GetProperty("semestres").EnumerateArray().FirstOrDefault(x => x.GetProperty("id").GetString() == semestreActivo);
        if (semestre.ValueKind != JsonValueKind.Object) throw new InvalidOperationException($"El semestre {semestreActivo} no existe en el catálogo.");
        var escuelas = catalogos.GetProperty("escuelas").EnumerateArray().Select(x => x.GetProperty("id").GetString()!).Where(x => x != "E-BIO").ToArray();
        if (!escuelas.Contains(escuelaAdmin)) throw new InvalidOperationException($"La escuela {escuelaAdmin} no existe en el catálogo.");
        foreach (var escuela in escuelas)
        {
            var id = semestreActivo + "|" + escuela;
            if (!await db.Periodos.AnyAsync(p => p.Id == id, ct)) db.Periodos.Add(new() { Id = id, EscuelaId = escuela, SemestreId = semestreActivo });
            if (!await db.ConfiguracionPeriodos.AnyAsync(c => c.PeriodoId == id, ct))
                db.ConfiguracionPeriodos.Add(new() { PeriodoId = id, Inicio = semestre.GetProperty("inicio").GetString()!, Fin = semestre.GetProperty("fin").GetString()!,
                    EntrevistasHasta = semestre.GetProperty("inicio").GetString()!, InformesHasta = semestre.GetProperty("fin").GetString()! });
        }
        await db.SaveChangesAsync(ct);

        var existe = await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == correo && c.Rol == "coordinacion", ct);
        if (existe) Console.WriteLine($"El administrador {correo} ya existía; no se modificó.");
        else
        {
            var persona = new PersonaEntity { Id = "PER-" + Guid.NewGuid().ToString("N"), Tipo = "tutor", EscuelaId = escuelaAdmin };
            persona.DatosJson = JsonDatos.Serializar(new Dictionary<string, object?> { ["id"] = persona.Id, ["nombres"] = nombres.Trim(), ["apellidos"] = apellidos.Trim(),
                ["correo"] = correo, ["codigo"] = "", ["telefono"] = "", ["escuelaId"] = escuelaAdmin, ["departamento"] = "", ["categoria"] = null, ["dedicacion"] = null,
                ["activo"] = true, ["aforoMaximo"] = null, ["cursosAsignados"] = Array.Empty<string>() });
            db.Personas.Add(persona);
            var usuario = credenciales.Crear(persona, correo, "coordinacion", password, temporal: false);
            usuario.AdminInstitucional = true;
            db.Auditoria.Add(new() { Fecha = clock.GetUtcNow(), UsuarioId = usuario.Id, EscuelaId = escuelaAdmin, Accion = "bootstrap-admin-institucional", RecursoId = usuario.Id, Version = usuario.Version });
            await db.SaveChangesAsync(ct);
            Console.WriteLine($"Administrador institucional creado: {correo}. Cambia la contraseña inicial al ingresar.");
        }
        await tx.CommitAsync(ct);
    }

    /// <summary>
    /// Crea una cuenta ya verificada (sin enviar correo) para una persona del padrón.
    /// Variables: CUENTA_ROL (estudiante|tutor|coordinacion), CUENTA_CORREO, CUENTA_PASSWORD (15+ caracteres),
    /// opcionales CUENTA_PERSONA_ID (si el correo coincide con varias fichas) y CUENTA_ESCUELA (si la ficha no tiene escuela).
    /// </summary>
    public static async Task CrearCuenta(IServiceProvider services, IConfiguration config, CancellationToken ct = default)
    {
        var db = services.GetRequiredService<TutoriaDbContext>();
        var credenciales = services.GetRequiredService<CredencialesCuentaService>();
        var seguridad = services.GetRequiredService<SeguridadCuenta>();

        var rol = Requerido(config, "CUENTA_ROL");
        if (rol is not ("estudiante" or "tutor" or "coordinacion")) throw new InvalidOperationException("CUENTA_ROL debe ser estudiante, tutor o coordinacion.");
        var correo = seguridad.Correo(Requerido(config, "CUENTA_CORREO"));
        var password = Requerido(config, "CUENTA_PASSWORD");
        SeguridadCuenta.Password(password, password);
        var personaId = config["CUENTA_PERSONA_ID"];
        var escuela = config["CUENTA_ESCUELA"];

        await using var tx = await credenciales.Bloquear(correo, ct);
        if (await db.CredencialesCuenta.AnyAsync(c => c.CorreoNormalizado == correo && c.Rol == rol, ct))
            throw new InvalidOperationException("Ya existe una cuenta con ese correo y perfil.");
        var tipo = rol == "estudiante" ? "estudiante" : "tutor";
        var candidatos = (await db.Personas.Where(p => p.Tipo == tipo && p.Activa).ToArrayAsync(ct))
            .Where(p => JsonDatos.Texto(p.DatosJson, "correo").Trim().Equals(correo, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (personaId is { Length: > 0 }) candidatos = candidatos.Where(p => p.Id == personaId).ToArray();
        if (candidatos.Length == 0) throw new InvalidOperationException("Ninguna persona activa del padrón tiene ese correo. Impórtala primero o revisa el correo.");
        if (candidatos.Length > 1) throw new InvalidOperationException("El correo coincide con varias fichas: " + string.Join(", ", candidatos.Select(p => p.Id)) + ". Indica CUENTA_PERSONA_ID.");
        var persona = candidatos[0];
        if (await db.Usuarios.AnyAsync(u => u.PersonaId == persona.Id && u.Rol == rol && u.Issuer == SeguridadCuenta.Issuer, ct))
            throw new InvalidOperationException("La persona ya tiene una cuenta de este perfil.");
        if (persona.EscuelaId.Length == 0)
        {
            if (string.IsNullOrEmpty(escuela) || !await db.Catalogos.AnyAsync(c => c.Tipo == "escuelas" && c.Id == escuela, ct))
                throw new InvalidOperationException("La ficha no tiene escuela. Indica CUENTA_ESCUELA con un id válido (por ejemplo E-IIS).");
            persona.EscuelaId = escuela;
            var datos = JsonDatos.Leer<Dictionary<string, object?>>(persona.DatosJson); datos["escuelaId"] = escuela; persona.DatosJson = JsonDatos.Serializar(datos);
        }
        var usuario = credenciales.Crear(persona, correo, rol, password, temporal: false);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        Console.WriteLine($"Cuenta creada y verificada: {correo} ({rol}, {persona.Id}, {persona.EscuelaId}). Id de usuario: {usuario.Id}");
    }

    /// <summary>
    /// Crea cuentas verificadas del portal para las personas de la semilla de desarrollo (estudiantes, tutores y
    /// coordinación de prueba) con una misma contraseña. Ninguna recibe administración institucional.
    /// Variable: CUENTA_PASSWORD (15+ caracteres). Idempotente: omite las que ya existen.
    /// </summary>
    public static async Task CrearCuentasPrueba(IServiceProvider services, IConfiguration config, CancellationToken ct = default)
    {
        var db = services.GetRequiredService<TutoriaDbContext>();
        var credenciales = services.GetRequiredService<CredencialesCuentaService>();
        var seguridad = services.GetRequiredService<SeguridadCuenta>();
        var password = Requerido(config, "CUENTA_PASSWORD");
        // Solo cuentas de prueba: se admite una clave corta (la política de 15+ caracteres sigue vigente para el resto).
        if (password.Length is < 8 or > 128) throw new InvalidOperationException("CUENTA_PASSWORD debe tener entre 8 y 128 caracteres.");
        var reiniciar = config.GetValue<bool>("CUENTA_RESET");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(20261032)", ct);
        var origen = await db.Usuarios.AsNoTracking().Where(u => u.Issuer == "local-development" && u.Activo).OrderBy(u => u.Rol).ThenBy(u => u.Id).ToArrayAsync(ct);
        var personas = await db.Personas.Where(p => origen.Select(u => u.PersonaId).Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
        var creadas = 0; var omitidas = 0; var reiniciadas = 0;
        foreach (var u in origen)
        {
            if (!personas.TryGetValue(u.PersonaId, out var persona) || persona.EscuelaId.Length == 0) { omitidas++; continue; }
            string correo;
            try { correo = seguridad.Correo(JsonDatos.Texto(persona.DatosJson, "correo")); }
            catch (TutoriaError) { omitidas++; continue; }
            var existente = await db.CredencialesCuenta.FirstOrDefaultAsync(c => c.CorreoNormalizado == correo && c.Rol == u.Rol, ct);
            var existe = existente is not null
                || await db.Usuarios.AnyAsync(x => x.PersonaId == persona.Id && x.Rol == u.Rol && x.Issuer == SeguridadCuenta.Issuer, ct)
                || db.CredencialesCuenta.Local.Any(c => c.CorreoNormalizado == correo && c.Rol == u.Rol);
            if (existe && reiniciar && existente is not null)
            {
                credenciales.CambiarPassword(existente, password);
                existente.Verificada = true; existente.CambioObligatorio = false; existente.TemporalHasta = null;
                existente.IntentosFallidos = 0; existente.BloqueadaHasta = null;
                Console.WriteLine($"{u.Rol,-13} {correo} (clave reiniciada)");
                reiniciadas++; continue;
            }
            if (existe) { omitidas++; continue; }
            credenciales.Crear(persona, correo, u.Rol, password, temporal: false);
            Console.WriteLine($"{u.Rol,-13} {correo}");
            creadas++;
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        Console.WriteLine($"Cuentas de prueba creadas: {creadas}. Claves reiniciadas: {reiniciadas}. Omitidas (ya existían o sin correo válido): {omitidas}.");
    }

    private static string Requerido(IConfiguration config, string clave) =>
        config[clave] is { Length: > 0 } valor ? valor : throw new InvalidOperationException($"Falta la variable de entorno {clave}.");
}
