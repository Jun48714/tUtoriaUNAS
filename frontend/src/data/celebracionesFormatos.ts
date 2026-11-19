import type { CodigoFormato } from '../types/domain';

/** Animaciones completas de autores de LottieFiles; fuentes y licencias en los recursos locales. */
export const celebracionesFormatos = {
  F01: { nombre: 'Reconocimiento al informe terminado', poster: 0.76, segundos: 2.1 },
  F02: { nombre: 'Un semestre de trabajo compartido', poster: 0.6, segundos: 2.3 },
  F03: { nombre: 'Comienza tu recorrido', poster: 0.56, segundos: 2.4 },
  F04: { nombre: 'Un paso más en tu recorrido', poster: 0.9, segundos: 1.95 },
  F05: { nombre: 'Nuevos horizontes', poster: 0.6, segundos: 2.4 },
  F06: { nombre: 'Encuentro completado', poster: 0.6, segundos: 2 },
  F07: { nombre: 'El trabajo del grupo cuenta', poster: 0.56, segundos: 2.3 },
  F08: { nombre: 'Gracias por acompañar', poster: 0.5, segundos: 1.95 },
  F09: { nombre: 'Gracias por compartir tu balance', poster: 0.95, segundos: 1.95 },
  F10: { nombre: 'Tu opinión forma parte del proceso', poster: 0.65, segundos: 1.95 },
  F11: { nombre: 'Una entrega que merece celebrarse', poster: 0.45, segundos: 2.4 },
  F12: { nombre: 'Registro de apoyo completo', poster: 0.62, segundos: 2.3 },
} satisfies Record<CodigoFormato, { nombre: string; poster: number; segundos: number }>;
