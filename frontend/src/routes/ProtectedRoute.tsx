import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoading } from '../components/ui/PageLoading';
import type { Role } from '../types/auth';
import { useAuth } from '../hooks/useAuth';
import { preloadPortalRoute } from './portalPages';
import { cargarEstadoRestaurado } from '../services/apiAuthService';
import { API_MODE } from '../services/apiConfig';

// Presentation-only demo guards. They are not server security boundaries.
export function ProtectedRoute({ role }: { role?: Role }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const monitoreo = /^\/tutor\/monitoreo(?:\/|$)/.test(pathname);
  const puedePrecargar = role && user?.role === role && (!monitoreo || user.coordinadorEscuela);

  useEffect(() => {
    if (API_MODE && puedePrecargar) void cargarEstadoRestaurado().catch(() => undefined);
  }, [puedePrecargar]);

  useEffect(() => {
    if (puedePrecargar) preloadPortalRoute(pathname);
  }, [pathname, puedePrecargar]);

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/no-autorizado" replace />;
  // El guard se monta mientras se carga el shell y puede iniciar el módulo de la ruta solicitada.
  return (
    <Suspense fallback={<PageLoading />}>
      <Outlet />
    </Suspense>
  );
}
