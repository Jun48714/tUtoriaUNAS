import { useId } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { CampoFormato, CodigoFormato } from '../../../types/domain';
import { cambiarTipo, tiposPregunta, usaOpciones } from '../../../utils/editorFormatos';
import { opcionBreve } from '../../../data/presentacionFormatos';

export function TextoEditor({
  etiqueta,
  valor,
  onChange,
  largo = false,
  maxLength = 500,
}: {
  etiqueta: string;
  valor: string;
  onChange(valor: string): void;
  largo?: boolean;
  maxLength?: number;
}) {
  const props = {
    value: valor,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    maxLength,
  };
  return (
    <label className="fe-field">
      <span>{etiqueta}</span>
      {largo ? (
        <textarea className="textarea" rows={2} {...props} />
      ) : (
        <input className="input" {...props} />
      )}
    </label>
  );
}

export function BotonEditor({
  etiqueta,
  icono,
  onClick,
  disabled = false,
}: {
  etiqueta: string;
  icono: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="fe-tool"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      disabled={disabled}
    >
      <i className={`fa-solid fa-${icono}`} aria-hidden="true" />
    </button>
  );
}

const opcionesDe = (campo: CampoFormato) =>
  campo.tipo === 'booleano' ? ['Sí', 'No'] : (campo.opciones ?? []);
const textoOpcion = (campo: CampoFormato, formato: CodigoFormato, opcion: string) =>
  campo.rotulosOpciones?.[opcion] ?? opcionBreve(formato, campo.codigo, opcion);
const pistasRespuesta: Partial<Record<CampoFormato['tipo'], string>> = {
  fecha: 'dd/mm/aaaa',
  hora: 'hh:mm',
  numero: '0',
};

export function VistaRespuesta({
  campo,
  formato,
}: {
  campo: CampoFormato;
  formato: CodigoFormato;
}) {
  if (usaOpciones(campo.tipo) || campo.tipo === 'booleano')
    return (
      <div className="fe-answer-options">
        {opcionesDe(campo).map((opcion) => (
          <label className="fe-answer-option" key={opcion}>
            <input type={campo.tipo === 'multiple' ? 'checkbox' : 'radio'} disabled />
            <span>{textoOpcion(campo, formato, opcion)}</span>
          </label>
        ))}
      </div>
    );
  if (campo.tipo === 'tabla')
    return (
      <div className="fe-table-preview">
        {campo.columnas?.map((c) => (
          <div key={c.codigo}>
            <span>{c.etiqueta}</span>
            <span className="fe-answer-line" />
          </div>
        ))}
      </div>
    );
  return (
    <input
      className={`fe-answer-placeholder${campo.tipo === 'texto-largo' ? ' is-long' : ''}`}
      aria-label="Vista de la respuesta"
      disabled
      placeholder={pistasRespuesta[campo.tipo] ?? 'Escribe tu respuesta'}
    />
  );
}

interface PropiedadesPregunta {
  campo: CampoFormato;
  integrado: boolean;
  onChange(campo: CampoFormato): void;
}

export function EditorPregunta({
  campo,
  formato,
  campos,
  integrado,
  onChange,
  herramientas,
  destino,
}: PropiedadesPregunta & {
  formato: CodigoFormato;
  campos: CampoFormato[];
  herramientas: ReactNode;
  destino: ReactNode;
}) {
  const tipoId = useId();
  const actualizar = (cambio: Partial<CampoFormato>) => onChange({ ...campo, ...cambio });
  return (
    <div className="fe-inline-editor">
      <EditorRespuesta campo={campo} formato={formato} integrado={integrado} onChange={onChange} />
      <div className="fe-question-settings">
        <label htmlFor={tipoId} className="sr-only">
          Tipo de respuesta
        </label>
        <select
          id={tipoId}
          className="fe-type"
          value={campo.tipo}
          disabled={integrado}
          title={integrado ? 'Tipo vinculado a los datos del sistema' : 'Tipo de respuesta'}
          onChange={(e) => onChange(cambiarTipo(campo, e.target.value as CampoFormato['tipo']))}
        >
          {tiposPregunta.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <label className="fe-check">
          <input
            type="checkbox"
            checked={campo.obligatorio}
            onChange={(e) => actualizar({ obligatorio: e.target.checked })}
          />{' '}
          Obligatoria
        </label>
      </div>
      <details className="fe-more">
        <summary>Más ajustes{campo.visibleSi ? ' · Condicional' : ''}</summary>
        <div>
          <TextoEditor
            etiqueta="Ayuda (opcional)"
            valor={campo.ayuda ?? ''}
            largo
            maxLength={1000}
            onChange={(ayuda) => actualizar({ ayuda })}
          />
          {!integrado && <CondicionPregunta campo={campo} campos={campos} onChange={onChange} />}
          {destino}
        </div>
      </details>
      <div className="fe-question-tools">{herramientas}</div>
    </div>
  );
}

function EditorRespuesta(props: PropiedadesPregunta & { formato: CodigoFormato }) {
  if (usaOpciones(props.campo.tipo) || props.campo.tipo === 'booleano')
    return <OpcionesPregunta {...props} />;
  if (props.campo.tipo === 'tabla') return <ColumnasPregunta {...props} />;
  return <VistaRespuesta campo={props.campo} formato={props.formato} />;
}

function OpcionesPregunta({
  campo,
  formato,
  integrado,
  onChange,
}: PropiedadesPregunta & { formato: CodigoFormato }) {
  const opciones = opcionesDe(campo);
  const fijas =
    campo.tipo === 'booleano' ||
    (integrado && ['resultado', 'areaDerivacion', 'area', 'motivo'].includes(campo.codigo));
  function agregarOpcion() {
    const valor = `opcion_${crypto.randomUUID()}`;
    onChange({
      ...campo,
      opciones: [...opciones, valor],
      rotulosOpciones: { ...campo.rotulosOpciones, [valor]: 'Nueva opción' },
    });
  }
  return (
    <div className="fe-edit-options">
      {opciones.map((opcion, i) => (
        <div className="fe-edit-option" key={`${campo.codigo}-${i}`}>
          <input
            type={campo.tipo === 'multiple' ? 'checkbox' : 'radio'}
            disabled
            aria-label={`Indicador de opción ${i + 1}`}
          />
          <input
            className="fe-option-text"
            aria-label={`Opción ${i + 1}`}
            value={textoOpcion(campo, formato, opcion)}
            maxLength={200}
            onChange={(e) =>
              onChange({
                ...campo,
                rotulosOpciones: { ...campo.rotulosOpciones, [opcion]: e.target.value },
              })
            }
          />
          {!fijas && (
            <BotonEditor
              etiqueta={`Eliminar opción ${i + 1}`}
              icono="xmark"
              disabled={opciones.length <= 1}
              onClick={() => {
                const rotulos = { ...campo.rotulosOpciones };
                delete rotulos[opcion];
                onChange({
                  ...campo,
                  opciones: opciones.filter((_, j) => j !== i),
                  rotulosOpciones: rotulos,
                });
              }}
            />
          )}
        </div>
      ))}
      {!fijas && (
        <button type="button" className="fe-add" onClick={agregarOpcion}>
          Añadir opción
        </button>
      )}
    </div>
  );
}

function ColumnasPregunta({ campo, integrado, onChange }: PropiedadesPregunta) {
  const columnas = campo.columnas ?? [];
  const actualizar = (indice: number, cambio: Partial<(typeof columnas)[number]>) =>
    onChange({
      ...campo,
      columnas: columnas.map((c, i) => (i === indice ? { ...c, ...cambio } : c)),
    });
  return (
    <div className="fe-edit-columns">
      {columnas.map((col, i) => (
        <div key={col.codigo}>
          <input
            className="fe-option-text"
            aria-label={`Columna ${i + 1}`}
            value={col.etiqueta}
            maxLength={200}
            onChange={(e) => actualizar(i, { etiqueta: e.target.value })}
          />
          {!integrado && (
            <>
              <select
                className="fe-type"
                aria-label={`Tipo de columna ${i + 1}`}
                value={col.tipo ?? 'texto'}
                onChange={(e) =>
                  actualizar(i, {
                    tipo: e.target.value as typeof col.tipo,
                    opciones: e.target.value === 'seleccion' ? ['Opción 1', 'Opción 2'] : undefined,
                  })
                }
              >
                {['texto', 'numero', 'fecha', 'seleccion'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <BotonEditor
                etiqueta={`Eliminar columna ${i + 1}`}
                icono="xmark"
                disabled={columnas.length <= 1}
                onClick={() => onChange({ ...campo, columnas: columnas.filter((_, j) => j !== i) })}
              />
            </>
          )}
          {col.tipo === 'seleccion' && !integrado && (
            <TextoEditor
              etiqueta={`Opciones de columna ${i + 1} (una por línea)`}
              valor={col.opciones?.join('\n') ?? ''}
              largo
              onChange={(texto) => actualizar(i, { opciones: texto.split('\n') })}
            />
          )}
        </div>
      ))}
      {!integrado && (
        <button
          type="button"
          className="fe-add"
          onClick={() =>
            onChange({
              ...campo,
              columnas: [
                ...columnas,
                {
                  codigo: `col_${crypto.randomUUID().replaceAll('-', '')}`,
                  etiqueta: 'Nueva columna',
                  tipo: 'texto',
                },
              ],
            })
          }
        >
          Añadir columna
        </button>
      )}
    </div>
  );
}

function CondicionPregunta({
  campo,
  campos,
  onChange,
}: {
  campo: CampoFormato;
  campos: CampoFormato[];
  onChange(campo: CampoFormato): void;
}) {
  const posibles = campos.filter(
    (c) => c.codigo !== campo.codigo && ['seleccion', 'escala', 'booleano'].includes(c.tipo),
  );
  const padre = posibles.find((c) => c.codigo === campo.visibleSi?.campo);
  return (
    <div className="fe-condition">
      <label className="fe-field">
        <span>Mostrar esta pregunta</span>
        <select
          className="select"
          value={campo.visibleSi?.campo ?? ''}
          onChange={(e) =>
            onChange({
              ...campo,
              visibleSi: e.target.value ? { campo: e.target.value, valores: [] } : undefined,
            })
          }
        >
          <option value="">Siempre</option>
          {posibles.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </label>
      {padre && (
        <div>
          {opcionesDe(padre).map((opcion) => (
            <label className="fe-check" key={opcion}>
              <input
                type="checkbox"
                checked={campo.visibleSi?.valores.includes(opcion) ?? false}
                onChange={(e) =>
                  onChange({
                    ...campo,
                    visibleSi: {
                      campo: padre.codigo,
                      valores: e.target.checked
                        ? [...campo.visibleSi!.valores, opcion]
                        : campo.visibleSi!.valores.filter((v) => v !== opcion),
                    },
                  })
                }
              />
              {padre.rotulosOpciones?.[opcion] ?? opcion}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
