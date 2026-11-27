import { readFileSync, writeFileSync } from 'node:fs';

const [beforePath, afterPath, destination] = process.argv.slice(2);
if (!beforePath || !afterPath || !destination) {
  throw new Error('Usage: node browser-compare.mjs BEFORE.json AFTER.json COMPARISON.json');
}

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const environment = [
  'mode',
  'platform',
  'cpuModel',
  'chromium',
  'playwright',
  'viewport',
  'speedMbps',
  'cpuSlowdown',
  'rttMs',
];
for (const field of environment) {
  if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
    throw new Error('Incompatible benchmark environment: ' + field);
  }
}

const statistics = (samples) => {
  const ordered = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const percentile = (p) => ordered[Math.ceil((ordered.length * p) / 100) - 1];
  return {
    n: ordered.length,
    p50: percentile(50),
    p75: percentile(75),
    p95: percentile(95),
    p99: percentile(99),
  };
};

const result = {
  note: 'Nearest-rank sample percentiles. Very small N describes the collected samples only; it does not establish a population percentile.',
  environment: Object.fromEntries(environment.map((field) => [field, before[field]])),
  before: { commit: before.commit, appId: before.appId, measuredAt: before.measuredAt },
  after: { commit: after.commit, appId: after.appId, measuredAt: after.measuredAt },
  routes: [],
  skipped: { before: before.skipped, after: after.skipped },
};

function group(entries) {
  const cases = new Map();
  for (const entry of entries) {
    const { mbps, profile, route, phase } = entry;
    const key = JSON.stringify([mbps, profile, route, phase]);
    if (!cases.has(key)) cases.set(key, []);
    cases.get(key).push(entry);
  }
  return cases;
}

const initial = group(before.entries);
const candidate = group(after.entries);
const metrics = [
  'readyMs',
  'lcpMs',
  'cls',
  'inpLabMs',
  'requests',
  'chunks',
  'transferBytes',
  'encodedBodyBytes',
  'decodedBodyBytes',
  'authPhotoRequests',
  'authPhotoTransferBytes',
  'apiStateStartMs',
  'apiWireBytes',
  'longTasks',
  'longTasksMs',
  'scriptingMs',
  'layoutMs',
  'styleMs',
  'jsHeapBytes',
];
function readMetric(entry, name) {
  if (name === 'apiWireBytes') return entry.api?.length ? entry.apiWireBytes : undefined;
  if (name === 'apiStateStartMs') {
    return entry.api?.find(
      (request) => request.method === 'GET' && request.path === '/api/tutoria/estado',
    )?.startedAfterFirstRequestMs;
  }
  return entry.metrics?.[name];
}

for (const key of new Set([...initial.keys(), ...candidate.keys()])) {
  const [mbps, profile, route, phase] = JSON.parse(key);
  const previous = initial.get(key) ?? [];
  const next = candidate.get(key) ?? [];
  const point = {
    mbps,
    profile,
    route,
    phase,
    samplesBefore: previous.length,
    samplesAfter: next.length,
    metrics: {},
  };
  point.errorsBefore = previous.filter(({ error, issues }) => error || issues?.length).length;
  point.errorsAfter = next.filter(({ error, issues }) => error || issues?.length).length;
  for (const name of metrics) {
    const baseline = statistics(previous.map((entry) => readMetric(entry, name)));
    const trial = statistics(next.map((entry) => readMetric(entry, name)));
    if (!baseline && !trial) continue;
    point.metrics[name] = {
      before: baseline,
      after: trial,
      p50Change: baseline && trial ? Math.round((trial.p50 - baseline.p50) * 100) / 100 : null,
    };
  }
  result.routes.push(point);
}

writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
