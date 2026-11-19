import { DirectoryDisclosure, DirectoryPage } from '../../components/ui/DirectoryPage';
import { SeguimientosCoordinacion } from '../../components/panels/GestionCoordinacion';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Eye } from '../../components/ui/icons';
import { PageHeading } from '../../components/ui/PageHeading';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { DataTable } from '../../components/ui/DataTable';
import type { Column } from '../../components/ui/DataTable';
import { Sheet } from '../../components/ui/Sheet';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { abrirVistaInforme } from '../../components/formatos/vistaInforme';
import { InformeRespuestas } from '../../components/formatos/InformeRespuestas';
import { ConsolidacionInformePanel } from '../../components/formatos/ConsolidacionInformePanel';
import { useFiltro } from '../../hooks/useFiltro';
import { DirectoryToolbar } from '../../components/ui/DirectoryToolbar';
import type { DefinicionSelect } from '../../hooks/useFiltro';
import { usePortal } from '../../hooks/usePortal';
import { useAuth } from '../../hooks/useAuth';
import { persistirRevision } from '../../services/mutacionesTutoria';
import { consultarConsolidacion, consultarPropuesta } from '../../services/informes';
import { API_MODE } from '../../services/apiConfig';
import type { CodigoFormato, Docente, Instrumento } from '../../types/domain';
import { escuelaDe, docentePorId } from '../../data/personas';
import { escuelas } from '../../data/catalogos';
import { definicionPorCodigo } from '../../data/formatos';
import { HOY_ISO, formatFecha } from '../../utils/fechas';
import { estadoRevisionInforme } from '../../utils/estadoInforme';
import type { EstadoRevisionInforme } from '../../utils/estadoInforme';
import '../../styles/informes-revision.css';

const FORMATOS_INFORME: CodigoFormato[] = ['F01', 'F02'];

/** Estado de revisión que la coordinación asigna a un informe. */
type EstadoRevision = EstadoRevisionInforme;

/** Decisión registrada en la demostración sobre un informe. */
interface DecisionRevision {
  estado: EstadoRevision;
  comentario: string;
  revisor: string;
  fecha: string;
}

/** Fila de la bandeja de revisión de informes 01 y 02. */
interface FilaRevision {
  instrumento: Instrumento;
  tutor: Docente | undefined;
  escuelaId: string;
  estado: EstadoRevision;
  comentario: string;
  revisor: string;
  fecha: string;
  puedeRevisarse: boolean;
}

/** Nombre corto del formato para las tablas. */
function nombreFormato(registro: Instrumento): string {
  const definicion = registro.definicion ?? definicionPorCodigo(registro.formato);
  return definicion ? `Formato ${definicion.numero} · ${definicion.nombre}` : registro.formato;
}

/**
 * Bandeja de revisión de los informes 01 y 02: pestañas por estado, detalle de
 * las secciones y campos del instrumento y registro de la observación o de la
 * aprobación por parte de la coordinación de tutoría.
 */
export function CoordReviews() {
  const portal = usePortal();
  const { user } = useAuth();
  const idObservacion = useId();
  const detalleRef = useRef<HTMLDivElement>(null);

  const informes = useMemo(
    () =>
      portal.instrumentos
        .filter((instrumento) => FORMATOS_INFORME.includes(instrumento.formato))
        .sort((a, b) => b.actualizado.localeCompare(a.actualizado)),
    [portal.instrumentos],
  );

  const [decisiones, setDecisiones] = useState<Record<string, DecisionRevision>>({});
  const [seleccionado, setSeleccionado] = useState<Instrumento | null>(null);
  const [pestana, setPestana] = useState<EstadoRevision | 'todos'>('todos');
  const [detallePestana, setDetallePestana] = useState('informe-respuestas');
  const [comentario, setComentario] = useState('');
  const [avisoInterno, setAvisoInterno] = useState<{ error: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const filas = useMemo<FilaRevision[]>(
    () =>
      informes.map((instrumento) => {
        const decision = decisiones[instrumento.id];
        const estado = decision?.estado ?? estadoRevisionInforme(instrumento.estado);
        const tutor = docentePorId(instrumento.tutorId);
        const escuelaDeclarada = instrumento.respuestas['escuela'];
        return {
          instrumento,
          tutor,
          escuelaId:
            instrumento.escuelaId ??
            (escuelaDeclarada && escuelas.some((escuela) => escuela.id === escuelaDeclarada)
              ? escuelaDeclarada
              : (tutor?.escuelaId ?? portal.escuelaId)),
          estado,
          comentario:
            decision?.comentario ??
            instrumento.observaciones[0]?.texto ??
            'Sin comentario de revisión registrado.',
          revisor: decision?.revisor ?? instrumento.revisadoPor ?? 'Coordinación de tutoría',
          fecha: decision?.fecha ?? instrumento.actualizado,
          puedeRevisarse: instrumento.estado === 'enviado',
        };
      }),
    [decisiones, informes, portal.escuelaId],
  );

  const buscarEn = useCallback(
    (fila: FilaRevision) =>
      [
        nombreFormato(fila.instrumento),
        fila.tutor?.apellidos ?? '',
        fila.tutor?.nombres ?? '',
        escuelaDe(fila.escuelaId),
        fila.instrumento.id,
        fila.estado,
      ].join(' '),
    [],
  );

  const selects = useMemo<Array<DefinicionSelect<FilaRevision>>>(
    () => [
      {
        id: 'semestre',
        etiqueta: 'Semestre',
        opciones: [...new Set(filas.map((fila) => fila.instrumento.semestreId))]
          .sort((a, b) => b.localeCompare(a))
          .map((semestre) => ({ valor: semestre, etiqueta: semestre })),
        valorDe: (fila) => fila.instrumento.semestreId,
      },
      {
        id: 'formato',
        etiqueta: 'Formato',
        opciones: FORMATOS_INFORME.map((codigo) => {
          const definicion = definicionPorCodigo(codigo);
          return {
            valor: codigo,
            etiqueta: definicion ? `${definicion.numero} · ${definicion.nombre}` : codigo,
          };
        }),
        valorDe: (fila) => fila.instrumento.formato,
      },
      {
        id: 'escuela',
        etiqueta: 'Escuela',
        opciones: escuelas.map((escuela) => ({ valor: escuela.id, etiqueta: escuela.nombre })),
        valorDe: (fila) => fila.escuelaId,
      },
      {
        id: 'enviado',
        etiqueta: 'Situación del envío',
        opciones: [
          { valor: 'enviado', etiqueta: 'Enviado por el responsable' },
          { valor: 'borrador', etiqueta: 'En borrador' },
          { valor: 'no-iniciado', etiqueta: 'No iniciado' },
          { valor: 'aprobado', etiqueta: 'Aprobado en el registro' },
        ],
        valorDe: (fila) => fila.instrumento.estado,
      },
    ],
    [filas],
  );

  const filtro = useFiltro(filas, buscarEn, selects);

  const porTab: Record<EstadoRevision | 'todos', FilaRevision[]> = {
    todos: filtro.filtrados,
    preparacion: filtro.filtrados.filter((fila) => fila.estado === 'preparacion'),
    pendiente: filtro.filtrados.filter((fila) => fila.estado === 'pendiente'),
    observado: filtro.filtrados.filter((fila) => fila.estado === 'observado'),
    aprobado: filtro.filtrados.filter((fila) => fila.estado === 'aprobado'),
  };
  const detalleFila = seleccionado
    ? (filas.find((fila) => fila.instrumento.id === seleccionado.id) ?? null)
    : null;
  const informeActual = detalleFila?.instrumento ?? seleccionado;
  const propuesta = useQuery({
    queryKey: ['propuesta-informe', informeActual?.id, informeActual?.version],
    queryFn: ({ signal }) => consultarPropuesta(informeActual?.id ?? '', signal),
    enabled: API_MODE && Boolean(informeActual),
    retry: false,
  });
  const consolidacion = useQuery({
    queryKey: ['consolidacion-informe', informeActual?.id, informeActual?.version],
    queryFn: ({ signal }) => consultarConsolidacion(informeActual?.id ?? '', signal),
    enabled: API_MODE && Boolean(informeActual),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const informeVista = propuesta.data ?? informeActual;
  const detalleFormato = informeActual
    ? (informeVista?.definicion ?? definicionPorCodigo(informeActual.formato))
    : undefined;

  function cambiarDetalle(id: string) {
    setDetallePestana(id);
    detalleRef.current?.closest('.sheet__body')?.scrollTo({ top: 0 });
  }

  async function registrarDecision(estado: EstadoRevision) {
    if (!informeActual || !user || (estado !== 'aprobado' && estado !== 'observado') || guardando)
      return;
    setGuardando(true);
    try {
      await persistirRevision(informeActual, user, estado, comentario);
    } catch (error) {
      setAvisoInterno({
        error: true,
        texto: error instanceof Error ? error.message : 'No se pudo registrar la revisión.',
      });
      return;
    } finally {
      setGuardando(false);
    }
    const revisor = portal.docente
      ? `${portal.docente.nombres} ${portal.docente.apellidos}`
      : 'Coordinación de tutoría';
    if (!API_MODE)
      setDecisiones((actuales) => ({
        ...actuales,
        [informeActual.id]: {
          estado,
          comentario:
            comentario.trim() ||
            (estado === 'aprobado'
              ? 'Informe revisado y conforme. Se aprueba para su descarga y consolidación.'
              : 'Se registra la observación para que el tutor subsane el informe.'),
          revisor,
          fecha: HOY_ISO,
        },
      }));
    setAvisoInterno({
      error: false,
      texto:
        estado === 'aprobado'
          ? 'Informe aprobado.'
          : 'Observación registrada. El responsable la verá en su bandeja de instrumentos.',
    });
    setComentario('');
    setPestana(estado);
  }

  const columnas: Column<FilaRevision>[] = [
    {
      key: 'informe',
      header: 'Informe',
      sortable: true,
      sortValue: (fila) => `${fila.instrumento.formato} ${fila.instrumento.id}`,
      render: (fila) => (
        <span className="stack" style={{ gap: 1 }}>
          <strong className="cell-strong">
            {(fila.instrumento.definicion ?? definicionPorCodigo(fila.instrumento.formato))?.nombre}
          </strong>
          <span className="cell-note">
            {fila.instrumento.formato} · {escuelaDe(fila.escuelaId)} · {fila.instrumento.semestreId}
          </span>
        </span>
      ),
    },
    {
      key: 'tutor',
      header: 'Responsable',
      sortable: true,
      sortValue: (fila) => fila.tutor?.apellidos ?? '',
      render: (fila) =>
        fila.tutor ? `${fila.tutor.apellidos}, ${fila.tutor.nombres}` : 'Comisión de tutoría',
    },
    {
      key: 'registro',
      header: 'Registro',
      sortable: true,
      sortValue: (fila) => fila.instrumento.estado,
      render: (fila) => (
        <span className="stack" style={{ gap: 2 }}>
          <StatusBadge estado={fila.instrumento.estado} contexto="formulario" />
        </span>
      ),
    },
    {
      key: 'revision',
      header: 'Revisión',
      sortable: true,
      sortValue: (fila) => fila.estado,
      render: (fila) => (
        <span className="stack" style={{ gap: 2 }}>
          {fila.estado === 'preparacion' ? (
            <Badge>En preparación</Badge>
          ) : (
            <StatusBadge estado={fila.estado} />
          )}
          <span className="cell-note">{formatFecha(fila.fecha)}</span>
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (fila) => (
        <span className="cell-actions">
          <button
            type="button"
            className="btn btn-falcon-default btn-sm"
            aria-label={`Revisar ${nombreFormato(fila.instrumento)}`}
            onClick={() => {
              setSeleccionado(fila.instrumento);
              setDetallePestana('informe-respuestas');
              setComentario('');
              setAvisoInterno(null);
            }}
          >
            <Eye aria-hidden="true" /> Revisar
          </button>
        </span>
      ),
    },
  ];

  return (
    <DirectoryPage>
      <PageHeading
        eyebrow="Coordinación de tutoría · Revisión de informes"
        title="Revisar informes"
        description="Revisa los informes 01 y 02. Puedes aprobarlos o pedir correcciones."
        actions={
          <Link className="btn btn-falcon-default" to="/coordinacion/plan">
            Preparar informe de escuela
          </Link>
        }
      />

      <Card>
        <CardHead title="Bandeja de informes" />
        <CardBody>
          <div className="stack">
            <DirectoryToolbar
              busqueda={filtro.busqueda}
              onBusqueda={filtro.setBusqueda}
              selects={selects}
              valores={filtro.valores}
              onValores={filtro.setValores}
              mostrados={porTab[pestana].length}
              total={
                pestana === 'todos'
                  ? filas.length
                  : filas.filter((fila) => fila.estado === pestana).length
              }
              onLimpiar={filtro.limpiar}
              etiqueta="Filtros de la bandeja de informes"
              placeholder="Buscar informe"
              views={
                <Tabs
                  etiqueta="Estado de revisión de los informes"
                  activo={pestana}
                  onChange={(id) => setPestana(id as EstadoRevision | 'todos')}
                  items={[
                    { id: 'pendiente', label: 'Pendiente', count: porTab.pendiente.length },
                    {
                      id: 'preparacion',
                      label: 'En preparación',
                      count: porTab.preparacion.length,
                    },
                    { id: 'observado', label: 'Por corregir', count: porTab.observado.length },
                    { id: 'aprobado', label: 'Aprobado', count: porTab.aprobado.length },
                    { id: 'todos', label: 'Todos', count: filtro.filtrados.length },
                  ]}
                />
              }
            />

            {(['pendiente', 'preparacion', 'observado', 'aprobado', 'todos'] as const).map((id) => (
              <TabPanel key={id} id={id} activo={pestana}>
                <DataTable<FilaRevision>
                  rows={porTab[id]}
                  columns={columnas}
                  caption={`Informes 01 y 02 en estado ${id}`}
                  rowKey={(fila) => fila.instrumento.id}
                  pageSize={8}
                  pagination="auto"
                  paginationPosition="bottom"
                  inlineActions
                  initialSort={{ key: 'revision', direction: 'asc' }}
                  emptyTitle="Sin informes en esta pestaña"
                  emptyDescription="Cambia de pestaña o ajusta los filtros."
                />
              </TabPanel>
            ))}
          </div>
        </CardBody>
      </Card>

      <DirectoryDisclosure title="Guía de revisión">
        <p>
          El tutor envía el informe 02 y la comisión el 01. Revisa el contenido y aprueba o registra
          una observación.
        </p>
      </DirectoryDisclosure>
      {informeActual && detalleFila && (
        <Sheet
          wide
          title={`Formato ${detalleFormato?.numero ?? '—'} · ${detalleFormato?.nombre ?? informeActual.formato}`}
          className="sheet--form sheet--informe-revision"
          description={`${informeActual.id} · ${escuelaDe(detalleFila.escuelaId)} · semestre ${informeActual.semestreId}`}
          onClose={() => {
            setSeleccionado(null);
            setAvisoInterno(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-link"
                onClick={() => {
                  setSeleccionado(null);
                  setAvisoInterno(null);
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn btn-falcon-default"
                disabled={
                  !informeVista || (API_MODE && (propuesta.isFetching || propuesta.isError))
                }
                onClick={() => {
                  if (
                    informeVista &&
                    !abrirVistaInforme(informeVista, detalleFormato, consolidacion.data)
                  )
                    setAvisoInterno({
                      error: true,
                      texto: 'Permite ventanas emergentes para abrir la vista previa.',
                    });
                }}
              >
                <Eye aria-hidden="true" /> Vista previa
              </button>
              <button
                type="button"
                className="btn btn-falcon-default"
                disabled={guardando || !detalleFila.puedeRevisarse}
                onClick={() => {
                  if (detallePestana !== 'informe-revision') {
                    cambiarDetalle('informe-revision');
                    return;
                  }
                  void registrarDecision('observado');
                }}
              >
                {detallePestana === 'informe-revision' ? 'Registrar observación' : 'Observar'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={guardando || !detalleFila.puedeRevisarse}
                onClick={() => registrarDecision('aprobado')}
              >
                Aprobar informe
              </button>
            </>
          }
        >
          <div className="stack stack--lg" ref={detalleRef}>
            {avisoInterno && (
              <Alert
                tone={avisoInterno.error ? 'riesgo' : 'ok'}
                title={avisoInterno.error ? 'No se pudo revisar' : 'Revisión guardada'}
              >
                {avisoInterno.texto}
              </Alert>
            )}
            {API_MODE && propuesta.isFetching && <p role="status">Preparando vista del informe…</p>}
            {API_MODE && propuesta.isError && (
              <Alert tone="riesgo" title="No se pudo preparar el informe">
                <button
                  type="button"
                  className="btn btn-falcon-default btn-sm"
                  onClick={() => void propuesta.refetch()}
                >
                  Reintentar
                </button>
              </Alert>
            )}

            <Tabs
              etiqueta="Detalle del informe"
              activo={detallePestana}
              onChange={cambiarDetalle}
              items={[
                { id: 'informe-respuestas', label: 'Respuestas' },
                { id: 'informe-resumen', label: 'Resumen' },
                { id: 'informe-revision', label: 'Revisión' },
              ]}
            />

            <TabPanel id="informe-resumen" activo={detallePestana}>
              {!detalleFila.puedeRevisarse && (
                <p className="informe-revision__estado" role="status">
                  Solo se revisan informes enviados.
                </p>
              )}

              {API_MODE && (
                <ConsolidacionInformePanel
                  id={informeActual.id}
                  version={informeActual.version}
                  actualizando={propuesta.isFetching || consolidacion.isFetching}
                  onActualizar={() => {
                    void propuesta.refetch();
                    void consolidacion.refetch();
                  }}
                />
              )}

              <DirectoryDisclosure title="Estado y revisión">
                <dl className="def-list">
                  <div>
                    <dt>Estado del registro</dt>
                    <dd>
                      <StatusBadge estado={informeActual.estado} contexto="formulario" /> · avance{' '}
                      {informeActual.avance}% · versión {informeActual.version}
                    </dd>
                  </div>
                  <div>
                    <dt>Envío del informe</dt>
                    <dd>
                      {informeActual.enviado
                        ? `Enviado el ${formatFecha(informeActual.enviado)}`
                        : 'Aún no enviado al sistema'}
                    </dd>
                  </div>
                  <div>
                    <dt>Revisión actual</dt>
                    <dd>
                      {detalleFila.estado} · {detalleFila.revisor} ·{' '}
                      {formatFecha(detalleFila.fecha)}
                    </dd>
                  </div>
                  <div>
                    <dt>Comentario de revisión</dt>
                    <dd>{detalleFila.comentario}</dd>
                  </div>
                </dl>
              </DirectoryDisclosure>

              <DirectoryDisclosure title="Ficha del formato">
                <dl className="def-list">
                  <div>
                    <dt>Responsable que responde</dt>
                    <dd>{detalleFormato?.actorEtiqueta ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Momento de presentación</dt>
                    <dd>{detalleFormato?.momento ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Requisito</dt>
                    <dd>
                      {detalleFormato?.obligatorio
                        ? 'Formulario obligatorio'
                        : 'Formulario opcional'}
                    </dd>
                  </div>
                  <div>
                    <dt>Versión y aprobación</dt>
                    <dd>
                      {detalleFormato?.version ?? '—'} · {detalleFormato?.aprobacion ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Vigencia</dt>
                    <dd>{detalleFormato?.vigencia ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Firmas de aprobación</dt>
                    <dd>{detalleFormato?.visaciones.join(' · ') ?? '—'}</dd>
                  </div>
                </dl>
              </DirectoryDisclosure>
            </TabPanel>
            <TabPanel id="informe-respuestas" activo={detallePestana}>
              {detalleFormato && (
                <InformeRespuestas
                  key={informeActual.id}
                  definicion={detalleFormato}
                  respuestas={informeVista?.respuestas ?? informeActual.respuestas}
                />
              )}
            </TabPanel>

            <TabPanel id="informe-revision" activo={detallePestana}>
              <div className="grid grid--2">
                <div>
                  <div className="section-head">
                    <h2>Observaciones</h2>
                    <p>{informeActual.observaciones.length} registradas</p>
                  </div>
                  {informeActual.observaciones.length === 0 ? (
                    <p className="informe-revision__vacio">Sin observaciones.</p>
                  ) : (
                    <ul className="list">
                      {informeActual.observaciones.map((observacion) => (
                        <li className="list__item" key={observacion.id}>
                          <span
                            className={`list__icon list__icon--${observacion.estado === 'abierta' ? 'danger' : 'ok'}`}
                            aria-hidden="true"
                          >
                            <ClipboardCheck />
                          </span>
                          <span className="list__body">
                            <strong>{observacion.texto}</strong>
                            <p>
                              {observacion.autor} · {formatFecha(observacion.fecha)}
                            </p>
                          </span>
                          <span className="list__aside">
                            <StatusBadge estado={observacion.estado} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="stack stack--sm">
                  <div className="field">
                    <label htmlFor={idObservacion}>Comentario de la revisión</label>
                    <textarea
                      id={idObservacion}
                      className="textarea"
                      value={comentario}
                      onChange={(evento) => setComentario(evento.target.value)}
                      placeholder="Escribe tu comentario"
                    />
                  </div>
                </div>
              </div>
            </TabPanel>
          </div>
        </Sheet>
      )}
      {API_MODE && <SeguimientosCoordinacion />}
    </DirectoryPage>
  );
}
