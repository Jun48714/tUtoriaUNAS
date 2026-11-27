import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactoPersistente } from './ContactoPersistente';

const mockUseSistema = vi.fn();
const mockGuardarContactoApi = vi.fn();

vi.mock('../../hooks/useSistema', () => ({
  useSistema: () => mockUseSistema(),
}));

vi.mock('../../services/apiSistema', () => ({
  guardarContactoApi: (...args: unknown[]) => mockGuardarContactoApi(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contacto persistente sin react-hook-form', () => {
  it('valida correo y teléfono, guarda cambios y conserva ediciones pendientes', async () => {
    mockUseSistema.mockReturnValue({
      contacto: { correo: 'docente@unas.edu.pe', telefono: '101', version: 1 },
    });
    mockGuardarContactoApi.mockResolvedValue({
      correo: 'nuevo@unas.edu.pe',
      telefono: '202',
      version: 2,
    });

    const { rerender } = render(<ContactoPersistente />);
    const correoInput = screen.getByLabelText('Correo de contacto');
    const telInput = screen.getByLabelText('Teléfono o anexo');

    fireEvent.change(correoInput, { target: { value: 'a@b' } });
    fireEvent.change(telInput, { target: { value: '9'.repeat(41) } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.map((el) => el.textContent)).toEqual([
      'Revisa el correo de contacto.',
      'Usa como máximo 40 caracteres.',
    ]);
    expect(mockGuardarContactoApi).not.toHaveBeenCalled();

    fireEvent.change(correoInput, { target: { value: '  nuevo@unas.edu.pe  ' } });
    fireEvent.change(telInput, { target: { value: '  202  ' } });
    expect(screen.queryAllByRole('alert')).toHaveLength(0);

    // Una actualización externa de data no pisa lo que el usuario está editando.
    mockUseSistema.mockReturnValue({
      contacto: { correo: 'otro@unas.edu.pe', telefono: '999', version: 1 },
    });
    rerender(<ContactoPersistente />);
    expect(correoInput).toHaveValue('nuevo@unas.edu.pe');
    expect(telInput).toHaveValue('  202  ');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockGuardarContactoApi).toHaveBeenCalledWith({
        correo: 'nuevo@unas.edu.pe',
        telefono: '202',
        version: 1,
      }),
    );
    expect(screen.getByText('Contacto guardado.')).toBeVisible();
  });
});
