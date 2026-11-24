import { Link } from 'react-router-dom';
import { FormField } from '../../components/forms/FormField';
import { KeyRound, Lock, MailSolid } from '../../components/ui/iconosAcceso';
import { useCuentaSetup } from '../../hooks/useCuentaSetup';
import type { ModoCuenta } from '../../hooks/useCuentaSetup';
import type { Role } from '../../types/auth';
import { API_MODE } from '../../services/apiConfig';
import '../../styles/account-access.css';

export function AccountSetupPage({ modo }: { modo: ModoCuenta }) {
  const c = useCuentaSetup(modo);
  const titulo =
    modo === 'activacion'
      ? 'Verifica tu cuenta'
      : modo === 'recuperacion'
        ? 'Recupera tu contraseña'
        : 'Crea tu cuenta';
  if (!API_MODE || (modo === 'activacion' && !c.activacion))
    return (
      <div className="d01__form-wrap">
        <h2 className="d01__title">{titulo}</h2>
        <p className="d01__sub">
          {!API_MODE
            ? 'Este servicio está disponible al conectar con el servidor institucional.'
            : 'Ingresa con tu contraseña temporal para iniciar la verificación.'}
        </p>
        <Link to="/login" className="d01__link-btn">
          Volver al inicio de sesión
        </Link>
      </div>
    );
  return (
    <div className="d01__form-wrap account-access">
      <h2 className="d01__title">{titulo}</h2>
      {c.fase === 'correo' && modo === 'activacion' && <p className="d01__sub">{c.correo}</p>}
      {c.fase === 'codigo' && (
        <p className="d01__sub">
          Si está registrado, enviamos un código a <strong>{c.correo.trim()}</strong>.
        </p>
      )}
      {c.fase !== 'terminado' && (
        <p className="small muted" aria-label="Paso actual">
          Paso {c.fase === 'correo' ? 1 : c.fase === 'codigo' ? 2 : 3} de 3
        </p>
      )}
      <form
        className="d01__form stack"
        aria-busy={c.ocupado}
        onSubmit={(e) => {
          e.preventDefault();
          void (c.fase === 'correo'
            ? c.solicitar()
            : c.fase === 'codigo'
              ? c.confirmar()
              : c.completar());
        }}
      >
        {c.fase === 'correo' && (
          <>
            {modo !== 'activacion' && (
              <>
                <FormField
                  id="account-email"
                  label="Correo institucional"
                  icon={MailSolid}
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@unas.edu.pe"
                  maxLength={254}
                  required
                  disabled={c.ocupado}
                  value={c.correo}
                  onChange={(e) => c.setCorreo(e.target.value)}
                  error={
                    c.validacion && c.validacion.estado !== 'ok' ? c.validacion.mensaje : undefined
                  }
                />
                {c.validando && <p className="small muted">Comprobando…</p>}
                {!c.validando && c.validacion?.estado === 'ok' && c.validacion.mensaje && (
                  <p className="small account-access__ok" role="status">
                    ✓ {c.validacion.mensaje}
                  </p>
                )}
                {modo === 'registro' && (
                  <label className="field">
                    <span className="field__label">Perfil</span>
                    <select
                      className="form-select"
                      aria-label="Perfil"
                      disabled={c.ocupado}
                      value={c.rol}
                      onChange={(e) => c.setRol(e.target.value as Role)}
                    >
                      <option value="estudiante">Estudiante</option>
                      <option value="tutor">Docente</option>
                    </select>
                  </label>
                )}
              </>
            )}
            <button
              type="submit"
              className="btn w-100 d01__cta"
              disabled={
                c.ocupado ||
                c.validando ||
                (modo !== 'activacion' && c.validacion !== null && c.validacion.estado !== 'ok')
              }
            >
              {c.ocupado
                ? 'Solicitando código…'
                : modo === 'activacion'
                  ? 'Verificar cuenta'
                  : 'Enviar código'}
            </button>
          </>
        )}
        {c.fase === 'codigo' && (
          <>
            <FormField
              id="account-code"
              label="Código de verificación"
              icon={KeyRound}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              disabled={c.ocupado}
              value={c.codigo}
              onChange={(e) => c.setCodigo(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="btn w-100 d01__cta" disabled={c.ocupado}>
              {c.ocupado ? 'Comprobando código…' : 'Confirmar código'}
            </button>
            <button
              type="button"
              className="d01__link-btn"
              disabled={c.ocupado || c.reenviarEn > 0}
              onClick={() => void c.solicitar()}
            >
              {c.reenviarEn > 0 ? `Reenviar en ${c.reenviarEn} s` : 'Reenviar código'}
            </button>
            <p className="small">Vence en 10 minutos. Revisa también el spam.</p>
          </>
        )}
        {c.fase === 'password' && (
          <>
            {c.perfiles.length > 1 && (
              <label className="field">
                <span className="field__label">Perfil a recuperar</span>
                <select
                  className="form-select"
                  aria-label="Perfil a recuperar"
                  disabled={c.ocupado}
                  value={c.perfilRecuperado}
                  onChange={(e) => c.setPerfilRecuperado(e.target.value as Role)}
                >
                  {c.perfiles.map((perfil) => (
                    <option key={perfil} value={perfil}>
                      {perfil === 'tutor'
                        ? 'Docente'
                        : perfil === 'coordinacion'
                          ? 'Coordinación'
                          : 'Estudiante'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <FormField
              id="account-password"
              label="Nueva contraseña"
              icon={Lock}
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              disabled={c.ocupado}
              value={c.password}
              onChange={(e) => c.setPassword(e.target.value)}
            />
            <FormField
              id="account-confirm"
              label="Confirmar nueva contraseña"
              icon={Lock}
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              disabled={c.ocupado}
              value={c.confirmacion}
              onChange={(e) => c.setConfirmacion(e.target.value)}
            />
            <p className="small">De 10 a 128 caracteres.</p>
            <button type="submit" className="btn w-100 d01__cta" disabled={c.ocupado}>
              {c.ocupado
                ? 'Guardando…'
                : modo === 'registro'
                  ? 'Crear cuenta e ingresar'
                  : 'Guardar contraseña e ingresar'}
            </button>
          </>
        )}
        {c.mensaje && (
          <p className="account-access__status" role="status">
            {c.mensaje}
          </p>
        )}
        {c.error && (
          <p className="field__error" role="alert">
            {c.error}
          </p>
        )}
      </form>
      <Link to="/login" className="d01__link-btn">
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
