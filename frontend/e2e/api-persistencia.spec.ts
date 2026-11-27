import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
const endpoint = process.env.TUTORIA_E2E_ORIGIN || 'http://127.0.0.1:5080';
async function ingresar(page: Page, rol: 'Tutor' | 'Estudiante' | 'Coordinación') {
  await page.goto('/login');

  await page
    .locator('#identifier')
    .fill(
      rol === 'Tutor' ? 'DOC-0421' : rol === 'Coordinación' ? 'coordinacion.tutoria' : '2023010456',
    );
  await page.locator('#password').fill('tutoria2026');
  const acceso = page.waitForResponse(
    (r) => r.url() === `${endpoint}/api/auth/login` && r.request().method() === 'POST' && r.ok(),
  );
  await page.locator('button[type="submit"]').click();
  await acceso;
  await expect(page).toHaveURL(/dashboard/);
}
async function headers(page: Page) {
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('unas:api-session:v1')!).accessToken as string,
  );
  return { Authorization: `Bearer ${token}` };
}
/** El enlace por sesión redirige a la página propia del formulario. */
async function abrirEvaluacion(page: Page) {
  await page.goto('/estudiante/instrumentos?sesion=SES-PRUEBA-individual');
  await expect(page).toHaveURL(/\/estudiante\/instrumentos\/INST-F10-/);
  const hoja = page.locator('.sf-llenado');
  await expect(hoja).toBeVisible();
  return hoja;
}

async function responderEvaluacion(hoja: Locator) {
  const secciones = hoja.getByLabel('Sección del formulario');
  const preguntas = await secciones
    .locator('option[data-question-code^="p"], option[data-question-code="tieneSugerencia"]')
    .evaluateAll((opciones) => opciones.map((opcion) => (opcion as HTMLOptionElement).value));
  expect(preguntas).toHaveLength(15);
  for (const pregunta of preguntas) {
    await secciones.selectOption(pregunta);
    for (const grupo of await hoja.getByRole('radiogroup').all()) {
      await grupo.getByRole('radio').nth(1).check();
    }
  }
  await secciones.selectOption({ label: 'Revisión' });
}
test('la asistencia habilita la evaluación, que se conserva al enviarla desde el portal', async ({
  browser,
}) => {
  const contextoTutor = await browser.newContext();
  const contextoEstudiante = await browser.newContext();
  const tutor = await contextoTutor.newPage();
  const estudiante = await contextoEstudiante.newPage();
  await ingresar(tutor, 'Tutor');
  await ingresar(estudiante, 'Estudiante');
  const response = await tutor.request.get(`${endpoint}/api/tutoria/estado`, {
    headers: await headers(tutor),
  });
  const state = await response.json();
  const session = state.sesiones.find((s: { id: string }) => s.id === 'SES-PRUEBA-individual');
  if (!session.asistenciaConfirmada) {
    const blocked = await abrirEvaluacion(estudiante);
    await expect(blocked.locator('input, textarea')).toHaveCount(0);
    await expect(blocked).toContainText('asistencia');
  }
  await tutor.goto('/tutor/asistencias?sesion=SES-PRUEBA-individual');
  const attendance = tutor.getByRole('dialog');
  await expect(attendance).toBeVisible();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await tutor.setViewportSize({ width, height: 1000 });
    expect(await attendance.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    expect(
      await tutor.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  }
  for (const radio of await attendance.getByRole('radio', { name: /^Asistió:/ }).all())
    await radio.check();
  const savedAttendance = tutor.waitForResponse(
    (r) => r.url().endsWith('/SES-PRUEBA-individual/asistencia') && r.request().method() === 'PUT',
  );
  await attendance
    .getByRole('button', { name: /Guardar registro|Finalizar sesión y guardar asistencia/ })
    .click();
  expect((await savedAttendance).status()).toBe(200);
  await expect(attendance.getByRole('heading', { name: 'Registro confirmado' })).toBeVisible();
  await attendance.getByRole('button', { name: 'Cerrar ventana' }).click();
  await expect(attendance).toHaveCount(0);
  const modal = await abrirEvaluacion(estudiante);
  await responderEvaluacion(modal);
  const auth = await headers(estudiante);
  const id = new URL(estudiante.url()).pathname.split('/').at(-1);
  const path = `${endpoint}/api/formularios/${id}`;
  const record = await (await estudiante.request.get(path, { headers: auth })).json();
  const updated = await estudiante.request.put(path, {
    headers: auth,
    data: { version: record.version, respuestas: record.respuestas, enviar: false },
  });
  expect(updated.status()).toBe(200);

  const submit = modal.getByRole('button', { name: 'Enviar formulario' });
  const conflict = estudiante.waitForResponse(
    (r) => r.url() === path && r.request().method() === 'PUT',
  );
  await submit.click();
  expect((await conflict).status()).toBe(409);
  await expect(modal).toContainText('El registro cambió en otro cliente');

  const simularDesconexion = (route: Route) => route.abort();
  await estudiante.route(path, simularDesconexion);
  await submit.click();
  await expect(modal).toContainText('No hay conexión con el servidor');
  const secciones = modal.getByLabel('Sección del formulario');
  const pregunta = secciones.locator('option[data-question-code="p01"]');
  await secciones.selectOption({ label: await pregunta.innerText() });
  await expect(modal.getByRole('radiogroup').first().getByRole('radio').nth(1)).toBeChecked();
  await estudiante.unroute(path, simularDesconexion);

  const reloaded = await abrirEvaluacion(estudiante);
  await responderEvaluacion(reloaded);
  const saved = estudiante.waitForResponse(
    (r) => r.url() === path && r.request().method() === 'PUT',
  );
  await reloaded.getByRole('button', { name: 'Enviar formulario' }).click();
  const resultado = await saved;
  expect(resultado.status()).toBe(200);
  const enviado = await resultado.json();
  expect(enviado.estado).toBe('enviado');
  const localKeys = await estudiante.evaluate(() => Object.keys(localStorage));
  expect(
    localKeys.filter((key) =>
      /expediente|instrument-workspace|asistencia|sesiones-programadas/.test(key),
    ),
  ).toEqual([]);
  const segundoContexto = await browser.newContext();
  const segundo = await segundoContexto.newPage();
  await ingresar(segundo, 'Estudiante');
  const restored = await abrirEvaluacion(segundo);
  await expect(restored.getByRole('navigation', { name: 'Consultar respuestas' })).toBeVisible();
  const recuperado = await segundo.request.get(path, { headers: await headers(segundo) });
  expect(recuperado.ok()).toBe(true);
  expect(await recuperado.json()).toMatchObject({
    estado: 'enviado',
    respuestas: enviado.respuestas,
  });
  await contextoTutor.close();
  await contextoEstudiante.close();
  await segundoContexto.close();
});
test('coordinación prepara el formato 01 y consulta la operación persistida en auditoría', async ({
  page,
}) => {
  await ingresar(page, 'Coordinación');
  await page.goto('/coordinacion/plan');
  await expect(
    page.getByRole('heading', { name: 'Plan e informe de tutoría', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Escuela de administración').selectOption('E-IIS');
  const prepare = page.getByRole('button', { name: 'Preparar formato 01', exact: true });
  const creado = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/formularios' && r.request().method() === 'POST',
  );
  await prepare.click();
  expect((await creado).ok()).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Informe del semestre' })).toBeVisible();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  }
  const audit = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/tutoria/auditoria' && r.ok(),
  );
  await page.goto('/coordinacion/auditoria');
  await audit;
  await expect(page.getByRole('table')).toContainText('crear-formulario');
  await expect(page.getByRole('table')).toContainText('INST-F01-');
});
