import { esObjeto, leerMapaSeguro } from '../utils/validacion';

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

export type PreferenciaAviso = (typeof preferenciasAvisos)[number]['id'];
export interface EstadoAvisosEstudiante {
  leidas: Record<string, boolean>;
  preferencias: Record<PreferenciaAviso, boolean>;
}

const PREFERENCIAS_DEFECTO: Record<PreferenciaAviso, boolean> = {
  sesiones: true,
  formularios: true,
  apoyo: true,
  bienestar: false,
  resumen: false,
};

function estadoPorDefecto(): EstadoAvisosEstudiante {
  return { leidas: {}, preferencias: { ...PREFERENCIAS_DEFECTO } };
}

function validarPreferencias(valor: unknown): Record<PreferenciaAviso, boolean> | null {
  if (valor === undefined) return { ...PREFERENCIAS_DEFECTO };
  if (!esObjeto(valor)) return null;
  const salida = { ...PREFERENCIAS_DEFECTO };
  for (const { id } of preferenciasAvisos) {
    const item = valor[id];
    if (item === undefined) continue;
    if (typeof item !== 'boolean') return null;
    salida[id] = item;
  }
  return salida;
}

function validarEstadoAvisos(valor: unknown): EstadoAvisosEstudiante | null {
  if (!esObjeto(valor)) return null;
  const leidas =
    valor.leidas === undefined
      ? {}
      : leerMapaSeguro(valor.leidas, (item) => (typeof item === 'boolean' ? item : null));
  const preferencias = validarPreferencias(valor.preferencias);
  if (!leidas || !preferencias) return null;
  return { leidas, preferencias };
}

export function claveAvisosEstudiante(estudianteId: string) {
  return `unas:student-notices:v1:${estudianteId}`;
}

export function leerEstadoAvisos(raw: string | null): EstadoAvisosEstudiante {
  try {
    return validarEstadoAvisos(JSON.parse(raw ?? '{}')) ?? estadoPorDefecto();
  } catch {
    return estadoPorDefecto();
  }
}

/** Adaptador local de demostración, sustituible por el servicio institucional. */
export function guardarEstadoAvisos(estudianteId: string, estado: EstadoAvisosEstudiante) {
  const validado = validarEstadoAvisos(estado);
  if (!validado) throw new Error('No se pudo guardar el cambio porque los datos no son válidos.');
  try {
    localStorage.setItem(claveAvisosEstudiante(estudianteId), JSON.stringify(validado));
  } catch {
    throw new Error(
      'No se pudo guardar el cambio. Habilita el almacenamiento del navegador y vuelve a intentarlo.',
    );
  }
  window.dispatchEvent(new Event(STUDENT_NOTICES_EVENT));
}
