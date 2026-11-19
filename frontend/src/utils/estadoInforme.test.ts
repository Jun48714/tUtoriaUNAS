import { describe, expect, it } from 'vitest';
import { estadoRevisionInforme } from './estadoInforme';

describe('bandeja de informes', () => {
  it('separa documentos en preparación de los pendientes de revisión', () => {
    expect(estadoRevisionInforme('no-iniciado')).toBe('preparacion');
    expect(estadoRevisionInforme('borrador')).toBe('preparacion');
    expect(estadoRevisionInforme('enviado')).toBe('pendiente');
    expect(estadoRevisionInforme('observado')).toBe('observado');
    expect(estadoRevisionInforme('aprobado')).toBe('aprobado');
  });
});
