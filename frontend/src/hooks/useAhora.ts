import { useEffect, useState } from 'react';

/**
 * Reloj compartido para lógicas que dependen del paso del tiempo (bloqueos de
 * evaluación, cuenta regresiva de reenvío). Vive en su propio hook para que
 * ningún cálculo costoso se recompute solo porque pasó el intervalo.
 */
export function useAhora(intervaloMs = 30_000): number {
  const [ahora, setAhora] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => window.clearInterval(timer);
  }, [intervaloMs]);
  return ahora;
}
