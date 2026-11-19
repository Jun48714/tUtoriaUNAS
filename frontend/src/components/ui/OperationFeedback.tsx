import { useEffect, useState } from 'react';
import { SuccessNotice } from './SuccessNotice';
import { OPERATION_CONFIRMED_EVENT as EVENT } from '../../utils/operationFeedback';

/** Conserva la confirmación de un guardado aunque se cierre su diálogo. */
export function OperationFeedback() {
  const [notice, setNotice] = useState<{ message: string; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const receive = (event: Event) => {
      const message = (event as CustomEvent<unknown>).detail;
      if (typeof message !== 'string') return;
      setNotice({ message, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 6000);
    };
    window.addEventListener(EVENT, receive);
    return () => {
      window.removeEventListener(EVENT, receive);
      clearTimeout(timer);
    };
  }, []);
  return (
    notice && (
      <div className="operation-feedback">
        <SuccessNotice key={notice.id}>{notice.message}</SuccessNotice>
        <button type="button" aria-label="Cerrar confirmación" onClick={() => setNotice(null)}>
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>
    )
  );
}
