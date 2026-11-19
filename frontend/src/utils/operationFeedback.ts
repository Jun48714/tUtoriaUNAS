export const OPERATION_CONFIRMED_EVENT = 'unas:operation-confirmed';

/** Mensaje público breve, sin incluir respuestas ni datos sensibles. */
export function notifySaved(message: string) {
  window.dispatchEvent(new CustomEvent(OPERATION_CONFIRMED_EVENT, { detail: message }));
}
