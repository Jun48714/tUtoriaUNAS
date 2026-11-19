import type { CodigoFormato } from '../types/domain';

/** Catálogo exhaustivo: una escena editorial propia por cada instrumento. */
export const escenasFormato = {
  F01: {
    nombre: 'Informe institucional',
    titulo: '¡Enviado!',
    detalle: 'El informe quedó registrado para su revisión institucional.',
  },
  F02: {
    nombre: 'Semestre consolidado',
    titulo: '¡Enviado!',
    detalle: 'Tus actividades y resultados quedaron registrados.',
  },
  F03: {
    nombre: 'Inicio de una trayectoria',
    titulo: '¡Enviado!',
    detalle: 'Tu tutor podrá conocer tus expectativas y preparar tu acompañamiento.',
  },
  F04: {
    nombre: 'Mapa del acompañamiento',
    titulo: '¡Enviado!',
    detalle: 'Tu situación actual quedó registrada para el acompañamiento tutorial.',
  },
  F05: {
    nombre: 'Proyección profesional',
    titulo: '¡Enviado!',
    detalle: 'Tu tutor podrá revisar tus expectativas y tu preparación profesional.',
  },
  F06: {
    nombre: 'Encuentro registrado',
    titulo: 'Registrado',
    detalle: 'El registro quedó guardado en la sesión de tutoría individual.',
  },
  F07: {
    nombre: 'Grupo reunido',
    titulo: 'Registrado',
    detalle: 'La participación del grupo quedó guardada en la sesión.',
  },
  F08: {
    nombre: 'Ruta de atención',
    titulo: 'Registrado',
    detalle: 'El resultado de la atención quedó registrado en el expediente.',
  },
  F09: {
    nombre: 'Balance tutorial',
    titulo: '¡Enviado!',
    detalle: 'Tu balance de actividades quedó registrado para su revisión.',
  },
  F10: {
    nombre: 'Valoración entregada',
    titulo: '¡Enviado!',
    detalle: 'El responsable del Sistema de Tutoría recibirá tu valoración de esta sesión.',
  },
  F11: {
    nombre: 'Perspectiva del grupo',
    titulo: '¡Enviado!',
    detalle: 'Tu valoración de la sesión grupal quedó registrada.',
  },
  F12: {
    nombre: 'Enlace con el área de apoyo',
    titulo: 'Registrado',
    detalle: 'La ficha quedó registrada. Puedes consultar el estado de la solicitud de apoyo.',
  },
} satisfies Record<CodigoFormato, { nombre: string; titulo: string; detalle: string }>;

export function detalleFinal(formato: CodigoFormato, respuestas: Record<string, string>) {
  if (formato === 'F08') {
    if (respuestas.resultado === 'Se deriva a:')
      return 'Se preparó el borrador del formato 12. Revísalo y envíalo desde Mis registros.';
    if (respuestas.resultado === 'Se programa nueva cita para seguimiento')
      return 'La nueva cita de seguimiento ya aparece en las agendas de tutoría.';
    return 'Se registró que la atención se resolvió con la asesoría.';
  }
  return escenasFormato[formato].detalle;
}
