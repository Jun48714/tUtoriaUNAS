import type { CampoFormato } from '../../types/domain';
import type { DocumentoFormato } from '../../utils/exportFormatos';
import { filasDe, respuestaPublicada } from '../../utils/exportFormatos';
import { campoVisible } from '../../utils/validacionInstrumentos';
import { Hoja } from './primitivas';

function RespuestaPublicada({
  campo,
  documento,
}: {
  campo: CampoFormato;
  documento: DocumentoFormato;
}) {
  if (campo.tipo === 'tabla')
    return (
      <table className="fo-tabla fo-rejilla">
        <thead>
          <tr>
            {campo.columnas?.map((c) => (
              <th scope="col" key={c.codigo}>
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filasDe(documento.respuestas, campo.codigo).map((fila, i) => (
            <tr key={i}>
              {campo.columnas?.map((c) => (
                <td key={c.codigo}>{fila[c.codigo] || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  return <p className="fo-val">{respuestaPublicada(campo, documento.respuestas) || '—'}</p>;
}

/** Cada sección fluye en una hoja; el navegador puede paginar bloques largos al imprimir. */
export function FormatoPublicado({ documento }: { documento: DocumentoFormato }) {
  return documento.definicion?.secciones.map((seccion, i) => (
    <Hoja key={i} documento={documento} continuacion={i > 0}>
      <h3>{seccion.titulo}</h3>
      {seccion.campos
        .filter((c) => campoVisible(c, documento.respuestas))
        .map((c) => (
          <section className="fo-pregunta-publicada" key={c.codigo}>
            <h4>{c.etiqueta}</h4>
            <RespuestaPublicada campo={c} documento={documento} />
          </section>
        ))}
    </Hoja>
  ));
}
