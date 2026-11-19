/**
 * Genera el subconjunto de `src/assets/vendor/falcon-theme.css` realmente usado.
 *
 * El tema completo pesa ~880 KB y se carga en el primer render. Este script
 * conserva:
 *   - Reglas sin clases (elementos, atributos, *, :root, variables).
 *   - @font-face, @keyframes, @property y cualquier @regla desconocida.
 *   - Bloques @media/@supports cuyo contenido sobreviva al filtro.
 *   - Reglas de clase solo si TODAS sus clases aparecen como palabra en el
 *     código fuente de `src/` o `index.html` (conservador: cualquier token
 *     palabra en el código cuenta como uso).
 *
 * Regenerar tras añadir clases nuevas del tema: node scripts/purgar-falcon.mjs
 * (lee falcon-theme.full.css y reescribe falcon-theme.css).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const srcDir = join(raiz, 'src');
const objetivo = join(srcDir, 'assets', 'vendor', 'falcon-theme.css');
const origen = join(srcDir, 'assets', 'vendor', 'falcon-theme.full.css');

// 1. Tokens usados en el código (clases, ids y palabras en general: es deliberadamente
//    permisivo para no romper estilos por clases construidas en tiempo de ejecución).
const usados = new Set([
  'active',
  'show',
  'fade',
  'in',
  'open',
  'collapsed',
  'disabled',
  'selected',
  'is-open',
  'is-active',
]);
function recolectar(dir) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      recolectar(ruta);
      continue;
    }
    if (!/\.(ts|tsx|css|html|svg)$/.test(entrada)) continue;
    // El vendor no cuenta como "uso": el subconjunto se genera desde el código de la app.
    if (ruta.includes(join('assets', 'vendor'))) continue;
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/[a-zA-Z0-9_-]+/g)) usados.add(m[0]);
  }
}
import { readdirSync, statSync } from 'node:fs';
recolectar(srcDir);
const indexHtml = readFileSync(join(raiz, 'index.html'), 'utf8');
for (const m of indexHtml.matchAll(/[a-zA-Z0-9_-]+/g)) usados.add(m[0]);

// 2. Parseo del CSS (soporta reglas anidadas y bloques @media/@supports).
function quitarComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
function parsearNodos(css) {
  const nodos = [];
  let buf = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      // Cadena literal: copiarla sin interpretar {}, ; o () dentro.
      let j = i + 1;
      while (j < css.length && css[j] !== ch) {
        if (css[j] === '\\') j++;
        j++;
      }
      buf += css.slice(i, j + 1);
      i = j + 1;
    } else if (ch === 'u' && css.slice(i, i + 4).toLowerCase() === 'url(') {
      // url(...) puede contener data-URIs con {}, ;: copiar hasta el ) final.
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
      // Cuerpo del bloque: respetar cadenas y url(...) también aquí.
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
      buf = ''; // cerramos un bloque ya consumido; ignorar
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  return nodos;
}

const SIN_CLASES_QUE_RECURSAN = ['media', 'supports', 'container', 'layer', 'scope', 'document'];
function procesar(nodos) {
  const salida = [];
  for (const nodo of nodos) {
    if (nodo.at) {
      salida.push(nodo.at + ';');
      continue;
    }
    const sel = nodo.selector;
    if (sel.startsWith('@')) {
      const nombre = sel
        .slice(1)
        .split(/[\s({]/)[0]
        .toLowerCase();
      if (SIN_CLASES_QUE_RECURSAN.includes(nombre)) {
        const interno = procesar(parsearNodos(nodo.body));
        if (interno.trim()) salida.push(sel + '{' + interno + '}');
      } else {
        salida.push(sel + '{' + nodo.body + '}');
      }
      continue;
    }
    const clases = [...sel.matchAll(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]);
    if (clases.length === 0) {
      salida.push(sel + '{' + nodo.body + '}');
      continue;
    }
    // Selector agrupado: separar por comas (fuera de paréntesis) y conservar solo
    // los selectores cuyas clases estén todas en uso, con el mismo cuerpo.
    const partes = [];
    let nivel = 0;
    let actual = '';
    for (const ch of sel) {
      if (ch === '(') nivel++;
      else if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) {
        partes.push(actual.trim());
        actual = '';
      } else actual += ch;
    }
    partes.push(actual.trim());
    const vivos = partes.filter((parte) => {
      const cs = [...parte.matchAll(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]);
      return cs.length === 0 || cs.every((c) => usados.has(c));
    });
    if (vivos.length > 0) salida.push(vivos.join(',') + '{' + nodo.body + '}');
  }
  return salida.join('');
}

const original = readFileSync(origen, 'utf8');
// Conservar eventuales comentarios de licencia /*! */
const licencias = [...original.matchAll(/\/\*![\s\S]*?\*\//g)].map((m) => m[0]).join('\n');
const purgado = procesar(parsearNodos(quitarComentarios(original)));
const resultado = (licencias ? licencias + '\n' : '') + purgado;
writeFileSync(objetivo, resultado, 'utf8');
console.log(
  `falcon-theme.css: ${(original.length / 1024).toFixed(0)} KB -> ${(resultado.length / 1024).toFixed(0)} KB`,
);
