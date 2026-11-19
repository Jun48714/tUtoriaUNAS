import { SuccessNotice } from '../../components/ui/SuccessNotice';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useInstrumentWorkspace } from '../../hooks/useInstrumentWorkspace';
import { useAhora } from '../../hooks/useAhora';
import { persistirProgramacion } from '../../services/mutacionesTutoria';
import { TriangleAlert } from '../../components/ui/icons';
import { PageHeading } from '../../components/ui/PageHeading';

import { Alert } from '../../components/ui/Alert';

import { EmptyState } from '../../components/ui/EmptyState';
import { Sheet } from '../../components/ui/Sheet';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { usePortal } from '../../hooks/usePortal';
import { SessionCalendar } from '../../components/panels/SessionCalendar';
import { SessionDetails } from '../../components/panels/SessionDetails';
import { AccionesSesion } from '../../components/panels/AccionesTutoria';
import { DisponibilidadSemanal } from '../../components/panels/DisponibilidadSemanal';

import { semestreActual } from '../../data/catalogos';
import { estudiantePorId, nombreCompleto } from '../../data/personas';
import { API_MODE } from '../../services/apiConfig';
import {
  consultarDisponibilidad,
  crucesDeBloque,
  disponibilidadDemo,
  lunesDeSemana,
} from '../../services/disponibilidadTutoria';
import { consultarSesiones } from '../../services/sessionWorkspace';
import type { ModalidadSesion, Sesion } from '../../types/domain';
import { fechaActualLima, formatFechaLarga, formatHora, formatRangoHora } from '../../utils/fechas';
import { admiteRegistroAsistencia, enlaceVirtualSesion } from '../../utils/evaluacionesSesion';

/** Sesiones del docente: un solo calendario con detalle y programación. */

type Ventana = { tipo: 'detalle'; sesionId: string } | { tipo: 'programar' } | null;

export function TutorSessions() {
  const portal = usePortal();
  const { user } = useAuth();
  const workspace = useInstrumentWorkspace();
  const ahora = useAhora(12_000);
  const { docente, tutorados, sesiones } = portal;
  const [parametros] = useSearchParams();

  const [ventana, setVentana] = useState<Ventana>(() =>
    parametros.get('accion') === 'programar' ? { tipo: 'programar' } : null,
  );

  const [nuevoTipo, setNuevoTipo] = useState<ModalidadSesion>('individual');
  const [nuevaFecha, setNuevaFecha] = useState(fechaActualLima);
  const [nuevaInicio, setNuevaInicio] = useState('16:00');
  const [nuevaFin, setNuevaFin] = useState('17:00');
  const [nuevoEstudiante, setNuevoEstudiante] = useState(
    tutorados.find((a) => a.estudianteId === parametros.get('estudiante'))?.estudianteId ??
      tutorados[0]?.estudianteId ??
      '',
  );
  const grupos = [...new Set(tutorados.flatMap((a) => (a.grupo ? [a.grupo] : [])))];
  const [nuevoGrupo, setNuevoGrupo] = useState(grupos[0] ?? '');
  const [modalidad, setModalidad] = useState<Sesion['modalidad']>('presencial');
  const [lugar, setLugar] = useState('Cubículo de tutoría · Pabellón B');
  const [enlace, setEnlace] = useState('');
  const [tema, setTema] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const lugarSesion = modalidad === 'virtual' ? enlace : lugar;
  const urlSesion = enlaceVirtualSesion({ modalidad, lugar: lugarSesion });
  const grupoActivo = grupos.includes(nuevoGrupo) ? nuevoGrupo : (grupos[0] ?? '');
  const convocados =
    nuevoTipo === 'individual'
      ? [nuevoEstudiante].filter(Boolean)
      : tutorados
          .filter((a) => grupoActivo && a.grupo === grupoActivo)
          .map((a) => a.estudianteId)
          .sort();
  const lunes = lunesDeSemana(nuevaFecha);
  const participantesValidos =
    convocados.length <= 100 && convocados.length >= (nuevoTipo === 'grupal' ? 2 : 1);
  const consultar =
    ventana?.tipo === 'programar' && Boolean(lunes) && participantesValidos && Boolean(docente);
  const disponibilidadApi = useQuery({
    queryKey: ['disponibilidad-tutoria', docente?.id, semestreActual, lunes, convocados],
    queryFn: ({ signal }) => consultarDisponibilidad(lunes, convocados, signal),
    enabled: API_MODE && consultar,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const disponibilidad = !consultar
    ? undefined
    : API_MODE
      ? disponibilidadApi.isError
        ? undefined
        : disponibilidadApi.data
      : disponibilidadDemo(docente!.id, convocados, lunes, consultarSesiones(workspace.registros));
  const horasValidas = Boolean(nuevaInicio && nuevaFin && nuevaInicio < nuevaFin);
  const fechaFutura = horasValidas && Date.parse(`${nuevaFecha}T${nuevaInicio}:00-05:00`) > ahora;
  const hayCruces = Boolean(
    disponibilidad &&
    horasValidas &&
    crucesDeBloque(disponibilidad, nuevaFecha, nuevaInicio, nuevaFin).length,
  );
  const puedeProgramar = !guardando && fechaFutura && Boolean(disponibilidad) && !hayCruces;
  const problemaHorario = hayCruces
    ? 'Horario ocupado. Elige otro día u hora.'
    : consultar && !fechaFutura
      ? horasValidas
        ? 'Elige un horario futuro.'
        : 'El fin debe ser posterior al inicio.'
      : '';
  async function programar() {
    if (!user || !puedeProgramar) return;
    if (!lugarSesion.trim() || !tema.trim() || !objetivo.trim()) {
      setError('Completa el lugar o enlace, el tema y el objetivo.');
      return;
    }
    if (modalidad === 'virtual' && !urlSesion) {
      setError('Ingresa un enlace que empiece con https:// o http://.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      const sesion = await persistirProgramacion(
        user,
        {
          tipo: nuevoTipo,
          fecha: nuevaFecha,
          horaInicio: nuevaInicio,
          horaFin: nuevaFin,
          modalidad,
          lugar: lugarSesion,
          tema,
          objetivo,
          estudiantes: convocados,
        },
        workspace.registros,
      );
      setError('');
      setTema('');
      setObjetivo('');
      setAviso('Sesión programada.');
      setVentana({ tipo: 'detalle', sesionId: sesion.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo programar la sesión.');
      if (API_MODE) void disponibilidadApi.refetch();
    } finally {
      setGuardando(false);
    }
  }

  const tutoradosResueltos = tutorados.flatMap((asignacion) => {
    const estudiante = estudiantePorId(asignacion.estudianteId);
    return estudiante ? [{ estudiante, grupo: asignacion.grupo }] : [];
  });

  const sesionDetalle =
    ventana && ventana.tipo !== 'programar'
      ? sesiones.find((sesion) => sesion.id === ventana.sesionId)
      : undefined;

  if (!docente) {
    return (
      <PageHeading
        eyebrow="Acompañamiento tutorial"
        title="Sesiones de tutoría"
        description="La cuenta de demostración no tiene una ficha de docente tutor asociada."
      />
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Tutoría"
        title="Sesiones de tutoría"
        actions={
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError('');
                setVentana({ tipo: 'programar' });
              }}
            >
              Programar sesión
            </button>
          </>
        }
      />
      {aviso && <SuccessNotice>{aviso}</SuccessNotice>}
      <SessionCalendar
        sesiones={sesiones}
        onAbrir={(sesion) => setVentana({ tipo: 'detalle', sesionId: sesion.id })}
      />

      {ventana?.tipo === 'detalle' && sesionDetalle && (
        <Sheet
          title={sesionDetalle.tema}
          description={`${formatFechaLarga(sesionDetalle.fecha)} · ${formatRangoHora(
            formatHora(sesionDetalle.horaInicio),
            formatHora(sesionDetalle.horaFin),
          )} · ${sesionDetalle.codigo}`}
          onClose={() => setVentana(null)}
          wide
          footer={
            <>
              {admiteRegistroAsistencia(sesionDetalle) && (
                <Link
                  className="btn btn-primary"
                  to={`/tutor/asistencias?sesion=${encodeURIComponent(sesionDetalle.id)}`}
                >
                  Registrar asistencia
                </Link>
              )}
              <button
                type="button"
                className="btn btn-falcon-default"
                onClick={() => setVentana(null)}
              >
                Cerrar
              </button>
            </>
          }
        >
          <SessionDetails sesion={sesionDetalle} />
          <AccionesSesion sesion={sesionDetalle} />
        </Sheet>
      )}

      {ventana?.tipo === 'programar' && (
        <Sheet
          title="Programar sesión"
          className="programacion-tutoria"
          onClose={() => {
            if (!guardando) setVentana(null);
          }}
          footer={
            <>
              {(error || problemaHorario) && (
                <p className="programacion-tutoria__estado" role={error ? 'alert' : 'status'}>
                  <TriangleAlert aria-hidden="true" />
                  <span>{error || problemaHorario}</span>
                </p>
              )}
              <div className="programacion-tutoria__acciones">
                <button
                  type="button"
                  className="btn btn-falcon-default"
                  onClick={() => setVentana(null)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={programar}
                  disabled={!puedeProgramar}
                >
                  {guardando ? 'Programando…' : 'Programar'}
                </button>
              </div>
            </>
          }
        >
          <div className="programacion-tutoria__contenido">
            <div className="programacion-tutoria__datos">
              <div className="programacion-tutoria__tipo">
                <div className="field">
                  <label htmlFor="programar-tipo">Tipo de tutoría</label>
                  <select
                    id="programar-tipo"
                    className="select"
                    value={nuevoTipo}
                    onChange={(evento) =>
                      setNuevoTipo(evento.target.value === 'grupal' ? 'grupal' : 'individual')
                    }
                  >
                    <option value="individual">Individual</option>
                    <option value="grupal">Grupal</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="programar-modalidad">Modalidad</label>
                  <select
                    id="programar-modalidad"
                    className="select"
                    value={modalidad}
                    onChange={(e) => setModalidad(e.target.value as Sesion['modalidad'])}
                  >
                    <option value="presencial">Presencial</option>
                    <option value="virtual">Virtual</option>
                    <option value="mixta">Mixta</option>
                  </select>
                </div>
              </div>

              {nuevoTipo === 'individual' && (
                <SearchableSelect
                  label="Estudiante"
                  placeholder="Buscar por nombre o código"
                  options={tutoradosResueltos.map(({ estudiante }) => ({
                    value: estudiante.id,
                    label: nombreCompleto(estudiante),
                    description: estudiante.codigo,
                  }))}
                  value={nuevoEstudiante}
                  onChange={setNuevoEstudiante}
                  autoFocus={false}
                  required
                />
              )}
              {nuevoTipo === 'grupal' && (
                <div className="field">
                  <label htmlFor="programar-grupo">Grupo</label>
                  <select
                    id="programar-grupo"
                    className="select"
                    value={grupoActivo}
                    onChange={(e) => setNuevoGrupo(e.target.value)}
                  >
                    {grupos.map((grupo) => (
                      <option key={grupo} value={grupo}>
                        {grupo}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">
                    {convocados.length} {convocados.length === 1 ? 'participante' : 'participantes'}
                  </span>
                </div>
              )}

              <div className="programacion-tutoria__horas">
                <div className="field programacion-tutoria__fecha">
                  <label htmlFor="programar-fecha">Fecha</label>
                  <input
                    id="programar-fecha"
                    className="input"
                    type="date"
                    value={nuevaFecha}
                    onChange={(evento) => setNuevaFecha(evento.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="programar-inicio">Inicio</label>
                  <input
                    id="programar-inicio"
                    className="input"
                    type="time"
                    value={nuevaInicio}
                    onChange={(evento) => setNuevaInicio(evento.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="programar-fin">Fin</label>
                  <input
                    id="programar-fin"
                    className="input"
                    type="time"
                    value={nuevaFin}
                    onChange={(evento) => setNuevaFin(evento.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="programar-lugar">
                  {modalidad === 'presencial'
                    ? 'Lugar'
                    : modalidad === 'virtual'
                      ? 'Enlace'
                      : 'Lugar o enlace'}
                </label>
                <input
                  id="programar-lugar"
                  className="input"
                  type={modalidad === 'virtual' ? 'url' : 'text'}
                  placeholder={modalidad === 'virtual' ? 'https://…' : undefined}
                  value={lugarSesion}
                  onChange={(e) => (modalidad === 'virtual' ? setEnlace : setLugar)(e.target.value)}
                  maxLength={300}
                  required
                />
                {urlSesion && (
                  <a className="small" href={urlSesion} target="_blank" rel="noopener noreferrer">
                    Abrir enlace virtual
                  </a>
                )}
              </div>
            </div>
            <aside className="programacion-tutoria__agenda" aria-label="Horario para programar">
              {disponibilidad ? (
                <DisponibilidadSemanal
                  datos={disponibilidad}
                  fecha={nuevaFecha}
                  inicio={nuevaInicio}
                  fin={nuevaFin}
                  ahora={ahora}
                  seleccionar={setNuevaFecha}
                  seleccionarTramo={(fecha, inicio, fin) => {
                    setNuevaFecha(fecha);
                    setNuevaInicio(inicio);
                    setNuevaFin(fin);
                    setError('');
                  }}
                />
              ) : API_MODE && consultar && disponibilidadApi.isError ? (
                <div className="stack">
                  <Alert tone="riesgo" title="No se pudo consultar el horario">
                    {disponibilidadApi.error.message}
                  </Alert>
                  <button
                    type="button"
                    className="btn btn-falcon-default btn-sm"
                    onClick={() => void disponibilidadApi.refetch()}
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <p className="disponibilidad__espera small muted" role="status">
                  {consultar
                    ? 'Consultando disponibilidad…'
                    : !lunes
                      ? 'Elige una fecha.'
                      : nuevoTipo === 'grupal'
                        ? 'Elige un grupo de 2 a 100 estudiantes.'
                        : 'Elige un estudiante.'}
                </p>
              )}
            </aside>
            <div className="programacion-tutoria__detalle">
              <div className="field">
                <label htmlFor="programar-tema">Tema</label>
                <input
                  id="programar-tema"
                  className="input"
                  type="text"
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="programar-objetivo">Objetivo</label>
                <textarea
                  id="programar-objetivo"
                  className="textarea"
                  rows={2}
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                  maxLength={2000}
                  required
                />
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {ventana?.tipo === 'detalle' && !sesionDetalle && (
        <Sheet
          title="Sesión no disponible"
          description="La sesión seleccionada ya no figura en el registro"
          onClose={() => setVentana(null)}
        >
          <EmptyState
            title="Sesión no encontrada"
            description="Actualiza el listado de sesiones para volver a intentarlo."
            icon={<TriangleAlert />}
          />
        </Sheet>
      )}
    </>
  );
}
