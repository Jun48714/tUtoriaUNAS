import { createRoot } from 'react-dom/client';
import type { DefinicionFormato, Instrumento } from '../../types/domain';
import type { DocumentoFormato } from '../../utils/exportFormatos';
import type { ConsolidacionInforme } from '../../services/informes';
import { FormatoOficial } from './FormatoOficial';
import { DatosApoyoInforme } from './DatosApoyoInforme';
import '../../styles/vista-informe.css';

function etiquetaEstado(estado: Instrumento['estado']): string | null {
  if (estado === 'aprobado') return null;
  if (estado === 'enviado') return 'Enviado · pendiente de revisión';
  if (estado === 'observado') return 'Observado · pendiente de corrección';
  return 'Borrador · no enviado';
}

/** Abre una fotografía del registro autorizado. No coloca respuestas en la URL ni en almacenamiento. */
export function abrirVistaInforme(
  instrumento: Instrumento,
  definicion?: DefinicionFormato,
  consolidacion?: ConsolidacionInforme,
): boolean {
  const ventana = window.open('', '_blank');
  if (!ventana) return false;
  ventana.opener = null;
  const documento: DocumentoFormato = {
    id: instrumento.id,
    formato: instrumento.formato,
    referencia: instrumento.id,
    estudianteId: instrumento.estudianteId,
    tutorId: instrumento.tutorId,
    semestreId: instrumento.semestreId,
    estado: instrumento.estado,
    fecha: instrumento.enviado ?? instrumento.actualizado,
    respuestas: { ...instrumento.respuestas },
    muestra: false,
    definicion: instrumento.definicion ?? definicion,
  };
  const pagina = ventana.document;
  pagina.documentElement.lang = 'es';
  pagina.title = `Informe ${instrumento.formato.slice(1)} · ${instrumento.semestreId}`;
  const viewport = pagina.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  pagina.head.append(viewport);
  document
    .querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')
    .forEach((original) => {
      const copia = original.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (copia instanceof HTMLLinkElement && original instanceof HTMLLinkElement)
        copia.href = original.href;
      pagina.head.append(copia);
    });
  pagina.body.className = 'ri-ventana';
  const contenedor = pagina.createElement('div');
  pagina.body.append(contenedor);
  const raiz = createRoot(contenedor);
  const estado = etiquetaEstado(instrumento.estado);
  raiz.render(
    <>
      <header className="ri-cabecera">
        <div>
          <strong>Informe {instrumento.formato.slice(1)}</strong>
          <span>{instrumento.semestreId}</span>
        </div>
        <button type="button" onClick={() => ventana.print()}>
          Imprimir o guardar PDF
        </button>
      </header>
      <main className="fo-impresion ri-contenido">
        {estado && <p className="ri-estado">{estado}</p>}
        <FormatoOficial documento={documento} />
        {consolidacion && <DatosApoyoInforme datos={consolidacion} />}
      </main>
    </>,
  );
  ventana.addEventListener('pagehide', () => raiz.unmount(), { once: true });
  ventana.focus();
  return true;
}
