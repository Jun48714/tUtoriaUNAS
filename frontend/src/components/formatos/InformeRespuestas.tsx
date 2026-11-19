import { useId, useState } from 'react';
import type { CampoFormato, DefinicionFormato } from '../../types/domain';
import { filasDe } from '../../utils/exportFormatos';
import { ChevronLeft, ChevronRight } from '../ui/icons';
import { RespuestaInforme } from './RespuestaInforme';

/** Una pregunta y, para las tablas, un registro a la vez. */
export function InformeRespuestas({
  definicion,
  respuestas,
}: {
  definicion: DefinicionFormato;
  respuestas: Record<string, string>;
}) {
  const selectId = useId();
  const preguntas = definicion.secciones.flatMap((seccion, indiceSeccion) =>
    seccion.campos.map((campo) => ({ seccion: seccion.titulo, indiceSeccion, campo })),
  );
  const [indice, setIndice] = useState(0);
  const actualIndice = Math.min(indice, Math.max(0, preguntas.length - 1));
  const actual = preguntas[actualIndice];

  if (!actual) return <p>Este informe no tiene preguntas.</p>;
  return (
    <section className="informe-respuestas" aria-label="Respuestas del informe">
      <div className="informe-respuestas__navegacion">
        <label className="sr-only" htmlFor={selectId}>
          Seleccionar pregunta
        </label>
        <select
          id={selectId}
          className="select"
          value={actualIndice}
          onChange={(evento) => setIndice(Number(evento.target.value))}
        >
          {definicion.secciones.map((seccion, indiceSeccion) => (
            <optgroup label={seccion.titulo} key={indiceSeccion}>
              {preguntas.map(
                (pregunta, numero) =>
                  pregunta.indiceSeccion === indiceSeccion && (
                    <option value={numero} key={pregunta.campo.codigo}>
                      {numero + 1}. {pregunta.campo.etiqueta}
                    </option>
                  ),
              )}
            </optgroup>
          ))}
        </select>
        <span className="informe-respuestas__contador" aria-live="polite">
          {actualIndice + 1} de {preguntas.length}
        </span>
        <div className="informe-respuestas__botones">
          <button
            type="button"
            className="btn btn-falcon-default btn-sm"
            disabled={actualIndice === 0}
            onClick={() => setIndice(actualIndice - 1)}
            aria-label="Anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-falcon-default btn-sm"
            disabled={actualIndice === preguntas.length - 1}
            onClick={() => setIndice(actualIndice + 1)}
            aria-label="Siguiente"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <article className="informe-respuestas__pregunta" aria-live="polite">
        <p className="informe-respuestas__seccion">{actual.seccion}</p>
        <h3>
          {actualIndice + 1}. {actual.campo.etiqueta}
        </h3>
        {actual.campo.tipo === 'tabla' ? (
          <RegistrosInforme
            key={actual.campo.codigo}
            campo={actual.campo}
            respuestas={respuestas}
          />
        ) : (
          <div className="informe-respuestas__valor">
            <RespuestaInforme campo={actual.campo} respuestas={respuestas} />
          </div>
        )}
      </article>
    </section>
  );
}

function RegistrosInforme({
  campo,
  respuestas,
}: {
  campo: CampoFormato;
  respuestas: Record<string, string>;
}) {
  const filas = filasDe(respuestas, campo.codigo);
  const [indice, setIndice] = useState(0);
  const actual = Math.min(indice, Math.max(0, filas.length - 1));
  const fila = filas[actual];
  if (!fila) return <p className="informe-respuestas__vacio">Sin registros</p>;
  const columnasDefinidas = campo.columnas ?? [];
  const columnas = [
    ...columnasDefinidas,
    ...Object.keys(fila)
      .filter((codigo) => !columnasDefinidas.some((columna) => columna.codigo === codigo))
      .map((codigo) => ({ codigo, etiqueta: codigo })),
  ];
  return (
    <div className="informe-registro">
      <div className="informe-registro__cabecera">
        <strong aria-live="polite">
          Registro {actual + 1} de {filas.length}
        </strong>
        {filas.length > 1 && (
          <div className="informe-respuestas__botones">
            <button
              type="button"
              className="btn btn-falcon-default btn-sm"
              disabled={actual === 0}
              onClick={() => setIndice(actual - 1)}
              aria-label="Registro anterior"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-falcon-default btn-sm"
              disabled={actual === filas.length - 1}
              onClick={() => setIndice(actual + 1)}
              aria-label="Registro siguiente"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <dl className="informe-registro__campos">
        {columnas.map((columna) => (
          <div key={columna.codigo}>
            <dt>{columna.etiqueta}</dt>
            <dd>{fila[columna.codigo] || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
