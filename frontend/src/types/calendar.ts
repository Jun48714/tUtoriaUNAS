import type { DemoUser } from './auth';
import {
  esEnteroEnRango,
  esFechaIsoReal,
  esHora24,
  esModalidad,
  esObjeto,
} from '../utils/validacion';

export interface CalendarInput {
  kind: 'curso' | 'tutoria';
  title: string;
  semesterId: string;
  days: number[];
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  location: string;
  modality: 'presencial' | 'virtual' | 'mixta';
  capacity?: number;
}

export function parseCalendarInput(valor: unknown): CalendarInput {
  if (!esObjeto(valor)) throw new Error('Revisa los datos del horario.');
  if (valor.kind !== 'curso' && valor.kind !== 'tutoria')
    throw new Error('Selecciona el tipo de horario.');
  if (typeof valor.title !== 'string') throw new Error('Escribe el nombre del curso.');
  const title = valor.title.trim();
  if (title.length < 3) throw new Error('Escribe el nombre del curso.');
  if (title.length > 100) throw new Error('Usa como máximo 100 caracteres para el curso.');
  if (typeof valor.semesterId !== 'string' || !/^\d{4}-(I|II)$/.test(valor.semesterId))
    throw new Error('Selecciona un semestre válido.');
  if (
    !Array.isArray(valor.days) ||
    valor.days.length < 1 ||
    valor.days.length > 7 ||
    valor.days.some((d) => !esEnteroEnRango(d, 1, 7))
  )
    throw new Error('Selecciona al menos un día.');
  if (typeof valor.dateFrom !== 'string' || !esFechaIsoReal(valor.dateFrom))
    throw new Error('Selecciona una fecha válida.');
  if (typeof valor.dateTo !== 'string' || !esFechaIsoReal(valor.dateTo))
    throw new Error('Selecciona una fecha válida.');
  if (typeof valor.startTime !== 'string' || !esHora24(valor.startTime))
    throw new Error('Selecciona una hora válida.');
  if (typeof valor.endTime !== 'string' || !esHora24(valor.endTime))
    throw new Error('Selecciona una hora válida.');
  if (typeof valor.location !== 'string') throw new Error('Indica el aula o enlace.');
  const location = valor.location.trim();
  if (location.length < 2) throw new Error('Indica el aula o enlace.');
  if (location.length > 180)
    throw new Error('Usa como máximo 180 caracteres para el aula o enlace.');
  if (!esModalidad(valor.modality)) throw new Error('Selecciona una modalidad válida.');
  if (valor.capacity !== undefined && !esEnteroEnRango(valor.capacity, 1, 200))
    throw new Error('Indica entre 1 y 200 cupos.');
  if (valor.startTime >= valor.endTime)
    throw new Error('La hora final debe ser posterior a la inicial.');
  if (valor.dateFrom > valor.dateTo)
    throw new Error('La fecha final debe ser posterior a la inicial.');
  if (Date.parse(valor.dateTo) - Date.parse(valor.dateFrom) > 366 * 86400000)
    throw new Error('El horario no puede abarcar más de un año.');
  return {
    kind: valor.kind,
    title,
    semesterId: valor.semesterId,
    days: [...valor.days],
    dateFrom: valor.dateFrom,
    dateTo: valor.dateTo,
    startTime: valor.startTime,
    endTime: valor.endTime,
    location,
    modality: valor.modality,
    ...(valor.capacity !== undefined ? { capacity: valor.capacity } : {}),
  };
}

export interface TeacherCalendarBlock extends CalendarInput {
  id: string;
  tutorId: string;
  createdAt: string;
}
export type CalendarActor = Pick<DemoUser, 'id' | 'role'>;

/** Contrato sustituible por el cliente de la API institucional. */
export interface TeacherCalendarService {
  list(actor: CalendarActor): Promise<TeacherCalendarBlock[]>;
  save(actor: CalendarActor, input: CalendarInput, id?: string): Promise<TeacherCalendarBlock>;
  remove(actor: CalendarActor, id: string): Promise<void>;
}

export function occurrenceDates(block: CalendarInput): string[] {
  const result: string[] = [];
  const cursor = new Date(`${block.dateFrom}T12:00:00Z`);
  const end = new Date(`${block.dateTo}T12:00:00Z`);
  for (let i = 0; cursor <= end && i <= 366; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (block.days.includes(((cursor.getUTCDay() + 6) % 7) + 1))
      result.push(cursor.toISOString().slice(0, 10));
  }
  return result;
}

export function calendarBlocksOverlap(a: CalendarInput, b: CalendarInput): boolean {
  if (
    a.startTime >= b.endTime ||
    a.endTime <= b.startTime ||
    a.dateFrom > b.dateTo ||
    a.dateTo < b.dateFrom
  )
    return false;
  const dates = new Set(occurrenceDates(a));
  return occurrenceDates(b).some((day) => dates.has(day));
}
