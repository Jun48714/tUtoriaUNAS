import { useState } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import { Eye, EyeOff } from '../ui/icons';
import type { Icono } from '../ui/icons';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Icono SVG del contenido del campo, p. ej. `Lock`. */
  icon: Icono;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Campo del diseño «Selva»: etiqueta en mayúsculas sobre una caja de 48 px
 * con una ilustración de su contenido a la izquierda y, en los campos de
 * contraseña, el botón de ojo a la derecha.
 */
export function FormField({
  label,
  icon: IconoCampo,
  error,
  type = 'text',
  id,
  ...props
}: FormFieldProps) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__shell">
        <IconoCampo className="field__fa-icon" aria-hidden="true" />
        <input
          {...props}
          id={id}
          className="field__input field__input--fa"
          type={password && visible ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {password && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff data-eye-off /> : <Eye data-eye />}
          </button>
        )}
      </span>
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  );
}
