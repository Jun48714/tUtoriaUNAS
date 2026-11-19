import type { Dispatch, SetStateAction } from 'react';
import type { DefinicionFormato } from '../../../types/domain';
import { TextoEditor } from './EditorPregunta';

const metadatos = [
  ['momento', 'Cuándo se responde'],
  ['periodicidad', 'Periodicidad'],
  ['destinatario', 'Destinatario'],
  ['version', 'Referencia de versión'],
  ['vigencia', 'Vigencia'],
  ['aprobacion', 'Aprobación'],
] as const;

export function EditorMetadatos({
  definicion,
  setDefinicion,
}: {
  definicion: DefinicionFormato;
  setDefinicion: Dispatch<SetStateAction<DefinicionFormato>>;
}) {
  return (
    <div className="fe-form-heading">
      <input
        className="fe-form-title"
        aria-label="Título del formulario"
        value={definicion.nombre}
        maxLength={1000}
        onChange={(e) => setDefinicion((d) => ({ ...d, nombre: e.target.value }))}
      />
      <textarea
        className="fe-form-description"
        aria-label="Descripción del formulario"
        value={definicion.proposito}
        rows={1}
        maxLength={1000}
        onChange={(e) => setDefinicion((d) => ({ ...d, proposito: e.target.value }))}
      />
      <details className="fe-metadata">
        <summary>Ajustes del formulario</summary>
        <div className="fe-grid">
          {metadatos.map(([propiedad, etiqueta]) => (
            <TextoEditor
              key={propiedad}
              etiqueta={etiqueta}
              valor={definicion[propiedad]}
              maxLength={1000}
              onChange={(valor) => setDefinicion((d) => ({ ...d, [propiedad]: valor }))}
            />
          ))}
          <TextoEditor
            etiqueta="Firmas (una por línea)"
            valor={definicion.visaciones.join('\n')}
            largo
            onChange={(valor) => setDefinicion((d) => ({ ...d, visaciones: valor.split('\n') }))}
          />
          <label className="fe-check">
            <input
              type="checkbox"
              checked={definicion.obligatorio}
              onChange={(e) => setDefinicion((d) => ({ ...d, obligatorio: e.target.checked }))}
            />{' '}
            Formulario obligatorio
          </label>
        </div>
      </details>
    </div>
  );
}
