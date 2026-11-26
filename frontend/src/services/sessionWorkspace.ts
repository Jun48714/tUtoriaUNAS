import { API_MODE } from './apiConfig';
import { snapshotApi } from './apiTutoria';
import type { Instrumento, Sesion } from '../types/domain';
import type { DemoUser } from '../types/auth';
import { asignaciones, sesiones } from '../data/tutoria';
import { semestreVigente } from '../data/catalogos';
import {
  crucesDeBloque,
  disponibilidadDemo,
  lunesDeSemana,
  origenOcupacion,
} from './disponibilidadTutoria';
import { sesionesDesdeInstrumentos } from '../utils/seguimientoInstrumentos';
import { aplicarRegistro, ATTENDANCE_KEY, leerRegistros } from './sessionAttendance';
import { enlaceVirtualSesion } from '../utils/evaluacionesSesion';
import { esHora24, esModalidad, esObjeto } from '../utils/validacion';

export const SESSIONS_KEY = 'unas:scheduled-sessions:v1';
export const SESSIONS_EVENT = 'unas:scheduled-sessions-updated';

export interface ProgramacionSesion {
  tipo: 'individual' | 'grupal';
  fecha: string;
  horaInicio: string;
  horaFin: string;
  modalidad: 'presencial' | 'virtual' | 'mixta';
  lugar: string;
  tema: string;
  objetivo: string;
  estudiantes: string[];
}

interface SesionProgramadaGuardada extends ProgramacionSesion {
  id: string;
  tutorId: string;
  semestreId: string;
}

function validarEntrada(valor: unknown): ProgramacionSesion | null {
  if (!esObjeto(valor)) return null;
  if (valor.tipo !== 'individual' && valor.tipo !== 'grupal') return null;
  if (typeof valor.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor.fecha)) return null;
  if (typeof valor.horaInicio !== 'string' || !esHora24(valor.horaInicio)) return null;
  if (typeof valor.horaFin !== 'string' || !esHora24(valor.horaFin)) return null;
  if (!esModalidad(valor.modalidad)) return null;
  if (
    typeof valor.lugar !== 'string' ||
    typeof valor.tema !== 'string' ||
    typeof valor.objetivo !== 'string'
  )
    return null;
  const lugar = valor.lugar.trim();
  const tema = valor.tema.trim();
  const objetivo = valor.objetivo.trim();
  if (
    lugar.length < 1 ||
    lugar.length > 300 ||
    tema.length < 1 ||
    tema.length > 200 ||
    objetivo.length < 1 ||
    objetivo.length > 2000
  )
    return null;
  if (
    !Array.isArray(valor.estudiantes) ||
    valor.estudiantes.length < 1 ||
    valor.estudiantes.some((item) => typeof item !== 'string')
  )
    return null;
  return {
    tipo: valor.tipo,
    fecha: valor.fecha,
    horaInicio: valor.horaInicio,
    horaFin: valor.horaFin,
    modalidad: valor.modalidad,
    lugar,
    tema,
    objetivo,
    estudiantes: [...valor.estudiantes],
  };
}

function validarProgramadas(valor: unknown): SesionProgramadaGuardada[] | null {
  if (!Array.isArray(valor)) return null;
  const filas: SesionProgramadaGuardada[] = [];
  for (const item of valor) {
    const entrada = validarEntrada(item);
    if (
      !entrada ||
      !esObjeto(item) ||
      typeof item.id !== 'string' ||
      typeof item.tutorId !== 'string' ||
      typeof item.semestreId !== 'string'
    )
      return null;
    filas.push({ ...entrada, id: item.id, tutorId: item.tutorId, semestreId: item.semestreId });
  }
  return filas;
}

export function leerProgramadas(raw: string | null): Sesion[] {
  try {
    const filas = validarProgramadas(JSON.parse(raw ?? '[]'));
    if (!filas) return [];
    return filas
      .filter(
        (s) =>
          new Set(s.estudiantes).size === s.estudiantes.length &&
          s.estudiantes.every((id) =>
            asignaciones.some(
              (a) =>
                a.estudianteId === id &&
                a.tutorId === s.tutorId &&
                a.semestreId === s.semestreId &&
                a.estado === 'activa',
            ),
          ),
      )
      .map((s): Sesion => ({
        ...s,
        codigo: `TUT-${s.id.slice(-8).toUpperCase()}`,
        estado: 'programada',
        asistentes: s.estudiantes.map((estudianteId) => ({
          estudianteId,
          estado: 'justificado',
          horaRegistro: null,
          observacion: 'Asistencia pendiente de registro',
        })),
        acuerdos: [],
        instrumentoId: null,
        observacion: null,
      }));
  } catch {
    return [];
  }
}

/** Fuente compartida para calendarios, asistencia y validación del guardado de evaluaciones. */
export function resolverSesiones(
  registros: Instrumento[],
  programadas: Sesion[],
  asistencias = leerRegistros(localStorage.getItem(ATTENDANCE_KEY)),
): Sesion[] {
  if (API_MODE) return snapshotApi().datos?.sesiones ?? [];
  const unicas = new Map(
    [...sesiones, ...programadas, ...sesionesDesdeInstrumentos(registros)].map((s) => [s.id, s]),
  );
  return [...unicas.values()].map((s) => aplicarRegistro(s, asistencias));
}
export function consultarSesiones(registros: Instrumento[]): Sesion[] {
  return resolverSesiones(registros, leerProgramadas(localStorage.getItem(SESSIONS_KEY)));
}

/** Persistencia de demostración en el navegador; la API institucional sustituirá este adaptador. */
export function programarSesion(
  actor: DemoUser,
  entrada: ProgramacionSesion,
  registros: Instrumento[],
): Sesion {
  if (API_MODE) throw new Error('La sesión debe programarse en el servidor.');
  if (actor.role !== 'tutor') throw new Error('Solo un docente tutor puede programar sesiones.');
  const dato = validarEntrada(entrada);
  if (!dato)
    throw new Error(
      'Completa la fecha, las horas, el lugar, el tema, el objetivo y los estudiantes.',
    );
  if (dato.modalidad === 'virtual' && !enlaceVirtualSesion(dato))
    throw new Error('Escribe el enlace completo de la sesión virtual (https://…).');
  if (dato.horaFin <= dato.horaInicio)
    throw new Error('La hora de fin debe ser posterior al inicio.');
  const inicio = Date.parse(`${dato.fecha}T${dato.horaInicio}:00-05:00`);
  const fechaValida = new Date(`${dato.fecha}T12:00:00Z`);
  if (
    !Number.isFinite(inicio) ||
    !Number.isFinite(fechaValida.getTime()) ||
    fechaValida.toISOString().slice(0, 10) !== dato.fecha ||
    inicio < Date.now()
  )
    throw new Error('Programa una fecha y hora futuras válidas.');
  if (
    new Set(dato.estudiantes).size !== dato.estudiantes.length ||
    (dato.tipo === 'individual' ? dato.estudiantes.length !== 1 : dato.estudiantes.length < 2)
  )
    throw new Error(
      'Selecciona un estudiante para la sesión individual o al menos dos para la grupal, sin duplicados.',
    );
  if (
    dato.estudiantes.some(
      (id) =>
        !asignaciones.some(
          (a) =>
            a.estudianteId === id &&
            a.tutorId === actor.id &&
            a.semestreId === semestreVigente.id &&
            a.estado === 'activa',
        ),
    )
  )
    throw new Error('Solo puedes convocar a estudiantes de tus asignaciones activas.');
  const ocupacion = disponibilidadDemo(
    actor.id,
    dato.estudiantes,
    lunesDeSemana(dato.fecha),
    consultarSesiones(registros),
  );
  const [cruce] = crucesDeBloque(ocupacion, dato.fecha, dato.horaInicio, dato.horaFin);
  if (cruce)
    throw new Error(`El horario coincide con ${origenOcupacion[cruce.origen].toLowerCase()}.`);
  let anteriores: SesionProgramadaGuardada[] | null;
  try {
    anteriores = validarProgramadas(JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]'));
  } catch {
    anteriores = null;
  }
  if (!anteriores)
    throw new Error(
      'No se pudo recuperar la agenda guardada. Revisa el almacenamiento antes de programar.',
    );
  const nueva = {
    ...dato,
    id: `SES-${crypto.randomUUID()}`,
    tutorId: actor.id,
    semestreId: semestreVigente.id,
  };
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([...anteriores, nueva]));
  window.dispatchEvent(new Event(SESSIONS_EVENT));
  return leerProgramadas(JSON.stringify([nueva]))[0]!;
}
