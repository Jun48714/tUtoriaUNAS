import { describe, expect, it } from 'vitest';
import { definicionesFormato } from './formatos';
import {
  bloquesPresentacion,
  caraOpcion,
  etiquetaBreve,
  opcionBreve,
} from './presentacionFormatos';
import { escenasFormato } from './escenasFormatos';

describe('presentación separada de los anexos', () => {
  it('cubre los doce formatos sin perder, reordenar ni cambiar campos y opciones', () => {
    for (const d of definicionesFormato) {
      expect(escenasFormato[d.codigo]).toBeDefined();
      const antes = JSON.stringify(d);
      const bloques = bloquesPresentacion(d);
      expect(bloques.flatMap((b) => b.campos)).toEqual(d.secciones.flatMap((s) => s.campos));
      for (const b of bloques) {
        expect(b.campos.filter((c) => !c.visibleSi).length).toBeLessThanOrEqual(1);
        for (const c of b.campos) {
          etiquetaBreve(d.codigo, c);
          for (const o of c.opciones ?? []) opcionBreve(d.codigo, c.codigo, o);
        }
      }
      expect(JSON.stringify(d)).toBe(antes);
    }
    expect(new Set(Object.values(escenasFormato).map((s) => s.nombre)).size).toBe(12);
  });
  it('mantiene las opciones canónicas aunque sus etiquetas y caritas sean breves', () => {
    expect(opcionBreve('F08', 'resultado', 'Se programa nueva cita para seguimiento')).toBe(
      'Seguimiento',
    );
    expect(opcionBreve('F10', 'p01', 'D · Totalmente en desacuerdo')).toBe(
      'Totalmente en desacuerdo',
    );
    expect(caraOpcion('F10', 'p01', 'D · Totalmente en desacuerdo')).toBe('face-frown-open');
    expect(caraOpcion('F11', 'p01', 'No')).toBeUndefined();
    expect(caraOpcion('F04', 'estadoSalud', 'Necesito apoyo')).toBeUndefined();
  });
});
