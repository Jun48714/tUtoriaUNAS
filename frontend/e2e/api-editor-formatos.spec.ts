import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Publicar en este recorrido está permitido únicamente en el entorno aislado 5174/5084.
test.beforeEach(({ baseURL }) => {
  test.skip(
    process.env.TUTORIA_EDITOR_E2E !== '1',
    'Requiere API con esquema PostgreSQL exclusivo de pruebas.',
  );
  expect(baseURL).toBe('http://127.0.0.1:5174');
});
const api = 'http://127.0.0.1:5084';
async function ingresar(page: Page, identifier = 'coordinacion.tutoria', rol = 'coordinacion') {
  await page.goto('/login');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('tutoria2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(`**/${rol}/dashboard`);
}

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`editor accesible sin desbordamiento a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await ingresar(page);
    await page.goto('/coordinacion/instrumentos');
    await page.getByRole('button', { name: 'Editar formato 03', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: 'Editar formato 03', exact: true });
    await expect(dialogo.getByLabel('Ir a pregunta')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    expect(await dialogo.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    const infracciones = await new AxeBuilder({ page }).include('.fe-sheet').analyze();
    expect(infracciones.violations).toEqual([]);
    if ([375, 1440].includes(width))
      await page.screenshot({ path: `../artifacts/editor-formatos/editor-${width}.png` });
    await dialogo.getByRole('tab', { name: 'Preguntas', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialogo.getByRole('tab', { name: 'Vista previa' })).toBeFocused();
    await expect(dialogo.getByRole('tabpanel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).not.toBeVisible();
  });
}

test('publica desde el editor y actualiza otro navegador sin alterar los envíos anteriores', async ({
  browser,
  page,
  request,
}) => {
  await ingresar(page);
  const titulo = `Entrevista de prueba ${Date.now()}`;
  const pregunta = `¿Qué acompañamiento prefieres ${Date.now()}?`;
  const autenticacion = await request.post(`${api}/api/auth/login`, {
    data: { identifier: 'coordinacion.tutoria', password: 'tutoria2026' },
  });
  const credencial = await autenticacion.json();
  const antes = await request.get(`${api}/api/formatos/F03/editor`, {
    headers: { Authorization: `Bearer ${credencial.accessToken}` },
  });
  const revisionEsperada = (await antes.json()).versionPublicada + 1;
  const otroContexto = await browser.newContext();
  const estudiante = await otroContexto.newPage();
  try {
    await ingresar(estudiante, '2023010456', 'estudiante');
    await estudiante.goto('/estudiante/instrumentos');
    await page.goto('/coordinacion/instrumentos');
    await page.getByRole('button', { name: 'Editar formato 03', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Editar formato 03', exact: true });
    await editor.getByRole('tab', { name: 'Formulario', exact: true }).click();
    await editor.getByLabel('Título del formulario').fill(titulo);
    await editor.getByRole('tab', { name: 'Preguntas', exact: true }).click();
    await editor.getByLabel('Ir a pregunta').selectOption('colegio');
    await editor
      .locator('[data-question="colegio"]')
      .getByRole('button', { name: /^Editar pregunta/ })
      .click();
    await editor.getByLabel('Texto de la pregunta').fill('Colegio de procedencia actualizado');
    await editor.getByRole('button', { name: 'Añadir pregunta', exact: true }).first().click();
    await editor.getByLabel('Texto de la pregunta').fill(pregunta);
    await editor.getByLabel('Tipo de respuesta', { exact: true }).selectOption('escala');
    await editor.getByLabel('Opción 1', { exact: true }).fill('Individual');
    await editor.getByLabel('Opción 2', { exact: true }).fill('En grupo');
    await editor.getByRole('checkbox', { name: 'Obligatoria', exact: true }).check();
    await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await expect(
      editor.getByText('Borrador guardado. Los portales conservan la versión publicada.'),
    ).toBeVisible();
    await expect(estudiante.getByText(titulo, { exact: true })).toHaveCount(0);
    await editor.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
    await editor.getByRole('button', { name: 'Sí, publicar', exact: true }).click();
    await expect(
      editor.getByText(`Versión ${revisionEsperada} publicada para todos los portales.`),
    ).toBeVisible();
    await expect(estudiante.getByText(titulo, { exact: true })).toBeVisible({ timeout: 20_000 });
    await estudiante.locator('.sf-entrevista').click();
    await expect(estudiante.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
    const grupo = estudiante.getByRole('radiogroup', { name: pregunta, exact: false });
    const secciones = estudiante.getByRole('combobox', { name: 'Sección del formulario' });
    const valores = await secciones
      .locator('option')
      .evaluateAll((elementos) => elementos.map((e) => (e as HTMLOptionElement).value));
    for (const valor of valores) {
      if (await grupo.count()) break;
      await secciones.selectOption(valor);
    }
    await expect(grupo).toBeVisible();
    await grupo.getByRole('radio', { name: 'Individual', exact: true }).check();
    await estudiante.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await expect(estudiante.getByText('Borrador guardado', { exact: true })).toBeVisible();
    for (const identifier of ['DOC-0421', 'coordinacion.tutoria', '2023010456']) {
      const login = await request.post(`${api}/api/auth/login`, {
        data: { identifier, password: 'tutoria2026' },
      });
      expect(login.ok()).toBeTruthy();
      const sesion = await login.json();
      const estado = await request.get(`${api}/api/tutoria/estado`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const datos = await estado.json();
      expect(
        datos.sistema.catalogos.formatos.find((f: { codigo: string }) => f.codigo === 'F03')
          .revision,
      ).toBe(revisionEsperada);
    }
    await editor.getByRole('tab', { name: 'Historial', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Recuperar versión 1', exact: true }),
    ).toBeVisible();
  } finally {
    await otroContexto.close();
  }
});
