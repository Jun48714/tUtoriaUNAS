import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const output = new URL("../artifacts/formatos-por-pregunta/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const errors = [];
const writes = [];

async function frame(dialog) {
  return dialog.evaluate((element) => {
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      modal: rect(element),
      head: rect(element.querySelector(".sheet__head")),
      tabs: rect(element.querySelector(".tabs")),
      foot: rect(element.querySelector(".sheet__foot")),
    };
  });
}

async function sameFrame(dialog, before, label) {
  const after = await frame(dialog);
  for (const part of Object.keys(before)) {
    for (const property of ["x", "y", "width", "height"]) {
      assert(
        Math.abs(before[part][property] - after[part][property]) <= 1,
        `${label}: ${part}.${property} se movió de ${before[part][property]} a ${after[part][property]}`,
      );
    }
  }
}

async function navigationVisible(dialog) {
  const geometry = await dialog.evaluate((element) => {
    const navigation = element
      .querySelector(".fe-question-navigation")
      .getBoundingClientRect();
    const head = element.querySelector(".sheet__head").getBoundingClientRect();
    const foot = element.querySelector(".sheet__foot").getBoundingClientRect();
    return {
      above: head.bottom - navigation.top,
      below: navigation.bottom - foot.top,
      foot: foot.bottom - innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
      vertical:
        element.querySelector(".fe-content").scrollHeight -
        element.querySelector(".fe-content").clientHeight,
    };
  });
  for (const key of ["above", "below", "foot", "overflow"])
    assert(geometry[key] <= 1, `${key}: ${JSON.stringify(geometry)}`);
  return geometry.vertical;
}

async function internalScroll(dialog, label) {
  await dialog.getByRole("tab", { name: "Formulario", exact: true }).click();
  await dialog.getByText("Ajustes del formulario", { exact: true }).click();
  const before = await frame(dialog);
  const area = dialog.locator(".fe-content");
  await expect
    .poll(() =>
      area.evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeGreaterThan(0);
  await area.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  assert(
    (await area.evaluate((element) => element.scrollTop)) > 0,
    `${label}: scroll interior disponible`,
  );
  assert.equal(
    await dialog
      .locator(".sheet__body")
      .evaluate((element) => element.scrollTop),
    0,
  );
  await sameFrame(
    dialog,
    before,
    `${label}: marco y pestañas fijos al hacer scroll`,
  );
  await dialog.getByRole("tab", { name: "Preguntas", exact: true }).click();
  assert.equal(
    await area.evaluate((element) => element.scrollTop),
    0,
    `${label}: volver al inicio`,
  );
}

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/formatos/**", async (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${base}/login`);
  await page.locator("#identifier").fill("coordinacion.tutoria");
  await page.locator("#password").fill("tutoria2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL("**/coordinacion/dashboard");
  await page.goto(`${base}/coordinacion/instrumentos`);
  for (let number = 1; number <= 12; number++) {
    const code = String(number).padStart(2, "0");
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith(`/F${code}/editor`) &&
        res.status() === 200,
    );
    await page
      .getByRole("button", { name: `Editar formato ${code}`, exact: true })
      .click();
    const state = await (await response).json();
    const definition = state.borrador ?? state.publicada;
    const fields = definition.secciones.flatMap((s) => s.campos);
    const dialog = page.getByRole("dialog", {
      name: `Editar formato ${code}`,
      exact: true,
    });
    const picker = dialog.getByLabel("Ir a pregunta", { exact: true });
    await expect(picker).toBeVisible();
    const values = await picker
      .locator("option")
      .evaluateAll((elements) => elements.map((el) => el.value));
    assert.deepEqual(
      values.filter((value) => !value.startsWith("seccion:")),
      fields.map((f) => f.codigo),
    );
    const initialFrame = await frame(dialog);
    assert(
      initialFrame.modal.width <= 901 && initialFrame.modal.height <= 561,
      "Marco reducido a 900 × 560 px",
    );
    for (const value of values) {
      await picker.selectOption(value);
      await sameFrame(dialog, initialFrame, `F${code} pregunta ${value}`);
      if (!value.startsWith("seccion:")) {
        await expect(dialog.locator(".fe-item")).toHaveCount(1);
        await expect(dialog.locator(".fe-item")).toHaveAttribute(
          "data-question",
          value,
        );
      }
    }
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      for (const height of [600, 900]) {
        await page.setViewportSize({ width, height });
        await picker.selectOption(values[0]);
        const before = await frame(dialog);
        await picker.selectOption(values.at(-1));
        await sameFrame(
          dialog,
          before,
          `F${code} ${width}x${height}: cambiar pregunta`,
        );
        await picker.selectOption(values[0]);
        const vertical = await navigationVisible(dialog);
        results.push({
          format: `F${code}`,
          width,
          height,
          vertical,
          status: "PASS",
        });
        if (code === "03" && [375, 1440].includes(width) && height === 900) {
          await dialog.screenshot({
            path: fileURLToPath(new URL(`editor-${width}.png`, output)),
            animations: "disabled",
          });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await internalScroll(dialog, `F${code}`);
    if (code === "07") {
      await picker.selectOption(values[2]);
      await dialog.screenshot({
        path: fileURLToPath(new URL("editor-07-compacto.png", output)),
        animations: "disabled",
      });
    }
    const tabFrame = await frame(dialog);
    await dialog.getByRole("button", { name: /^Editar pregunta/ }).click();
    await sameFrame(dialog, tabFrame, `F${code}: editar pregunta`);
    await dialog.getByRole("button", { name: "Listo", exact: true }).click();
    await sameFrame(dialog, tabFrame, `F${code}: cerrar edición de pregunta`);
    for (const name of ["Formulario", "Historial", "Preguntas"]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      await sameFrame(dialog, tabFrame, `F${code}: pestaña ${name}`);
    }
    const accessibility = await new AxeBuilder({ page })
      .include(".fe-sheet")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      accessibility.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      `F${code}: accesibilidad`,
    );
    await dialog
      .getByRole("tab", { name: "Vista previa", exact: true })
      .click();
    await sameFrame(dialog, tabFrame, `F${code}: vista previa`);
    const steps = dialog.getByLabel("Sección del formulario", { exact: true });
    const options = await steps
      .locator("option")
      .evaluateAll((elements) => elements.map((el) => el.value));
    const roots = new Set(
      fields.filter((field) => !field.visibleSi).map((field) => field.codigo),
    );
    for (const option of options.slice(0, -1)) {
      await steps.selectOption(option);
      await sameFrame(
        dialog,
        tabFrame,
        `F${code}: paso ${option} de vista previa`,
      );
      const codes = await dialog
        .locator(".tutoring-fields [data-field]")
        .evaluateAll((elements) => elements.map((el) => el.dataset.field));
      assert(
        codes.filter((value) => roots.has(value)).length <= 1,
        `F${code}: una pregunta principal por paso`,
      );
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    console.log(
      `F${code}: orden completo, navegación, doce tamaños, vista previa y Axe PASS`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await writeFile(
    new URL("verificacion.json", output),
    JSON.stringify({ base, results, errors, writes }, null, 2),
  );
} finally {
  await browser.close();
}
