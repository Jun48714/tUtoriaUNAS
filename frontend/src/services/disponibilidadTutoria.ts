import { horariosAcademicos, horariosDocentes } from '../data/academico';
import type { Sesion } from '../types/domain';
import { aIso, desdeIso, sumarDias } from '../utils/fechas';
import { apiJson } from './apiClient';

export interface BloqueOcupado {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  origen: 'clase-estudiante' | 'clase-tutor' | 'sesion';
}

export interface DisponibilidadTutoria {
  lunes: string;
  sinHorario: number;
  bloques: BloqueOcupado[];
}

export const origenOcupacion = {
  'clase-estudiante': 'Clase de un estudiante',
  'clase-tutor': 'Clase del tutor',
  sesion: 'Otra sesión de tutoría',
} satisfies Record<BloqueOcupado['origen'], string>;

export function lunesDeSemana(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '';
  const dia = desdeIso(fecha);
  if (!Number.isFinite(dia.getTime()) || aIso(dia) !== fecha) return '';
  return aIso(sumarDias(dia, -((dia.getDay() + 6) % 7)));
}

export function crucesDeBloque(
  disponibilidad: DisponibilidadTutoria,
  fecha: string,
  inicio: string,
  fin: string,
) {
  return disponibilidad.bloques.filter(
    (b) => b.fecha === fecha && inicio < b.horaFin && b.horaInicio < fin,
  );
}

export function consultarDisponibilidad(lunes: string, estudiantes: string[], signal: AbortSignal) {
  return apiJson<DisponibilidadTutoria>(
    '/api/sesiones/disponibilidad',
    'POST',
    { fecha: lunes, estudiantes },
    signal,
  );
}

export function disponibilidadDemo(
  tutorId: string,
  estudiantes: string[],
  lunes: string,
  sesiones: Sesion[],
): DisponibilidadTutoria {
  const fechas = Array.from({ length: 7 }, (_, i) => aIso(sumarDias(desdeIso(lunes), i)));
  const clases = horariosAcademicos.filter(
    (h) => h.estudianteId && estudiantes.includes(h.estudianteId),
  );
  const bloques: BloqueOcupado[] = [];
  for (const h of clases) {
    const fecha = fechas[h.dia - 1];
    if (fecha)
      bloques.push({
        fecha,
        horaInicio: h.horaInicio,
        horaFin: h.horaFin,
        origen: 'clase-estudiante',
      });
  }
  for (const h of horariosDocentes.filter((h) => h.tutorId === tutorId)) {
    const fecha = fechas[h.dia - 1];
    if (fecha)
      bloques.push({ fecha, horaInicio: h.horaInicio, horaFin: h.horaFin, origen: 'clase-tutor' });
  }
  for (const s of sesiones) {
    if (
      fechas.includes(s.fecha) &&
      !['cancelada', 'reprogramada'].includes(s.estado) &&
      (s.tutorId === tutorId || s.asistentes.some((a) => estudiantes.includes(a.estudianteId)))
    )
      bloques.push({
        fecha: s.fecha,
        horaInicio: s.horaInicio,
        horaFin: s.horaFin,
        origen: 'sesion',
      });
  }
  return {
    lunes,
    bloques,
    sinHorario: estudiantes.length - new Set(clases.map((c) => c.estudianteId)).size,
  };
}
