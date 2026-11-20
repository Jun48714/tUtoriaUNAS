import * as v from 'valibot';
import type { DemoUser } from './auth';

const date = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.'),
  v.check((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Selecciona una fecha válida.'),
);
const time = v.pipe(
  v.string(),
  v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Selecciona una hora válida.'),
);

export const calendarInputSchema = v.pipe(
  v.object({
    kind: v.picklist(['curso', 'tutoria']),
    title: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(3, 'Escribe el nombre del curso.'),
      v.maxLength(100),
    ),
    semesterId: v.pipe(v.string(), v.regex(/^\d{4}-(I|II)$/)),
    days: v.pipe(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))),
      v.minLength(1, 'Selecciona al menos un día.'),
      v.maxLength(7),
    ),
    dateFrom: date,
    dateTo: date,
    startTime: time,
    endTime: time,
    location: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(2, 'Indica el aula o enlace.'),
      v.maxLength(180),
    ),
    modality: v.picklist(['presencial', 'virtual', 'mixta']),
    capacity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))),
  }),
  v.forward(
    v.check(
      (input) => input.startTime < input.endTime,
      'La hora final debe ser posterior a la inicial.',
    ),
    ['endTime'],
  ),
  v.forward(
    v.check(
      (input) => input.dateFrom <= input.dateTo,
      'La fecha final debe ser posterior a la inicial.',
    ),
    ['dateTo'],
  ),
  v.forward(
    v.check(
      (input) => Date.parse(input.dateTo) - Date.parse(input.dateFrom) <= 366 * 86400000,
      'El horario no puede abarcar más de un año.',
    ),
    ['dateTo'],
  ),
);

export type CalendarInput = v.InferOutput<typeof calendarInputSchema>;
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
