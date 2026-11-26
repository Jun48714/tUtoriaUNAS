import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImportarPadron } from './ImportarPadron';
import * as servicio from '../../services/padronImportacion';
import type { VistaPreviaPadron } from '../../services/padronImportacion';

vi.mock('../../services/padronImportacion', async (original) => ({
  ...(await original<typeof servicio>()),
  analizarPadron: vi.fn(),
  confirmarPadron: vi.fn(),
}));

const prototipo = HTMLDialogElement.prototype;
const showModalOriginal = Object.getOwnPropertyDescriptor(prototipo, 'showModal');
const closeOriginal = Object.getOwnPropertyDescriptor(prototipo, 'close');
beforeAll(() => {
  // jsdom no implementa dialog.
  Object.defineProperty(prototipo, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(prototipo, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterAll(() => {
  if (showModalOriginal) Object.defineProperty(prototipo, 'showModal', showModalOriginal);
  if (closeOriginal) Object.defineProperty(prototipo, 'close', closeOriginal);
});

const vista: VistaPreviaPadron = {
  token: 'tok',
  expira: '2026-11-26T20:00:00Z',
  archivo: 'padron.xlsx',
  tamano: 4_400_000,
  sha256: 'abc',
  semestre: '2026-II',
  semestreFuente: '2026-2',
  yaImportado: false,
  segundosLectura: 1.8,
  hojas: { alumnos: true, docentes: true },
  alumnos: {
    filas: 45831,
    importables: 3686,
    filasExcluidas: 0,
    nuevos: 3686,
    actualizados: 0,
    sinPpa: 4,
    sinCelular: 17,
  },
  matriculas: 3686,
  cursos: 873,
  cursosMatriculados: 21121,
  horarios: 45618,
  horariosDuplicados: 195,
  horariosSinNormalizar: 18,
  docentes: {
    filas: 500,
    importables: 337,
    excluidos: 163,
    duplicados: 0,
    nuevos: 337,
    actualizados: 0,
  },
  escuelas: [
    { id: 'E-ZOO', nombre: 'Zootecnia', alumnos: 4, nueva: false },
    { id: 'E-CIV', nombre: 'Ingeniería Civil', alumnos: 3, nueva: true },
  ],
  advertencias: ['La pestaña dice 2026-1.'],
  excluidas: [
    {
      hoja: 'Docentes',
      fila: 10,
      motivo: 'Datos no definidos',
      detalle: 'No se define: apellidos, correo · NO SE DEFINE PROF.4',
    },
  ],
  totalExcluidas: 163,
};

describe('ImportarPadron', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra la vista previa y solo guarda al confirmar', async () => {
    vi.mocked(servicio.analizarPadron).mockResolvedValue(vista);
    vi.mocked(servicio.confirmarPadron).mockResolvedValue({
      importado: true,
      alumnos: 3686,
      docentes: 337,
      matriculas: 3686,
      cursos: 873,
      horarios: 45618,
      horariosRetirados: 0,
      escuelas: 15,
      segundos: 4.3,
      semestre: '2026-II',
    });
    const alImportar = vi.fn();
    const { container } = render(<ImportarPadron onClose={vi.fn()} onImportado={alImportar} />);
    const entrada = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const archivo = new File(['x'], 'padron.xlsx');
    fireEvent.change(entrada, { target: { files: [archivo] } });
    expect(await screen.findByText('padron.xlsx')).toBeInTheDocument();
    expect(servicio.analizarPadron).toHaveBeenCalledWith(archivo);
    expect(servicio.confirmarPadron).not.toHaveBeenCalled();
    expect(screen.getAllByText(/3[.,\u202f\u00a0]?686/).length).toBeGreaterThan(0);
    expect(screen.getByText(/163 filas dicen/)).toBeInTheDocument();
    expect(screen.getByText('Nueva')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Importar 3[.,\u202f\u00a0]?686 alumnos y 337 docentes/ }),
    );
    expect(await screen.findByText('Importación completada')).toBeInTheDocument();
    expect(servicio.confirmarPadron).toHaveBeenCalledWith('tok');
    expect(alImportar).toHaveBeenCalledTimes(1);
  });

  it('rechaza archivos que no son .xlsx sin llamar al servidor', async () => {
    const { container } = render(<ImportarPadron onClose={vi.fn()} onImportado={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'datos.csv')] },
    });
    expect(await screen.findByText(/extensión \.xlsx/)).toBeInTheDocument();
    expect(servicio.analizarPadron).not.toHaveBeenCalled();
  });

  it('conserva la vista previa si el servidor rechaza la importación', async () => {
    vi.mocked(servicio.analizarPadron).mockResolvedValue(vista);
    vi.mocked(servicio.confirmarPadron).mockRejectedValue(new Error('La vista previa venció.'));
    const alImportar = vi.fn();
    const { container } = render(<ImportarPadron onClose={vi.fn()} onImportado={alImportar} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'padron.xlsx')] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Importar/ }));
    await waitFor(() => expect(screen.getByText('La vista previa venció.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Importar/ })).toBeInTheDocument();
    expect(alImportar).not.toHaveBeenCalled();
  });

  it('genera un CSV con tildes y comillas escapadas', () => {
    const csv = servicio.csvExcluidas([
      { hoja: 'Docentes', fila: 3, motivo: 'Datos no definidos', detalle: 'dice "NO SE DEFINE"' },
    ]);
    expect(csv.startsWith('﻿"Hoja","Fila"')).toBe(true);
    expect(csv).toContain('"dice ""NO SE DEFINE"""');
  });
});
