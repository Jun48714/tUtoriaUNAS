import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#identifier').fill('DOC-0421');
  await page.locator('#password').fill('tutoria2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL('**/tutor/dashboard');
  await page.goto('/tutor/instrumentos?ambito=propios');
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`registros fuera de la página y panel accesible a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await login(page);
    const trigger = page.getByRole('button', { name: /^Registros/ });
    await expect(page.locator('.teacher-task')).toHaveCount(6);
    await expect(page.locator('.teacher-register__row')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    if ([375, 1440].includes(width)) {
      await page.screenshot({
        path: `../artifacts/tutor-registros/pagina-${width}.png`,
        fullPage: true,
      });
    }
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Mis registros', exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const bounds = await panel.boundingBox();
    const pageBounds = await page.locator('html').boundingBox();
    expect(bounds).not.toBeNull();
    expect(
      Math.abs(bounds!.x + bounds!.width - pageBounds!.x - pageBounds!.width),
    ).toBeLessThanOrEqual(1);
    expect(bounds!.x).toBeGreaterThanOrEqual(pageBounds!.x);
    expect(bounds!.height).toBe(950);
    expect(bounds!.width).toBeLessThanOrEqual(680);
    const filters = panel.getByRole('group', { name: 'Filtrar mis registros' });
    const before = await filters.boundingBox();
    for (const label of ['Por corregir', 'Enviados', 'Revisados', 'Todos']) {
      const button = filters.getByRole('button', { name: new RegExp(`^${label}`) });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const after = await filters.boundingBox();
      expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    }
    const scrollBefore = await page.evaluate(() => scrollY);
    const headingBefore = await panel.locator('.sheet__head').boundingBox();
    await panel.locator('.sheet__body').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    expect(await panel.locator('.sheet__head').boundingBox()).toEqual(headingBefore);
    await panel.locator('.sheet__body').evaluate((element) => {
      element.scrollTop = 0;
    });
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    if ([375, 1440].includes(width)) {
      await panel.getByRole('button', { name: 'Cerrar ventana' }).focus();
      await panel.locator('.sheet__body').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: `../artifacts/tutor-registros/panel-${width}.png` });
      const axe = await new AxeBuilder({ page }).include('.teacher-records-sheet').analyze();
      expect(axe.violations).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('.teacher-register__row')).toHaveCount(0);
  });
}

test('abre el registro sin apilar ventanas y vuelve al panel conservando la búsqueda', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await login(page);
  const trigger = page.getByRole('button', { name: /^Registros/ });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Mis registros', exact: true });
  await panel.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('F12');
  const row = panel.locator('.teacher-register__row').first();
  await expect(row).toHaveAttribute('data-instrument', 'F12');
  await row.getByRole('button').click();
  const editor = page.getByRole('dialog', { name: /^Formato 12/ });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('searchbox', { name: 'Buscar', exact: true })).toHaveValue('F12');
  await panel.getByRole('button', { name: 'Cerrar ventana' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(panel.getByRole('searchbox', { name: 'Buscar', exact: true })).toHaveValue('F12');
});

test('el enlace a pendientes abre el panel y la bandeja de estudiantes conserva su lista', async ({
  page,
}) => {
  await login(page);
  await page.goto('/tutor/instrumentos?estado=pendiente');
  const panel = page.getByRole('dialog', { name: 'Mis registros', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Pendientes/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('button', { name: /^Por corregir/ }).click();
  await expect(page).toHaveURL(/estado=observado/);
  await expect(panel.getByRole('button', { name: /^Por corregir/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/estado=pendiente/);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Pendientes/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('group', { name: 'Bandejas de tutoría' })
    .getByRole('button', { name: /^Respuestas de estudiantes/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Seguimiento' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Filtrar respuestas de estudiantes' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Registros/ })).toHaveCount(0);
});
