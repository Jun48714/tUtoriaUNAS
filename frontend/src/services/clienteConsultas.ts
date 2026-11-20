import { QueryClient } from '@tanstack/react-query';
import { registrarLimpiezaConsultas } from './limpiezaConsultas';

/** Cliente único del portal; vive en el chunk del portal (ver AppLayoutConConsultas). */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
registrarLimpiezaConsultas(() => queryClient.clear());
