/** Recarga los módulos, además del árbol React, tras una carga interrumpida. */
export function reloadPage() {
  window.location.reload();
}

const CLAVE_RECARGA = 'tutoria:recarga-por-actualizacion';
/**
 * Un despliegue nuevo cambia los nombres de los archivos: una pestaña abierta antes pide módulos que ya no
 * existen. Se recarga sola, una vez por minuto como máximo (para no entrar en bucle si el fallo es otro).
 * Devuelve true si inició la recarga.
 */
export function recargarPorActualizacion(): boolean {
  try {
    const ultima = Number(window.sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - ultima < 60_000) return false;
    window.sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch {
    return false; // sin almacenamiento no se puede evitar el bucle: que lo decida el usuario con «Reintentar»
  }
  window.location.reload();
  return true;
}
