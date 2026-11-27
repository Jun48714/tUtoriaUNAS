import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';

const base = __ENV.TUTORIA_PERF_URL;
const escenario = __ENV.TUTORIA_PERF_STAGE || 'base';
const segundos = Number(__ENV.TUTORIA_PERF_STAGE_SECONDS || 12);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || __ENV.TUTORIA_PERF_SYNTHETIC !== '1') {
  throw new Error('Use una API loopback conectada a una base sintética aislada.');
}
if (!Number.isInteger(segundos) || segundos < 5) throw new Error('Duración mínima de 5 s.');

const perfiles = {
  estudiante: ['estudiante', ['/api/sistema/calendario']],
  tutor: ['tutor', ['/api/sistema/calendario']],
  coordinadorEscuela: ['tutor', ['/api/monitoreo/escuela', '/api/sistema/calendario']],
  coordinacion: ['coordinacion', ['/api/padron?pagina=1', '/api/sistema/calendario']],
  administracion: [
    'coordinacion',
    ['/api/padron?pagina=1', '/api/sistema/calendario', '/api/tutoria/auditoria'],
  ],
};
const etapas = {
  base: [1],
  nominal: [2],
  alta: [4],
  pico: [1, 8, 1],
  estres: [4, 8, 16, 24],
};
const niveles = etapas[escenario];
if (!niveles) throw new Error('Etapa desconocida. Use base, nominal, alta, pico o estres.');

const porPerfil = Object.fromEntries(
  Object.keys(perfiles).map((perfil) => [
    perfil,
    {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: niveles.map((target) => ({ target, duration: segundos + 's' })),
      exec: 'navegar',
    },
  ]),
);
export const options = {
  scenarios: {
    ...porPerfil,
    preferencias: { executor: 'constant-vus', vus: 1, duration: niveles.length * segundos + 's', exec: 'guardar' },
  },
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: [escenario === 'estres' ? 'rate<0.01' : 'rate<0.005'],
    'http_req_duration{tipo:lectura}': ['p(50)<=150', 'p(95)<=400', 'p(99)<=1000'],
    'http_req_duration{tipo:mutacion}': ['p(50)<=800', 'p(95)<=2000', 'p(99)<=4000'],
    checks: ['rate>0.99'],
  },
};

function parametros(nombre, tipo, token) {
  return {
    tags: { name: nombre, tipo },
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    timeout: '8s',
    redirects: 0,
  };
}

function login(perfil) {
  const identifier = __ENV['TUTORIA_PERF_USER_' + perfil.toUpperCase()];
  const password = __ENV.TUTORIA_PERF_PASSWORD;
  if (!identifier || !password) throw new Error('Falta una credencial de prueba para ' + perfil);
  const body = JSON.stringify({ identifier, password, role: perfiles[perfil][0], incluirEstado: false });
  const res = http.post(base + '/api/auth/login', body, parametros('login', 'acceso'));
  if (!check(res, { 'acceso sintético aceptado': (r) => r.status === 200 && !!r.json('accessToken') })) {
    throw new Error('Acceso de prueba falló para ' + perfil + ' (HTTP ' + res.status + ')');
  }
  return res.json('accessToken');
}

export function setup() {
  return Object.fromEntries(Object.keys(perfiles).map((perfil) => [perfil, login(perfil)]));
}

function leer(ruta, token) {
  const res = http.get(base + ruta, parametros(ruta.split('?')[0], 'lectura', token));
  check(res, { 'lectura autorizada devuelve 200': (r) => r.status === 200 });
  return res;
}

const estadoInicial = '/api/tutoria/estado?inicio=true';
let tokenRenovado;
export function navegar(cuentas) {
  const perfil = exec.scenario.name;
  const paso = exec.vu.iterationInScenario;
  const rutas = perfiles[perfil][1];
  if (paso > 0 && paso % 12 === 0) tokenRenovado = login(perfil);
  const token = tokenRenovado || cuentas[perfil];
  leer(paso % 3 === 0 ? rutas[Math.floor(paso / 3) % rutas.length] : estadoInicial, token);
  sleep(0.5 + (paso % 4) * 0.25);
}

export function guardar({ estudiante }) {
  const res = leer(estadoInicial, estudiante);
  if (res.status === 200) {
    const preferencias = res.json('sistema.preferencias');
    const ruta = '/api/sistema/preferencias';
    const guardado = http.put(base + ruta, JSON.stringify(preferencias), parametros(ruta, 'mutacion', estudiante));
    if (check(guardado, { 'preferencias confirma 204': (r) => r.status === 204 })) {
      const lectura = leer(estadoInicial, estudiante);
      check(lectura, { 'versión persistida': (r) => r.status === 200 && r.json('sistema.preferencias.version') === preferencias.version + 1 });
    }
  }
  sleep(2);
}
