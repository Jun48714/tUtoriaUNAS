import type { EstadoInstrumento } from '../types/domain';

export type EstadoRevisionInforme = 'preparacion' | 'pendiente' | 'observado' | 'aprobado';

/** Un informe solo está pendiente de revisión cuando el responsable lo envió. */
export function estadoRevisionInforme(estado: EstadoInstrumento): EstadoRevisionInforme {
  if (estado === 'enviado') return 'pendiente';
  if (estado === 'observado') return 'observado';
  if (estado === 'aprobado') return 'aprobado';
  return 'preparacion';
}
