import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const frontend = resolve(repository, 'frontend');
const requireFrontend = createRequire(resolve(frontend, 'package.json'));
const { chromium, expect } = requireFrontend('@playwright/test');
const { preview } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);

const api = new URL(process.env.PERF_PROXY_URL ?? 'http://127.0.0.1:5088');
if (!['127.0.0.1', 'localhost'].includes(api.hostname)) {
  throw new Error('La medición solo admite una API local con datos sintéticos.');
}
const dist = resolve(
  repository,
  process.env.PERF_DIST ?? 'scripts/performance/.runtime/browser-api-dist',
);
const port = Number(process.env.PERF_PORT ?? 4194);
const speed = Number(process.env.PERF_SPEED ?? 5);
const throughput = (speed * 1_000_000) / 8;
const cpu = Number(process.env.PERF_CPU ?? 4);
const interval = 60;
const padronOnly = process.env.PERF_PADRON_ONLY === '1';
const rapidTerm = 'zzqfpr';
const interruptedTerm = 'zzqpra';
const lastTerm = 'zzqprb';
const accounts = [
  ['administracion-institucional', 'coordinacion.tutoria'],
  ['coordinacion-escuela', 'coordinacion.perf'],
];
const output = resolve(process.argv[2] ?? 'scripts/performance/.runtime/remote-search.json');
const index = await readFile(resolve(dist, 'index.html'), 'utf8');
const result = {
  stage: process.env.PERF_STAGE ?? 'unlabeled',
  appId: index.match(/\/assets\/[^"' ]+\.js/)?.[0],
  measuredAt: new Date().toISOString(),
  Mbps: speed,
  rttMs: 150,
  cpu,
  intervalMs: interval,
  chromium: null,
  cases: [],
};

async function measure(page, path, input, empty) {
  let requests = new Map();
  const start = (request) => {
    const url = new URL(request.url());
    const term = url.searchParams.get('buscar');
    if (request.method() === 'GET' && url.pathname === path && term) {
      requests.set(request, { term, startMs: performance.now() });
    }
  };
  const finish = (request) => {
    const observation = requests.get(request);
    if (observation) observation.outcome = 'complete';
  };
  const fail = (request) => {
    const observation = requests.get(request);
    if (observation) {
      observation.failure = request.failure()?.errorText;
      observation.outcome = observation.failure?.includes('ERR_ABORTED') ? 'cancelled' : 'failed';
    }
  };
  page.on('request', start);
  page.on('requestfinished', finish);
  page.on('requestfailed', fail);
  const matches = (request, term) => {
    const url = new URL(request.url());
    return url.pathname === path && url.searchParams.get('buscar') === term;
  };
  async function verify(responsePromise, inputFinishedMs) {
    const response = await responsePromise;
    const observed = requests.get(response.request());
    if (!response.ok() || !observed) throw new Error('Búsqueda final sin una respuesta válida.');
    const searchPacket = await response.json();
    const rows = Array.isArray(searchPacket) ? searchPacket : searchPacket.filas;
    expect(rows).toEqual([]);
    await empty.waitFor({ state: 'visible' });
    const ready = performance.now();
    return {
      readyFromRequestMs: Math.round(ready - observed.startMs),
      readyFromInputMs: Math.round(ready - inputFinishedMs),
    };
  }
  function snapshot() {
    return [...requests.values()].map(({ term, outcome, failure }) => ({
      term,
      outcome: outcome ?? 'pending',
      ...(failure ? { failure } : {}),
    }));
  }
  try {
    await input.focus();
    const expectedRapid = page.waitForResponse((response) => matches(response.request(), rapidTerm));
    await input.pressSequentially(rapidTerm, { delay: interval });
    const rapidTiming = await verify(expectedRapid, performance.now());
    await expect.poll(() => snapshot().filter((item) => item.outcome === 'pending').length).toBe(0);
    const rapid = { ...rapidTiming, requests: snapshot() };
    requests = new Map();
    const waitingForOld = page.waitForRequest((request) => matches(request, interruptedTerm));
    await input.fill(interruptedTerm);
    await waitingForOld;
    const waitingForNewest = page.waitForResponse((response) => matches(response.request(), lastTerm));
    await input.fill(lastTerm);
    const interruptedTiming = await verify(waitingForNewest, performance.now());
    await expect.poll(() => snapshot().filter((item) => item.outcome === 'pending').length).toBe(0);
    return { rapid, interrupted: { ...interruptedTiming, requests: snapshot() } };
  } finally {
    page.off('request', start);
    page.off('requestfinished', finish);
    page.off('requestfailed', fail);
  }
}

const server = await preview({
  configFile: false,
  root: frontend,
  build: { outDir: dist },
  preview: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    proxy: { '/api': api.origin },
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  result.chromium = browser.version();
  for (const [profile, identifier] of accounts) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:' + port,
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditionsByRule', {
        offline: false,
        matchedNetworkConditions: [
          {
            urlPattern: '',
            latency: 150,
            downloadThroughput: throughput,
            uploadThroughput: throughput,
          },
        ],
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

      await page.goto('/login');
      await page.locator('#identifier').fill(identifier);
      await page.locator('#password').fill(process.env.PERF_FIXTURE_PASSWORD ?? 'tutoria2026');
      await page.locator('.d01__form button[type="submit"]').click();
      await page.waitForURL('**/coordinacion/dashboard');

      await page.goto('/coordinacion/padron');
      const padron = page.getByRole('searchbox', { name: 'Nombre, correo o código' });
      const sinCoincidencias = page.getByText('Sin coincidencias', { exact: true });
      await sinCoincidencias.waitFor({ state: 'visible' });
      result.cases.push({
        profile,
        endpoint: '/api/padron',
        ...(await measure(page, '/api/padron', padron, sinCoincidencias)),
      });

      if (padronOnly) continue;
      await page.goto('/coordinacion/permisos?tab=cuentas');
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Crear cuenta' });
      const school = form.getByLabel('Escuela', { exact: true });
      if (await school.count()) await school.selectOption('E-ADM');
      await form.getByLabel('Origen de los datos').selectOption('padron');
      result.cases.push({
        profile,
        endpoint: '/api/cuentas/candidatos',
        ...(await measure(
          page,
          '/api/cuentas/candidatos',
          form.getByRole('searchbox', { name: 'Buscar en el padrón' }),
          form.getByText('Sin coincidencias. Prueba otro nombre o correo.', { exact: true }),
        )),
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.httpServer.close(done));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result));
