import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FormField } from '../../components/forms/FormField';
import { CircleCheck, MailSolid } from '../../components/ui/iconosAcceso';
import { API_MODE } from '../../services/apiConfig';
import { esCorreo } from '../../utils/validacion';
import { AccountSetupPage } from './AccountSetupPage';

const SEND_PAUSE = 800;
const RESEND_PAUSE = 700;
const RESEND_RESET = 3000;

function validarCorreoRecuperacion(valor: string): string | undefined {
  if (!esCorreo(valor)) return 'Ingresa un correo válido.';
  if (valor.length > 254) return 'El correo es demasiado largo.';
  return undefined;
}

export function RecoveryPage() {
  return API_MODE ? <AccountSetupPage modo="recuperacion" /> : <DemoRecoveryPage />;
}
function DemoRecoveryPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [resendLabel, setResendLabel] = useState('Reenviar enlace');
  const intentado = useRef(false);
  const resendTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resendTimer.current) window.clearTimeout(resendTimer.current);
    },
    [],
  );

  function revalidar(event: ChangeEvent<HTMLInputElement>) {
    if (!intentado.current) return;
    setError(validarCorreoRecuperacion(event.currentTarget.value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') ?? '');
    intentado.current = true;
    const mensaje = validarCorreoRecuperacion(email);
    setError(mensaje);
    if (mensaje) {
      form.querySelector<HTMLInputElement>('#recovery-email')?.focus();
      return;
    }
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setSentTo(email.trim());
    }, SEND_PAUSE);
  }

  function resend() {
    if (resendTimer.current) window.clearTimeout(resendTimer.current);
    setResendLabel('Enviando…');
    window.setTimeout(() => {
      setResendLabel('¡Enviado! ✓');
      resendTimer.current = window.setTimeout(
        () => setResendLabel('Reenviar enlace'),
        RESEND_RESET,
      );
    }, RESEND_PAUSE);
  }

  return (
    <div className="d01__form-wrap">
      {sentTo === null && (
        <div id="recovery-intro">
          <h2 className="d01__title">¿Olvidaste tu contraseña?</h2>
        </div>
      )}

      {/* Formulario (visible por defecto) */}
      {sentTo === null && (
        <form
          className="d01__form stack"
          id="recovery-form"
          aria-busy={sending}
          noValidate
          onSubmit={submit}
        >
          <FormField
            id="recovery-email"
            name="email"
            label="Correo institucional"
            icon={MailSolid}
            type="email"
            placeholder="ejemplo@unas.edu.pe"
            autoComplete="email"
            maxLength={254}
            disabled={sending}
            error={error}
            onChange={revalidar}
          />

          <button
            className="btn w-100 d01__cta"
            type="submit"
            id="recovery-submit"
            disabled={sending}
          >
            <span hidden={!sending} className="spin" aria-hidden="true" />
            <span id="recovery-btn-label">{sending ? 'Enviando…' : 'Enviar enlace'}</span>
          </button>
        </form>
      )}

      {/* Estado de éxito */}
      {sentTo !== null && (
        <div className="recovery-success" id="recovery-success" role="status">
          <div className="recovery-success__icon" aria-hidden="true">
            <CircleCheck aria-hidden="true" />
          </div>
          <h3 className="recovery-success__title">¡Enlace enviado!</h3>
          <p className="recovery-success__desc">
            Correo: <strong id="sent-email-display">{sentTo}</strong>
          </p>
          <p className="recovery-success__note">
            Válido por 15 minutos. Revisa también tu carpeta de spam.
          </p>
          <div className="recovery-success__actions">
            <Link to="/login" className="btn w-100 d01__cta">
              Volver al inicio de sesión
            </Link>
            <button
              type="button"
              className="d01__link-btn"
              id="btn-resend"
              onClick={resend}
              disabled={resendLabel !== 'Reenviar enlace'}
            >
              {resendLabel}
            </button>
          </div>
        </div>
      )}
      <p className="d01__demo-note">Entorno de demostración · El envío del correo se simula.</p>
    </div>
  );
}
