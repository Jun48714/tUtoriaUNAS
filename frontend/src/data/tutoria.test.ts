import { afterEach, describe, expect, it } from 'vitest';
import { asignacionDe, asignaciones, tutoradosDe } from './tutoria';
import { semestreActual } from './catalogos';

const originales = [...asignaciones];
afterEach(() => asignaciones.splice(0, asignaciones.length, ...originales));

describe('asignación vigente', () => {
  it('no toma el tutor de un semestre anterior aunque siga marcado como activo', () => {
    const vigente = { ...originales[0]!, semestreId: semestreActual };
    const anterior = {
      ...vigente,
      id: 'ASG-ANTERIOR',
      tutorId: 'DOC-ANTERIOR',
      semestreId: '2025-I',
    };
    asignaciones.splice(0, asignaciones.length, anterior, vigente);
    expect(asignacionDe(vigente.estudianteId)).toEqual(vigente);
    expect(tutoradosDe(anterior.tutorId)).toEqual([]);
    expect(tutoradosDe(vigente.tutorId)).toEqual([vigente]);
  });
  it('no presenta una asignación anterior como vigente si falta la del semestre actual', () => {
    const anterior = { ...originales[0]!, semestreId: '2025-I' };
    asignaciones.splice(0, asignaciones.length, anterior);
    expect(asignacionDe(anterior.estudianteId)).toBeUndefined();
  });
});
