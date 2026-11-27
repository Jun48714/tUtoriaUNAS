import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditarCuenta } from './EditarCuenta';
import * as cliente from '../../services/apiClient';
import type { CuentaAdmin } from '../../services/cuentas';

vi.mock('../../services/apiClient', async (original) => ({
  ...(await original<typeof cliente>()),
  apiJson: vi.fn(),
}));
vi.mock('../../services/apiTutoria', () => ({
  refrescarApi: vi.fn().mockResolvedValue(undefined),
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

const cuenta: CuentaAdmin = {
  id: 'CTA-1',
  personaId: 'PER-1',
  escuelaId: 'E-IIS',
  rol: 'estudiante',
  identifier: 'ana@unas.edu.pe',
  nombre: 'Ana Prueba',
  activo: true,
  version: 3,
  verificada: false,
  cambioObligatorio: true,
  pendienteVinculacion: false,
  propia: false,
  correo: 'ana@unas.edu.pe',
  correoEstado: 'enviado',
  nombres: 'Ana',
  apellidos: 'Prueba',
  codigo: '',
  ciclo: null,
};

function mostrar(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditarCuenta cuenta={cuenta} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('EditarCuenta', () => {
  beforeEach(() => vi.mocked(cliente.apiJson).mockReset());

  it('envía los datos con la versión de la cuenta y cierra al guardar', async () => {
    vi.mocked(cliente.apiJson).mockResolvedValue({
      id: 'CTA-1',
      identifier: 'ana@unas.edu.pe',
      passwordTemporal: null,
      expiraEn: 0,
    });
    const onClose = mostrar();
    fireEvent.change(screen.getByLabelText('Ciclo'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana María' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cliente.apiJson).toHaveBeenCalledWith('/api/cuentas/CTA-1/datos', 'PUT', {
      version: 3,
      correo: 'ana@unas.edu.pe',
      nombres: 'Ana María',
      apellidos: 'Prueba',
      codigo: null,
      ciclo: 4,
    });
  });

  it('muestra el acceso temporal nuevo cuando cambia el correo de una cuenta sin verificar', async () => {
    vi.mocked(cliente.apiJson).mockResolvedValue({
      id: 'CTA-1',
      identifier: 'ana.nueva@unas.edu.pe',
      passwordTemporal: 'UNAS-ABC123',
      expiraEn: 172800,
    });
    const onClose = mostrar();
    fireEvent.change(screen.getByLabelText('Correo institucional'), {
      target: { value: 'ana.nueva@unas.edu.pe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByDisplayValue('UNAS-ABC123')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('muestra el motivo cuando el servidor rechaza el cambio', async () => {
    vi.mocked(cliente.apiJson).mockRejectedValueOnce(
      new Error('Ya existe una cuenta con este correo y perfil.'),
    );
    mostrar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Ya existe una cuenta con este correo y perfil.')).toBeTruthy();
  });
});
