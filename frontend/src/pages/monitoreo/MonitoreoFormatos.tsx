import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  HojasFormatos,
  ImpresionFormatos,
  VistaPreviaFormatos,
} from '../../components/formatos/FormatoOficial';
import {
  TITULOS_OFICIALES,
  documentosExportables,
  fechaOficial,
  nombreArchivo,
} from '../../utils/exportFormatos';
import type { DocumentoFormato } from '../../utils/exportFormatos';
import type { CodigoFormato } from '../../types/domain';
import type { MonitoreoApi } from '../../types/monitoreo';
import { MonitoreoMarco } from './MonitoreoMarco';
import '../../styles/coord-exports.css';
import './monitoreo-formatos.css';

const CODIGOS = Array.from(
  { length: 12 },
  (_, i) => `F${String(i + 1).padStart(2, '0')}`,
) as CodigoFormato[];

type Ayudas = Parameters<Parameters<typeof MonitoreoMarco>[0]['children']>[1];

/** Lista de documentos enviados de un formato, con el nombre de la persona a la que corresponden. */
function documentosDe(
  datos: MonitoreoApi,
  ayudas: Ayudas,
  formato: CodigoFormato,
): DocumentoFormato[] {
  return documentosExportables(datos.registros, datos.sesiones)
    .filter((d) => d.formato === formato)
    .map((d) => ({
      ...d,
      referencia: d.estudianteId
        ? ayudas.nombreEstudiante(d.estudianteId)
        : formato === 'F01'
          ? 'Informe de la escuela'
          : `${ayudas.nombreDocente(d.tutorId)}${d.referencia.includes('·') ? ` · ${d.referencia.split('·').pop()?.trim()}` : ''}`,
    }));
}

function Contenido({ datos, ayudas }: { datos: MonitoreoApi; ayudas: Ayudas }) {
  const idPrevia = useId();
  const [params, setParams] = useSearchParams();
  const pedido = params.get('formato') as CodigoFormato | null;
  const [formatoElegido, setFormato] = useState<CodigoFormato>(
    pedido && CODIGOS.includes(pedido) ? pedido : 'F03',
  );
  const [docElegido, setDoc] = useState<string | null>(params.get('doc'));
  const [impresion, setImpresion] = useState<{
    id: number;
    documentos: DocumentoFormato[];
    titulo: string;
  } | null>(null);

  const documentos = useMemo(
    () => documentosDe(datos, ayudas, formatoElegido),
    [datos, ayudas, formatoElegido],
  );
  const activo = documentos.find((d) => d.id === docElegido) ?? documentos[0] ?? null;
  const resumen = datos.porFormato.find((f) => f.formato === formatoElegido);
  const enCurso = (resumen?.enCurso ?? 0) + (resumen?.observados ?? 0);

  function elegirFormato(codigo: CodigoFormato) {
    setFormato(codigo);
    setDoc(null);
    if (params.size) setParams({}, { replace: true });
  }

  return (
    <>
      <div className="mon-formatos">
        <Card className="mon-formatos__selector">
          <CardHead title="Formatos de tutoría" />
          <label className="mon-formatos__mobile">
            Formato
            <select
              className="select"
              value={formatoElegido}
              onChange={(evento) => elegirFormato(evento.currentTarget.value as CodigoFormato)}
            >
              {CODIGOS.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {codigo.slice(1)} · {TITULOS_OFICIALES[codigo].titulo}
                </option>
              ))}
            </select>
          </label>
          <ul
            className="mon-formatos__list"
            aria-label="Formatos de la Resolución N.º 500-2022-CU-R-UNAS"
          >
            {CODIGOS.map((codigo) => {
              const r = datos.porFormato.find((f) => f.formato === codigo);
              const enviados = (r?.enviados ?? 0) + (r?.aprobados ?? 0);
              const pendientes = (r?.enCurso ?? 0) + (r?.observados ?? 0);
              return (
                <li key={codigo}>
                  <button
                    type="button"
                    className="mon-formatos__row"
                    aria-current={codigo === formatoElegido ? 'true' : undefined}
                    onClick={() => elegirFormato(codigo)}
                  >
                    <span className="mon-formatos__number">{codigo.slice(1)}</span>
                    <span className="mon-formatos__label">
                      <strong>{TITULOS_OFICIALES[codigo].titulo}</strong>
                      <small>
                        {TITULOS_OFICIALES[codigo].actor} · {enviados}{' '}
                        {enviados === 1 ? 'enviado' : 'enviados'}
                        {pendientes > 0 ? ` · ${pendientes} en curso` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <section className="fx-previa" aria-labelledby={`${idPrevia}-previa`}>
          <header className="fx-previa__cabecera">
            <div>
              <h2 id={`${idPrevia}-previa`}>
                Formato {formatoElegido.slice(1)} · {TITULOS_OFICIALES[formatoElegido].titulo}
              </h2>
              <p>
                {documentos.length} enviado(s)
                {enCurso ? ` · ${enCurso} en curso (aún sin contenido visible)` : ''}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!activo}
              onClick={() =>
                activo &&
                setImpresion({
                  id: Date.now(),
                  documentos: [activo],
                  titulo: nombreArchivo([activo]),
                })
              }
            >
              <i className="fa-solid fa-file-pdf" aria-hidden="true" /> Exportar PDF
            </button>
          </header>

          {documentos.length > 0 && (
            <Card className="mon-formatos__documento">
              <CardBody>
                <SearchableSelect
                  label="Ver el formato de"
                  placeholder="Buscar estudiante o docente…"
                  autoFocus={false}
                  value={activo?.id ?? ''}
                  onChange={(valor) => setDoc(valor)}
                  options={documentos.map((d) => ({
                    value: d.id,
                    label: d.referencia,
                    description: `${d.estado === 'aprobado' ? 'Aprobado' : 'Enviado'} · ${fechaOficial(d.fecha) || 'sin fecha'}`,
                  }))}
                />
                {activo && (
                  <p className="compact-note">
                    <StatusBadge estado={activo.estado} contexto="formulario" /> Se muestra tal como
                    lo llenó la persona. Es solo lectura.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {activo ? (
            <VistaPreviaFormatos
              documentos={[activo]}
              etiqueta={`Vista previa: ${activo.referencia}`}
            />
          ) : (
            <Card>
              <EmptyState
                title="Aún no hay formatos enviados"
                description={
                  enCurso
                    ? 'Hay formatos en curso; podrás verlos cuando se envíen.'
                    : 'Aparecerán cuando el estudiante o el docente los envíen.'
                }
              />
            </Card>
          )}
        </section>
      </div>

      {impresion && (
        <ImpresionFormatos
          key={impresion.id}
          titulo={impresion.titulo}
          onTerminar={() => setImpresion(null)}
        >
          <HojasFormatos documentos={impresion.documentos} />
        </ImpresionFormatos>
      )}
    </>
  );
}

/** Formatos de la escuela: se elige el formato y se ve la plantilla con lo que llenaron (solo lectura). */
export function MonitoreoFormatos() {
  return (
    <MonitoreoMarco vista="formatos">
      {(datos, ayudas) => <Contenido datos={datos} ayudas={ayudas} />}
    </MonitoreoMarco>
  );
}
