import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../services/apiClient';
import type { MonitoreoApi, PersonaMonitoreo } from '../types/monitoreo';

const nombreDe = (p: PersonaMonitoreo | undefined, vacio: string) =>
  p ? `${p.apellidos}, ${p.nombres}` : vacio;

/** Datos de solo lectura de la escuela para el coordinador de escuela. */
export function useMonitoreo() {
  const consulta = useQuery({
    queryKey: ['monitoreo-escuela'],
    queryFn: ({ signal }) =>
      apiJson<MonitoreoApi>('/api/monitoreo/escuela', 'GET', undefined, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const ayudas = useMemo(() => {
    const estudiantes = new Map((consulta.data?.estudiantes ?? []).map((p) => [p.id, p]));
    const docentes = new Map((consulta.data?.docentes ?? []).map((p) => [p.id, p]));
    return {
      estudiante: (id: string | null | undefined) => (id ? estudiantes.get(id) : undefined),
      docente: (id: string | null | undefined) => (id ? docentes.get(id) : undefined),
      nombreEstudiante: (id: string | null | undefined) =>
        nombreDe(id ? estudiantes.get(id) : undefined, 'Estudiante'),
      nombreDocente: (id: string | null | undefined) =>
        nombreDe(id ? docentes.get(id) : undefined, 'Docente'),
    };
  }, [consulta.data]);
  return { ...consulta, ayudas };
}
