import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch();
const baseURL = process.env.TUTORIA_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const apiURL = process.env.TUTORIA_API_URL ?? 'http://127.0.0.1:5080';
const resultado = { rutas: [], errores: [], mutaciones: [] };
const rutas = {
  coordinacion: ['dashboard', 'asignaciones', 'tutores', 'tutorados', 'plan', 'revisiones', 'reportes', 'sesiones', 'avisos', 'exportar', 'instrumentos', 'campos', 'permisos', 'integraciones', 'semestres', 'auditoria', 'padron'],
  tutor: ['dashboard', 'tutorados', 'sesiones', 'asistencias', 'derivaciones', 'instrumentos', 'reportes', 'avisos'],
  estudiante: ['dashboard', 'tutor', 'sesiones', 'instrumentos', 'expediente', 'derivaciones', 'salud', 'documentos', 'avisos'],
};
if (process.env.TUTORIA_SOLO_ROL) {
  for (const rol of Object.keys(rutas)) if (rol !== process.env.TUTORIA_SOLO_ROL) delete rutas[rol];
}
try {
  for (const [rol, identifier] of [['coordinacion', 'coordinacion.tutoria'], ['tutor', 'DOC-0421'], ['estudiante', process.env.TUTORIA_TEST_ESTUDIANTE ?? '2023010456']]) {
    if (!rutas[rol]) continue;
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', error => resultado.errores.push({ ruta: new URL(page.url()).pathname, mensaje: error.message }));
    await page.route('**/api/**', route => {
      const r = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && !r.url().endsWith('/auth/login')) {
        resultado.mutaciones.push(`${r.method()} ${new URL(r.url()).pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const login = await page.request.post(`${apiURL}/api/auth/login`, { data: { identifier, password: 'tutoria2026', incluirEstado: true } });
    assert.equal(login.status(), 200);
    const datos = await login.json();
    // Se mantiene todo el estado en memoria. No se exportan tokens ni datos personales.
    await page.goto(`${baseURL}/login`);
    await page.locator('#identifier').fill(identifier);
    await page.locator('#password').fill('tutoria2026');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL(`**/${rol}/dashboard`);
    for (const modulo of rutas[rol]) {
      const ruta = `/${rol}/${modulo}`;
      const response = await page.goto(baseURL + ruta);
      assert.equal(response.status(), 200, ruta);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('Cargando…', { exact: true })).toHaveCount(0, { timeout: 20000 });
      if (await page.getByText('No se pudo mostrar esta pantalla', { exact: true }).count()) {
        resultado.errores.push({ ruta, mensaje: await page.locator('.mono.small').textContent() });
      }
      await expect(page.getByText('No se pudo mostrar esta pantalla', { exact: true })).toHaveCount(0);
      await expect(page.getByText('No encontramos esta página', { exact: true })).toHaveCount(0);
      await expect(page.locator('main h1')).toBeVisible();
      resultado.rutas.push(ruta);
      if (modulo === 'asignaciones') {
        await expect(page.getByRole('heading', { name: 'Asignar tutores', exact: true })).toBeVisible();
        // El registro incompleto que produjo la captura debe ser consultable sin inventar su historial.
        const incompleta = datos.estado.asignaciones.find(a => !Array.isArray(a.historial));
        if (incompleta) {
          const estudiante = datos.estado.estudiantes.find(e => e.id === incompleta.estudianteId);
          if (estudiante) {
            await page.getByRole('searchbox', { name: 'Buscar por estudiante, código o tutor…', exact: true }).fill(estudiante.codigo);
            await page.getByRole('button', { name: `Ver detalle de la asignación ${incompleta.id}`, exact: true }).click();
            await expect(page.getByText('No hay cambios registrados.', { exact: true })).toBeVisible();
            await expect(page.getByRole('dialog').getByText('Sin registro', { exact: true })).toHaveCount(2);
            await page.keyboard.press('Escape');
            const descarga = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
            assert.match((await descarga).suggestedFilename(), /\.csv$/);
            resultado.detalleSinHistorial = true;
            resultado.exportacion = true;
          }
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.mutaciones, []);
  resultado.aprobado = true;
} finally {
  await browser.close();
  await fs.writeFile(new URL('asignaciones-verificacion.json', import.meta.url), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify({ rutas: resultado.rutas.length, errores: resultado.errores, mutaciones: resultado.mutaciones, aprobado: resultado.aprobado ?? false }));
}
