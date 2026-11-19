import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const out = path.join(repo, "artifacts/celebraciones-v3");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto("http://127.0.0.1:5173/login");
  await page.locator("#identifier").fill("2023010457");
  await page.locator("#password").fill("tutoria2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL("**/estudiante/dashboard");
  const loginResponse = await fetch("http://127.0.0.1:5082/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "2023010457",
      password: "tutoria2026",
      role: "estudiante",
      incluirEstado: true,
    }),
  });
  if (!loginResponse.ok)
    throw new Error(`Acceso de prueba: ${loginResponse.status}`);
  const { estado: datos } = await loginResponse.json();
  const report = (() => {
    if (!datos) throw new Error("Estado de API no disponible");
    const practicas = datos.registros.filter((d) =>
      d.sesionId?.startsWith("SES-PRACTICA-CIERRES-V3-EST-2023010457-"),
    );
    return {
      cuenta: datos.usuario.identifier,
      practicas: practicas.map((d) => ({
        id: d.id,
        formato: d.formato,
        estado: d.estado,
        enviado: d.enviado,
      })),
      anterioresEnviados: datos.registros.filter(
        (d) =>
          !d.sesionId?.startsWith("SES-PRACTICA-CIERRES-V3-") &&
          ["enviado", "aprobado"].includes(d.estado),
      ).length,
    };
  })();
  expect(report.practicas).toHaveLength(8);
  expect(report.practicas.filter((d) => d.formato === "F10")).toHaveLength(4);
  expect(report.practicas.filter((d) => d.formato === "F11")).toHaveLength(4);
  expect(
    report.practicas.every((d) =>
      ["no-iniciado", "borrador", "enviado", "aprobado"].includes(d.estado),
    ),
  ).toBe(true);
  const pendientes = report.practicas.filter((d) =>
    ["no-iniciado", "borrador"].includes(d.estado),
  );
  expect(pendientes.every((d) => d.enviado === null)).toBe(true);
  await page.goto("http://127.0.0.1:5173/estudiante/instrumentos");
  await expect(
    page.getByRole("link", { name: /Práctica/ }).first(),
  ).toBeVisible();
  const visibles = await page.getByRole("link", { name: /Práctica/ }).count();
  if (visibles < 1 || visibles > 8)
    throw new Error("Cantidad de prácticas visible inesperada");
  await page.screenshot({
    path: path.join(out, "alumno-ocho-pendientes.png"),
    fullPage: true,
  });
  if (pendientes.length) {
    await page.goto(
      `http://127.0.0.1:5173/estudiante/instrumentos/${encodeURIComponent(pendientes[0].id)}`,
    );
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".form-completion")).toHaveCount(0);
    await page.screenshot({
      path: path.join(out, "alumno-practica-disponible.png"),
      fullPage: true,
    });
  }
  await fs.writeFile(
    path.join(out, "alumno-practicas.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Verificadas 8 prácticas; ${pendientes.length} siguen pendientes y ${8 - pendientes.length} ya se completaron. Envíos previos: ${report.anterioresEnviados}.`,
  );
} finally {
  await browser.close();
}
