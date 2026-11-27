import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSistema } from '../../hooks/useSistema';
import { guardarContactoApi } from '../../services/apiSistema';
import { esCorreo, esEnteroEnRango } from '../../utils/validacion';
import { Alert } from '../ui/Alert';
import { SuccessNotice } from '../ui/SuccessNotice';

interface Contacto {
  correo: string;
  telefono: string;
  version: number;
}
interface ErroresContacto {
  correo?: string;
  telefono?: string;
}

function validarContacto(correo: string, telefono: string): ErroresContacto {
  const errores: ErroresContacto = {};
  const correoLimpio = correo.trim();
  const telefonoLimpio = telefono.trim();
  if (!esCorreo(correoLimpio)) errores.correo = 'Revisa el correo de contacto.';
  else if (correoLimpio.length > 254) errores.correo = 'Usa como máximo 254 caracteres.';
  if (telefonoLimpio.length > 40) errores.telefono = 'Usa como máximo 40 caracteres.';
  return errores;
}

export function ContactoPersistente() {
  const sistema = useSistema();
  const data = sistema?.contacto;
  const [guardado, setGuardado] = useState<Contacto | null>(null);
  const [edicion, setEdicion] = useState<{ correo: string; telefono: string } | null>(null);
  const [errores, setErrores] = useState<ErroresContacto>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const intentado = useRef(false);

  if (!data) return <p role="status">Cargando contacto…</p>;
  const base = guardado && guardado.version >= data.version ? guardado : data;
  const correo = edicion?.correo ?? base.correo;
  const telefono = edicion?.telefono ?? base.telefono;

  function actualizar(campo: 'correo' | 'telefono', valor: string) {
    const siguiente = { correo, telefono, [campo]: valor };
    setEdicion(siguiente);
    if (intentado.current) setErrores(validarContacto(siguiente.correo, siguiente.telefono));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    intentado.current = true;
    const validacion = validarContacto(correo, telefono);
    setErrores(validacion);
    if (validacion.correo || validacion.telefono) return;
    if (!esEnteroEnRango(base.version, 0)) {
      setError('La versión del contacto no es válida.');
      return;
    }
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      const respuesta = await guardarContactoApi({
        correo: correo.trim(),
        telefono: telefono.trim(),
        version: base.version,
      });
      setGuardado(respuesta);
      setEdicion(null);
      intentado.current = false;
      setMensaje('Contacto guardado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el contacto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="stack" noValidate onSubmit={onSubmit}>
      {error && (
        <Alert tone="riesgo" title="No se guardó el contacto">
          {error}
        </Alert>
      )}
      <label className="field">
        <span>Correo de contacto</span>
        <input
          className="input"
          name="correo"
          type="email"
          autoComplete="email"
          disabled={guardando}
          aria-invalid={!!errores.correo}
          value={correo}
          onChange={(e) => actualizar('correo', e.target.value)}
        />
        {errores.correo && <span role="alert">{errores.correo}</span>}
      </label>
      <label className="field">
        <span>Teléfono o anexo</span>
        <input
          className="input"
          name="telefono"
          type="tel"
          autoComplete="tel"
          disabled={guardando}
          aria-invalid={!!errores.telefono}
          value={telefono}
          onChange={(e) => actualizar('telefono', e.target.value)}
        />
        {errores.telefono && <span role="alert">{errores.telefono}</span>}
      </label>
      <p className="small muted">
        Los datos académicos y el correo institucional los actualiza el área responsable.
      </p>
      <div className="ui-row ui-row--between ui-row--wrap">
        {mensaje && <SuccessNotice>{mensaje}</SuccessNotice>}
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
