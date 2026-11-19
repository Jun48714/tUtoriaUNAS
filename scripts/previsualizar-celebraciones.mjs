import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const dir = path.join(repo, "artifacts/celebraciones-v3/candidatas");
const candidates = JSON.parse(
  await fs.readFile(path.join(dir, "catalogo.json"), "utf8"),
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.setContent(
    '<body style="background:#f3f6f4;font:16px Arial;margin:24px"><main style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px"></main></body>',
  );
  await page.addScriptTag({ path: path.join(dir, "lottie_light.min.js") });
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const data = JSON.parse(
      await fs.readFile(path.join(dir, `${c.slug}.json`), "utf8"),
    );
    await page.evaluate(
      async ({ c, data, i }) => {
        const card = document.createElement("article");
        card.style =
          "background:white;padding:12px;border-radius:12px;min-width:0";
        card.innerHTML = `<div id="asset-${i}" style="height:230px"></div><p style="font-size:12px;overflow-wrap:anywhere">${i + 1}. ${c.slug}</p>`;
        document.querySelector("main").append(card);
        const a = window.lottie.loadAnimation({
          container: card.firstChild,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData: data,
        });
        if (!a.isLoaded)
          await new Promise((resolve) => {
            a.addEventListener("DOMLoaded", resolve);
            setTimeout(resolve, 1000);
          });
        a.goToAndStop(a.totalFrames * 0.58, true);
        (window.previewAnimations ??= []).push(a);
      },
      { c, data, i },
    );
    console.log(`${i + 1}: ${c.slug}`);
  }
  await page.screenshot({
    path: path.join(dir, "galeria.png"),
    fullPage: true,
  });
  await page.evaluate(() =>
    window.previewAnimations.forEach((a) => a.destroy()),
  );
} finally {
  await browser.close();
}
