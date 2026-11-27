import process from 'node:process'

const origins = process.argv.slice(2)
const samples = Number(process.env.TUTORIA_PERF_API_SAMPLES ?? 24)
const password = process.env.TUTORIA_PERF_PASSWORD ?? 'tutoria2026'

if (origins.length !== 2 || !Number.isInteger(samples) || samples < 5 || samples > 200) {
  throw new Error('Uso: node scripts/performance/Measure-ActorRoutes.mjs http://127.0.0.1:5088 http://127.0.0.1:5089')
}

for (const origin of origins) {
  const url = new URL(origin)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || origin !== url.origin) {
    throw new Error('La comparación requiere dos orígenes HTTP de prueba en 127.0.0.1.')
  }
}
if (origins[0] === origins[1]) throw new Error('Usa un puerto distinto para cada compilación.')

const estado = '/api/tutoria/estado'
const identidad = '/api/access/me'
// Valida primero la cuenta exclusiva del entorno sintético.
const workloads = [
  ['coordinacion-escolar', 'coordinacion.perf', 'coordinacion', [identidad, estado]],
  ['estudiante', '2023010456', 'estudiante', [identidad, estado]],
  ['tutor', 'DOC-0421', 'tutor', [identidad, estado]],
  ['coordinador-escuela', 'DOC-0427', 'tutor', [identidad, estado, '/api/monitoreo/escuela']],
  ['administracion-institucional', 'coordinacion.tutoria', 'coordinacion', [
    identidad, estado + '?ambitoInstitucional=true', '/api/monitoreo/escuela?ambitoEscuela=E-IIS',
  ]],
]

async function request(origin, path, options = {}) {
  const start = performance.now()
  const response = await fetch(new URL(path, origin), {
    ...options,
    headers: { 'Accept-Encoding': 'identity', ...options.headers },
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(origin + path + ' devolvió HTTP ' + response.status)
  const body = Buffer.from(await response.arrayBuffer())
  return { body, milliseconds: performance.now() - start }
}

async function login(origin, identifier, role) {
  const result = await request(origin, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, role, password, incluirEstado: false }),
  })
  const { accessToken } = JSON.parse(result.body.toString('utf8'))
  if (!accessToken) throw new Error('No se recibió sesión para el perfil de prueba.')
  return { headers: { Authorization: 'Bearer ' + accessToken } }
}

const round = (value) => Math.round(value * 100) / 100

function percentiles(measurements) {
  const ordered = measurements.map((measurement) => measurement.milliseconds).sort((a, b) => a - b)
  const percentile = (p) => round(ordered[Math.ceil(ordered.length * p) - 1])
  const bytes = measurements.map((measurement) => measurement.bytes)
  return {
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    minBytes: Math.min(...bytes),
    maxBytes: Math.max(...bytes),
  }
}

const endpoints = []
for (const [profile, identifier, role, paths] of workloads) {
  const sessions = []
  for (const origin of origins) sessions.push(await login(origin, identifier, role))
  for (const path of paths) {
    const results = [[], []]
    for (let iteration = -3; iteration < samples; iteration++) {
      const first = (iteration + 3) % 2
      for (const index of [first, 1 - first]) {
        const { body, milliseconds } = await request(origins[index], path, sessions[index])
        if (iteration >= 0) results[index].push({ bytes: body.length, milliseconds })
      }
    }
    endpoints.push({
      profile,
      endpoint: path,
      before: percentiles(results[0]),
      after: percentiles(results[1]),
    })
  }
}

console.log(JSON.stringify({
  recordedAt: new Date().toISOString(),
  samplesPerEndpointPerVersion: samples,
  transport: 'HTTP loopback, sin compresión, peticiones seriales alternadas',
  measurements: endpoints,
}, null, 2))
