import type { AriaAttributes, CSSProperties, ComponentType } from 'react';

/**
 * Base de la iconografía del sistema (Font Awesome Free 6.5.1 vendorizado).
 *
 * Cada icono acepta las propiedades que los componentes de interfaz ya usan
 * (`aria-hidden`, `className`, `style` y `size`, que se traduce a `font-size`).
 */

export interface IconProps extends Pick<AriaAttributes, 'aria-hidden' | 'aria-label'> {
  className?: string;
  /** Tamaño en píxeles; se aplica como `font-size` del icono. */
  size?: number | string;
  style?: CSSProperties;
  title?: string;
}

export type Icono = ComponentType<IconProps>;
export type Glifo = { width: number; height: number; path: string };

type EstiloIcono = 'solid' | 'regular';

/** Devuelve `crearIcono(nombre, estilo)` para un mapa de glifos concreto. */
export function fabricaIconos(glifos: Record<string, Glifo>) {
  return function crearIcono(nombre: string, estilo: EstiloIcono = 'solid'): Icono {
    const candidate = glifos[`${estilo}:${nombre}`];
    if (!candidate) throw new Error(`Icono no disponible: ${estilo}:${nombre}`);
    const glyph = candidate;

    function Icono({ className, size, style, title, ...resto }: IconProps) {
      const clases = ['portal-icon', className].filter(Boolean).join(' ');
      const estilos: CSSProperties | undefined =
        size === undefined
          ? style
          : { fontSize: typeof size === 'number' ? `${size}px` : size, ...style };
      return (
        <svg
          className={clases}
          viewBox={`0 0 ${glyph.width} ${glyph.height}`}
          focusable="false"
          style={estilos}
          role={title || resto['aria-label'] ? 'img' : undefined}
          aria-hidden={title ? undefined : true}
          {...resto}
        >
          {title && <title>{title}</title>}
          <path d={glyph.path} />
        </svg>
      );
    }
    Icono.displayName = `Icono${nombre
      .split('-')
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join('')}`;
    return Icono;
  };
}
