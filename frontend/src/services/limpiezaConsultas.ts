/**
 * React Query se descarga con el portal, no con /login. AuthProvider limpia su caché por este
 * registro, sin importar la biblioteca: si el portal aún no se cargó, no hay caché que limpiar.
 */
let limpiar: (() => void) | undefined;

export function registrarLimpiezaConsultas(accion: () => void) {
  limpiar = accion;
}

export function limpiarConsultas() {
  limpiar?.();
}
