import { SuccessNotice } from '../ui/SuccessNotice';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';
import { useSistema } from '../../hooks/useSistema';
import { guardarContactoApi } from '../../services/apiSistema';
import { Alert } from '../ui/Alert';

const schema = v.object({
  correo: v.pipe(
    v.string('Revisa el correo de contacto.'),
    v.email('Revisa el correo de contacto.'),
    v.maxLength(254),
  ),
  telefono: v.pipe(v.string(), v.maxLength(40, 'Usa como máximo 40 caracteres.')),
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
type Contacto = v.InferOutput<typeof schema>;
export function ContactoPersistente() {
  const sistema = useSistema();
  const data = sistema?.contacto;
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Contacto>({
    resolver: valibotResolver(schema),
    defaultValues: {
      correo: data?.correo ?? '',
      telefono: data?.telefono ?? '',
      version: data?.version ?? 0,
    },
  });
  useEffect(() => {
    if (data && !isDirty)
      reset({ correo: data.correo, telefono: data.telefono, version: data.version });
  }, [data, isDirty, reset]);
  if (!data) return <p role="status">Cargando contacto…</p>;
  return (
    <form
      className="stack"
      onSubmit={handleSubmit(async (values) => {
        setError('');
        setMensaje('');
        try {
          const guardado = await guardarContactoApi(values);
          reset({
            correo: guardado.correo,
            telefono: guardado.telefono,
            version: guardado.version,
          });
          setMensaje('Contacto guardado.');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo guardar el contacto.');
        }
      })}
    >
      {error && (
        <Alert tone="riesgo" title="No se guardó el contacto">
          {error}
        </Alert>
      )}
      <label className="field">
        <span>Correo de contacto</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          aria-invalid={!!errors.correo}
          {...register('correo')}
        />
        {errors.correo && <span role="alert">{errors.correo.message}</span>}
      </label>
      <label className="field">
        <span>Teléfono o anexo</span>
        <input
          className="input"
          type="tel"
          autoComplete="tel"
          disabled={isSubmitting}
          aria-invalid={!!errors.telefono}
          {...register('telefono')}
        />
        {errors.telefono && <span role="alert">{errors.telefono.message}</span>}
      </label>
      <p className="small muted">
        Los datos académicos y el correo institucional los actualiza el área responsable.
      </p>
      <div className="ui-row ui-row--between ui-row--wrap">
        {mensaje && <SuccessNotice>{mensaje}</SuccessNotice>}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
