import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const dir = path.join(repo, "frontend/public/assets/celebraciones");
const { animations } = JSON.parse(
  await fs.readFile(path.join(dir, "sources.json"), "utf8"),
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 260 } });
try {
  await page.setContent(
    '<body style="margin:0;background:transparent"><div id="animation" style="width:480px;height:260px"></div></body>',
  );
  await page.addScriptTag({
    path: path.join(dir, "lottie-light-5.13.0.min.js"),
  });
  for (const spec of animations) {
    const data = JSON.parse(
      await fs.readFile(path.join(dir, `${spec.format}.json`), "utf8"),
    );
    await page.evaluate(
      async ({ data, frame }) => {
        window.current?.destroy();
        const a = window.lottie.loadAnimation({
          container: document.getElementById("animation"),
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData: data,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        window.current = a;
        if (!a.isLoaded)
          await new Promise((resolve) => {
            a.addEventListener("DOMLoaded", resolve);
            setTimeout(resolve, 1000);
          });
        a.goToAndStop(a.totalFrames * frame, true);
      },
      { data, frame: spec.poster },
    );
    await page.screenshot({
      path: path.join(dir, `${spec.format}.png`),
      omitBackground: true,
    });
    console.log(`${spec.format}: fotograma estático renderizado`);
    if (spec.format === "F02" || spec.format === "F11")
      for (const frame of [0.2, 0.35, 0.65, 0.8]) {
        await page.evaluate(
          (frame) =>
            window.current.goToAndStop(
              window.current.totalFrames * frame,
              true,
            ),
          frame,
        );
        await page.screenshot({
          path: path.join(
            repo,
            `artifacts/celebraciones-v3/${spec.format}-${frame}.png`,
          ),
          omitBackground: true,
        });
      }
  }
} finally {
  await browser.close();
}
