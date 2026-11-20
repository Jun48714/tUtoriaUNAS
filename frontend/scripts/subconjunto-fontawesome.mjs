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
 *
 * También recorta `src/assets/webfonts/fa-*.woff2` a los glifos de esa hoja y a los
 * `content: '\f…'` de los estilos propios, a partir de `fa-*.full.woff2`. Para eso
 * necesita `subset-font`, que no es dependencia del proyecto: instálalo en una carpeta
 * aparte (`pnpm add subset-font`) y pasa su ruta en SUBSET_FONT, p. ej.
 *   SUBSET_FONT=C:/tmp/fuentes/node_modules/subset-font node scripts/subconjunto-fontawesome.mjs
 * Sin SUBSET_FONT las fuentes no se tocan y un icono nuevo se vería vacío.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  // EditorEstructura.tsx / EditorPregunta.tsx (icono="…" de los botones del editor)
  'pen',
  'arrow-up',
  'arrow-down',
  'copy',
  'trash-can',
  'chevron-left',
  'chevron-right',
  'xmark',
]);

const usados = new Set(SAFELIST);
const codigosPropios = new Set();
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
    for (const m of texto.matchAll(/content:\s*['"]\\(f[0-9a-f]{3,4})['"]/gi))
      codigosPropios.add(parseInt(m[1], 16));
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
  // La última declaración de un bloque no lleva `;` (p. ej. `src:url(…)` en @font-face).
  if (buf.trim()) nodos.push({ at: buf.trim() });
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
      if (sel.startsWith('@font-face') && /Brands|fa-brands/.test(nodo.body)) continue;
      salida.push(sel + '{' + procesar(parsearNodos(nodo.body)) + '}');
      continue;
    }
    const partes = sel.split(',').map((p) => p.trim());
    const esReglaDeGlifo = partes.length > 0 && partes.every((p) => GLIFO.test(p));
    if (!esReglaDeGlifo) {
      salida.push(sel + '{' + nodo.body + '}');
      continue;
    }
    // Regla de glifo: Font Awesome agrupa alias (`.fa-close,…,.fa-xmark`); se conservan
    // solo los selectores en uso, de modo que un alias sin usar no descarta el glifo.
    const enUso = partes.filter((p) => usados.has(p.match(GLIFO)[1]));
    if (enUso.length) salida.push(enUso.join(',') + '{' + nodo.body + '}');
  }
  return salida.join('');
}

const resultado = procesar(parsearNodos(original));
writeFileSync(objetivo, resultado, 'utf8');
console.log(
  `fontawesome.min.css: ${(original.length / 1024).toFixed(0)} KB -> ${(resultado.length / 1024).toFixed(0)} KB`,
);

const codigos = new Set(codigosPropios);
// Algunos glifos usan códigos ASCII (`fa-plus` es "\2b"), no solo el área privada \f000.
for (const m of resultado.matchAll(/content:"\\([0-9a-f]{1,6})"/gi))
  codigos.add(parseInt(m[1], 16));
if (!process.env.SUBSET_FONT) {
  console.warn(
    'AVISO: sin SUBSET_FONT no se regeneraron las fuentes; ver la cabecera de este script.',
  );
} else {
  const { default: subsetFont } = await import(
    pathToFileURL(join(process.env.SUBSET_FONT, 'index.js')).href
  );
  const webfonts = join(srcDir, 'assets', 'webfonts');
  const texto = String.fromCodePoint(...codigos);
  for (const fuente of ['fa-solid-900', 'fa-regular-400']) {
    const completa = readFileSync(join(webfonts, `${fuente}.full.woff2`));
    const recortada = await subsetFont(completa, texto, { targetFormat: 'woff2' });
    writeFileSync(join(webfonts, `${fuente}.woff2`), recortada);
    console.log(
      `${fuente}.woff2: ${(completa.length / 1024).toFixed(0)} KB -> ${(recortada.length / 1024).toFixed(0)} KB (${codigos.size} glifos)`,
    );
  }
}
