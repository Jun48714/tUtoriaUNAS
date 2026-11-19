import { apiJson } from './apiClient';
import type { Instrumento } from '../types/domain';

export interface ConsolidacionInforme {
  formato: 'F01' | 'F02';
  escuelaId: string;
  semestreId: string;
  consultado: string;
  esCorteActual: boolean;
  estudiantesAsignados: number;
  tutoresAsignados: number;
  sesionesIndividuales: number;
  sesionesGrupales: number;
  atendidosIndividuales: number;
  atendidosGrupales: number;
  atendidosUnicos: number;
  atencionesEnviadas: number;
  informesEsperados: number;
  informesEnviados: number;
  informesAprobados: number;
  motivos: Array<{ motivo: string; atenciones: number }>;
  coberturaFormatos: Array<{ formato: string; enviados: number; aprobados: number }>;
  fuentes: Array<{
    id: string;
    formato: string;
    version: number;
    estado: string;
    actualizado: string;
  }>;
}

export function consultarConsolidacion(id: string, signal?: AbortSignal) {
  return apiJson<ConsolidacionInforme>(
    `/api/formularios/${encodeURIComponent(id)}/consolidacion`,
    'GET',
    undefined,
    signal,
  );
}

/** Calcula una propuesta sin guardar ni modificar el informe. */
export function consultarPropuesta(id: string, signal?: AbortSignal) {
  return apiJson<Instrumento>(
    `/api/formularios/${encodeURIComponent(id)}/propuesta`,
    'GET',
    undefined,
    signal,
  );
}
