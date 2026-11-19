import { describe, expect, it, vi } from 'vitest';
import type { Instrumento } from '../types/domain';
import { precargarInstrumentoConOrigen } from './instrumentos';

vi.mock('../services/apiConfig', () => ({ API_MODE: true }));
vi.mock('../services/expediente', () => ({
  respuestasRecordadas: () => ({ individuales: '8', atendidosIndividual: '7' }),
}));

describe('precarga del informe del tutor', () => {
  it('prioriza las cifras actuales del servidor sobre el borrador y el cálculo local', () => {
    const registro: Instrumento = {
      id: 'F02-prueba',
      formato: 'F02',
      semestreId: '2026-II',
      tutorId: 'DOC-0421',
      estudianteId: null,
      sesionId: null,
      estado: 'borrador',
      avance: 0,
      version: 1,
      creado: '',
      actualizado: '',
      enviado: null,
      revisadoPor: null,
      observaciones: [],
      descargaDisponible: false,
      respuestas: { individuales: '2', atendidosIndividual: '1' },
    };
    const { valores } = precargarInstrumentoConOrigen(registro, []);
    expect(valores.individuales).toBe('8');
    expect(valores.atendidosIndividual).toBe('7');
  });
  it('mantiene intacta la fotografía del informe enviado', () => {
    const registro: Instrumento = {
      id: 'F02-enviado',
      formato: 'F02',
      semestreId: '2026-II',
      tutorId: 'DOC-0421',
      estudianteId: null,
      sesionId: null,
      estado: 'enviado',
      avance: 100,
      version: 2,
      creado: '',
      actualizado: '',
      enviado: '2026-11-01',
      revisadoPor: null,
      observaciones: [],
      descargaDisponible: false,
      respuestas: { individuales: '2', atendidosIndividual: '1' },
    };
    const { valores } = precargarInstrumentoConOrigen(registro, []);
    expect(valores.individuales).toBe('2');
    expect(valores.atendidosIndividual).toBe('1');
  });
});
