import { FormCompletion } from '../../components/formatos/FormCompletion';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { admiteRegistroAsistencia } from '../../utils/evaluacionesSesion';
import { PageHeading } from '../../components/ui/PageHeading';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/StatusBadge';
import { Sheet } from '../../components/ui/Sheet';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { usePortal } from '../../hooks/usePortal';
import { useAuth } from '../../hooks/useAuth';
import { estudiantePorId, nombreCompleto } from '../../data/personas';
import { cantidadAsistentes } from '../../services/sessionAttendance';
import { persistirAsistencia } from '../../services/mutacionesTutoria';
import { descargarEvidencia } from '../../services/evidenciaAsistencia';
import { API_MODE } from '../../services/apiConfig';
import { formatFecha, formatFechaLarga } from '../../utils/fechas';
import type { Sesion } from '../../types/domain';
import '../../styles/attendance.css';

export function TutorAttendance() {
  const { sesiones, docente, instrumentos } = usePortal();
  const adicionales = instrumentos.filter(
    (r) => ['F06', 'F07'].includes(r.formato) && r.estado === 'borrador',
  );
  const { user } = useAuth();
  const [fecha, setFecha] = useState('');
  const [buscar, setBuscar] = useState('');
  const [parametros, setParametros] = useSearchParams();
  const [detalleId, setDetalleId] = useState<string | null>(() => parametros.get('sesion'));
  const disponibles = sesiones.filter(admiteRegistroAsistencia);
  const detalle = disponibles.find((s) => s.id === detalleId);
  function cerrar() {
    setDetalleId(null);
    const nuevos = new URLSearchParams(parametros);
    nuevos.delete('sesion');
    setParametros(nuevos, { replace: true });
  }
  const [confirmacion, setConfirmacion] = useState('');
  const filas = disponibles.filter(
    (s) =>
      (!fecha || s.fecha === fecha) &&
      `${s.tema} ${s.codigo}`
        .toLocaleLowerCase('es')
        .includes(buscar.trim().toLocaleLowerCase('es')),
  );
  if (!docente || !user) return <EmptyState title="Sin docente asociado" />;
  return (
    <div className="attendance-page">
      <PageHeading
        eyebrow="Tutoría"
        title="Asistencias"
        description="Confirma la asistencia para habilitar la evaluación."
      />
      {confirmacion && (
        <p className="attendance-notice" role="status">
          {confirmacion}
        </p>
      )}
      {adicionales.map((r) => (
        <Link
          key={r.id}
          className="btn btn-falcon-default"
          to={`/tutor/instrumentos?registro=${encodeURIComponent(r.id)}`}
        >
          Completar formato {r.formato.slice(1)}
        </Link>
      ))}
      <section className="card attendance-register" aria-label="Registro de sesiones">
        <div className="attendance-filters">
          <label className="field">
            <span>Buscar sesión</span>
            <input
              className="input"
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Título o código"
            />
          </label>
          <label className="field">
            <span>Fecha</span>
            <input
              className="input"
              type="date"
              value={fecha}
              onInput={(e) => setFecha(e.currentTarget.value)}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          {(fecha || buscar) && (
            <button
              className="btn btn-falcon-default"
              type="button"
              onClick={() => {
                setFecha('');
                setBuscar('');
              }}
            >
              Limpiar
            </button>
          )}
          <span className="small muted">{filas.length} sesiones</span>
        </div>
        <DataTable
          rows={filas}
          rowKey={(s) => s.id}
          caption="Asistencia por sesión"
          pagination="auto"
          initialSort={{ key: 'fecha', direction: 'desc' }}
          emptyTitle="Sin sesiones para registrar"
          emptyDescription={
            fecha || buscar
              ? 'Prueba con otra fecha o título.'
              : 'Las sesiones aparecen aquí después de su hora de fin.'
          }
          columns={[
            {
              key: 'fecha',
              header: 'Fecha',
              sortable: true,
              sortValue: (s) => s.fecha,
              render: (s) => (
                <>
                  <span className="cell-strong nowrap">{formatFecha(s.fecha)}</span>
                  <span className="cell-note mono">
                    {s.horaInicio}–{s.horaFin}
                  </span>
                </>
              ),
            },
            {
              key: 'sesion',
              header: 'Sesión',
              sortable: true,
              sortValue: (s) => s.tema,
              render: (s) => (
                <>
                  <span className="cell-strong">{s.tema}</span>
                  <span className="cell-note mono">{s.codigo}</span>
                </>
              ),
            },
            {
              key: 'tipo',
              header: 'Tipo',
              render: (s) => (
                <Badge tone={s.tipo === 'grupal' ? 'dorado' : 'info'}>
                  {s.tipo === 'grupal' ? 'Grupal' : 'Individual'}
                </Badge>
              ),
            },
            {
              key: 'asistentes',
              header: 'Asistentes',
              render: (s) => (
                <>
                  <span className="cell-strong">
                    {s.asistenciaConfirmada
                      ? `${cantidadAsistentes(s)} de ${s.asistentes.length}`
                      : `${s.asistentes.length} convocados`}
                  </span>
                  <span className="cell-note">{s.acuerdos.length} acuerdos</span>
                </>
              ),
            },
            {
              key: 'accion',
              header: 'Registro',
              render: (s) => (
                <button
                  type="button"
                  className="btn btn-falcon-default btn-sm"
                  aria-label={`Revisar asistencia de ${s.codigo}`}
                  onClick={() => {
                    setDetalleId(s.id);
                    setConfirmacion('');
                  }}
                >
                  {s.asistenciaConfirmada ? 'Revisar' : 'Registrar'}
                </button>
              ),
            },
          ]}
        />
      </section>
      {detalle && (
        <AttendanceEditor
          key={detalle.id}
          sesion={detalle}
          onClose={cerrar}
          onSave={async (asistentes, mensaje, tipo, version, evidencia) => {
            await persistirAsistencia(
              user,
              { ...detalle, version },
              asistentes,
              mensaje,
              tipo,
              evidencia,
            );
            setConfirmacion(
              `Registro guardado · ${detalle.codigo}${mensaje.trim() ? '. El acuerdo ya está disponible en la sesión del estudiante.' : '.'}`,
            );
          }}
        />
      )}
      {detalleId && !detalle && (
        <Alert tone="alerta" title="Sesión no disponible">
          Busca en Sesiones; solo se puede registrar la asistencia al finalizar.
        </Alert>
      )}
    </div>
  );
}

function AttendanceEditor({
  sesion,
  onClose,
  onSave,
}: {
  sesion: Sesion;
  onClose(): void;
  onSave(
    asistentes: Sesion['asistentes'],
    mensaje: string,
    tipo: string,
    version?: number,
    evidencia?: File,
  ): Promise<void>;
}) {
  const [version] = useState(sesion.version);
  const [completada, setCompletada] = useState(false);
  const guardadoEnCurso = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [evidencia, setEvidencia] = useState<File>();
  const [descargando, setDescargando] = useState(false);
  const [tipoTutoria, setTipoTutoria] = useState('Académica');
  const [asistentes, setAsistentes] = useState<Sesion['asistentes']>(() =>
    sesion.asistentes.map((a) => ({
      ...a,
      estado: a.estado === 'asistio' || a.estado === 'tarde' ? 'asistio' : 'falto',
    })),
  );
  const [mensaje, setMensaje] = useState('');
  const [marcados, setMarcados] = useState(
    () =>
      new Set(sesion.estado === 'realizada' ? sesion.asistentes.map((a) => a.estudianteId) : []),
  );
  const [error, setError] = useState('');
  const total = asistentes.filter((a) => a.estado === 'asistio' || a.estado === 'tarde').length;
  async function guardar() {
    if (guardadoEnCurso.current) return;
    guardadoEnCurso.current = true;
    setGuardando(true);
    setError('');
    try {
      await onSave(asistentes, mensaje, tipoTutoria, version, evidencia);
      setCompletada(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo guardar el registro. Inténtalo de nuevo.',
      );
    } finally {
      guardadoEnCurso.current = false;
      setGuardando(false);
    }
  }
  if (completada)
    return (
      <Sheet title="Registro confirmado" onClose={onClose} wide>
        <FormCompletion formato={sesion.tipo === 'individual' ? 'F06' : 'F07'} onFinish={onClose} />
      </Sheet>
    );
  return (
    <Sheet
      title={sesion.tema}
      description={`${formatFechaLarga(sesion.fecha)} · ${sesion.horaInicio}–${sesion.horaFin} · ${sesion.codigo}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-falcon-default" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={guardar}
            disabled={guardando || marcados.size !== asistentes.length}
          >
            {guardando
              ? 'Guardando…'
              : sesion.asistenciaConfirmada
                ? 'Guardar registro'
                : 'Finalizar sesión y guardar asistencia'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">Marca la asistencia de todos los convocados.</p>
        {error && (
          <Alert tone="riesgo" title="Revisa el registro">
            {error}
          </Alert>
        )}
        <div className="ui-row ui-row--between ui-row--wrap">
          <strong>
            {total} de {asistentes.length} asistentes
          </strong>
          <span className="small muted">
            Formato {sesion.tipo === 'individual' ? '06' : '07'} · {sesion.semestreId}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-falcon-default"
          onClick={() => {
            setAsistentes((lista) =>
              lista.map((a) => ({
                ...a,
                estado: 'asistio',
                horaRegistro: a.horaRegistro ?? sesion.horaInicio,
              })),
            );
            setMarcados(new Set(asistentes.map((a) => a.estudianteId)));
          }}
        >
          Marcar todos como presentes
        </button>
        <table className="attendance-students">
          <caption className="sr-only">Asistencia de los estudiantes de esta sesión</caption>
          <thead>
            <tr>
              <th scope="col">Estudiante</th>
              <th scope="col">Asistió</th>
              <th scope="col">Faltó</th>
            </tr>
          </thead>
          <tbody>
            {asistentes.map((asistente) => {
              const estudiante = estudiantePorId(asistente.estudianteId);
              const nombre = estudiante ? nombreCompleto(estudiante) : asistente.estudianteId;
              return (
                <tr className="attendance-student" key={asistente.estudianteId}>
                  <th scope="row">
                    <strong>{nombre}</strong>
                    <span className="cell-note mono">
                      {estudiante?.codigo ?? asistente.estudianteId}
                    </span>
                  </th>
                  {(['asistio', 'falto'] as const).map((estado) => (
                    <td key={estado}>
                      <label className="attendance-choice">
                        <input
                          type="radio"
                          name={`asistencia-${asistente.estudianteId}`}
                          value={estado}
                          disabled={guardando}
                          checked={
                            marcados.has(asistente.estudianteId) && asistente.estado === estado
                          }
                          onChange={() => {
                            setMarcados((lista) => new Set([...lista, asistente.estudianteId]));
                            setAsistentes((lista) =>
                              lista.map((alumno) =>
                                alumno.estudianteId === asistente.estudianteId
                                  ? {
                                      ...alumno,
                                      estado,
                                      horaRegistro:
                                        estado === 'asistio'
                                          ? (alumno.horaRegistro ?? sesion.horaInicio)
                                          : null,
                                    }
                                  : alumno,
                              ),
                            );
                          }}
                        />
                        <span className="sr-only">
                          {estado === 'asistio' ? 'Asistió' : 'Faltó'}: {nombre}
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {API_MODE && sesion.tipo === 'individual' && (
          <label className="field">
            <span>Tipo de tutoría individual</span>
            <select
              className="select"
              value={tipoTutoria}
              disabled={guardando}
              onChange={(e) => setTipoTutoria(e.target.value)}
            >
              <option>Académica</option>
              <option>Personal</option>
              <option>Social</option>
            </select>
          </label>
        )}
        {API_MODE && (
          <section className="stack stack--sm" aria-label="Evidencia de asistencia">
            <label className="field">
              <span>Evidencia (opcional)</span>
              <input
                className="input"
                type="file"
                accept={
                  sesion.tipo === 'grupal' ? 'application/pdf,.pdf,image/*' : 'application/pdf,.pdf'
                }
                disabled={guardando}
                onChange={(e) => {
                  if (e.currentTarget.files?.[0]) setEvidencia(e.currentTarget.files[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            {sesion.tipo === 'grupal' && (
              <label className="field attendance-camera">
                <span>Tomar foto</span>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={guardando}
                  onChange={(e) => {
                    if (e.currentTarget.files?.[0]) setEvidencia(e.currentTarget.files[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            )}
            <p className="small muted">
              {sesion.tipo === 'grupal' ? 'Foto o PDF' : 'PDF'} · Hasta 8 MB.
            </p>
            {evidencia && (
              <p className="small">
                Adjunto seleccionado: {evidencia.name}{' '}
                <button
                  type="button"
                  className="btn btn-link"
                  disabled={guardando}
                  onClick={() => setEvidencia(undefined)}
                >
                  Quitar adjunto
                </button>
              </p>
            )}
            {sesion.evidenciaNombre && (
              <button
                type="button"
                className="btn btn-falcon-default"
                disabled={descargando}
                onClick={async () => {
                  setDescargando(true);
                  setError('');
                  try {
                    await descargarEvidencia(sesion.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo descargar la evidencia.');
                  } finally {
                    setDescargando(false);
                  }
                }}
              >
                {descargando ? 'Descargando…' : 'Descargar evidencia guardada'}
              </button>
            )}
          </section>
        )}
        <section className="stack stack--sm" aria-label="Acuerdos de tutoría">
          {sesion.acuerdos.length > 0 && (
            <details>
              <summary>Acuerdos anteriores ({sesion.acuerdos.length})</summary>
              <ul className="list">
                {sesion.acuerdos.map((a) => (
                  <li className="list__item" key={a.id}>
                    {a.descripcion}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label className="field" htmlFor="asistencia-acuerdo">
            <span>Nuevo acuerdo o mensaje</span>
            <textarea
              id="asistencia-acuerdo"
              className="textarea"
              rows={3}
              value={mensaje}
              maxLength={2000}
              onChange={(e) => setMensaje(e.target.value)}
              aria-describedby="asistencia-acuerdo-ayuda"
              placeholder="Escribe el acuerdo de esta sesión…"
            />
          </label>
          <p id="asistencia-acuerdo-ayuda" className="small muted">
            Se mostrará a los estudiantes de esta sesión. Solo verán el acuerdo y la cantidad de
            asistentes.
          </p>
        </section>
        <p className="small muted">
          {API_MODE
            ? 'La asistencia y el formato de atención se guardan al confirmar el registro.'
            : 'Demostración: registro guardado en este navegador.'}
        </p>
      </div>
    </Sheet>
  );
}
