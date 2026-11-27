import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiAuthService, cargarEstadoRestaurado } from './apiAuthService';
import { getApiSession, setApiSession } from './apiClient';
import { ActivacionRequerida, borrarActivacion, leerActivacion } from './cuentas';
const api = vi.hoisted(() => ({ aplicar: vi.fn(), refrescar: vi.fn(), vaciar: vi.fn() }));
vi.mock('./apiTutoria', () => ({
  aplicarEstadoApi: api.aplicar,
  refrescarApi: api.refrescar,
  snapshotApi: () => ({ datos: null }),
  vaciarApi: api.vaciar,
}));
const credentials = {
  identifier: 'prueba@unas.edu.pe',
  password: 'Temporal de prueba solamente',
};
function respuesta(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body)))),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  setApiSession(null);
  borrarActivacion();
});
afterEach(() => {
  setApiSession(null);
  borrarActivacion();
  vi.unstubAllGlobals();
});
describe('acceso institucional del cliente', () => {
  const cuentaRestaurada = {
    id: 'TUTOR-FICTICIO',
    role: 'tutor' as const,
    identifier: credentials.identifier,
    name: 'Docente de prueba',
    email: credentials.identifier,
  };

  it('comparte el GET de una sesión restaurada entre el guard y el shell', async () => {
    const estado = { usuario: cuentaRestaurada };
    respuesta(estado);
    api.refrescar.mockImplementationOnce(async (_inicio, pedido) => (await pedido).datos);
    setApiSession({
      accessToken: 'token-restaurado',
      expiresAt: Date.now() + 10000,
      user: cuentaRestaurada,
    });

    const guard = cargarEstadoRestaurado();
    const shell = cargarEstadoRestaurado();

    expect(fetch).toHaveBeenCalledOnce();
    await expect(Promise.all([guard, shell])).resolves.toEqual([estado, estado]);
    expect(api.refrescar).toHaveBeenCalledOnce();
  });

  it('descarta la consulta de la cuenta anterior si la sesión cambia durante la carga', async () => {
    respuesta({ usuario: cuentaRestaurada });
    setApiSession({
      accessToken: 'token-anterior',
      expiresAt: Date.now() + 10000,
      user: cuentaRestaurada,
    });

    const anterior = cargarEstadoRestaurado();
    apiAuthService.logout();

    await expect(anterior).resolves.toBeUndefined();
    expect(api.refrescar).not.toHaveBeenCalled();
  });

  it('aplica el estado inicial sin pedirlo una segunda vez', async () => {
    const usuario = {
      id: 'DOC-FICTICIO',
      role: 'tutor',
      identifier: credentials.identifier,
      name: 'Docente de prueba',
      email: credentials.identifier,
    };
    const estado = { usuario };
    respuesta({ accessToken: 'token-de-prueba', expiresIn: 3600, estado });
    await expect(apiAuthService.login(credentials, true)).resolves.toEqual(usuario);
    expect(api.aplicar).toHaveBeenCalledWith(estado);
    expect(api.refrescar).not.toHaveBeenCalled();
    expect(getApiSession()?.user).toEqual(usuario);
  });
  it('pide el estado aparte, comprimido, en lugar de dentro del login', async () => {
    const usuario = {
      id: 'EST-FICTICIO',
      role: 'estudiante',
      identifier: credentials.identifier,
      name: 'Estudiante de prueba',
      email: credentials.identifier,
    };
    respuesta({ accessToken: 'token-de-prueba', expiresIn: 3600 });
    api.refrescar.mockResolvedValue({ usuario });
    await expect(apiAuthService.login(credentials, false)).resolves.toEqual(usuario);
    const cuerpo = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body)) as Record<
      string,
      unknown
    >;
    expect(cuerpo.incluirEstado).toBe(false);
    // La consulta del estado sale con el token, sin esperar al módulo que la aplica.
    const estado = vi.mocked(fetch).mock.calls[1]!;
    expect(String(estado[0])).toContain('/api/tutoria/estado?inicio=true');
    expect(new Headers(estado[1]!.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    expect(api.refrescar).toHaveBeenCalledWith(true, expect.any(Promise));
    expect(api.aplicar).not.toHaveBeenCalled();
    expect(getApiSession()?.user).toEqual(usuario);
  });
  it('una contraseña temporal nunca se convierte en una sesión del portal', async () => {
    respuesta({
      activacionRequerida: true,
      tokenActivacion: 'A'.repeat(64),
      correo: credentials.identifier,
      expiraEn: 900,
      role: 'tutor',
    });
    await expect(apiAuthService.login(credentials, true)).rejects.toBeInstanceOf(
      ActivacionRequerida,
    );
    expect(getApiSession()).toBeNull();
    expect(api.refrescar).not.toHaveBeenCalled();
    expect(leerActivacion()).toMatchObject({ correo: credentials.identifier, role: 'tutor' });
    expect(sessionStorage.getItem('unas:activacion:v1')).not.toContain(credentials.password);
  });
  it('no permite entrar a un docente pendiente de vinculación académica', async () => {
    respuesta({ pendienteVinculacion: true });
    await expect(apiAuthService.login(credentials, true)).rejects.toThrow(/vincular tu escuela/);
    expect(getApiSession()).toBeNull();
    expect(api.refrescar).not.toHaveBeenCalled();
  });
  it('rechaza respuestas incompletas antes de crear la sesión', async () => {
    respuesta({ accessToken: 'incompleto' });
    await expect(apiAuthService.login(credentials, true)).rejects.toThrow();
    expect(getApiSession()).toBeNull();
    expect(api.refrescar).not.toHaveBeenCalled();
  });
});
