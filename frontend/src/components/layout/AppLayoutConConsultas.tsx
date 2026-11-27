// Antes que AppLayout: conserva el orden del CSS (tema del portal, luego los estilos propios).
import '../../assets/vendor/falcon-theme.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '../../assets/vendor/falcon-portal.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../services/clienteConsultas';
import { AppLayout } from './AppLayout';

/**
 * Entrada del portal autenticado: aporta React Query, que el login no necesita. Así la biblioteca
 * baja con el portal (se precarga al enviar el login) y no con la pantalla de acceso.
 */
export function AppLayoutConConsultas() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout />
    </QueryClientProvider>
  );
}
