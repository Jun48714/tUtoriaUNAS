import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const out = path.join(repo, "artifacts/tutor-registros");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
const page = await context.newPage();
const errores = [];
const mutaciones = [];
page.on("pageerror", (error) => errores.push(error.message));
await page.route("**/api/**", (route) => {
  const request = route.request();
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    !request.url().endsWith("/auth/login")
  ) {
    mutaciones.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.abort();
  }
  return route.continue();
});
try {
  await page.goto("http://127.0.0.1:5173/login");
  await page.locator("#identifier").fill("DOC-0421");
  await page.locator("#password").fill("tutoria2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL("**/tutor/dashboard");
  await page.goto("http://127.0.0.1:5173/tutor/instrumentos?ambito=propios");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".teacher-task")).toHaveCount(6);
  await expect(page.locator(".teacher-register__row")).toHaveCount(0);
  await page.screenshot({
    path: path.join(out, "sistema-pagina-1440.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Registros/ }).click();
  const panel = page.getByRole("dialog", {
    name: "Mis registros",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const anchos = [];
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await panel.locator(".sheet__body").evaluate((element) => {
      element.scrollTop = 0;
    });
    const medidas = await panel.evaluate((element) => {
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        ancho: innerWidth,
        panel: rect(element),
        encabezado: rect(element.querySelector(".sheet__head")),
        cuerpo: rect(element.querySelector(".sheet__body")),
        root: rect(document.documentElement),
        clientWidth: document.documentElement.clientWidth,
        gutter: getComputedStyle(element).scrollbarGutter,
        desbordePagina: document.documentElement.scrollWidth - innerWidth,
        desbordePanel: element.scrollWidth - element.clientWidth,
      };
    });
    expect(medidas.desbordePagina).toBeLessThanOrEqual(1);
    expect(medidas.desbordePanel).toBeLessThanOrEqual(1);
    anchos.push(medidas);
    if ([375, 1440].includes(width)) {
      await panel.getByRole("button", { name: "Cerrar ventana" }).focus();
      await page.screenshot({
        path: path.join(out, `sistema-panel-${width}.png`),
      });
      const axe = await new AxeBuilder({ page })
        .include(".teacher-records-sheet")
        .analyze();
      expect(axe.violations).toEqual([]);
    }
  }
  await panel
    .getByRole("searchbox", { name: "Buscar", exact: true })
    .fill("F12");
  await panel
    .locator(".teacher-register__row")
    .first()
    .getByRole("button")
    .click();
  const editor = page.getByRole("dialog", { name: /^Formato 12/ });
  await expect(editor).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("searchbox", { name: "Buscar", exact: true }),
  ).toHaveValue("F12");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Registros/ })).toBeFocused();
  expect(mutaciones).toEqual([]);
  expect(errores).toEqual([]);
  const resultado = {
    resultado: "PASS",
    origen:
      "Sistema local con API y PostgreSQL; sin guardar ni enviar registros",
    anchos,
    errores,
    mutaciones,
  };
  await fs.writeFile(
    path.join(out, "verificacion-sistema.json"),
    JSON.stringify(resultado, null, 2),
  );
  console.log(JSON.stringify(resultado));
} finally {
  await context.close();
  await browser.close();
}
