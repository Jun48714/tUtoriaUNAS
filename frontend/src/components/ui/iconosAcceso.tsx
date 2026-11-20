import { glifosAcceso } from '../../assets/vendor/fontawesome-acceso';
import { fabricaIconos } from './fabricaIconos';

/**
 * Iconos que usa la pantalla de acceso y lo que se descarga con ella (login, recuperación,
 * verificación de cuenta, avisos de error y modales).
 *
 * Los módulos que se cargan al abrir /login deben importar sus iconos de aquí y no de `icons`,
 * que arrastra el mapa completo de glifos (unos 40 KB) al JavaScript inicial. `icons` vuelve a
 * exportar estos mismos componentes para el resto de la aplicación.
 *
 * Al agregar un icono aquí, ejecuta `node scripts/vendor-falcon-icons.mjs`.
 */
const crearIcono = fabricaIconos(glifosAcceso);

export const X = crearIcono('xmark');
export const ArrowLeft = crearIcono('arrow-left');
export const IdCardSolid = crearIcono('id-card');
export const KeyRound = crearIcono('key');
export const Lock = crearIcono('lock');
export const CircleAlert = crearIcono('circle-exclamation');
export const CircleCheck = crearIcono('circle-check');
export const TriangleAlert = crearIcono('triangle-exclamation');
export const Info = crearIcono('circle-info');
export const MailSolid = crearIcono('envelope');
export const Eye = crearIcono('eye', 'regular');
export const EyeOff = crearIcono('eye-slash', 'regular');
