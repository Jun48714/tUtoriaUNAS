import type { DemoUser } from '../types/auth';
import { z } from 'zod';

export interface ApiSession {
  accessToken: string;
  expiresAt: number;
  user: DemoUser | null;
}
const SESSION_KEY = 'unas:api-session:v1';
const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().finite(),
  user: z.object({
    id: z.string().min(1),
    role: z.enum(['estudiante', 'tutor', 'coordinacion']),
    name: z.string(),
    identifier: z.string(),
    email: z.string(),
    personaId: z.string().optional(),
    adminInstitucional: z.boolean().optional(),
    coordinadorEscuela: z.boolean().optional(),
  }),
});
let session: ApiSession | null = null;
let escuelaAdministrada: string | undefined;
try {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) session = parsed.data;
  }
} catch {
  /* Requiere volver a iniciar sesión. */
}
export function getApiSession() {
  return session && session.expiresAt > Date.now() ? session : null;
}
export function setApiSession(value: ApiSession | null, remember = true) {
  if (value?.accessToken !== session?.accessToken) escuelaAdministrada = undefined;
  session = value;
  try {
    if (value?.user && remember) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Sesión solo en memoria. */
  }
}
export function seleccionarEscuelaApi(escuelaId: string | undefined) {
  escuelaAdministrada = escuelaId;
}
export function rutaEscuela(path: string, escuela: string) {
  return `${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ ambitoEscuela: escuela })}`;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export async function apiJson<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return (await solicitar<T>(path, method, body, signal, null)).datos as T;
}
/**
 * GET condicional: envía la etiqueta (ETag) de la copia que ya tiene el portal. Devuelve
 * `null` cuando el servidor responde 304 (nada cambió), sin descargar ni analizar el cuerpo.
 */
export async function apiJsonSiCambio<T>(
  path: string,
  etag: string | null,
): Promise<{ datos: T; etag: string | null } | null> {
  const respuesta = await solicitar<T>(path, 'GET', undefined, undefined, etag);
  return respuesta.sinCambios ? null : { datos: respuesta.datos as T, etag: respuesta.etag };
}
async function solicitar<T>(
  path: string,
  method: string,
  body: unknown,
  signal: AbortSignal | undefined,
  etag: string | null,
): Promise<{ datos: T | undefined; etag: string | null; sinCambios: boolean }> {
  // Producción: sin variable, la API se llama en el mismo dominio (/api detrás del proxy).
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:5080' : window.location.origin);
  const current = getApiSession();
  const escuela = escuelaAdministrada;
  const url = new URL(path, baseUrl);
  if (
    current?.user?.adminInstitucional &&
    !url.searchParams.has('ambitoEscuela') &&
    !url.searchParams.has('ambitoInstitucional')
  ) {
    if (escuela) url.searchParams.set('ambitoEscuela', escuela);
    else url.searchParams.set('ambitoInstitucional', 'true');
  }
  function comprobarCuenta() {
    if (
      !path.endsWith('/login') &&
      (getApiSession()?.accessToken !== current?.accessToken || escuelaAdministrada !== escuela)
    )
      throw new ApiError('La sesión o la escuela cambió. Vuelve a abrir el registro.', 409);
  }
  const response = await fetch(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    signal,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(current ? { Authorization: `Bearer ${current.accessToken}` } : {}),
      ...(etag ? { 'If-None-Match': etag } : {}),
    },
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      'No hay conexión con el servidor. Revisa la conexión e inténtalo de nuevo.',
      503,
    );
  });
  comprobarCuenta();
  if (response.status === 304 && etag) return { datos: undefined, etag, sinCambios: true };
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      title?: string;
      errors?: Record<string, string[]>;
    };
    comprobarCuenta();
    if (
      (response.status === 401 || (response.status === 403 && path === '/api/tutoria/estado')) &&
      !path.endsWith('/login')
    ) {
      setApiSession(null);
      window.dispatchEvent(new Event('unas:api-session-expired'));
    }
    throw new ApiError(
      problem.title ?? 'No se pudo completar la operación en el servidor.',
      response.status,
      problem.errors,
    );
  }
  const result = response.status === 204 ? undefined : await response.json();
  comprobarCuenta();
  return { datos: result as T, etag: response.headers.get('ETag'), sinCambios: false };
}
export const getApiJson = (path: string, signal?: AbortSignal) =>
  apiJson<unknown>(path, 'GET', undefined, signal);
