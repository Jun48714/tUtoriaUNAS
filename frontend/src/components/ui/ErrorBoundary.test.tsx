import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { recargarPorActualizacion, reloadPage } from '../../utils/navigation';

vi.mock('../../utils/navigation', () => ({
  reloadPage: vi.fn(),
  recargarPorActualizacion: vi.fn(() => false),
}));

afterEach(() => vi.restoreAllMocks());

describe('recuperación de errores de interfaz', () => {
  it.each([
    'Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.',
    'Failed to fetch dynamically imported module: /assets/StudentDashboard.js',
    'Loading chunk 17 failed.',
  ])('recarga los módulos cuando falla su carga: %s', (message) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(reloadPage).mockClear();
    function Falla(): never {
      throw new Error(message);
    }
    render(
      <ErrorBoundary>
        <Falla />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('recarga sola, sin pulsar nada, cuando falla la carga de un módulo', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(recargarPorActualizacion).mockClear();
    function Falla(): never {
      throw new Error('Failed to fetch dynamically imported module: /assets/X.js');
    }
    render(
      <ErrorBoundary>
        <Falla />
      </ErrorBoundary>,
    );
    expect(recargarPorActualizacion).toHaveBeenCalled();
  });

  it('permite volver a renderizar un fallo ordinario sin recargar la página', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(reloadPage).mockClear();
    let falla = true;
    function Pantalla() {
      if (falla) throw new Error('Fallo de render temporal');
      return <h1>Panel recuperado</h1>;
    }
    render(
      <ErrorBoundary>
        <Pantalla />
      </ErrorBoundary>,
    );
    falla = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('heading', { name: 'Panel recuperado' })).toBeVisible();
    expect(reloadPage).not.toHaveBeenCalled();
    expect(recargarPorActualizacion).not.toHaveBeenCalled();
  });
});
