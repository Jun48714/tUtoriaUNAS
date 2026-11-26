import type { Role } from '../types/auth';
import { apiJson } from './apiClient';
import { esCorreo, esNumeroFinito, esObjeto, esRol } from '../utils/validacion';

const ACTIVACION_KEY = 'unas:activacion:v1';
export interface ActivacionPendiente {
  tokenActivacion: string;
  correo: string;
  role: Role;
  expira: number;
}
function validarActivacion(valor: unknown): ActivacionPendiente | null {
  if (
    !esObjeto(valor) ||
    typeof valor.tokenActivacion !== 'string' ||
    valor.tokenActivacion.length !== 64 ||
    typeof valor.correo !== 'string' ||
    !esCorreo(valor.correo) ||
    !esRol(valor.role) ||
    !esNumeroFinito(valor.expira)
  )
    return null;
  return {
    tokenActivacion: valor.tokenActivacion,
    correo: valor.correo,
    role: valor.role,
    expira: valor.expira,
  };
}
let activacionMemoria: ActivacionPendiente | null = null;
export class ActivacionRequerida extends Error {
  constructor() {
    super('Verifica tu cuenta para continuar.');
  }
}
export function guardarActivacion(
  data: { tokenActivacion: string; correo: string; expiraEn: number },
  role: Role,
) {
  activacionMemoria = {
    tokenActivacion: data.tokenActivacion,
    correo: data.correo,
    role,
    expira: Date.now() + data.expiraEn * 1000,
  };
  try {
    sessionStorage.setItem(ACTIVACION_KEY, JSON.stringify(activacionMemoria));
  } catch {
    /* La verificación continúa en memoria. */
  }
}
export function leerActivacion(): ActivacionPendiente | null {
  try {
    const data = validarActivacion(JSON.parse(sessionStorage.getItem(ACTIVACION_KEY) ?? 'null'));
    return data && data.expira > Date.now()
      ? data
      : activacionMemoria && activacionMemoria.expira > Date.now()
        ? activacionMemoria
        : null;
  } catch {
    return activacionMemoria && activacionMemoria.expira > Date.now() ? activacionMemoria : null;
  }
}
export function borrarActivacion() {
  activacionMemoria = null;
  try {
    sessionStorage.removeItem(ACTIVACION_KEY);
  } catch {
    /* Sin persistencia local. */
  }
}
export interface CodigoSolicitado {
  retoId: string;
  expiraEn: number;
  reenviarEn: number;
  mensaje: string;
}
export interface CuentaAdmin {
  id: string;
  personaId: string;
  escuelaId?: string;
  rol: Role;
  identifier: string;
  nombre: string;
  activo: boolean;
  version: number;
  verificada: boolean | null;
  cambioObligatorio: boolean;
  pendienteVinculacion: boolean;
  propia: boolean;
  correo: string;
  correoEstado: string;
  /** Docente designado por la administración para monitorear su escuela. */
  coordinadorEscuela?: boolean;
}
export interface CandidatoCuenta {
  id: string;
  nombre: string;
  nombres: string;
  apellidos: string;
  correo: string;
  escuelaId: string;
  ciclo: number | null;
}
export interface CuentaCreada {
  id: string;
  identifier: string;
  passwordTemporal: string;
  expiraEn: number;
  estadoCorreo: string;
}
export const solicitarCodigoCuenta = (body: {
  correo: string;
  proposito: string;
  rol: Role;
  tokenActivacion?: string;
}) => apiJson<CodigoSolicitado>('/api/auth/codigo', 'POST', body);
export interface EstadoCorreo {
  estado: string;
  mensaje: string;
}
export const validarCorreoCuenta = (body: { correo: string; proposito: string; rol: Role }) =>
  apiJson<EstadoCorreo>('/api/auth/correo/validar', 'POST', body);
let capacidades: Promise<{ revelarExistencia: boolean }> | null = null;
/** Indica si el servidor permite validar el correo al escribirlo (por defecto no). */
export const leerCapacidades = () =>
  (capacidades ??= apiJson<{ revelarExistencia: boolean }>('/api/auth/capacidades').catch(() => ({
    revelarExistencia: false,
  })));
export const confirmarCodigoCuenta = (body: {
  retoId: string;
  codigo: string;
  tokenActivacion?: string;
}) =>
  apiJson<{ ticket: string; expiraEn: number; perfiles?: Role[] | null }>(
    '/api/auth/codigo/confirmar',
    'POST',
    body,
  );
export const completarCuenta = (body: {
  retoId: string;
  ticket: string;
  password: string;
  confirmacion: string;
  /** Solo si el correo tiene varios perfiles al recuperar la contraseña. */
  rol?: Role;
}) =>
  apiJson<{ identifier: string; role: Role; pendienteVinculacion: boolean }>(
    '/api/auth/cuenta/completar',
    'POST',
    body,
  );
