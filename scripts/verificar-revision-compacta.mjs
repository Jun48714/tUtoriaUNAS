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
const out = path.join(repo, "artifacts/celebraciones-v3");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
const page = await context.newPage();
const mutations = [];
try {
  await page.route("**/api/formularios/**", (route) => {
    if (route.request().method() !== "GET") {
      mutations.push(route.request().method());
      return route.abort();
    }
    return route.continue();
  });
  const response = await fetch("http://127.0.0.1:5082/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "2023010457",
      password: "tutoria2026",
      role: "estudiante",
      incluirEstado: true,
    }),
  });
  const { estado } = await response.json();
  const candidate = estado.registros.find(
    (d) =>
      d.formato === "F10" &&
      d.estado === "no-iniciado" &&
      d.sesionId?.startsWith("SES-PRACTICA-CIERRES-V3-"),
  );
  if (!candidate)
    throw new Error(
      "No hay una práctica individual pendiente para previsualizar.",
    );
  await page.goto("http://127.0.0.1:5173/login");
  await page.locator("#identifier").fill("2023010457");
  await page.locator("#password").fill("tutoria2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL("**/estudiante/dashboard");
  await page.goto(
    `http://127.0.0.1:5173/estudiante/instrumentos/${encodeURIComponent(candidate.id)}`,
  );
  const select = page.getByLabel("Sección del formulario");
  await expect(select).toBeVisible();
  const values = await select
    .locator("option")
    .evaluateAll((options) => options.map((o) => o.value));
  for (const value of values.slice(0, -1)) {
    await select.selectOption(value);
    for (const field of await page
      .locator(".tutoring-fields > .tutoring-field")
      .all()) {
      const radios = field.getByRole("radio");
      if (await radios.count()) await radios.last().check();
    }
  }
  await select.selectOption(values.at(-1));
  await expect(page.locator(".form-review-list")).toBeVisible();
  const widths = [];
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    widths.push(width);
    if (width === 375 || width === 1440)
      await page.screenshot({
        path: path.join(out, `revision-${width}.png`),
        fullPage: true,
      });
  }
  const audit = await new AxeBuilder({ page })
    .include(".tutoring-form")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  const summary = page.locator(".form-review-list summary").nth(1);
  await summary.focus();
  await page.keyboard.press("Enter");
  const open = page.locator(".form-review-list details[open]");
  await expect(open).toHaveCount(1);
  expect(await open.locator(".tutoring-answer").count()).toBeGreaterThan(0);
  await open.getByRole("button", { name: "Editar esta sección" }).click();
  await expect(page.locator(".form-review-list")).toHaveCount(0);
  await expect(
    page
      .getByRole("radio", { name: "Totalmente en desacuerdo", exact: true })
      .first(),
  ).toBeChecked();
  expect(mutations).toEqual([]);
  await fs.writeFile(
    path.join(out, "revision-compacta.json"),
    JSON.stringify(
      {
        formato: "F10",
        widths,
        accesibilidad: "PASS",
        cambiosServidor: mutations,
      },
      null,
      2,
    ),
  );
  console.log(
    "Revisión compacta: 6 anchos y Axe PASS; ninguna respuesta guardada ni enviada.",
  );
} finally {
  await browser.close();
}
