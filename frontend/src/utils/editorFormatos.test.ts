import { describe, expect, it } from 'vitest';
import { definicionPorCodigo } from '../data/formatos';
import {
  cambiarTipo,
  mover,
  nuevaPregunta,
  quitarPregunta,
  reemplazarPregunta,
} from './editorFormatos';

describe('operaciones del editor de formatos', () => {
  it('ordena sin mutar el documento ni aceptar posiciones fuera de rango', () => {
    const original = ['a', 'b', 'c'];
    expect(mover(original, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(mover(original, 0, -1)).toEqual(original);
    expect(mover(original, 2, 1)).toEqual(original);
    expect(original).toEqual(['a', 'b', 'c']);
  });
  it('elimina condiciones dependientes al quitar una pregunta', () => {
    const definicion = structuredClone(definicionPorCodigo('F04')!);
    const quitada = quitarPregunta(definicion, 'expectativas');
    expect(
      quitada.secciones.flatMap((s) => s.campos).find((c) => c.codigo === 'motivoExpectativas')
        ?.visibleSi,
    ).toBeUndefined();
    expect(
      definicion.secciones.flatMap((s) => s.campos).some((c) => c.codigo === 'expectativas'),
    ).toBe(true);
  });
  it('cambia tipos y conserva la identidad sin arrastrar opciones o condiciones incompatibles', () => {
    const campo = {
      ...nuevaPregunta(),
      tipo: 'escala' as const,
      opciones: ['A', 'B'],
      visibleSi: { campo: 'anterior', valores: ['A'] },
    };
    expect(cambiarTipo(campo, 'texto')).toMatchObject({ codigo: campo.codigo, tipo: 'texto' });
    expect(cambiarTipo(campo, 'texto').opciones).toBeUndefined();
    expect(cambiarTipo(campo, 'tabla').columnas).toHaveLength(1);
    expect(cambiarTipo(campo, 'multiple').opciones).toEqual(['A', 'B']);
  });
  it('genera identificadores diferentes y reemplaza solo la pregunta elegida', () => {
    const a = nuevaPregunta();
    const b = nuevaPregunta();
    expect(a.codigo).not.toBe(b.codigo);
    const original = definicionPorCodigo('F03')!;
    const campo = original.secciones[0]!.campos[0]!;
    const resultado = reemplazarPregunta(original, campo.codigo, {
      ...campo,
      etiqueta: 'Nuevo texto',
    });
    expect(resultado.secciones[0]!.campos[0]!.etiqueta).toBe('Nuevo texto');
    expect(original.secciones[0]!.campos[0]!.etiqueta).toBe(campo.etiqueta);
  });
});
