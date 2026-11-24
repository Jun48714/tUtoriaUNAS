import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../contexts/authContext';
import { demoAccounts } from '../../mocks/accounts';
import { AccountSetupPage } from './AccountSetupPage';

const servicio = vi.hoisted(() => ({
  confirmarCodigoCuenta: vi.fn(),
  completarCuenta: vi.fn(),
}));

vi.mock('../../services/apiConfig', () => ({ API_MODE: true }));
vi.mock('../../services/cuentas', () => ({
  borrarActivacion: vi.fn(),
  leerActivacion: () => null,
  leerCapacidades: () => Promise.resolve({ revelarExistencia: false }),
  validarCorreoCuenta: vi.fn(),
  solicitarCodigoCuenta: () => Promise.resolve({ retoId: 'reto-1', reenviarEn: 60 }),
  confirmarCodigoCuenta: servicio.confirmarCodigoCuenta,
  completarCuenta: servicio.completarCuenta,
}));

function mostrar(modo: 'registro' | 'recuperacion') {
  const user = demoAccounts[0]!;
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user, login: async () => user, logout: () => undefined }}>
        <AccountSetupPage modo={modo} />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

async function llegarAlPaso3(contrasena: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Correo institucional'), 'persona@unas.edu.pe');
  await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
  await usuario.type(await screen.findByLabelText('Código de verificación'), '123456');
  await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }));
  await usuario.type(await screen.findByLabelText('Nueva contraseña'), contrasena);
  await usuario.type(screen.getByLabelText('Confirmar nueva contraseña'), contrasena);
  return usuario;
}

beforeEach(() => {
  vi.clearAllMocks();
  servicio.completarCuenta.mockResolvedValue({
    identifier: 'DOC-0421',
    role: 'tutor',
    pendienteVinculacion: true,
  });
});

describe('recuperación de contraseña por correo', () => {
  it('no pide elegir el perfil al ingresar el correo, pero el registro sí', () => {
    mostrar('recuperacion');
    expect(screen.queryByLabelText('Perfil')).toBeNull();
    mostrar('registro');
    expect(screen.getByLabelText('Perfil')).toBeTruthy();
  });

  it('con un solo perfil guarda la contraseña sin preguntar cuál', async () => {
    servicio.confirmarCodigoCuenta.mockResolvedValue({ ticket: 't', expiraEn: 300 });
    mostrar('recuperacion');
    const usuario = await llegarAlPaso3('Una frase segura 2026!');
    expect(screen.queryByLabelText('Perfil a recuperar')).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Guardar contraseña e ingresar' }));
    expect(servicio.completarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ rol: undefined }),
    );
  });

  it('con varios perfiles pregunta cuál recuperar y lo envía al servidor', async () => {
    servicio.confirmarCodigoCuenta.mockResolvedValue({
      ticket: 't',
      expiraEn: 300,
      perfiles: ['estudiante', 'tutor'],
    });
    mostrar('recuperacion');
    const usuario = await llegarAlPaso3('Una frase segura 2026!');
    await usuario.selectOptions(screen.getByLabelText('Perfil a recuperar'), 'tutor');
    await usuario.click(screen.getByRole('button', { name: 'Guardar contraseña e ingresar' }));
    expect(servicio.completarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'tutor' }),
    );
  });
});
