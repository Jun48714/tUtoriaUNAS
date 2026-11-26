import { describe, expect, it } from 'vitest';
import { parseCalendarInput } from '../types/calendar';
import { esCorreo, esFechaIsoReal, esHora24, leerMapaSeguro } from './validacion';

describe('helpers nativos de validación', () => {
  it('conserva las reglas de correo sin aceptar direcciones sin TLD', () => {
    expect(esCorreo('ana@unas.edu.pe')).toBe(true);
    expect(esCorreo('ana.perez+tutor@demo.example')).toBe(true);
    expect(esCorreo('a@b')).toBe(false);
    expect(esCorreo('  ana@unas.edu.pe  ')).toBe(false);
    expect(esCorreo('')).toBe(false);
  });

  it('valida fechas ISO reales y horas en formato de 24 horas', () => {
    expect(esFechaIsoReal('2024-02-29')).toBe(true);
    expect(esFechaIsoReal('2026-02-30')).toBe(false);
    expect(esFechaIsoReal('2026-13-01')).toBe(false);
    expect(esHora24('08:30')).toBe(true);
    expect(esHora24('23:59')).toBe(true);
    expect(esHora24('24:00')).toBe(false);
  });

  it('omite claves peligrosas en mapas seguros y rechaza valores inválidos', () => {
    const entrada = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"x","a":true,"b":false}',
    );
    const mapa = leerMapaSeguro(entrada, (item) => (typeof item === 'boolean' ? item : null));
    expect(mapa).toEqual({ a: true, b: false });
    expect(Object.keys(mapa ?? {})).toEqual(['a', 'b']);
    expect(
      leerMapaSeguro({ a: 'no-booleano' }, (item) => (typeof item === 'boolean' ? item : null)),
    ).toBeNull();
  });

  it('valida bloques de calendario con recortes y mensajes en español', () => {
    const valido = parseCalendarInput({
      kind: 'tutoria',
      title: '  Tutoría  ',
      semesterId: '2026-II',
      days: [1, 3],
      dateFrom: '2026-09-01',
      dateTo: '2026-12-15',
      startTime: '08:00',
      endTime: '10:00',
      location: '  Aula 204  ',
      modality: 'presencial',
      capacity: 15,
      extraIgnored: 'x',
    });
    expect(valido).toEqual({
      kind: 'tutoria',
      title: 'Tutoría',
      semesterId: '2026-II',
      days: [1, 3],
      dateFrom: '2026-09-01',
      dateTo: '2026-12-15',
      startTime: '08:00',
      endTime: '10:00',
      location: 'Aula 204',
      modality: 'presencial',
      capacity: 15,
    });
    expect(() =>
      parseCalendarInput({
        ...valido,
        capacity: 201,
      }),
    ).toThrow('entre 1 y 200 cupos');
    expect(() =>
      parseCalendarInput({
        ...valido,
        startTime: '10:00',
        endTime: '09:00',
      }),
    ).toThrow('posterior a la inicial');
  });
});
