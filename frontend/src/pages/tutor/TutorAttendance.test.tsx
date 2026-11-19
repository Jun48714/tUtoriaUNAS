import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sesion } from '../../types/domain';
import { TutorAttendance } from './TutorAttendance';

const fixtures = vi.hoisted(() => ({ sesiones: [] as Sesion[], guardar: vi.fn() }));
vi.mock('../../hooks/usePortal', () => ({
  usePortal: () => ({ docente: { id: 'DOC-0421' }, sesiones: fixtures.sesiones, instrumentos: [] }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'DOC-0421', role: 'tutor' } }),
}));
vi.mock('../../services/mutacionesTutoria', () => ({
  persistirAsistencia: (...args: unknown[]) => fixtures.guardar(...args),
}));
function abrir(tipo: Sesion['tipo']) {
  fixtures.sesiones = [
    {
      id: 'SES-CIERRE',
      codigo: 'SES-CIERRE',
      tipo,
      tutorId: 'DOC-0421',
      semestreId: '2026-II',
      fecha: '2026-10-01',
      horaInicio: '10:00',
      horaFin: '11:00',
      modalidad: 'presencial',
      lugar: 'Aula ficticia',
      tema: 'Actividad ficticia',
      objetivo: '',
      estado: 'realizada',
      asistenciaConfirmada: true,
      version: 1,
      asistentes: [
        {
          estudianteId: 'EST-2023010456',
          estado: 'asistio',
          horaRegistro: null,
          observacion: null,
        },
      ],
      acuerdos: [],
      instrumentoId: null,
      observacion: null,
    },
  ];
  return render(
    <MemoryRouter initialEntries={['/tutor/asistencias?sesion=SES-CIERRE']}>
      <TutorAttendance />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  fixtures.guardar.mockReset();
});
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
describe('cierre de los registros derivados de asistencia', () => {
  it.each(['individual', 'grupal'] as const)(
    '%s conserva el editor hasta confirmar el guardado y muestra su escena',
    async (tipo) => {
      let confirmar!: () => void;
      fixtures.guardar.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            confirmar = resolve;
          }),
      );
      const { container } = abrir(tipo);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
      await waitFor(() => expect(fixtures.guardar).toHaveBeenCalledOnce());
      expect(container.querySelector('.form-completion')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar registro' })).toBeDisabled();
      await act(async () => confirmar());
      const scene = document.querySelector('.form-completion');
      expect(scene).toHaveAttribute('data-format', tipo === 'individual' ? 'F06' : 'F07');
      expect(screen.getByRole('button', { name: /Volver al listado/ })).toBeEnabled();
    },
  );
  it('mantiene la asistencia para reintentar y no celebra un guardado rechazado', async () => {
    fixtures.guardar.mockRejectedValue(new Error('Conflicto de versión.'));
    abrir('individual');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Conflicto de versión.'),
    );
    expect(document.querySelector('.form-completion')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar registro' })).toBeEnabled();
  });
});
