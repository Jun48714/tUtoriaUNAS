import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useStudentNotices } from './useStudentNotices';
import { API_MODE } from '../services/apiConfig';
import { snapshotApi } from '../services/apiTutoria';
import { useSessionAttendance } from './useSessionAttendance';
import { resolverSesiones } from '../services/sessionWorkspace';
import { useScheduledSessions } from './useScheduledSessions';
import {
  bloqueoEvaluacion,
  esEvaluacionSesion,
  evaluacionesDeSesiones,
} from '../utils/evaluacionesSesion';
import { useInstrumentWorkspace } from './useInstrumentWorkspace';
import { puedeEnviarFormato } from '../utils/instrumentos';
import { formulariosVigentes } from '../utils/entrevistas';
import { semestreVigente } from '../data/catalogos';
import { derivacionesDesdeInstrumentos } from '../utils/seguimientoInstrumentos';
import { useAhora } from './useAhora';
import type {
  Asignacion,
  Derivacion,
  Docente,
  Estudiante,
  Instrumento,
  Notificacion,
  Sesion,
} from '../types/domain';
import type { Contadores } from '../data';
// Imports directos por módulo (en vez del barrel ../data): evita arrastrar
// todos los catálogos de datos al chunk compartido del portal.
import { estudiantePorId, docentePorId } from '../data/personas';
import { asignacionDe, tutoradosDe, asignaciones as todasAsignaciones } from '../data/tutoria';
import {
  derivacionesDe,
  derivacionesDeTutor,
  derivaciones as todasDerivaciones,
} from '../data/derivaciones';
import { notificaciones } from '../data/institucional';
import { definicionPorCodigo } from '../data/formatos';

const ESTADOS_ABIERTOS: Derivacion['estado'][] = [
  'registrada',
  'recibida',
  'citada',
  'en-atencion',
  'seguimiento',
  'no-presentado',
];

const ESTADOS_PENDIENTES: Instrumento['estado'][] = ['no-iniciado', 'borrador', 'observado'];

export interface Portal {
  /** Entidades resueltas para el usuario de la sesión. */
  estudiante: Estudiante | null;
  docente: Docente | null;
  asignacion: Asignacion | null;
  tutor: Docente | null;
  /** Alcance de datos según el rol. */
  tutorados: Asignacion[];
  sesiones: Sesion[];
  instrumentos: Instrumento[];
  derivaciones: Derivacion[];
  contadores: Contadores;
  /** Ámbito institucional: escuela del estudiante o del tutor. */
  escuelaId: string;
  institucional: boolean;
  avisosSinLeer: number;
  notificaciones: Notificacion[];
}

/**
 * Resuelve la sesión de demostración en entidades del dominio y calcula el
 * alcance de datos y los contadores que muestra la barra lateral.
 */
export function usePortal(): Portal {
  const { user } = useAuth();
  const avisosEstudiante = useStudentNotices();
  const role = user?.role ?? 'estudiante';
  const userId = user?.id ?? '';
  const escuelaActiva = API_MODE ? snapshotApi().datos?.escuelaId : undefined;
  const institucional = API_MODE && snapshotApi().datos?.consultaInstitucional === true;
  const { registros: todosInstrumentos, momento } = useInstrumentWorkspace();
  const registrosAsistencia = useSessionAttendance();
  const programadas = useScheduledSessions();
  // Solo el conteo de pendientes depende del reloj (bloqueos de evaluación).
  // La firma de bloqueos hace que el Portal completo se recalcule únicamente
  // cuando entra o sale un bloqueo, no en cada tick del intervalo.
  const ahora = useAhora();

  const alcance = useMemo(() => {
    let estudiante: Estudiante | null = null;
    let doc: Docente | null = null;
    let asignacion: Asignacion | null = null;
    let tutorados: Asignacion[] = [];
    let instrumentos: Instrumento[] = [];
    let derivaciones: Derivacion[] = [];

    if (role === 'estudiante') {
      estudiante = estudiantePorId(userId) ?? null;
      if (estudiante) {
        asignacion = asignacionDe(estudiante.id) ?? null;
        // El tutorado solo responde los instrumentos cuyo actor es él mismo
        // (entrevistas 03, 04 o 05 y evaluaciones 10 y 11). Los formatos que
        // llena el docente tutor pertenecen a su bandeja, no a la del tutorado.
        instrumentos = formulariosVigentes(todosInstrumentos, estudiante.ciclo, semestreVigente.id)
          .filter((item) => item.estudianteId === estudiante!.id)
          .filter((instrumento) => definicionPorCodigo(instrumento.formato)?.actor === 'tutorado');
        derivaciones = derivacionesDe(estudiante.id);
      }
    } else if (role === 'tutor') {
      doc = docentePorId(userId) ?? null;
      if (doc) {
        tutorados = tutoradosDe(doc.id);
        instrumentos = todosInstrumentos.filter((item) => item.tutorId === doc!.id);
        derivaciones = derivacionesDeTutor(doc.id);
      }
    } else {
      doc = docentePorId(user?.personaId ?? 'DOC-0422') ?? null;
      tutorados = todasAsignaciones;
      instrumentos = todosInstrumentos;
      derivaciones = todasDerivaciones;
    }

    const extrasDerivaciones = API_MODE ? [] : derivacionesDesdeInstrumentos(todosInstrumentos);
    const sesiones = resolverSesiones(todosInstrumentos, programadas, registrosAsistencia).filter(
      (s) =>
        role === 'coordinacion' ||
        (role === 'tutor'
          ? s.tutorId === doc?.id
          : s.asistentes.some((a) => a.estudianteId === estudiante?.id)),
    );
    instrumentos = [
      ...instrumentos.filter((r) => !esEvaluacionSesion(r.formato)),
      ...evaluacionesDeSesiones(sesiones, todosInstrumentos).filter(
        (r) => role !== 'estudiante' || r.estudianteId === estudiante?.id,
      ),
    ];
    derivaciones = [
      ...derivaciones,
      ...extrasDerivaciones.filter(
        (d) =>
          role === 'coordinacion' ||
          (role === 'tutor' ? d.tutorId === doc?.id : d.estudianteId === estudiante?.id),
      ),
    ];
    const tutor = asignacion ? (docentePorId(asignacion.tutorId) ?? null) : null;
    const escuelaId = escuelaActiva ?? estudiante?.escuelaId ?? doc?.escuelaId ?? 'E-IIS';

    return {
      estudiante,
      docente: doc,
      asignacion,
      tutor,
      tutorados,
      sesiones,
      instrumentos,
      derivaciones,
      escuelaId,
    };
  }, [
    role,
    userId,
    user?.personaId,
    escuelaActiva,
    todosInstrumentos,
    registrosAsistencia,
    programadas,
  ]);

  // Firma estable: los identificadores de instrumentos de evaluación cuya
  // sesión está bloqueada en este instante. Su valor solo cambia cuando un
  // bloqueo entra o expira, aunque el reloj avance.
  const firmasBloqueo = useMemo(() => {
    const bloqueados = alcance.instrumentos
      .filter(
        (instrumento) =>
          esEvaluacionSesion(instrumento.formato) &&
          bloqueoEvaluacion(
            alcance.sesiones.find((s) => s.id === instrumento.sesionId),
            instrumento.estudianteId ?? '',
            ahora,
          ),
      )
      .map((instrumento) => instrumento.id)
      .sort((a, b) => a.localeCompare(b));
    return bloqueados.length === 0 ? '' : bloqueados.join('|');
  }, [alcance, ahora]);

  return useMemo<Portal>(() => {
    const { sesiones, instrumentos, derivaciones } = alcance;
    const bloqueados = new Set(firmasBloqueo ? firmasBloqueo.split('|') : []);
    const sesionesPendientes = sesiones.filter((sesion) => sesion.estado === 'programada').length;
    const instrumentosPendientes = instrumentos.filter(
      (instrumento) =>
        ESTADOS_PENDIENTES.includes(instrumento.estado) &&
        puedeEnviarFormato(instrumento.formato, momento) &&
        (!esEvaluacionSesion(instrumento.formato) || !bloqueados.has(instrumento.id)) &&
        (role !== 'tutor' || definicionPorCodigo(instrumento.formato)?.actor === 'tutor'),
    ).length;
    const derivacionesAbiertas = derivaciones.filter((derivacion) =>
      ESTADOS_ABIERTOS.includes(derivacion.estado),
    ).length;
    const notificacionesVisibles: Notificacion[] =
      role === 'estudiante' ? avisosEstudiante.mensajes : notificaciones;
    const avisosSinLeer = notificacionesVisibles.filter(
      (notificacion) => !notificacion.leida,
    ).length;
    const instrumentosObservados = instrumentos.filter(
      (instrumento) => instrumento.estado === 'observado',
    ).length;

    return {
      ...alcance,
      contadores: {
        sesiones: sesionesPendientes,
        pendientes: instrumentosPendientes,
        derivaciones: derivacionesAbiertas,
        avisos: avisosSinLeer,
        observados: instrumentosObservados,
        revisiones: instrumentos.filter(
          (item) => ['F03', 'F04', 'F05'].includes(item.formato) && item.estado === 'enviado',
        ).length,
      },
      institucional,
      avisosSinLeer,
      notificaciones: notificacionesVisibles,
    };
  }, [alcance, firmasBloqueo, momento, role, institucional, avisosEstudiante.mensajes]);
}
