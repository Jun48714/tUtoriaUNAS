import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Sheet } from './Sheet';
import { EmptyState } from './EmptyState';
import '../../styles/chart-data.css';

export interface TablaGrafica {
  columnas: string[];
  filas: Array<Array<string | number>>;
}

const FILAS_POR_PAGINA = 6;
const numero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const mostrarValor = (valor: string | number) =>
  typeof valor === 'number' ? numero.format(valor) : valor;

/** Mantiene cada página dentro del espacio entre la cabecera y la navegación. */
function useFilasVisibles(contenido: RefObject<HTMLDivElement | null>, tabla: TablaGrafica) {
  const [cantidad, setCantidad] = useState(FILAS_POR_PAGINA);
  useLayoutEffect(() => {
    const elemento = contenido.current;
    const dialogo = elemento?.closest('dialog');
    const cuerpo = elemento?.closest('.sheet__body');
    const cabecera = dialogo?.querySelector('.sheet__head');
    const pie = dialogo?.querySelector('.sheet__foot');
    if (!elemento || !dialogo || !cuerpo || !cabecera || !pie) return;
    let anchoAnterior = 0;
    let altoFila = 0;
    function ajustar() {
      if (!elemento || !dialogo || !cuerpo || !cabecera || !pie) return;
      const ancho = elemento.getBoundingClientRect().width;
      if (!ancho) return;
      if (ancho !== anchoAnterior) altoFila = 0;
      anchoAnterior = ancho;
      const tablaVisible = elemento.querySelector('.chart-data-table');
      if (!tablaVisible) return;
      const movil = getComputedStyle(tablaVisible).display === 'none';
      const filas = elemento.querySelectorAll(
        movil ? '.chart-data-records > li' : '.chart-data-table tbody tr',
      );
      for (const fila of filas) altoFila = Math.max(altoFila, fila.getBoundingClientRect().height);
      if (!altoFila) return;
      const estilo = getComputedStyle(cuerpo);
      const encabezado = movil
        ? 0
        : (elemento.querySelector('thead')?.getBoundingClientRect().height ?? 0);
      const disponible =
        parseFloat(getComputedStyle(dialogo).maxHeight) -
        cabecera.getBoundingClientRect().height -
        pie.getBoundingClientRect().height -
        parseFloat(estilo.paddingTop) -
        parseFloat(estilo.paddingBottom) -
        encabezado;
      const limite = movil ? 2 : FILAS_POR_PAGINA;
      setCantidad(Math.max(1, Math.min(limite, Math.floor(disponible / altoFila))));
    }
    const observador = new ResizeObserver(ajustar);
    for (const parte of [elemento, cabecera, pie]) observador.observe(parte);
    window.addEventListener('resize', ajustar);
    ajustar();
    return () => {
      observador.disconnect();
      window.removeEventListener('resize', ajustar);
    };
  }, [contenido, tabla]);
  return cantidad;
}

/** Consulta de datos independiente del tamaño y la disposición del gráfico. */
export function ChartDataDialog({
  title,
  tabla,
  onClose,
}: {
  title: string;
  tabla: TablaGrafica;
  onClose(): void;
}) {
  const [posicion, setPosicion] = useState(0);
  const contenido = useRef<HTMLDivElement>(null);
  const filasPorPagina = useFilasVisibles(contenido, tabla);
  const ultima = Math.max(0, Math.ceil(tabla.filas.length / filasPorPagina) - 1);
  const inicio =
    ultima === 0 || posicion >= tabla.filas.length ? ultima * filasPorPagina : posicion;
  const filas = tabla.filas.slice(inicio, inicio + filasPorPagina);
  function irA(siguiente: number) {
    setPosicion(siguiente);
    contenido.current?.closest<HTMLElement>('.sheet__body')?.scrollTo({ top: 0 });
  }
  const cantidad = tabla.filas.length;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      wide
      className="chart-data-sheet"
      footer={
        <div className="chart-data-pagination">
          <span role="status">
            {cantidad ? `${inicio + 1}–${inicio + filas.length} de ${cantidad}` : 'Sin registros'}
          </span>
          {ultima > 0 && (
            <nav aria-label="Páginas de datos del gráfico">
              <button
                type="button"
                className="btn btn-falcon-default"
                aria-label="Anterior"
                disabled={inicio === 0}
                onClick={() => irA(Math.max(0, inicio - filasPorPagina))}
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" /> <span>Anterior</span>
              </button>
              <button
                type="button"
                className="btn btn-falcon-default"
                aria-label="Siguiente"
                disabled={inicio + filasPorPagina >= cantidad}
                onClick={() => irA(inicio + filasPorPagina)}
              >
                <span>Siguiente</span>{' '}
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      }
    >
      <div ref={contenido}>
        {cantidad ? (
          <>
            <table className="chart-data-table">
              <caption className="sr-only">Datos de {title}</caption>
              <thead>
                <tr>
                  {tabla.columnas.map((columna) => (
                    <th key={columna} scope="col">
                      {columna}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, indice) => (
                  <tr key={inicio + indice}>
                    {fila.map((valor, columna) => (
                      <td className={columna > 0 ? 'chart-data-number' : undefined} key={columna}>
                        {mostrarValor(valor)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="chart-data-records" aria-label={`Datos de ${title}`}>
              {filas.map((fila, indice) => (
                <li key={inicio + indice}>
                  <h3>{mostrarValor(fila[0] ?? '')}</h3>
                  <dl>
                    {fila.slice(1).map((valor, columna) => (
                      <div key={columna}>
                        <dt>{tabla.columnas[columna + 1]}</dt>
                        <dd>{mostrarValor(valor)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title="Sin datos en este periodo" />
        )}
      </div>
    </Sheet>
  );
}
