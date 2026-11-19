import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { consultarConsolidacion } from '../../services/informes';
import { ConsolidacionInformePanel } from './ConsolidacionInformePanel';

vi.mock('../../services/informes', () => ({ consultarConsolidacion: vi.fn() }));

function montar(onActualizar?: () => void) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <ConsolidacionInformePanel id="F01-prueba" version={1} onActualizar={onActualizar} />
    </QueryClientProvider>,
  );
}

describe('datos que respaldan el informe', () => {
  it('presenta cobertura, fuentes y lo que falta sin relatos personales', async () => {
    vi.mocked(consultarConsolidacion).mockResolvedValueOnce({
      formato: 'F01',
      escuelaId: 'escuela-prueba',
      semestreId: '2026-II',
      consultado: '2026-11-12T15:00:00Z',
      esCorteActual: true,
      estudiantesAsignados: 20,
      tutoresAsignados: 3,
      sesionesIndividuales: 4,
      sesionesGrupales: 2,
      atendidosIndividuales: 6,
      atendidosGrupales: 4,
      atendidosUnicos: 8,
      atencionesEnviadas: 2,
      informesEsperados: 3,
      informesEnviados: 2,
      informesAprobados: 1,
      motivos: [{ motivo: 'Otro', atenciones: 2 }],
      coberturaFormatos: [{ formato: 'F03', enviados: 4, aprobados: 0 }],
      fuentes: [
        {
          id: 'F02-tutor-ficticio',
          formato: 'F02',
          version: 2,
          estado: 'enviado',
          actualizado: '',
        },
      ],
    });
    montar();
    expect(await screen.findByText('1 pendiente')).toBeVisible();
    expect(screen.getByText(/Datos actuales/)).toBeVisible();
    fireEvent.click(screen.getByText('Ver detalle'));
    expect(screen.getByText(/el informe enviado conserva su versión/)).toBeVisible();
    fireEvent.click(screen.getByText(/Informes de tutor incluidos/));
    expect(screen.getByText(/F02-tutor-ficticio/)).toBeVisible();
    fireEvent.click(screen.getByText('Formatos enviados'));
    expect(screen.getByText(/F03: 4/)).toBeVisible();
    fireEvent.click(screen.getByText('Datos necesarios'));
    expect(screen.getByText(/Asignaciones y plan de la escuela/)).toBeVisible();
  });
  it('permite reintentar si la consulta falla', async () => {
    vi.mocked(consultarConsolidacion).mockReset().mockRejectedValueOnce(new Error('sin conexión'));
    montar();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron consultar los datos',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  });
});

it('muestra el resumen de un tutor y actualiza solo cuando se solicita', async () => {
  vi.mocked(consultarConsolidacion).mockResolvedValueOnce({
    formato: 'F02',
    escuelaId: 'escuela-prueba',
    semestreId: '2026-II',
    consultado: '2026-11-12T15:00:00Z',
    esCorteActual: true,
    estudiantesAsignados: 9,
    tutoresAsignados: 1,
    sesionesIndividuales: 4,
    sesionesGrupales: 2,
    atendidosIndividuales: 2,
    atendidosGrupales: 1,
    atendidosUnicos: 3,
    atencionesEnviadas: 2,
    informesEsperados: 0,
    informesEnviados: 0,
    informesAprobados: 0,
    motivos: [],
    coberturaFormatos: [],
    fuentes: [],
  });
  const actualizar = vi.fn();
  montar(actualizar);
  expect(await screen.findByText('Atenciones')).toBeVisible();
  expect(screen.getByText(/enviadas o aprobadas/)).toHaveTextContent('2');
  expect(screen.getByText('3 atendidos')).toBeVisible();
  expect(screen.queryByText('Informes de tutor')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  expect(actualizar).toHaveBeenCalledOnce();
});
