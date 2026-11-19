/**
 * Genera el subconjunto de `src/assets/vendor/fontawesome.min.css` usado por la app.
 *
 * Conserva todas las reglas base y de utilidad del paquete, y reduce las reglas
 * de glifos (`.fa-xxx:before{content:…}`) a los iconos realmente utilizados,
 * incluyendo los nombres que se construyen en tiempo de ejecución (SAFELIST).
 * Elimina la fuente de marcas (Font Awesome 6 Brands): la app no usa `fa-brands`.
 *
 * Regenerar tras añadir iconos nuevos: node scripts/subconjunto-fontawesome.mjs
 * (lee fontawesome.full.css y reescribe fontawesome.min.css).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const srcDir = join(raiz, 'src');
const objetivo = join(srcDir, 'assets', 'vendor', 'fontawesome.min.css');
const origen = join(srcDir, 'assets', 'vendor', 'fontawesome.full.css');

// Nombres de glifo que solo aparecen como datos dinámicos (fa-${icono}):
const SAFELIST = new Set([
  // StudentNotices.tsx + studentNoticesWorkspace.ts (categorías y preferencias de avisos)
  'calendar-days',
  'file-lines',
  'hand-holding-heart',
  'graduation-cap',
  'heart-pulse',
  'chart-simple',
  // presentacionFormatos.ts (caras de opciones F10/F04/F05)
  'face-smile-beam',
  'face-smile',
  'face-frown',
  'face-frown-open',
  'face-meh',
]);

const usados = new Set(SAFELIST);
function recolectar(dir) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      recolectar(ruta);
      continue;
    }
    if (!/\.(ts|tsx|css|html)$/.test(entrada)) continue;
    if (ruta.includes('vendor')) continue; // el vendor no se auto-referencia
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/\bfa-([a-z0-9-]+)\b/g)) usados.add(m[1]);
  }
}
recolectar(srcDir);
// Los nombres de clase genéricos del paquete siempre se conservan:
for (const base of [
  'fa',
  'solid',
  'regular',
  'brands',
  'classic',
  'sharp',
  'fab',
  'fas',
  'far',
  'sr-only',
  'sr-only-focusable',
])
  usados.add(base);

const original = readFileSync(origen, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function parsearNodos(css) {
  const nodos = [];
  let buf = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) {
        if (css[j] === '\\') j++;
        j++;
      }
      buf += css.slice(i, j + 1);
      i = j + 1;
    } else if (ch === 'u' && css.slice(i, i + 4).toLowerCase() === 'url(') {
      let depth = 1;
      let j = i + 4;
      while (j < css.length && depth > 0) {
        if (css[j] === '"' || css[j] === "'") {
          const q = css[j];
          j++;
          while (j < css.length && css[j] !== q) {
            if (css[j] === '\\') j++;
            j++;
          }
        } else if (css[j] === '(') depth++;
        else if (css[j] === ')') depth--;
        j++;
      }
      buf += css.slice(i, j);
      i = j;
    } else if (ch === '{') {
      const selector = buf.trim();
      buf = '';
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        const cj = css[j];
        if (cj === '"' || cj === "'") {
          const q = cj;
          j++;
          while (j < css.length && css[j] !== q) {
            if (css[j] === '\\') j++;
            j++;
          }
        } else if (cj === '{') depth++;
        else if (cj === '}') depth--;
        j++;
      }
      nodos.push({ selector, body: css.slice(i + 1, j - 1) });
      i = j;
    } else if (ch === ';') {
      if (buf.trim()) nodos.push({ at: buf.trim() });
      buf = '';
      i++;
    } else if (ch === '}') {
      buf = '';
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  return nodos;
}

const GLIFO = /^\.fa-([a-z0-9-]+):(before|after)$/;
function procesar(nodos) {
  const salida = [];
  for (const nodo of nodos) {
    if (nodo.at) {
      salida.push(nodo.at + ';');
      continue;
    }
    const sel = nodo.selector;
    if (sel.startsWith('@')) {
      // @font-face de Brands fuera: la app no usa fa-brands.
      if (sel.startsWith('@font-face') && nodo.body.includes('"Font Awesome 6 Brands"')) continue;
      salida.push(sel + '{' + procesar(parsearNodos(nodo.body)) + '}');
      continue;
    }
    const partes = sel.split(',').map((p) => p.trim());
    const esReglaDeGlifo = partes.length > 0 && partes.every((p) => GLIFO.test(p));
    if (!esReglaDeGlifo) {
      salida.push(sel + '{' + nodo.body + '}');
      continue;
    }
    // Regla de glifo: conservar solo si todos sus iconos están en uso (mínimo 1).
    const glifos = partes.map((p) => p.match(GLIFO)[1]);
    if (glifos.every((g) => usados.has(g))) salida.push(sel + '{' + nodo.body + '}');
  }
  return salida.join('');
}

const resultado = procesar(parsearNodos(original));
writeFileSync(objetivo, resultado, 'utf8');
console.log(
  `fontawesome.min.css: ${(original.length / 1024).toFixed(0)} KB -> ${(resultado.length / 1024).toFixed(0)} KB`,
);
