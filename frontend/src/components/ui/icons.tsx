import { fontAwesomeIcons } from '../../assets/vendor/fontawesome-icons';
import { fabricaIconos } from './fabricaIconos';
import type { Icono, IconProps } from './fabricaIconos';

/**
 * Iconografía del sistema.
 *
 * Todos los controles y módulos usan Font Awesome Free 6.5.1 vendorizado.
 *
 * Los iconos de la pantalla de acceso viven en `iconosAcceso` (JavaScript inicial) y se vuelven a
 * exportar aquí; el resto de glifos se carga con el portal.
 */
export type { Icono, IconProps };
export {
  X,
  ArrowLeft,
  IdCardSolid,
  KeyRound,
  Lock,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  Info,
  MailSolid,
  Eye,
  EyeOff,
} from './iconosAcceso';

const crearIcono = fabricaIconos(fontAwesomeIcons);

/* ==========================================================================
   Navegación y estructura
   ========================================================================== */
export const LayoutDashboard = crearIcono('table-columns');
export const Menu = crearIcono('bars');
export const ChevronLeft = crearIcono('chevron-left');
export const ChevronRight = crearIcono('chevron-right');
export const ArrowRight = crearIcono('arrow-right');
export const ArrowUp = crearIcono('arrow-up');
export const ArrowDown = crearIcono('arrow-down');
export const ArrowLeftRight = crearIcono('arrow-right-arrow-left');
export const LogOut = crearIcono('arrow-right-from-bracket');
export const Search = crearIcono('magnifying-glass');
export const Bell = crearIcono('bell', 'regular');
export const BellRing = crearIcono('bell', 'regular');
export const UserRound = crearIcono('user', 'regular');
export const Users = crearIcono('user-group');
export const UsersRound = crearIcono('users');
export const UserCheck = crearIcono('user-check');
export const UserPlus = crearIcono('user-plus');
export const Headset = crearIcono('headset');

/* ==========================================================================
   Tutoría, instrumentos y documentos
   ========================================================================== */
export const GraduationCap = crearIcono('graduation-cap');
export const Presentation = crearIcono('chalkboard-user');
export const BookOpen = crearIcono('book-open');
export const ClipboardList = crearIcono('clipboard-list');
export const ClipboardCheck = crearIcono('clipboard-check');
export const ListChecks = crearIcono('list-check');
export const FileText = crearIcono('file-lines', 'regular');
export const FileCheck = crearIcono('file-circle-check');
export const FileClock = crearIcono('clock-rotate-left');
export const FileSpreadsheet = crearIcono('file-csv');
export const FolderOpen = crearIcono('folder-open', 'regular');
export const Layers = crearIcono('layer-group');
export const SlidersHorizontal = crearIcono('sliders');
export const Settings2 = crearIcono('sliders');
export const Target = crearIcono('bullseye');
export const Award = crearIcono('award');
export const BadgeCheck = crearIcono('circle-check');
export const ScrollText = crearIcono('scroll');
export const Scale = crearIcono('scale-balanced');
export const Percent = crearIcono('percent');
export const ChartNoAxesCombined = crearIcono('chart-bar', 'regular');
export const TrendingUp = crearIcono('arrow-trend-up');
export const Activity = crearIcono('wave-square');
export const History = crearIcono('clock-rotate-left');
export const IdCard = crearIcono('id-card', 'regular');
/* Se evita repetir el mismo glifo en nombres con significados distintos: antes
   `ShieldAlert` era idéntico a `ShieldCheck` (un aviso de seguridad parecía una
   aprobación) y `MailPlus` dibujaba un lápiz en vez de un sobre. */
export const ShieldCheck = crearIcono('shield-halved');
export const ShieldAlert = crearIcono('user-lock');
export const Database = crearIcono('database');
export const Server = crearIcono('server');
export const ServerCog = crearIcono('server');
export const Network = crearIcono('diagram-project');
export const Plug = crearIcono('plug');

/* ==========================================================================
   Fechas, agenda y estados
   ========================================================================== */
export const CalendarDays = crearIcono('calendar-days', 'regular');
export const CalendarCheck = crearIcono('calendar-check', 'regular');
export const CalendarClock = crearIcono('calendar', 'regular');
export const CalendarRange = crearIcono('calendar-week');
export const Clock = crearIcono('clock', 'regular');
export const MapPin = crearIcono('location-dot');
export const Video = crearIcono('video');
export const Hourglass = crearIcono('hourglass-half');
export const Milestone = crearIcono('signs-post');
export const Waypoints = crearIcono('circle-nodes');
export const FingerprintPattern = crearIcono('fingerprint');
export const CircleDashed = crearIcono('circle-notch');
export const LoaderCircle = crearIcono('spinner');
export const Check = crearIcono('check');
export const Ban = crearIcono('ban');
export const Flag = crearIcono('flag', 'regular');
export const Send = crearIcono('paper-plane');
export const Inbox = crearIcono('inbox');
export const Download = crearIcono('download');
export const Printer = crearIcono('print');
export const Pencil = crearIcono('pen');
export const Plus = crearIcono('plus');
export const Save = crearIcono('floppy-disk');
export const Trash = crearIcono('trash-can');

/* ==========================================================================
   Comunicación, bienestar y servicios
   ========================================================================== */
export const Mail = crearIcono('envelope', 'regular');
export const MailCheck = crearIcono('envelope-circle-check');
export const MailOpen = crearIcono('envelope-open');
export const MailPlus = crearIcono('envelope-open-text');
export const Megaphone = crearIcono('bullhorn');
export const Phone = crearIcono('phone');
export const Utensils = crearIcono('utensils');
export const HeartPulse = crearIcono('heart-pulse');
export const HandHeart = crearIcono('hand-holding-heart');
export const Stethoscope = crearIcono('stethoscope');
export const Building2 = crearIcono('building');
export const Briefcase = crearIcono('briefcase');
export const Handshake = crearIcono('handshake');

/** Icono genérico para usos dinámicos: `<IconoBase nombre="fa-solid fa-bell" />`. */
export function IconoBase({ nombre, className, size, ...resto }: IconProps & { nombre: string }) {
  const estilos =
    size === undefined ? undefined : { fontSize: typeof size === 'number' ? `${size}px` : size };
  return (
    <i
      className={[nombre, className].filter(Boolean).join(' ')}
      style={estilos}
      aria-hidden="true"
      {...resto}
    />
  );
}
