import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormCompletion } from './FormCompletion';
import { escenasFormato } from '../../data/escenasFormatos';
import type { CodigoFormato } from '../../types/domain';
import { DISPLAY_PREFERENCES_KEY } from '../../utils/displayPreferences';
import { cargarCelebracion, cargarReproductor } from '../../services/lottieCelebration';

const { animation } = vi.hoisted(() => ({
  animation: {
    isLoaded: true,
    totalFrames: 180,
    getDuration: vi.fn(() => 4),
    goToAndStop: vi.fn(),
    setSpeed: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    destroy: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
}));
vi.mock('../../services/lottieCelebration', () => ({
  cargarCelebracion: vi.fn(() => Promise.resolve({ layers: [] })),
  cargarReproductor: vi.fn(() => Promise.resolve({ loadAnimation: vi.fn(() => animation) })),
}));

afterEach(() => {
  localStorage.removeItem(DISPLAY_PREFERENCES_KEY);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('cierres editoriales de los doce formatos', () => {
  it.each(Object.keys(escenasFormato) as CodigoFormato[])(
    '%s ofrece acciones inmediatas sin bloquear por duración',
    (formato) => {
      const finish = vi.fn(),
        view = vi.fn();
      const { container, rerender } = render(
        <FormCompletion formato={formato} onFinish={finish} onView={view} />,
      );
      expect(screen.getByRole('heading', { name: escenasFormato[formato].titulo })).toHaveFocus();
      const stage = container.querySelector('.fc-stage');
      expect(stage).toHaveAttribute('data-scene', formato);
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Ver formulario' }));
      expect(view).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: /Volver al listado/ }));
      expect(finish).toHaveBeenCalledOnce();
      rerender(<FormCompletion formato={formato} onFinish={finish} onView={view} />);
      expect(container.querySelector('.fc-stage')).toBe(stage);
    },
  );
  it.each([
    ['Se resuelve con la asesoría', 'resuelto', 'Se registró que la atención se resolvió'],
    ['Se programa nueva cita para seguimiento', 'seguimiento', 'La nueva cita de seguimiento'],
    ['Se deriva a:', 'derivar', 'Se preparó el formato 12'],
  ])('F08 refleja %s sin afirmar otro resultado', (resultado, ruta, texto) => {
    const { container } = render(
      <FormCompletion formato="F08" respuestas={{ resultado: String(resultado) }} />,
    );
    expect(container.querySelector('.fc-stage')).toHaveAttribute('data-outcome', String(ruta));
    expect(screen.getByRole('status')).toHaveTextContent(String(texto));
  });
  it('F09 conserva realizadas y no realizadas; F12 no anuncia recepción ni atención', () => {
    const { container } = render(
      <FormCompletion
        formato="F09"
        respuestas={{ actividad1: 'Realizada', actividad2: 'No realizada' }}
      />,
    );
    expect(container.querySelector('.fc-balance')).toHaveTextContent(
      '1 realizadas · 1 no realizadas',
    );
    cleanup();
    render(<FormCompletion formato="F12" />);
    expect(screen.getByRole('status')).not.toHaveTextContent(/atendid|recibid|aprobado/i);
  });
  it('respeta las preferencias antiguas, el ajuste propio y la preferencia del sistema', () => {
    localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify({ reduceMotion: true }));
    const { container, unmount } = render(<FormCompletion formato="F01" />);
    expect(container.firstChild).toHaveAttribute('data-reduced-motion', 'true');
    unmount();
    localStorage.removeItem(DISPLAY_PREFERENCES_KEY);
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const next = render(<FormCompletion formato="F01" />);
    expect(next.container.firstChild).toHaveAttribute('data-reduced-motion', 'true');
    expect(cargarReproductor).not.toHaveBeenCalled();
    expect(cargarCelebracion).not.toHaveBeenCalled();
  });
  it('reproduce la secuencia una vez, conserva el fotograma al terminar y no la reinicia al renderizar', async () => {
    const { container, rerender, unmount } = render(<FormCompletion formato="F11" />);
    await waitFor(() => expect(animation.play).toHaveBeenCalledOnce());
    expect(container.querySelector('.fc-stage')).toHaveAttribute('data-playback', 'playing');
    const complete = animation.addEventListener.mock.calls.find(
      ([event]) => event === 'complete',
    )![1];
    act(() => complete());
    expect(container.querySelector('.fc-stage')).toHaveAttribute('data-playback', 'complete');
    rerender(<FormCompletion formato="F11" />);
    expect(animation.play).toHaveBeenCalledOnce();
    unmount();
    expect(animation.destroy).toHaveBeenCalledOnce();
  });
  it('una animación que falla conserva confirmación y acciones con su imagen estática', async () => {
    vi.mocked(cargarCelebracion).mockRejectedValueOnce(new Error('sin conexión'));
    const { container } = render(<FormCompletion formato="F03" onFinish={vi.fn()} />);
    await waitFor(() =>
      expect(container.querySelector('.fc-stage')).toHaveAttribute('data-playback', 'fallback'),
    );
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByRole('button', { name: /Volver al listado/ })).toBeEnabled();
    expect(animation.play).not.toHaveBeenCalled();
  });
});
