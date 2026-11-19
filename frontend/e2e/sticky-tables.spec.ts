import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Regresión visual de encabezados sticky y barras fijas:
 * los encabezados deben ser opacos y anclar sin quedar detrás de la barra
 * superior, y la paginación no debe pegarse al borde del viewport.
 */

async function login(page: Page, id: string, rol: string) {
  await page.goto('/login');
  await page.locator('#identifier').fill(id);
  await page.locator('#password').fill('tutoria2026');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(`/${rol}/dashboard`);
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(2);
}

function colorEsOpaco(color: string): boolean {
  const m = color.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
  if (!m) return false;
  return (m[4] === undefined ? 1 : Number(m[4])) > 0.99;
}

test('los encabezados de Mis archivos no dejan ver las filas al hacer scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await login(page, '2023010456', 'estudiante');
  await page.goto('/estudiante/documentos');
  const panel = page.locator('.data-table-panel__scroll');
  await expect(panel).toBeVisible();
  // El estado inicial ya debe ser opaco: el bug reportado era el fondo
  // transparente del encabezado mientras las filas pasan por debajo.
  const colorInicial = await panel
    .locator('thead th')
    .first()
    .evaluate((th) => getComputedStyle(th).backgroundColor);
  expect(colorEsOpaco(colorInicial)).toBe(true);
  await panel.evaluate((marco) => {
    marco.scrollTop = marco.scrollHeight;
  });
  const colorFinal = await panel
    .locator('thead th')
    .first()
    .evaluate((th) => getComputedStyle(th).backgroundColor);
  expect(colorEsOpaco(colorFinal)).toBe(true);
  await noPageOverflow(page);
});

test('la paginación de las tablas del portal no se pega detrás de la barra superior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await login(page, 'coordinacion.tutoria', 'coordinacion');
  await page.goto('/coordinacion/tutorados');
  const paginacion = page.locator('.table-pagination').first();
  await expect(paginacion).toBeVisible();
  const posicion = await paginacion.evaluate((nav) => getComputedStyle(nav).position);
  expect(posicion).not.toBe('sticky');
  expect(posicion).not.toBe('fixed');
});

test('los encabezados de la lista de asistencia anclan al tope del panel', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await login(page, 'DOC-0421', 'tutor');
  await page.goto('/tutor/asistencias');
  // La tabla de asistentes vive dentro del detalle de una sesión: abrirla.
  await page.locator('.attendance-register .data-table tbody button').first().click();
  const th = page.locator('.attendance-students thead th').first();
  await expect(th).toBeVisible();
  const estilos = await th.evaluate((celda) => {
    const s = getComputedStyle(celda);
    return { posicion: s.position, top: Number.parseFloat(s.top), fondo: s.backgroundColor };
  });
  expect(estilos.posicion).toBe('sticky');
  expect(estilos.top).toBe(0);
  expect(colorEsOpaco(estilos.fondo)).toBe(true);
});

for (const width of [320, 390]) {
  test(`Mis archivos y Mis documentos sin desborde horizontal a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, '2023010456', 'estudiante');
    await page.goto('/estudiante/documentos');
    await expect(page.getByRole('heading', { name: 'Mis documentos' })).toBeVisible();
    await noPageOverflow(page);
  });
}
