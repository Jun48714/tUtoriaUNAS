import { API_MODE } from './apiConfig';
import type { Sesion } from '../types/domain';
import type { Role } from '../types/auth';
import { sesionFinalizo } from '../utils/evaluacionesSesion';
import { esHora24, esObjeto, leerMapaSeguro } from '../utils/validacion';

export const ATTENDANCE_KEY = 'unas:session-attendance:v1';
export const ATTENDANCE_EVENT = 'unas:session-attendance-updated';

type AsistenteGuardado = Sesion['asistentes'][number];
type AcuerdoGuardado = Sesion['acuerdos'][number];

export interface RegistroAsistencia {
  tutorId: string;
  asistentes: AsistenteGuardado[];
  acuerdos: AcuerdoGuardado[];
}
export type RegistrosAsistencia = Record<string, RegistroAsistencia>;

function validarAsistente(valor: unknown): AsistenteGuardado | null {
  if (!esObjeto(valor) || typeof valor.estudianteId !== 'string') return null;
  if (
    valor.estado !== 'asistio' &&
    valor.estado !== 'tarde' &&
    valor.estado !== 'falto' &&
    valor.estado !== 'justificado'
  )
    return null;
  if (
    valor.horaRegistro !== null &&
    (typeof valor.horaRegistro !== 'string' || !esHora24(valor.horaRegistro))
  )
    return null;
  if (valor.observacion !== null && typeof valor.observacion !== 'string') return null;
  return {
    estudianteId: valor.estudianteId,
    estado: valor.estado,
    horaRegistro: valor.horaRegistro,
    observacion: valor.observacion,
  };
}

function validarAcuerdo(valor: unknown): AcuerdoGuardado | null {
  if (!esObjeto(valor) || typeof valor.id !== 'string' || typeof valor.descripcion !== 'string')
    return null;
  if (
    valor.responsable !== 'tutor' &&
    valor.responsable !== 'tutorado' &&
    valor.responsable !== 'ambos'
  )
    return null;
  if (valor.fechaCompromiso !== null && typeof valor.fechaCompromiso !== 'string') return null;
  if (valor.estado !== 'pendiente' && valor.estado !== 'cumplido' && valor.estado !== 'vencido')
    return null;
  return {
    id: valor.id,
    descripcion: valor.descripcion,
    responsable: valor.responsable,
    fechaCompromiso: valor.fechaCompromiso,
    estado: valor.estado,
  };
}

function validarRegistro(valor: unknown): RegistroAsistencia | null {
  if (
    !esObjeto(valor) ||
    typeof valor.tutorId !== 'string' ||
    !Array.isArray(valor.asistentes) ||
    !Array.isArray(valor.acuerdos)
  )
    return null;
  const asistentes: AsistenteGuardado[] = [];
  for (const item of valor.asistentes) {
    const asistente = validarAsistente(item);
    if (!asistente) return null;
    asistentes.push(asistente);
  }
  const acuerdos: AcuerdoGuardado[] = [];
  for (const item of valor.acuerdos) {
    const acuerdo = validarAcuerdo(item);
    if (!acuerdo) return null;
    acuerdos.push(acuerdo);
  }
  return { tutorId: valor.tutorId, asistentes, acuerdos };
}

export function leerRegistros(raw: string | null): RegistrosAsistencia {
  try {
    return leerMapaSeguro(JSON.parse(raw ?? '{}'), validarRegistro) ?? {};
  } catch {
    return {};
  }
}

export function aplicarRegistro(sesion: Sesion, registros: RegistrosAsistencia): Sesion {
  if (!['programada', 'realizada'].includes(sesion.estado) || !sesionFinalizo(sesion))
    return sesion;
  const registro = registros[sesion.id];
  if (!registro || registro.tutorId !== sesion.tutorId) return sesion;
  const ids = new Set(sesion.asistentes.map((a) => a.estudianteId));
  if (
    registro.asistentes.length !== ids.size ||
    new Set(registro.asistentes.map((a) => a.estudianteId)).size !== ids.size ||
    registro.asistentes.some((a) => !ids.has(a.estudianteId))
  )
    return sesion;
  return {
    ...sesion,
    estado: 'realizada',
    asistenciaConfirmada: true,
    asistentes: registro.asistentes,
    acuerdos: registro.acuerdos,
  };
}

/** Persistencia de demostración en este navegador; sustituible por la API institucional. */
export function guardarAsistencia(
  actor: { id: string; role: Role },
  sesion: Sesion,
  asistentes: Sesion['asistentes'],
  mensaje: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
) {
  if (API_MODE) throw new Error('La asistencia debe confirmarse en el servidor.');
  if (
    actor.role !== 'tutor' ||
    actor.id !== sesion.tutorId ||
    !['programada', 'realizada'].includes(sesion.estado)
  ) {
    throw new Error('Solo el tutor responsable puede registrar la asistencia de esta sesión.');
  }
  if (!sesionFinalizo(sesion))
    throw new Error('Registra la asistencia cuando haya finalizado la sesión.');
  const registros = leerRegistros(storage.getItem(ATTENDANCE_KEY));
  const actual = aplicarRegistro(sesion, registros);
  const texto = mensaje.trim();
  if (texto.length > 2000) throw new Error('El acuerdo admite hasta 2000 caracteres.');
  const registro = validarRegistro({
    tutorId: sesion.tutorId,
    asistentes,
    acuerdos: texto
      ? [
          ...actual.acuerdos,
          {
            id: `AC-${crypto.randomUUID()}`,
            descripcion: texto,
            responsable: 'ambos',
            fechaCompromiso: null,
            estado: 'pendiente',
          },
        ]
      : actual.acuerdos,
  });
  if (!registro) throw new Error('Revisa los datos de asistencia antes de guardar.');
  const ids = new Set(sesion.asistentes.map((a) => a.estudianteId));
  if (
    registro.asistentes.length !== ids.size ||
    new Set(registro.asistentes.map((a) => a.estudianteId)).size !== ids.size ||
    registro.asistentes.some((a) => !ids.has(a.estudianteId))
  ) {
    throw new Error('La lista debe incluir una sola vez a cada estudiante de la sesión.');
  }
  storage.setItem(ATTENDANCE_KEY, JSON.stringify({ ...registros, [sesion.id]: registro }));
  window.dispatchEvent(new Event(ATTENDANCE_EVENT));
}

export function cantidadAsistentes(sesion: Sesion): number {
  return (
    sesion.totalAsistentes ??
    sesion.asistentes.filter((a) => a.estado === 'asistio' || a.estado === 'tarde').length
  );
}
