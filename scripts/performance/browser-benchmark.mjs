import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const frontend = resolve(repository, 'frontend');
const requireFrontend = createRequire(resolve(frontend, 'package.json'));
const { chromium } = requireFrontend('@playwright/test');
const { preview } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);

const mode = process.env.PERF_MODE ?? 'demo';
if (!['demo', 'api'].includes(mode)) throw new Error('PERF_MODE must be demo or api.');
const port = Number(process.env.PERF_PORT ?? 4191);
const speed = (process.env.PERF_SPEEDS ?? '5,2').split(',').map(Number);
const samples = Number(process.env.PERF_SAMPLES ?? 3);
const cpuSlowdown = Number(process.env.PERF_CPU ?? 4);
const routeFilter = process.env.PERF_ROUTE_FILTER
  ? new RegExp(process.env.PERF_ROUTE_FILTER)
  : null;
const output = resolve(process.argv[2] ?? 'scripts/performance/browser-results.json');
const dist = resolve(process.env.PERF_DIST ?? 'frontend/dist');
const api = process.env.PERF_PROXY_URL;
if (api && !['127.0.0.1', 'localhost'].includes(new URL(api).hostname)) {
  throw new Error('The benchmark proxy only accepts a local synthetic API.');
}
const origin = 'http://127.0.0.1:' + port;
const [width, height] = (process.env.PERF_VIEWPORT ?? '1440x900').split('x').map(Number);
const viewport = { width, height };
const profiles = [
  { name: 'estudiante', role: 'estudiante', identifier: '2023010456' },
  { name: 'tutor', role: 'tutor', identifier: 'DOC-0421' },
  {
    name: mode === 'api' ? 'administracion-institucional' : 'coordinacion',
    role: 'coordinacion',
    identifier: 'coordinacion.tutoria',
  },
  ...JSON.parse(process.env.PERF_ADDITIONAL_PROFILES ?? '[]'),
];
const password = process.env.PERF_FIXTURE_PASSWORD ?? 'tutoria2026';
const eligible = (route) => !routeFilter || routeFilter.test(route);
const phases = new Set((process.env.PERF_PHASES ?? 'cold,reload,warm,cached,operation').split(','));
const profileFilter = process.env.PERF_PROFILE_FILTER
  ? new RegExp(process.env.PERF_PROFILE_FILTER)
  : null;
const routerSource = readFileSync(resolve(frontend, 'src/routes/AppRoutes.tsx'), 'utf8');
const routes = [...routerSource.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]);
const queryRoutes = {
  estudiante: [
    'instrumentos?estado=enviado',
    'instrumentos?estado=pendiente',
    'derivaciones?estado=seguimiento',
    'sesiones?vista=historial',
  ],
  tutor: [
    'instrumentos?ambito=propios',
    'instrumentos?ambito=estudiantes',
    'derivaciones?estado=seguimiento',
    'sesiones?vista=historial',
  ],
  coordinacion: ['sesiones?vista=historial'],
};
const monitoring = '/tutor/monitoreo';
const aliases = {
  '/': '/login',
  '/estudiante': '/estudiante/dashboard',
  '/estudiante/calendario': '/estudiante/sesiones',
  '/tutor': '/tutor/dashboard',
  '/tutor/calendario': '/tutor/sesiones',
  '/tutor/horario': '/tutor/sesiones',
  '/coordinacion': '/coordinacion/dashboard',
  '/coordinacion/calendario': '/coordinacion/sesiones',
  '/coordinacion/horarios': '/coordinacion/sesiones',
};
const isPortal = (path) => /^\/(estudiante|tutor|coordinacion)(\/|$|\?)/.test(path);
const routeAt = (url) => url.pathname + url.search;
const results = {
  stage: process.env.PERF_STAGE ?? 'unlabeled',
  mode,
  dataset:
    mode === 'demo'
      ? 'Browser-only bundled demo fixtures'
      : 'Authorized isolated local API with synthetic fixtures',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim(),
  appId: readFileSync(resolve(dist, 'index.html'), 'utf8').match(/\/assets\/[^"' ]+\.js/)?.[0],
  measuredAt: new Date().toISOString(),
  platform: platform(),
  cpuModel: cpus()[0]?.model,
  chromium: null,
  playwright: requireFrontend('@playwright/test/package.json').version,
  viewport,
  speedMbps: speed,
  rttMs: 150,
  cpuSlowdown,
  requestedSamplesPerCase: samples,
  selectedPhases: [...phases],
  definitions: {
    cold: 'Real login to prepare the role, then HTTP cache cleared; navigation from the address bar into the requested route.',
    reload: 'Browser reload of the same route with HTTP cache intact.',
    warm: 'First usable navigation by app link from a neighbouring route after login.',
    cached: 'Second navigation by the same link after visiting the previous route again.',
    ready:
      'Visible heading, dashboard chart or detail dialog as appropriate, then two animation frames. Empty states are allowed; errors are recorded. For authentication pages, LCP collection continues until the hero decode settles without changing the ready timestamp.',
    inpLab:
      'Maximum observed Event Timing interaction duration in the measured lab actions. Null when no qualifying interaction; not field INP.',
    lcp: 'Largest-paint entry from initial document navigation only, without field aggregation.',
    cls: 'Max layout shift session window without recent input. Warm SPA phases report only their local shifts.',
    requests:
      'Document and completed resources visible to Resource Timing around the measured phase.',
    bytes:
      'Browser Resource Timing transfer/encoded/decoded sums. Cross-origin API sizes may be redacted without Timing-Allow-Origin; CDP apiWireBytes is separate.',
    cpu: 'Chromium Performance scripting/layout cumulative duration deltas and end-of-phase JS heap.',
  },
  entries: [],
  skipped: [],
};

function installObservers() {
  performance.setResourceTimingBufferSize(2000);
  window.perfProbe = { lcp: [], shifts: [], interactions: [], longTasks: [] };
  const observe = (type, list, detail, options = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    new PerformanceObserver((entries) => {
      window.perfProbe[list].push(...entries.getEntries().map(detail));
    }).observe({ type, buffered: true, ...options });
  };
  observe('largest-contentful-paint', 'lcp', (entry) => entry.startTime);
  observe('layout-shift', 'shifts', (entry) => [
    entry.startTime,
    entry.value,
    entry.hadRecentInput,
  ]);
  observe(
    'event',
    'interactions',
    (entry) => [entry.startTime, entry.duration, entry.interactionId],
    { durationThreshold: 16 },
  );
  observe('longtask', 'longTasks', (entry) => [entry.startTime, entry.duration]);
}

function probeSnapshot({ from, isDocument, ready }) {
  const probe = window.perfProbe;
  const normalize = (value) => Math.round(value * 10) / 10;
  const assets = [...performance.getEntriesByType('resource')];
  if (isDocument) assets.unshift(...performance.getEntriesByType('navigation'));
  const entries = assets.filter((item) => item.startTime >= from);
  const authPhoto = entries.filter((entry) =>
    /\/selva(?:-1000|-1400)?-[^/]+\.(?:avif|jpg)$/.test(entry.name),
  );
  const total = (key) => entries.reduce((sum, entry) => sum + entry[key], 0);
  let sessionStart = -Infinity;
  let last = -Infinity;
  let shiftSession = 0;
  let cls = 0;
  for (const [time, value, input] of probe.shifts) {
    if (time < from || input) continue;
    if (time - last >= 1000 || time - sessionStart >= 5000) {
      sessionStart = time;
      shiftSession = 0;
    }
    shiftSession += value;
    last = time;
    cls = Math.max(cls, shiftSession);
  }
  const eventDurations = probe.interactions
    .filter(([time, , id]) => time >= from && id > 0)
    .map(([, value]) => value);
  const tasks = probe.longTasks.filter(([time]) => time >= from);
  return {
    readyMs: normalize(ready - from),
    lcpMs: isDocument && probe.lcp.length ? normalize(probe.lcp.at(-1)) : null,
    cls: Math.round(cls * 10000) / 10000,
    inpLabMs: eventDurations.length ? Math.max(...eventDurations) : null,
    requests: entries.length,
    chunks: entries.filter((entry) => /\.js(?:[?#]|$)/.test(entry.name)).length,
    transferBytes: total('transferSize'),
    encodedBodyBytes: total('encodedBodySize'),
    decodedBodyBytes: total('decodedBodySize'),
    authPhotoRequests: authPhoto.length,
    authPhotoTransferBytes: authPhoto.reduce((sum, entry) => sum + entry.transferSize, 0),
    domElements: document.getElementsByTagName('*').length,
    longTasks: tasks.length,
    longTasksMs: normalize(tasks.reduce((sum, [, value]) => sum + value, 0)),
    largestResource:
      entries
        .reduce((max, item) => (item.transferSize > (max?.transferSize ?? 0) ? item : max), null)
        ?.name.split('/')
        .at(-1)
        ?.split('?')[0] ?? null,
  };
}

async function metricSnapshot(cdp) {
  return Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
  );
}

async function waitReady(page, path, comparePrevious = false) {
  await page.waitForURL((url) => routeAt(url) === path, { timeout: 4000 });
  const selector = !isPortal(path)
    ? path === '/login'
      ? '#identifier'
      : /^\/(recuperar-clave|crear-cuenta|verificar-cuenta)$/.test(path)
        ? '.d01__form-wrap'
        : '.error-page h1'
    : /\/dashboard$/.test(path)
      ? '.workspace .portal-chart canvas'
      : /\/estudiante\/instrumentos\/[^/?]+/.test(path)
        ? 'dialog[open]'
        : '.workspace h1, .workspace .empty-state';
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 9000 });
  if (comparePrevious) {
    await page.waitForFunction(
      (sel) => document.querySelector(sel) !== window.perfPreviousReady,
      selector,
      { timeout: 6000 },
    );
  }
  return page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))),
      ),
  );
}

async function visibleLink(page, path) {
  const selector = 'a[href=' + JSON.stringify(path) + ']';
  const visible = page.locator(selector + ':visible').first();
  if (await visible.count()) return visible;
  const hidden = page.locator('#app-sidebar ' + selector).first();
  if (!(await hidden.count())) return null;

  const drawer = page.locator('#sidebar-trigger');
  if (viewport.width < 1200 && (await drawer.getAttribute('aria-expanded')) === 'false') {
    await drawer.click({ timeout: 1000 });
  }
  const branch = await hidden.evaluate((element) => element.closest('ul.sidebar__submenu')?.id);
  if (branch) {
    const toggle = page.locator(
      'button[aria-controls=' + JSON.stringify(branch) + '][aria-expanded=false]',
    );
    if (await toggle.count()) await toggle.click({ timeout: 1000 });
  }
  return (await visible.count()) ? visible : null;
}

const server = await preview({
  configFile: false,
  root: frontend,
  build: { outDir: dist },
  preview: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    proxy: api ? { '/api': api } : undefined,
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  results.chromium = browser.version();
  for (const mbps of speed) {
    for (let sample = 1; sample <= samples; sample++) {
      const roles = [{ name: 'publico', role: null }, ...profiles];
      for (const profile of roles.filter(
        ({ name }) => !profileFilter || profileFilter.test(name),
      )) {
        const context = await browser.newContext({
          baseURL: origin,
          viewport,
          serviceWorkers: 'block',
        });
        await context.addInitScript(installObservers);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        const throughput = (mbps * 1_000_000) / 8;
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
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
        await cdp.send('Performance.enable');
        let apiRequests = new Map();
        let phaseNetworkStart;
        let issues = [];
        let phaseRequests = new WeakSet();
        page.on('request', (request) => phaseRequests.add(request));
        cdp.on('Network.requestWillBeSent', ({ requestId, request, timestamp }) => {
          const url = new URL(request.url);
          phaseNetworkStart ??= timestamp;
          const item = {
            method: request.method,
            path: url.pathname,
            startedAfterFirstRequestMs: Math.round((timestamp - phaseNetworkStart) * 1000),
          };
          if (url.pathname.startsWith('/api/')) apiRequests.set(requestId, item);
        });
        cdp.on('Network.responseReceived', ({ requestId, response }) => {
          const apiRequest = apiRequests.get(requestId);
          if (apiRequest) {
            apiRequest.status = response.status;
            apiRequest.encoding =
              Object.entries(response.headers).find(
                ([key]) => key.toLowerCase() === 'content-encoding',
              )?.[1] ?? null;
            apiRequest.ttfbMs = response.timing?.receiveHeadersEnd ?? null;
          }
        });
        cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
          const apiRequest = apiRequests.get(requestId);
          if (apiRequest) apiRequest.wireBytes = encodedDataLength;
        });
        page.on('pageerror', (error) => issues.push({ type: 'pageerror', name: error.name }));
        page.on('console', (message) => {
          if (message.type() === 'error') issues.push({ type: 'console-error' });
        });
        page.on('requestfailed', (request) => {
          if (!phaseRequests.has(request)) return;
          const url = new URL(request.url());
          issues.push({
            type: 'request-failed',
            path: url.pathname,
            error: request.failure()?.errorText,
          });
        });
        page.on('response', (response) => {
          if (response.status() >= 400)
            issues.push({
              type: 'http',
              path: new URL(response.url()).pathname,
              status: response.status(),
            });
        });
        console.log(mbps + ' Mbps sample ' + sample + ': ' + profile.name);

        async function measure(route, phase, action, expected = aliases[route] ?? route) {
          const document = phase === 'cold' || phase === 'reload';
          const before = await metricSnapshot(cdp);
          apiRequests = new Map();
          phaseNetworkStart = undefined;
          issues = [];
          phaseRequests = new WeakSet();
          const beforePath = new URL(page.url()).pathname;
          const comparePrevious =
            !document && beforePath !== new URL(expected, origin).pathname && phase !== 'operation';
          const from = document
            ? 0
            : await page.evaluate(() => {
                window.perfPreviousReady = document.querySelector('.workspace h1');
                return performance.now();
              });
          const entry = {
            mbps,
            sample,
            profile: profile.name,
            route,
            phase,
            expected,
          };
          try {
            await action();
            const ready = await waitReady(page, expected, comparePrevious);
            if (document) {
              await page.evaluate(async () => {
                const photo = window.document.querySelector('img.d01__photo');
                if (photo) await photo.decode().catch(() => undefined);
                await new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
              });
            }
            entry.metrics = await page.evaluate(probeSnapshot, {
              from,
              isDocument: document,
              ready,
            });
            const after = await metricSnapshot(cdp);
            const delta = (metric) =>
              Math.round(Math.max(0, (after[metric] - before[metric]) * 1000));
            entry.metrics.scriptingMs = delta('ScriptDuration');
            entry.metrics.layoutMs = delta('LayoutDuration');
            entry.metrics.styleMs = delta('RecalcStyleDuration');
            entry.metrics.jsHeapBytes = after.JSHeapUsedSize;
          } catch (error) {
            entry.error = error.name;
            entry.actual = routeAt(new URL(page.url()));
          }
          entry.api = [...apiRequests.values()];
          entry.apiWireBytes = entry.api.reduce(
            (sum, request) => sum + (request.wireBytes ?? 0),
            0,
          );
          entry.issues = issues.slice();
          if (entry.error || entry.issues.length) {
            console.log(
              '  ' +
                phase +
                ' ' +
                route +
                ' ' +
                (entry.error ?? 'issues') +
                ' ' +
                (entry.actual ?? '') +
                ' ' +
                JSON.stringify(entry.issues.slice(0, 3)),
            );
          }
          results.entries.push(entry);
          return Boolean(entry.metrics);
        }

        async function direct(route, expected) {
          await cdp.send('Network.clearBrowserCache');
          return measure(
            route,
            'cold',
            () => page.goto(route, { waitUntil: 'commit', timeout: 10_000 }),
            expected,
          );
        }

        async function forProfile() {
          if (!profile.role) {
            for (const route of [
              '/ruta-de-prueba-inexistente',
              ...routes.filter((path) => path.startsWith('/') && !isPortal(path)),
            ].filter(eligible)) {
              if (!phases.has('cold') && !phases.has('reload')) continue;
              if ((await direct(route)) && phases.has('reload')) {
                await measure(route, 'reload', () =>
                  page.reload({ waitUntil: 'commit', timeout: 10_000 }),
                );
              }
            }
            return;
          }
          const dashboard = '/' + profile.role + '/dashboard';
          await direct('/login');
          await page.locator('#identifier').fill(profile.identifier);
          await page.locator('#password').fill(password);
          if (
            !(await measure(dashboard, 'login-submit', () =>
              page.locator('.d01__form button[type=submit]').click({ timeout: 3000 }),
            ))
          )
            return;

          const prefix = '/' + profile.role + '/';
          const targets = routes.filter(
            (route) =>
              (route === '/' + profile.role || route.startsWith(prefix)) &&
              !route.includes(':estudianteId'),
          );
          if (profile.role === 'tutor' && (!routeFilter || eligible('/tutor/tutorados/EST'))) {
            await page.goto('/tutor/tutorados', {
              waitUntil: 'commit',
              timeout: 10_000,
            });
            await waitReady(page, '/tutor/tutorados');
            const detail = await page
              .locator('.workspace a[href^="/tutor/tutorados/"]')
              .first()
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null);
            if (detail) targets.push(detail);
            else
              results.skipped.push({
                mbps,
                sample,
                profile: profile.name,
                route: '/tutor/tutorados/:estudianteId',
                reason: 'The synthetic scope has no linked student record.',
              });
          }
          if (
            profile.role === 'estudiante' &&
            routes.includes(':instrumentoId') &&
            (!routeFilter || eligible('/estudiante/instrumentos/INST'))
          ) {
            await page.goto('/estudiante/instrumentos', {
              waitUntil: 'commit',
              timeout: 10_000,
            });
            await waitReady(page, '/estudiante/instrumentos');
            const detail = await page
              .locator('.workspace a[href^="/estudiante/instrumentos/"]')
              .first()
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null);
            if (detail) targets.push(detail);
            else
              results.skipped.push({
                mbps,
                sample,
                profile: profile.name,
                route: '/estudiante/instrumentos/:instrumentoId',
                reason: 'The synthetic fixture has no visible link for an enabled instrument.',
              });
          }
          targets.push(...(queryRoutes[profile.role] ?? []).map((route) => prefix + route));
          const orderedTargets = [...new Set(targets)].filter(eligible);
          for (const route of orderedTargets) {
            if (!phases.has('cold') && !phases.has('reload')) break;
            const allowed = !route.startsWith(monitoring) || profile.schoolCoordinator;
            const expected = allowed ? (aliases[route] ?? route) : '/no-autorizado';
            if ((await direct(route, expected)) && phases.has('reload')) {
              await measure(
                route,
                'reload',
                () => page.reload({ waitUntil: 'commit', timeout: 10_000 }),
                expected,
              );
            }
          }

          if (!['warm', 'cached', 'operation'].some((phase) => phases.has(phase))) return;

          // Avoid carrying over route-specific assets from the cold-route sweep.
          await cdp.send('Network.clearBrowserCache');
          await page.goto(dashboard, { waitUntil: 'commit', timeout: 10_000 });
          await waitReady(page, dashboard);
          async function goNeighbour(path) {
            if (routeAt(new URL(page.url())) === path) return;
            const close = page
              .locator('dialog[open]')
              .getByRole('button', { name: 'Cerrar ventana', exact: true });
            if (await close.count()) {
              await close.click({ timeout: 2000 });
              await page.locator('dialog[open]').waitFor({ state: 'hidden', timeout: 3000 });
              if (routeAt(new URL(page.url())) === path) return;
            }
            const link = await visibleLink(page, path);
            if (link) await link.click({ timeout: 3000 });
            else await page.goto(path, { waitUntil: 'commit', timeout: 10_000 });
            await waitReady(page, path);
          }
          for (const route of orderedTargets) {
            if (!phases.has('warm') && !phases.has('cached')) break;
            if (aliases[route] || (route.startsWith(monitoring) && !profile.schoolCoordinator))
              continue;
            let neighbour = route === dashboard ? prefix + 'perfil' : dashboard;
            if (/\/tutorados\/[^/?]+/.test(route)) neighbour = prefix + 'tutorados';
            if (/\/instrumentos\/[^/?]+/.test(route)) neighbour = prefix + 'instrumentos';
            if (route.startsWith(monitoring + '/')) neighbour = monitoring;
            await goNeighbour(neighbour);
            const link = await visibleLink(page, route);
            if (!link) {
              results.skipped.push({
                mbps,
                sample,
                profile: profile.name,
                route,
                phase: 'warm/cached',
                reason: 'No visible app link from the selected neighbour.',
              });
              continue;
            }
            if (!(await measure(route, 'warm', () => link.click({ timeout: 3000 })))) continue;
            await goNeighbour(neighbour);
            const secondLink = await visibleLink(page, route);
            if (secondLink && phases.has('cached'))
              await measure(route, 'cached', () => secondLink.click({ timeout: 3000 }));
          }
          if (
            phases.has('operation') &&
            profile.role === 'estudiante' &&
            eligible(prefix + 'instrumentos')
          ) {
            const route = prefix + 'instrumentos';
            await goNeighbour(route);
            const filter = page
              .getByRole('group', { name: 'Filtrar mis formularios' })
              .getByRole('button', { name: /Pendientes/ });
            await measure(
              route,
              'operation',
              () => filter.click({ timeout: 3000 }),
              route + '?estado=pendiente',
            );
          }
          if (
            phases.has('operation') &&
            profile.role !== 'estudiante' &&
            eligible(prefix + 'tutorados')
          ) {
            const route = prefix + 'tutorados';
            await goNeighbour(route);
            const field = page.getByPlaceholder(
              profile.role === 'tutor'
                ? 'Nombre, apellidos o código…'
                : 'Buscar por nombre, código o grupo…',
            );
            if (await field.count())
              await measure(route, 'operation', async () => {
                await field.fill('sin coincidencia ficticia');
                await page
                  .getByText(
                    /Sin estudiantes que coincidan|Sin estudiantes con estos filtros|No hay resultados|No se encontraron estudiantes/,
                  )
                  .first()
                  .waitFor({ timeout: 3000 });
              });
          }
        }

        try {
          await forProfile();
        } catch (error) {
          results.skipped.push({
            mbps,
            sample,
            profile: profile.name,
            reason: error.name,
            actual: routeAt(new URL(page.url())),
          });
          console.log('  Profile interrupted: ' + error.name + ' ' + routeAt(new URL(page.url())));
        } finally {
          await context.close();
          writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
        }
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
