import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [];
const writes = [];
const captures = process.env.TUTORIA_CAPTURAS;
if (captures) await mkdir(captures, { recursive: true });
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/formularios/**", (route) => {
  if (route.request().method() !== "GET") {
    writes.push(route.request().method());
    return route.abort();
  }
  return route.continue();
});

try {
  await page.goto("http://127.0.0.1:5173/login");
  await page.locator("#identifier").fill("coordinacion.tutoria");
  await page.locator("#password").fill("tutoria2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL("**/coordinacion/dashboard");
  await page.goto("http://127.0.0.1:5173/coordinacion/revisiones");
  await page.locator("tbody tr").first().waitFor();
  for (const formato of ["F01", "F02"]) {
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.locator("tbody tr").filter({ hasText: formato }).first();
      await row.getByRole("button", { name: /^Revisar / }).click();
      const dialog = page.getByRole("dialog");
      const picker = dialog.getByLabel("Seleccionar pregunta");
      await expect(picker).toBeVisible();
      const before = await dialog.boundingBox();
      const values = await picker
        .locator("option")
        .evaluateAll((items) => items.map((item) => item.value));
      assert(values.length > 0);
      for (const value of values) {
        await picker.selectOption(value);
        await expect(
          dialog.locator(".informe-respuestas__pregunta"),
        ).toHaveCount(1);
        await expect(dialog.locator(".ri-tabla")).toHaveCount(0);
        const firstField = dialog
          .locator(".informe-registro__campos dt")
          .first();
        if (await firstField.isVisible()) {
          const fieldBox = await firstField.boundingBox();
          const bodyBox = await dialog.locator(".sheet__body").boundingBox();
          assert(
            fieldBox.y < bodyBox.y + bodyBox.height,
            `${formato} ${width}: primer campo visible`,
          );
        }
        const nextRecord = dialog.getByRole("button", {
          name: "Registro siguiente",
        });
        if (
          captures &&
          [375, 1440].includes(width) &&
          (await dialog.locator(".informe-registro").isVisible())
        ) {
          await dialog.screenshot({
            path: join(captures, `${formato}-respuestas-${width}.png`),
          });
        }
        if ((await nextRecord.isVisible()) && (await nextRecord.isEnabled())) {
          const previous = await dialog
            .locator(".informe-registro__cabecera strong")
            .textContent();
          await nextRecord.click();
          assert.notEqual(
            await dialog
              .locator(".informe-registro__cabecera strong")
              .textContent(),
            previous,
          );
          await dialog
            .getByRole("button", { name: "Registro anterior" })
            .click();
        }
      }
      const after = await dialog.boundingBox();
      for (const property of ["x", "y", "width", "height"]) {
        assert(
          Math.abs(before[property] - after[property]) <= 1,
          `${formato} ${width}: ${property}`,
        );
      }
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
        false,
      );
      await dialog.getByRole("tab", { name: "Resumen" }).click();
      await expect(
        dialog.getByRole("region", { name: "Datos actuales del periodo" }),
      ).toBeVisible();
      const summary = dialog.getByRole("region", {
        name: "Datos actuales del periodo",
      });
      await expect(
        summary.locator(".informe-fuentes__cifras > div"),
      ).toHaveCount(3);
      const detailBox = await summary.getByText("Ver detalle").boundingBox();
      const summaryBody = await dialog.locator(".sheet__body").boundingBox();
      if (captures && [320, 375, 1440].includes(width)) {
        await dialog.screenshot({
          path: join(captures, `${formato}-${width}.png`),
        });
      }
      assert(
        detailBox.y + detailBox.height <= summaryBody.y + summaryBody.height,
        `${formato} ${width}: resumen completo sin desplazar (${Math.round(detailBox.y + detailBox.height - summaryBody.y - summaryBody.height)} px)`,
      );
      await summary.getByText("Ver detalle").click();
      await expect(summary.getByText("Formatos enviados")).toBeVisible();
      await summary.getByText("Ver detalle").click();
      await summary.getByRole("button", { name: "Actualizar" }).click();
      await dialog.getByRole("tab", { name: "Revisión" }).click();
      await expect(
        dialog.getByLabel("Comentario de la revisión"),
      ).toBeVisible();
      if (captures && [375, 1440].includes(width)) {
        await dialog.screenshot({
          path: join(captures, `${formato}-revision-${width}.png`),
        });
      }
      await expect(
        dialog.getByRole("button", { name: "Vista previa" }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    "F01 y F02: seis anchos, preguntas y registros accesibles, modal estable; sin escrituras.",
  );
} finally {
  await browser.close();
}
