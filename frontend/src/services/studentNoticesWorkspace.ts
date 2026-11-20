import * as v from 'valibot';

export const STUDENT_NOTICES_EVENT = 'unas:student-notices-updated';
export const preferenciasAvisos = [
  {
    id: 'sesiones',
    titulo: 'Sesiones de tutoría',
    detalle: 'Recordatorios de tu agenda',
    icono: 'calendar-days',
  },
  {
    id: 'formularios',
    titulo: 'Mis formularios',
    detalle: 'Pendientes y correcciones',
    icono: 'file-lines',
  },
  {
    id: 'apoyo',
    titulo: 'Solicitudes de apoyo',
    detalle: 'Cambios en el seguimiento',
    icono: 'hand-holding-heart',
  },
  {
    id: 'bienestar',
    titulo: 'Salud y bienestar',
    detalle: 'Campañas y actividades',
    icono: 'heart-pulse',
  },
  {
    id: 'resumen',
    titulo: 'Resumen semanal',
    detalle: 'Tu avance en un solo aviso',
    icono: 'chart-simple',
  },
] as const;

const preferenciasSchema = v.object({
  sesiones: v.optional(v.boolean(), true),
  formularios: v.optional(v.boolean(), true),
  apoyo: v.optional(v.boolean(), true),
  bienestar: v.optional(v.boolean(), false),
  resumen: v.optional(v.boolean(), false),
});
const estadoSchema = v.object({
  leidas: v.optional(v.record(v.string(), v.boolean()), {}),
  // El valor por defecto también pasa por el esquema, de modo que completa cada preferencia.
  preferencias: v.optional(preferenciasSchema, {}),
});
export type EstadoAvisosEstudiante = v.InferOutput<typeof estadoSchema>;
export type PreferenciaAviso = (typeof preferenciasAvisos)[number]['id'];

export function claveAvisosEstudiante(estudianteId: string) {
  return `unas:student-notices:v1:${estudianteId}`;
}

export function leerEstadoAvisos(raw: string | null): EstadoAvisosEstudiante {
  try {
    return v.parse(estadoSchema, JSON.parse(raw ?? '{}'));
  } catch {
    return v.parse(estadoSchema, {});
  }
}

/** Adaptador local de demostración, sustituible por el servicio institucional. */
export function guardarEstadoAvisos(estudianteId: string, estado: EstadoAvisosEstudiante) {
  try {
    localStorage.setItem(
      claveAvisosEstudiante(estudianteId),
      JSON.stringify(v.parse(estadoSchema, estado)),
    );
  } catch {
    throw new Error(
      'No se pudo guardar el cambio. Habilita el almacenamiento del navegador y vuelve a intentarlo.',
    );
  }
  window.dispatchEvent(new Event(STUDENT_NOTICES_EVENT));
}
