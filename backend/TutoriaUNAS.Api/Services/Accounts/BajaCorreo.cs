using Microsoft.EntityFrameworkCore;
using TutoriaUNAS.Api.Data;

namespace TutoriaUNAS.Api.Services.Accounts;

/// <summary>
/// Regla única para "no escribir a quien fue dado de baja": un correo está de baja cuando sus cuentas están
/// deshabilitadas por coordinación (o su ficha del padrón está inactiva) y no queda ninguna vigente.
/// Una cuenta pendiente de vinculación (sin escuela) no cuenta como baja: debe poder activarse.
/// </summary>
public static class BajaCorreo
{
    public static async Task<bool> Consultar(TutoriaDbContext db, string correo, CancellationToken ct)
    {
        correo = correo.Trim().ToLowerInvariant();
        var cuentas = await (from c in db.CredencialesCuenta.AsNoTracking()
                             join u in db.Usuarios.AsNoTracking() on c.UsuarioId equals u.Id
                             join p in db.Personas.AsNoTracking() on u.PersonaId equals p.Id
                             where c.CorreoNormalizado == correo
                             select new { u.Activo, u.EscuelaId, p.Activa }).ToArrayAsync(ct);
        // Con cuenta: manda el estado de las cuentas. Si hubo varias (perfiles), basta una vigente para escribir.
        if (cuentas.Length > 0) return !cuentas.Any(x => (x.Activo || x.EscuelaId.Length == 0) && x.Activa);
        // Sin cuenta: solo hay baja si existe ficha en el padrón y todas están inactivas. Un correo desconocido no es baja.
        var fichas = await db.Personas.FromSqlInterpolated($"SELECT * FROM \"Personas\" WHERE lower(\"DatosJson\"::json->>'correo') = {correo}")
            .AsNoTracking().Select(p => p.Activa).ToArrayAsync(ct);
        return fichas.Length > 0 && !fichas.Any(a => a);
    }
}
