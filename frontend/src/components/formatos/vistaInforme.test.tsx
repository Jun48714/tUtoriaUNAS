import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definicionPorCodigo } from '../../data/formatos';
import type { CampoFormato, Instrumento } from '../../types/domain';
import type { ConsolidacionInforme } from '../../services/informes';
import { abrirVistaInforme } from './vistaInforme';
import { RespuestaInforme } from './RespuestaInforme';

const campo: CampoFormato = {
  codigo: 'actividades',
  etiqueta: 'Actividades',
  tipo: 'tabla',
  obligatorio: true,
  columnas: [
    { codigo: 'meta', etiqueta: 'Meta' },
    { codigo: 'evidencia', etiqueta: 'Evidencia' },
  ],
};
const instrumento: Instrumento = {
  id: 'informe-prueba',
  formato: 'F01',
  semestreId: '2026-II',
  tutorId: 'tutor-prueba',
  estudianteId: null,
  sesionId: null,
  estado: 'borrador',
  avance: 30,
  version: 1,
  creado: '',
  actualizado: '2026-11-12',
  enviado: null,
  revisadoPor: null,
  observaciones: [],
  descargaDisponible: false,
  respuestas: {
    facultad: 'Escuela ficticia',
    actividades: JSON.stringify([{ meta: 'Meta ficticia', evidencia: 'Registro ficticio' }]),
  },
};
const datos: ConsolidacionInforme = {
  formato: 'F01',
  escuelaId: 'escuela-ficticia',
  semestreId: '2026-II',
  consultado: '2026-11-12T15:00:00Z',
  esCorteActual: true,
  estudiantesAsignados: 20,
  tutoresAsignados: 2,
  sesionesIndividuales: 4,
  sesionesGrupales: 2,
  atendidosIndividuales: 6,
  atendidosGrupales: 8,
  atendidosUnicos: 10,
  atencionesEnviadas: 3,
  informesEsperados: 2,
  informesEnviados: 2,
  informesAprobados: 1,
  motivos: [],
  coberturaFormatos: [],
  fuentes: [
    { id: 'F02-ficticio', formato: 'F02', version: 2, estado: 'aprobado', actualizado: '' },
    { id: 'F08-dato-reservado', formato: 'F08', version: 1, estado: 'enviado', actualizado: '' },
  ],
};
afterEach(() => vi.restoreAllMocks());

describe('vista de informe', () => {
  it('muestra tablas con cabeceras y valores en lugar de JSON', () => {
    render(<RespuestaInforme campo={campo} respuestas={instrumento.respuestas} />);
    const tabla = screen.getByRole('table', { name: 'Actividades' });
    expect(within(tabla).getByRole('columnheader', { name: 'Meta' })).toBeVisible();
    expect(within(tabla).getByRole('cell', { name: 'Meta ficticia' })).toBeVisible();
    expect(tabla).not.toHaveTextContent('{');
  });
  it('detecta el bloqueo de la pestaña sin perder el informe', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(abrirVistaInforme(instrumento)).toBe(false);
  });
  it('muestra el borrador y conserva la definición y respuestas recibidas', async () => {
    const pagina = document.implementation.createHTMLDocument('');
    const imprimir = vi.fn();
    let cerrar: (() => void) | undefined;
    const ventana = {
      document: pagina,
      opener: window,
      focus: vi.fn(),
      print: imprimir,
      addEventListener: (_tipo: string, callback: () => void) => {
        cerrar = callback;
      },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(ventana);
    const definicion = structuredClone(definicionPorCodigo('F01')!);
    definicion.revision = 2;
    definicion.secciones[0]!.campos[0]!.etiqueta = 'Escuela según versión enviada';
    await act(async () => {
      expect(abrirVistaInforme({ ...instrumento, definicion }, undefined, datos)).toBe(true);
    });
    expect(ventana.opener).toBeNull();
    expect(pagina.body.textContent).toContain('Borrador · no enviado');
    expect(pagina.body.textContent).toContain('Escuela según versión enviada');
    expect(pagina.body.textContent).toContain('Escuela ficticia');
    expect(pagina.body.textContent).not.toContain('Pendiente de revisión');
    expect(pagina.body.textContent).toContain('Datos de apoyo actuales');
    expect(pagina.body.textContent).toContain('Estudiantes asignados20');
    expect(pagina.body.textContent).toContain('Estudiantes atendidos10');
    expect(pagina.body.textContent).toContain('F02-ficticio');
    expect(pagina.body.textContent).not.toContain('F08-dato-reservado');
    act(() => pagina.querySelector('button')!.click());
    expect(imprimir).toHaveBeenCalledOnce();
    await act(async () => cerrar?.());
  });
});
