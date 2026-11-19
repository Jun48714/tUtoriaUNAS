import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "artifacts", "celebraciones-v3");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
let context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
let page = await context.newPage();
const errors = [];
const resultados = [];
async function preparar(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/login");
  await page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const domModule =
      await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = domModule.createRoot ?? domModule.default.createRoot;
    const { FormCompletion } =
      await import("/src/components/formatos/FormCompletion.tsx");
    const { escenasFormato } = await import("/src/data/escenasFormatos.ts");
    document.getElementById("root").style.display = "none";
    const host = document.createElement("div");
    host.id = "completion-verification";
    document.body.append(host);
    host.innerHTML =
      '<main style="min-height:100vh;background:#f3f7f5;padding:40px 16px;font-family:var(--font-body)"><header style="max-width:680px;margin:0 auto 20px"><p style="font-size:12px;color:#45624b;letter-spacing:2px">TUTORÍA UNAS · REVISIÓN DE MOVIMIENTO</p><h1 id="scene-title" style="font-size:22px;color:#142239;margin:10px 0">Formatos 01–12</h1><p style="font-size:13px;color:#45624b">Muestra visual · datos ficticios · sin envíos al servidor</p></header><div class="qa-panel" style="max-width:680px;margin:auto;padding:24px;border:1px solid #dce5db;border-radius:12px;background:white"><div id="completion-root"></div></div></main>';
    const root = createRoot(document.getElementById("completion-root"));
    window.renderCompletion = (formato, respuestas = {}, key = formato) => {
      document.getElementById("scene-title").textContent =
        `${formato.slice(1)} · ${escenasFormato[formato].nombre}`;
      root.render(
        React.createElement(FormCompletion, {
          key,
          formato,
          respuestas,
          focus: false,
          onFinish: () => {},
          onView: () => {},
        }),
      );
    };
  });
}
try {
  await preparar(page);
  for (let n = 1; n <= 12; n++) {
    const formato = `F${String(n).padStart(2, "0")}`;
    await page.evaluate(
      (f) =>
        window.renderCompletion(f, {
          resultado: "Se programa nueva cita para seguimiento",
          ...Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [
              `actividad${i + 1}`,
              i % 2 ? "No realizada" : "Realizada",
            ]),
          ),
        }),
      formato,
    );
    await expect(page.locator(".fc-stage")).toHaveAttribute(
      "data-scene",
      formato,
    );
    await expect(page.locator(".fc-stage")).toHaveAttribute(
      "data-playback",
      "playing",
    );
    await page.waitForTimeout(180);
    const firstFrame = await page.locator(".fc-lottie").innerHTML();
    await expect(
      page.getByRole("button", { name: /Volver al listado/ }),
    ).toBeEnabled();
    await page.waitForTimeout(850);
    if (firstFrame === (await page.locator(".fc-lottie").innerHTML()))
      throw new Error(`${formato}: fotograma sin movimiento`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .locator(".qa-panel")
      .screenshot({ path: path.join(out, `${formato}-movimiento.png`) });
    await expect(page.locator(".fc-stage")).toHaveAttribute(
      "data-playback",
      "complete",
    );
    await page.waitForTimeout(220);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .locator(".qa-panel")
      .screenshot({ path: path.join(out, `${formato}-final.png`) });
    const audit = await new AxeBuilder({ page })
      .include("#completion-verification")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    if (audit.violations.length)
      throw new Error(
        `${formato}: ${audit.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.failureSummary).join(";")).join("\n")}`,
      );
    await page.evaluate((f) => window.renderCompletion(f), formato);
    await expect(page.locator(".fc-stage")).toHaveAttribute(
      "data-playback",
      "complete",
    );
    resultados.push({
      formato,
      accesibilidad: "PASS",
      reproduccion: "completa, una vez",
    });
    console.log(`${formato}: escena, acciones y accesibilidad correctas`);
  }
  const showcase = page.video();
  await context.close();
  if (showcase) {
    await showcase.saveAs(path.join(out, "doce-cierres.webm"));
    await showcase.delete();
  }
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  await preparar(page);
  for (const resultado of [
    "Se resuelve con la asesoría",
    "Se programa nueva cita para seguimiento",
    "Se deriva a:",
  ]) {
    await page.evaluate(
      (r) => window.renderCompletion("F08", { resultado: r }, r),
      resultado,
    );
    await expect(page.locator(".fc-detail")).toContainText(
      resultado === "Se deriva a:"
        ? "borrador del formato 12"
        : resultado.includes("cita")
          ? "nueva cita"
          : "se resolvió",
    );
    await expect(page.locator(".fc-stage")).toHaveAttribute(
      "data-playback",
      "complete",
    );
    await page.waitForTimeout(220);
    await page.locator(".qa-panel").screenshot({
      path: path.join(
        out,
        `F08-ruta-${resultado === "Se deriva a:" ? "derivar" : resultado.includes("cita") ? "seguimiento" : "resuelto"}.png`,
      ),
    });
  }
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (let n = 1; n <= 12; n++) {
      const f = `F${String(n).padStart(2, "0")}`;
      await page.evaluate((f) => window.renderCompletion(f), f);
      await expect(page.locator(".fc-stage")).toHaveAttribute("data-scene", f);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`Desbordamiento ${f} a ${width}`);
    }
    if (width === 375)
      await page
        .locator(".qa-panel")
        .screenshot({ path: path.join(out, "cierre-movil.png") });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.renderCompletion("F01", {}, "reduced"));
  await expect(page.locator(".form-completion")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect
    .poll(() =>
      page
        .locator(".fc-stage")
        .evaluate((e) => e.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(page.locator(".fc-stage")).toHaveAttribute(
    "data-playback",
    "static",
  );
  await expect(page.locator(".fc-lottie svg")).toHaveCount(0);
  const reduced = await page
    .locator(".fc-poster")
    .evaluate((e) => getComputedStyle(e).opacity);
  await page.waitForTimeout(250);
  if (
    reduced !==
    (await page
      .locator(".fc-poster")
      .evaluate((e) => getComputedStyle(e).opacity))
  )
    throw new Error("Movimiento no reducido");
  if (errors.length) throw new Error(errors.join("\n"));
  await fs.writeFile(
    path.join(out, "verificacion.json"),
    JSON.stringify(
      {
        resultados,
        anchos: [320, 375, 390, 768, 1024, 1440],
        rutasF08: 3,
        movimientoReducido: "PASS",
        errores: errors,
      },
      null,
      2,
    ),
  );
} finally {
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(out, "doce-cierres.webm"));
  await browser.close();
}
