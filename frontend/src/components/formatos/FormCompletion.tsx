import { useEffect, useRef } from 'react';
import type { CodigoFormato } from '../../types/domain';
import { escenasFormato, detalleFinal } from '../../data/escenasFormatos';
import { celebracionesFormatos } from '../../data/celebracionesFormatos';
import { cargarCelebracion, cargarReproductor } from '../../services/lottieCelebration';
import type { LottieAnimation } from '../../services/lottieCelebration';
import { useMotionPreference } from '../../hooks/useMotionPreference';
import { ArrowRight, Check } from '../ui/icons';
import '../../styles/form-completion.css';

/** Celebraciones de autor. Montar solo después de confirmar la entrega en el servidor. */
export function FormCompletion({
  formato,
  respuestas = {},
  onFinish,
  onView,
  focus = true,
}: {
  formato: CodigoFormato;
  respuestas?: Record<string, string>;
  onFinish?(): void;
  onView?(): void;
  focus?: boolean;
}) {
  const reduced = useMotionPreference();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const played = useRef(false);
  const animation = useRef<LottieAnimation | null>(null);
  const spec = celebracionesFormatos[formato];
  useEffect(() => {
    if (focus) heading.current?.focus({ preventScroll: true });
  }, [focus]);
  useEffect(() => {
    const host = canvas.current;
    const scene = stage.current;
    if (!host || !scene || played.current) return;
    if (reduced) {
      played.current = true;
      scene.dataset.playback = 'static';
      return;
    }
    let active = true;
    let current: LottieAnimation | undefined;
    const finish = () => {
      if (active) scene.dataset.playback = 'complete';
    };
    const failed = () => {
      if (active) scene.dataset.playback = 'fallback';
    };
    void Promise.all([cargarReproductor(), cargarCelebracion(formato)])
      .then(([player, data]) => {
        if (!active || played.current) return;
        current = player.loadAnimation({
          container: host,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false },
        });
        animation.current = current;
        const start = () => {
          if (!active || played.current || !current) return;
          played.current = true;
          scene.dataset.playback = 'playing';
          current.setSpeed(current.getDuration() / spec.segundos);
          current.play();
        };
        current.addEventListener('complete', finish);
        current.addEventListener('data_failed', failed);
        current.addEventListener('DOMLoaded', start);
        if (current.isLoaded) start();
      })
      .catch(failed);
    return () => {
      active = false;
      current?.destroy();
      if (animation.current === current) animation.current = null;
    };
  }, [formato, reduced, spec.segundos]);
  useEffect(() => {
    if (reduced && stage.current) {
      animation.current?.pause();
      stage.current.dataset.playback = 'static';
    }
  }, [reduced]);
  const realizadas = Object.entries(respuestas).filter(
    ([key, value]) => /^actividad\d+$/.test(key) && value === 'Realizada',
  ).length;
  const noRealizadas = Object.entries(respuestas).filter(
    ([key, value]) => /^actividad\d+$/.test(key) && value === 'No realizada',
  ).length;
  const outcome =
    respuestas.resultado === 'Se deriva a:'
      ? 'derivar'
      : respuestas.resultado?.includes('cita')
        ? 'seguimiento'
        : 'resuelto';
  const derivacionDibu = formato === 'F12' || (formato === 'F08' && outcome === 'derivar');
  return (
    <section
      className="form-completion"
      data-reduced-motion={reduced}
      data-format={formato}
      aria-label={`Confirmación del formato ${formato.slice(1)}`}
    >
      <div
        className="fc-stage"
        ref={stage}
        aria-hidden="true"
        data-scene={formato}
        data-outcome={formato === 'F08' ? outcome : undefined}
      >
        <img
          className="fc-poster"
          src={`/assets/celebraciones/${formato}.png`}
          width="480"
          height="260"
          alt=""
          draggable={false}
        />
        <div className="fc-lottie" ref={canvas} />
      </div>
      <div className="fc-copy">
        <div className="fc-result">
          <span className="fc-result__icon" aria-hidden="true">
            <Check />
          </span>
          <h3 ref={heading} tabIndex={-1}>
            {escenasFormato[formato].titulo}
          </h3>
        </div>
        <p className="fc-detail sr-only" role="status">
          {detalleFinal(formato, respuestas)}
        </p>
        {derivacionDibu && (
          <p className="fc-detail">
            {formato === 'F08'
              ? 'Ficha de derivación preparada. Complétala desde Mis registros.'
              : 'La transmisión al sistema de DIBU está pendiente.'}
          </p>
        )}
        {formato === 'F09' && (
          <p className="fc-balance sr-only">
            {realizadas} realizadas · {noRealizadas} no realizadas
          </p>
        )}
        <div className="fc-actions">
          {onView && (
            <button
              type="button"
              className="btn btn-falcon-default"
              aria-label="Ver formulario"
              onClick={onView}
            >
              Ver
            </button>
          )}
          {onFinish && (
            <button
              type="button"
              className="btn btn-primary"
              aria-label="Volver al listado"
              onClick={onFinish}
            >
              Volver <ArrowRight />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
