import type { AuthService, Role } from '../types/auth';
import {
  RUTA_ESTADO_INICIAL,
  apiJson,
  apiJsonSiCambio,
  getApiSession,
  setApiSession,
} from './apiClient';
import type * as ApiTutoria from './apiTutoria';
import type { EstadoApi } from './apiTutoria';
import { ActivacionRequerida, borrarActivacion, guardarActivacion } from './cuentas';
import { esCorreo, esNumeroFinito, esObjeto, esRol, esTextoNoVacio } from '../utils/validacion';

// El almacén del expediente arrastra los catálogos y formatos (unos 70 KB): se descarga al iniciar
// sesión, en paralelo con la petición, y no al abrir /login. Sin cargar, no hay estado que vaciar.
let tutoria: typeof ApiTutoria | undefined;
const cargarTutoria = () => import('./apiTutoria').then((modulo) => (tutoria = modulo));
const vaciar = () => tutoria?.vaciarApi();

type RespuestaLogin =
  | { accessToken: string; expiresIn: number; estado?: EstadoApi }
  | {
      activacionRequerida: true;
      tokenActivacion: string;
      correo: string;
      expiraEn: number;
      role: Role;
    }
  | { pendienteVinculacion: true };

function validarRespuestaLogin(valor: unknown): RespuestaLogin {
  if (esObjeto(valor)) {
    if (
      esTextoNoVacio(valor.accessToken) &&
      esNumeroFinito(valor.expiresIn) &&
      valor.expiresIn > 0
    ) {
      return {
        accessToken: valor.accessToken,
        expiresIn: valor.expiresIn,
        ...(valor.estado !== undefined ? { estado: valor.estado as EstadoApi } : {}),
      };
    }
    if (
      valor.activacionRequerida === true &&
      typeof valor.tokenActivacion === 'string' &&
      valor.tokenActivacion.length === 64 &&
      typeof valor.correo === 'string' &&
      esCorreo(valor.correo) &&
      esNumeroFinito(valor.expiraEn) &&
      valor.expiraEn > 0 &&
      esRol(valor.role)
    ) {
      return {
        activacionRequerida: true,
        tokenActivacion: valor.tokenActivacion,
        correo: valor.correo,
        expiraEn: valor.expiraEn,
        role: valor.role,
      };
    }
    if (valor.pendienteVinculacion === true) return { pendienteVinculacion: true };
  }
  throw new Error('La respuesta del servidor no tiene el formato esperado.');
}

export const apiAuthService: AuthService = {
  async login(credentials, remember) {
    setApiSession(null);
    vaciar();
    const cargando = cargarTutoria();
    cargando.catch(() => undefined); // El fallo se informa más abajo; aquí no debe quedar sin atender.
    const result = validarRespuestaLogin(
      await apiJson<unknown>('/api/auth/login', 'POST', {
        identifier: credentials.identifier.trim(),
        password: credentials.password,
        role: credentials.role,
        // El estado se pide aparte con GET: así viaja comprimido (el login no se comprime por llevar
        // el token) y deja fijada la etiqueta para la siguiente consulta. Medido en producción:
        // 179 KB sin comprimir dentro del login.
        incluirEstado: false,
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
    // El estado se pide en cuanto llega el token, sin esperar a que termine de descargarse el módulo que lo
    // aplica: esas descargas compiten con las del panel y, con la latencia hasta el servidor, retrasaban la consulta.
    const pedido = result.estado
      ? undefined
      : apiJsonSiCambio<EstadoApi>(RUTA_ESTADO_INICIAL, null);
    pedido?.catch(() => undefined); // El fallo lo informa refrescarApi; aquí no debe quedar sin atender.
    try {
      const api = await cargando;
      const data = result.estado ?? (await api.refrescarApi(true, pedido));
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
