import type { AuthService } from '../types/auth';
import { apiJson, getApiSession, setApiSession } from './apiClient';
import type * as ApiTutoria from './apiTutoria';
import type { EstadoApi } from './apiTutoria';
import { ActivacionRequerida, borrarActivacion, guardarActivacion } from './cuentas';
import * as v from 'valibot';

// El almacén del expediente arrastra los catálogos y formatos (unos 70 KB): se descarga al iniciar
// sesión, en paralelo con la petición, y no al abrir /login. Sin cargar, no hay estado que vaciar.
let tutoria: typeof ApiTutoria | undefined;
const cargarTutoria = () => import('./apiTutoria').then((modulo) => (tutoria = modulo));
const vaciar = () => tutoria?.vaciarApi();

const respuestaLogin = v.union([
  v.object({
    accessToken: v.pipe(v.string(), v.minLength(1)),
    expiresIn: v.pipe(v.number(), v.gtValue(0)),
    estado: v.optional(v.custom<EstadoApi>(() => true)),
  }),
  v.object({
    activacionRequerida: v.literal(true),
    tokenActivacion: v.pipe(v.string(), v.length(64)),
    correo: v.pipe(v.string(), v.email()),
    expiraEn: v.pipe(v.number(), v.gtValue(0)),
    role: v.picklist(['estudiante', 'tutor', 'coordinacion']),
  }),
  v.object({ pendienteVinculacion: v.literal(true) }),
]);

export const apiAuthService: AuthService = {
  async login(credentials, remember) {
    setApiSession(null);
    vaciar();
    const cargando = cargarTutoria();
    cargando.catch(() => undefined); // El fallo se informa más abajo; aquí no debe quedar sin atender.
    const result = v.parse(
      respuestaLogin,
      await apiJson<unknown>('/api/auth/login', 'POST', {
        identifier: credentials.identifier.trim(),
        password: credentials.password,
        role: credentials.role,
        incluirEstado: true,
      }),
    );
    if ('activacionRequerida' in result) {
      guardarActivacion(
        {
          tokenActivacion: result.tokenActivacion,
          correo: result.correo,
          expiraEn: result.expiraEn ?? 900,
        },
        result.role,
      );
      throw new ActivacionRequerida();
    }
    if ('pendienteVinculacion' in result)
      throw new Error(
        'Tu cuenta está verificada. Coordinación debe vincular tu escuela para habilitar el portal docente.',
      );
    borrarActivacion();
    setApiSession(
      {
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        user: null,
      },
      false,
    );
    try {
      const api = await cargando;
      const data = result.estado ?? (await api.refrescarApi());
      if (!data) throw new Error('No se pudo validar la cuenta con el servidor.');
      if (result.estado) api.aplicarEstadoApi(data);
      setApiSession(
        {
          accessToken: result.accessToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
          user: data.usuario,
        },
        remember,
      );
      return data.usuario;
    } catch (e) {
      setApiSession(null);
      vaciar();
      throw e;
    }
  },
  restore: () => {
    const user = getApiSession()?.user ?? null;
    vaciar();
    return user;
  },
  logout() {
    borrarActivacion();
    setApiSession(null);
    vaciar();
  },
};
