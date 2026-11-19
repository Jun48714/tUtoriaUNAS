export interface LottieAnimation {
  isLoaded: boolean;
  totalFrames: number;
  getDuration(inFrames?: boolean): number;
  goToAndStop(frame: number, inFrames: boolean): void;
  setSpeed(speed: number): void;
  play(): void;
  pause(): void;
  destroy(): void;
  addEventListener(name: string, callback: () => void): void;
  removeEventListener(name: string, callback: () => void): void;
}
interface LottiePlayer {
  loadAnimation(options: {
    container: HTMLElement;
    renderer: 'svg';
    loop: false;
    autoplay: false;
    animationData: unknown;
    rendererSettings: { preserveAspectRatio: string; progressiveLoad: boolean };
  }): LottieAnimation;
}
declare global {
  interface Window {
    lottie?: LottiePlayer;
  }
}
let player: Promise<LottiePlayer> | undefined;
const files = new Map<string, Promise<unknown>>();

/** Reproductor local fijado a 5.13.0; se descarga únicamente al confirmar una entrega. */
export function cargarReproductor(): Promise<LottiePlayer> {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!player)
    player = new Promise<LottiePlayer>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/celebraciones/lottie-light-5.13.0.min.js';
      script.async = true;
      script.onload = () =>
        window.lottie ? resolve(window.lottie) : reject(new Error('Reproductor no disponible.'));
      script.onerror = () => {
        script.remove();
        reject(new Error('No se pudo cargar la celebración.'));
      };
      document.head.append(script);
    }).catch((error: unknown) => {
      player = undefined;
      throw error;
    });
  return player;
}
export function cargarCelebracion(formato: string): Promise<unknown> {
  if (!/^F(0[1-9]|1[0-2])$/.test(formato)) return Promise.reject(new Error('Formato inválido.'));
  const previous = files.get(formato);
  if (previous) return previous;
  const pending = fetch(`/assets/celebraciones/${formato}.json`)
    .then((response) => {
      if (!response.ok) throw new Error('No se pudo cargar la celebración.');
      return response.json() as Promise<unknown>;
    })
    .catch((error: unknown) => {
      files.delete(formato);
      throw error;
    });
  files.set(formato, pending);
  return pending;
}
