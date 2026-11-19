import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const output = new URL("../artifacts/datos-graficas/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const widths = [320, 375, 390, 768, 1024, 1440, 1880];
const heights = [480, 950];

async function fitsViewport(dialog, context) {
  await expect
    .poll(
      () =>
        dialog.evaluate((element) => {
          const body = element.querySelector(".sheet__body");
          const footer = element
            .querySelector(".sheet__foot")
            .getBoundingClientRect();
          return Math.max(
            body.scrollHeight - body.clientHeight,
            element.scrollHeight - element.clientHeight,
            footer.bottom - window.innerHeight,
            -element.getBoundingClientRect().top,
          );
        }),
      { message: `${context}: consultar y paginar sin scroll vertical` },
    )
    .toBeLessThanOrEqual(1);
}

async function geometry(cards) {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const rect = (selector) => {
        const node = element.querySelector(selector);
        if (!node) return null;
        const bounds = node.getBoundingClientRect();
        return {
          x: bounds.x - card.x,
          y: bounds.y - card.y,
          width: bounds.width,
          height: bounds.height,
        };
      };
      return {
        height: card.height,
        header: rect(".analytics-card-head"),
        chart: rect(".portal-chart"),
        footer: rect(".chart-activity-footer, .chart-instrument-footer"),
        trigger: rect(".chart-data-trigger"),
      };
    }),
  );
}

async function frame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

function sameVisuals(before, after, context) {
  for (const key of ["header", "chart", "footer", "trigger"]) {
    assert.equal(
      Boolean(before[key]),
      Boolean(after[key]),
      `${context}: ${key}`,
    );
    if (!before[key]) continue;
    for (const property of ["x", "y", "width", "height"]) {
      assert(
        Math.abs(before[key][property] - after[key][property]) <= 1,
        `${context}: ${key}.${property} cambió`,
      );
    }
  }
}

async function verifyDisclosure(page, cards, index, context) {
  const card = cards.nth(index);
  const trigger = card.getByRole("button", {
    name: "Ver datos del gráfico",
    exact: true,
  });
  const title = await card.locator("h2").innerText();
  if (context === "coordinacion 1880x950" && index === 0) {
    await card.evaluate((element) =>
      window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 100),
    );
    await frame(page);
    await card.screenshot({
      path: fileURLToPath(new URL("acceso-datos-arriba.png", output)),
      animations: "disabled",
    });
  }
  await trigger.focus();
  const before = await geometry(cards);
  assert(
    before[index].trigger.y < before[index].chart.y,
    `${context}: acceso a datos en la cabecera`,
  );
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await frame(page);
  const after = await geometry(cards);
  for (let i = 0; i < before.length; i++) {
    sameVisuals(before[i], after[i], `${context}, tarjeta ${i + 1}`);
    assert(
      Math.abs(before[i].height - after[i].height) <= 1,
      `${context}: cambió la altura de una tarjeta`,
    );
  }
  const overflow = await dialog.evaluate((element) => {
    const body = element.querySelector(".sheet__body");
    return Math.max(
      element.scrollWidth - element.clientWidth,
      body.scrollWidth - body.clientWidth,
    );
  });
  assert(overflow <= 1, `${context}: desbordamiento del detalle ${overflow}px`);
  await fitsViewport(dialog, context);
  const rowCount = await dialog.locator("tbody tr").count();
  assert(rowCount > 0 && rowCount <= 6, `${context}: paginación de datos`);
  const next = dialog.getByRole("button", { name: "Siguiente", exact: true });
  const originalDialog = await dialog.boundingBox();
  if ((await next.count()) && (await next.isEnabled())) {
    const previousStatus = await dialog.getByRole("status").innerText();
    await next.click();
    const nextDialog = await dialog.boundingBox();
    for (const property of ["x", "y", "width", "height"]) {
      assert(
        Math.abs(originalDialog[property] - nextDialog[property]) <= 1,
        `${context}: modal estático al paginar`,
      );
    }
    await fitsViewport(dialog, `${context}: página siguiente`);
    await expect(dialog.getByRole("status")).not.toHaveText(previousStatus);
    await dialog.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText(previousStatus);
  }
  if (context.endsWith("x480") && index === 0) {
    let last = 0;
    do {
      await fitsViewport(dialog, `${context}: recorrido de páginas`);
      const range = await dialog.getByRole("status").innerText();
      const [, first, end, total] = range.match(/^(\d+)–(\d+) de (\d+)$/);
      assert.equal(
        Number(first),
        last + 1,
        `${context}: todos los registros, sin omitir ni repetir`,
      );
      last = Number(end);
      if (last === Number(total)) break;
      await next.click();
    } while (last < 1000);
    const previous = dialog.getByRole("button", {
      name: "Anterior",
      exact: true,
    });
    while ((await previous.count()) && (await previous.isEnabled())) {
      await previous.click();
    }
  }
  if (context === "coordinacion 1880x950" && index === 0) {
    await dialog.screenshot({
      path: fileURLToPath(new URL("detalle-compacto-desktop.png", output)),
      animations: "disabled",
    });
  }
  if (context === "coordinacion 375x480" && index === 0) {
    await dialog.screenshot({
      path: fileURLToPath(new URL("detalle-compacto-mobile.png", output)),
      animations: "disabled",
    });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await frame(page);
  const closed = await geometry(cards);
  for (let i = 0; i < before.length; i++) {
    sameVisuals(before[i], closed[i], `${context}: cerrar`);
    assert(
      Math.abs(before[i].height - closed[i].height) <= 1,
      `${context}: no conservó su altura`,
    );
  }
}

try {
  for (const account of [
    { role: "coordinacion", id: "coordinacion.tutoria" },
    { role: "estudiante", id: "2023010456" },
    { role: "tutor", id: "DOC-0421" },
  ]) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/login`);
    await page.locator("#identifier").fill(account.id);
    await page.locator("#password").fill("tutoria2026");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL(`**/${account.role}/dashboard`);
    await page.evaluate(() => document.fonts.ready);
    const cards = page.locator(".portal-chart-card");
    for (const width of widths) {
      for (const height of heights) {
        await page.setViewportSize({ width, height });
        await expect(
          cards.locator('.portal-chart[aria-busy="false"]'),
        ).toHaveCount(2);
        await frame(page);
        for (let index = 0; index < 2; index++)
          await verifyDisclosure(
            page,
            cards,
            index,
            `${account.role} ${width}x${height}`,
          );
        const formatView = account.role === "tutor" ? "Por formato" : "Avance";
        const stateView = account.role === "tutor" ? "Por estado" : "Estados";
        await cards
          .nth(1)
          .getByRole("button", { name: formatView, exact: true })
          .click();
        await frame(page);
        await verifyDisclosure(
          page,
          cards,
          1,
          `${account.role} ${width}x${height} por formato`,
        );
        await cards
          .nth(1)
          .getByRole("button", { name: stateView, exact: true })
          .click();
        results.push({
          role: account.role,
          page: "dashboard",
          width,
          height,
          status: "PASS",
        });
      }
    }
    if (account.role === "tutor") {
      await page.goto(`${base}/tutor/reportes`);
      const reports = page
        .locator(".report-chart")
        .filter({ has: page.locator(".portal-chart") });
      await expect(reports.first().locator(".portal-chart")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      for (const width of [320, 768, 1440]) {
        for (const height of heights) {
          await page.setViewportSize({ width, height });
          await frame(page);
          for (let index = 0; index < (await reports.count()); index++)
            await verifyDisclosure(
              page,
              reports,
              index,
              `reportes ${width}x${height}`,
            );
          results.push({
            role: account.role,
            page: "reportes",
            width,
            height,
            status: "PASS",
          });
        }
      }
    }
    await context.close();
    console.log(
      `${account.role}: datos abiertos/cerrados, tamaños, teclado y tablas PASS`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("verificacion.json", output),
    JSON.stringify({ base, results, errors }, null, 2),
  );
  console.log(`${results.length} combinaciones verificadas.`);
} finally {
  await browser.close();
}
