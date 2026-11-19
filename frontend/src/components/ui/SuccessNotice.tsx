import type { ReactNode } from 'react';
import { CircleCheck } from './icons';
import { useMotionPreference } from '../../hooks/useMotionPreference';
import '../../styles/form-feedback.css';

/** Confirmación de una operación ya resuelta; no se utiliza para una selección local. */
export function SuccessNotice({ children }: { children: ReactNode }) {
  const reduced = useMotionPreference();
  return (
    <span className="success-notice" data-reduced-motion={reduced} role="status">
      <CircleCheck aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
