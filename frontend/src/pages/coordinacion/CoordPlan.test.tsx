import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instrumento } from '../../types/domain';
import { escuelas, semestreVigente } from '../../data/catalogos';
import { CoordPlan } from './CoordPlan';

const scope = vi.hoisted(() => ({
  institucional: false,
  escuelaId: '',
  registros: [] as Instrumento[],
}));
vi.mock('../../services/apiConfig', () => ({ API_MODE: true }));
vi.mock('../../hooks/usePortal', () => ({ usePortal: () => scope }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'COORD' } }) }));
vi.mock('../../hooks/useSistema', () => ({
  useSistema: () => ({ actividadesPlan: [], periodosEscuela: [] }),
}));
vi.mock('../../hooks/useInstrumentWorkspace', () => ({
  useInstrumentWorkspace: () => ({ registros: scope.registros, momento: 'durante' }),
}));
vi.mock('../../components/ui/Sheet', () => ({
  Sheet: ({ children, title }: { children: ReactNode; title: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));
vi.mock('../../components/panels/GuidedInstrumentForm', () => ({
  GuidedInstrumentForm: ({ instrumento }: { instrumento: Instrumento }) => (
    <div data-testid="informe-escogido">{instrumento.id}</div>
  ),
}));

function informe(escuelaId: string): Instrumento {
  return {
    id: `F01-${escuelaId}`,
    formato: 'F01',
    escuelaId,
    semestreId: semestreVigente.id,
    tutorId: 'COORD',
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
    respuestas: {},
  };
}

describe('informe F01 por ámbito', () => {
  beforeEach(() => {
    scope.institucional = false;
    scope.escuelaId = escuelas[0]!.id;
    scope.registros = [informe(escuelas[1]!.id), informe(escuelas[0]!.id)];
  });

  it('abre el informe de la escuela seleccionada aunque otro aparezca primero', () => {
    render(
      <MemoryRouter>
        <CoordPlan />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir formato 01' }));
    expect(screen.getByTestId('informe-escogido')).toHaveTextContent(`F01-${escuelas[0]!.id}`);
  });

  it('no abre un F01 mientras se consulta el ámbito institucional', () => {
    scope.institucional = true;
    scope.escuelaId = '';
    render(
      <MemoryRouter>
        <CoordPlan />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Ver informes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /formato 01/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('informe-escogido')).not.toBeInTheDocument();
  });

  it('ofrece preparar un informe si solo existe el de otra escuela', () => {
    scope.registros = [informe(escuelas[1]!.id)];
    render(
      <MemoryRouter>
        <CoordPlan />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Preparar formato 01' })).toBeVisible();
  });
});
