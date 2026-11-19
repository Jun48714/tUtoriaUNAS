import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill('tutoria2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
}
async function responderBloques(page: Page, resultado?: string) {
  const form = page.locator('.tutoring-form:not(.tutoring-form--read)');
  for (let n = 0; n < 100; n++) {
    if (await form.getByRole('checkbox', { name: /He revisado/ }).count()) return;
    if (resultado && (await form.locator('[data-field="resultado"]').count())) {
      await form
        .locator('[data-field="resultado"]')
        .getByRole('radio', { name: resultado, exact: true })
        .check();
    }
    for (const field of await form.locator('.tutoring-fields > .tutoring-field').all()) {
      const codigo = await field.getAttribute('data-field');
      const radios = field.getByRole('radio');
      if (await radios.count()) {
        const chosen =
          codigo === 'resultado' && resultado
            ? field.getByRole('radio', { name: resultado, exact: true })
            : radios.first();
        await chosen.check();
      }
      const checks = field.getByRole('checkbox');
      if (await checks.count()) await checks.first().check();
      for (const input of await field
        .locator('input:not([type="checkbox"]):not([type="radio"])')
        .all()) {
        if (
          (await input.getAttribute('readonly')) !== null ||
          !(await input.isVisible()) ||
          (await input.inputValue())
        )
          continue;
        const type = await input.getAttribute('type');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await input.fill(
          type === 'number'
            ? '2'
            : type === 'date'
              ? tomorrow.toISOString().slice(0, 10)
              : type === 'time'
                ? codigo === 'horaFinCita'
                  ? '11:00'
                  : '10:00'
                : 'Dato ficticio de prueba',
        );
      }
      for (const select of await field.locator('select').all()) {
        if (await select.inputValue()) continue;
        const option = await select.locator('option').nth(1).getAttribute('value');
        await select.selectOption(option ?? { index: 1 });
      }
    }
    const selector = form.getByLabel('Sección del formulario');
    const anterior = await selector.inputValue();
    await form.getByRole('button', { name: /^(Continuar|Revisar respuestas)$/ }).click();
    await expect(selector)
      .not.toHaveValue(anterior)
      .catch(async () => {
        throw new Error(
          `No avanzó el bloque ${anterior}: ${await form.innerText()}\n${JSON.stringify(await form.locator('input').evaluateAll((es) => es.map((e) => ({ name: e.getAttribute('name'), value: (e as HTMLInputElement).value }))))}`,
        );
      });
    await expect(form.locator('.tutoring-errors')).toHaveCount(0);
  }
  throw new Error('El formulario no llegó a la revisión');
}
async function enviar(page: Page, formato: string) {
  await page.getByRole('checkbox', { name: /He revisado/ }).check();
  await page.getByRole('button', { name: 'Enviar formulario', exact: true }).click();
  await expect(page.locator('.form-completion')).toHaveAttribute('data-format', formato);
  await expect(page.getByRole('button', { name: /Volver al listado/ })).toBeEnabled();
  const audit = await new AxeBuilder({ page })
    .include('.form-completion')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
}

test('selecciones y borradores conservan scroll, preguntas y altura en seis anchos', async ({
  page,
}) => {
  await login(page, '2023010456');
  await page.goto('/estudiante/instrumentos');
  await page.getByRole('link', { name: /Entrevista inicial/ }).click();
  const selector = page.getByLabel('Sección del formulario');
  const bloque = await selector
    .locator('option[data-question-code="eleccionCarrera"]')
    .getAttribute('value');
  await selector.selectOption(bloque!);
  const form = page.locator('.tutoring-form');
  const campo = form.locator('[data-field="eleccionCarrera"]');
  const primera = campo.getByRole('checkbox').first();
  const segunda = campo.getByRole('checkbox').nth(1);
  const geometria = () =>
    page.evaluate(() => {
      const f = document.querySelector('.tutoring-form')!.getBoundingClientRect();
      const c = document.querySelector('[data-field="eleccionCarrera"]')!.getBoundingClientRect();
      return {
        scroll: scrollY,
        height: f.height,
        top: c.top,
        document: document.documentElement.scrollHeight,
      };
    });
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 720 });
    await page.waitForTimeout(220);
    await page.keyboard.press('Escape');
    await primera.uncheck();
    await segunda.uncheck();
    await campo.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const antes = await geometria();
    await primera.check();
    await segunda.check();
    await expect(campo.getByText('Respondida')).toBeVisible();
    expect(await geometria()).toEqual(antes);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  const guardar = form.getByRole('button', { name: 'Guardar borrador', exact: true });
  await guardar.scrollIntoViewIfNeeded();
  const antes = await geometria();
  await guardar.click();
  await expect(form.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
  expect(await geometria()).toEqual(antes);
  await expect(primera).toBeChecked();
  await expect(segunda).toBeChecked();
  await expect(selector).toHaveValue(bloque!);
  await expect(page.getByText('Ver preguntas originales')).toHaveCount(0);
});

test('entrevista: bloques breves, respuesta, borrador, entrega en la misma página y consulta histórica', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await login(page, '2023010456');
  await page.goto('/estudiante/instrumentos');
  await page.getByRole('link', { name: /Entrevista inicial/ }).click();
  await expect(page.locator('.sf-llenado')).toBeVisible();
  const url = page.url();
  await expect(page.locator('.form-completion')).toHaveCount(0);
  const selector = page.getByLabel('Sección del formulario');
  const primero = await selector.inputValue();
  const opciones = selector.locator('option');
  const motivacion = await opciones
    .filter({ hasText: 'Motivación y carrera' })
    .first()
    .getAttribute('value');
  await selector.selectOption(motivacion!);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: '../artifacts/formatos-animados/llenado-estudiante-escritorio.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Módulos del portal' })).not.toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: '../artifacts/formatos-animados/llenado-estudiante-movil.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 950 });
  await selector.selectOption(primero);
  await responderBloques(page);
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Borrador guardado/ })).toBeVisible();
  await enviar(page, 'F03');
  expect(page.url()).toBe(url);
  await page.getByRole('button', { name: 'Ver formulario', exact: true }).click();
  await expect(page.locator('.tutoring-form--read')).toBeVisible();
  await page.reload();
  await expect(page.locator('.tutoring-form--read')).toBeVisible();
  await expect(page.locator('.form-completion')).toHaveCount(0);
});

test('autoevaluación: diez decisiones explícitas en dos bloques y cierre propio', async ({
  page,
}) => {
  await login(page, 'DOC-0421');
  await page.goto('/tutor/instrumentos');
  await page.getByLabel('Momento del semestre').selectOption('cierre');
  await page.getByRole('button', { name: 'Completar formato 09', exact: true }).click();
  await responderBloques(page);
  await enviar(page, 'F09');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /Volver al listado/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const [resultado, expected] of [
  ['Resuelto', 'se resolvió'],
  ['Seguimiento', 'nueva cita'],
  ['Derivar', 'borrador del formato 12'],
] as const) {
  test(`atención personalizada: ${resultado} conserva su resultado y muestra la ruta correcta`, async ({
    page,
  }) => {
    await login(page, 'DOC-0421');
    await page.goto('/tutor/instrumentos');
    await page.getByRole('button', { name: 'Completar formato 08', exact: true }).click();
    const student = page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Estudiante', exact: true });
    await student.fill('2023010456');
    await student.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click();
    await responderBloques(page, resultado);
    await enviar(page, 'F08');
    await expect(page.locator('.fc-detail')).toContainText(expected);
    await page.getByRole('button', { name: /Volver al listado/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
