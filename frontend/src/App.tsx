import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { AppRoutes } from './routes/AppRoutes';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// React Query se provee en AppLayoutConConsultas: el login no lo descarga.
export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        {/* La frontera de errores cubre todas las rutas: un fallo de render muestra un
            aviso con salida en lugar de dejar la pantalla en blanco. */}
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
