import type { EstadoInstrumento } from '../types/domain';

export const filtrosFormularios = [
  { id: 'enviado', nombre: 'Enviados' },
  { id: 'pendiente', nombre: 'Pendientes' },
  { id: '', nombre: 'Todos' },
] as const;

export type FiltroFormularios = (typeof filtrosFormularios)[number]['id'];

export function filtroFormulario(valor: string | null): FiltroFormularios {
  if (
    valor === 'enviado' ||
    valor === 'entregado' ||
    valor === 'aprobado' ||
    valor === 'por-revisar'
  )
    return 'enviado';
  if (valor === 'pendiente' || valor === 'observado') return 'pendiente';
  return '';
}

export function formularioEnviado(estado: EstadoInstrumento) {
  return estado === 'enviado' || estado === 'aprobado';
}

export function coincideFiltroFormulario(estado: EstadoInstrumento, filtro: FiltroFormularios) {
  return !filtro || formularioEnviado(estado) === (filtro === 'enviado');
}
