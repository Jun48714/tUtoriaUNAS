import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FormField } from '../../components/forms/FormField';
import { IdCardSolid, Lock } from '../../components/ui/iconosAcceso';
import { dashboardPath } from '../../utils/roles';
import { API_MODE } from '../../services/apiConfig';
import { ActivacionRequerida } from '../../services/cuentas';
import { preloadLoginDestination } from '../../routes/portalPages';
import { validarAcceso, validarCampoAcceso } from '../../utils/validacionAcceso';
import type { ErroresAcceso } from '../../utils/validacionAcceso';

/**
 * El formulario usa campos no controlados y validación simple, sin react-hook-form ni valibot: esas
 * bibliotecas pesan ~60 KB y retrasarían el primer render de la pantalla inicial. Conserva el
 * comportamiento de antes: valida al enviar, enfoca el primer campo inválido y, tras el primer
 * intento, revalida cada campo mientras se escribe.
 */
export function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErroresAcceso>({});
  const intentado = useRef(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;

  function revalidar(event: ChangeEvent<HTMLInputElement>) {
    if (!intentado.current) return;
    const campo = event.currentTarget.name as keyof ErroresAcceso;
    const mensaje = validarCampoAcceso(campo, event.currentTarget.value);
    setErrors((actuales) => ({ ...actuales, [campo]: mensaje }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const datos = new FormData(form);
    const identifier = String(datos.get('identifier') ?? '').trim();
    const password = String(datos.get('password') ?? '');
    const remember = datos.has('remember');
    intentado.current = true;
    const invalidos = validarAcceso(identifier, password);
    setErrors(invalidos);
    const primero = invalidos.identifier ? 'identifier' : invalidos.password ? 'password' : null;
    if (primero) {
      form.querySelector<HTMLInputElement>(`#${primero}`)?.focus();
      return;
    }
    setFailure(null);
    setBusy(true);
    preloadLoginDestination();
    try {
      await login({ identifier, password }, remember);
    } catch (error) {
      if (error instanceof ActivacionRequerida) {
        navigate('/verificar-cuenta', { replace: true });
        return;
      }
      setBusy(false);
      setFailure(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
    }
  }

  return (
    <div className="d01__form-wrap">
      <div className="d01__intro">
        <h2 className="d01__title" id="login-title">
          Inicia sesión
        </h2>
      </div>

      <form
        className="d01__form stack"
        aria-labelledby="login-title"
        aria-busy={busy}
        onSubmit={submit}
        noValidate
      >
        <FormField
          id="identifier"
          name="identifier"
          label="Correo institucional o usuario"
          icon={IdCardSolid}
          placeholder="nombre@unas.edu.pe"
          autoComplete="username"
          maxLength={254}
          disabled={busy}
          error={errors.identifier}
          onChange={revalidar}
        />

        <FormField
          id="password"
          name="password"
          label="Contraseña"
          icon={Lock}
          type="password"
          placeholder="••••••••••"
          autoComplete="current-password"
          maxLength={128}
          disabled={busy}
          error={errors.password}
          onChange={revalidar}
        />

        <div className="between d01__opts">
          <label className="checkbox">
            <input type="checkbox" name="remember" defaultChecked disabled={busy} /> Mantener mi
            sesión
          </label>
          <Link className="link-soft" to="/recuperar-clave">
            ¿Olvidaste tu clave?
          </Link>
        </div>

        <button className="btn w-100 d01__cta" type="submit" disabled={busy}>
          <span hidden={!busy} className="spin" aria-hidden="true" />
          <span data-btn-label>{busy ? 'Verificando credenciales…' : 'Ingresar'}</span>
        </button>

        {failure && (
          <p className="d01__ok d01__ok--error" role="alert">
            {failure}
          </p>
        )}
      </form>
      {API_MODE ? (
        <p className="d01__demo-note">
          ¿Aún no tienes cuenta?{' '}
          <Link className="link-soft" to="/crear-cuenta">
            Crear cuenta
          </Link>
        </p>
      ) : (
        <p className="d01__demo-note">Entorno de demostración · Accede con una cuenta de prueba.</p>
      )}
    </div>
  );
}
