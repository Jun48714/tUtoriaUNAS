import type { CampoFormato } from '../../types/domain';
import { filasDe, respuestaPublicada } from '../../utils/exportFormatos';
import '../../styles/vista-informe.css';

/** Representa las respuestas conforme a la versión del formato, incluidas tablas. */
export function RespuestaInforme({
  campo,
  respuestas,
}: {
  campo: CampoFormato;
  respuestas: Record<string, string>;
}) {
  if (campo.tipo !== 'tabla')
    return (
      <span className="ri-respuesta">
        {respuestaPublicada(campo, respuestas) || 'Sin respuesta'}
      </span>
    );
  const filas = filasDe(respuestas, campo.codigo);
  if (!filas.length) return <span className="ri-respuesta">Sin respuesta</span>;
  return (
    <div
      className="ri-tabla-contenedor"
      role="region"
      aria-label={`Tabla: ${campo.etiqueta}`}
      tabIndex={0}
    >
      <table className="ri-tabla">
        <caption className="sr-only">{campo.etiqueta}</caption>
        <thead>
          <tr>
            {campo.columnas?.map((columna) => (
              <th scope="col" key={columna.codigo}>
                {columna.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, indice) => (
            <tr key={indice}>
              {campo.columnas?.map((columna) => (
                <td key={columna.codigo}>{fila[columna.codigo] || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
