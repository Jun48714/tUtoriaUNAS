import { useSyncExternalStore } from 'react';
import { DISPLAY_PREFERENCES_KEY, parseDisplayPreferences } from '../utils/displayPreferences';

function subscribe(update: () => void) {
  const query =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  query?.addEventListener?.('change', update);
  window.addEventListener('storage', update);
  window.addEventListener('unas:preferences', update);
  return () => {
    query?.removeEventListener?.('change', update);
    window.removeEventListener('storage', update);
    window.removeEventListener('unas:preferences', update);
  };
}
function snapshot() {
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return true;
  try {
    return parseDisplayPreferences(localStorage.getItem(DISPLAY_PREFERENCES_KEY)).reduceMotion;
  } catch {
    return false;
  }
}

/** La preferencia del sistema siempre puede reducir el movimiento del portal. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
