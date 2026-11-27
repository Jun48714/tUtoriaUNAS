import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/authContext';
import type { DemoUser, Role } from '../types/auth';
import { ProtectedRoute } from './ProtectedRoute';
import { preloadPortalRoute } from './portalPages';

vi.mock('./portalPages', () => ({ preloadPortalRoute: vi.fn() }));

function renderGuard(user: DemoUser | null, role?: Role, path = '/private') {
  render(
    <AuthContext.Provider value={{ user, login: vi.fn(), logout: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute role={role} />}>
            <Route path={path} element={<p>Protected content</p>} />
          </Route>
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/no-autorizado" element={<p>Unauthorized page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
const user: DemoUser = {
  id: 'student-1',
  role: 'estudiante',
  name: 'Ana Ejemplo',
  identifier: '2023010456',
  email: 'ana@demo.example',
};

describe('presentation-only demo access guards', () => {
  beforeEach(() => vi.mocked(preloadPortalRoute).mockClear());

  it('redirects unauthenticated visitors to login', () => {
    renderGuard(null, 'estudiante');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
  it('rejects access to another role', () => {
    renderGuard(user, 'coordinacion', '/coordinacion/padron');
    expect(screen.getByText('Unauthorized page')).toBeInTheDocument();
    expect(preloadPortalRoute).not.toHaveBeenCalled();
  });
  it('renders permitted routes', () => {
    renderGuard(user, 'estudiante');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
  it('allows any authenticated account when no role is specified', () => {
    renderGuard(user);
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
  it('no precarga monitoreo para un tutor regular', () => {
    renderGuard({ ...user, role: 'tutor' }, 'tutor', '/tutor/monitoreo/sesiones');
    expect(preloadPortalRoute).not.toHaveBeenCalled();
  });
  it('inicia la carga del módulo para una ruta permitida', () => {
    renderGuard(user, 'estudiante', '/estudiante/instrumentos');
    expect(preloadPortalRoute).toHaveBeenCalledWith('/estudiante/instrumentos');
  });
});
