import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = path.join(repo, "artifacts/celebraciones-v3/candidatas");
const out = path.join(repo, "frontend/public/assets/celebraciones");
await mkdir(out, { recursive: true });
const sources = JSON.parse(
  await readFile(path.join(candidates, "catalogo.json"), "utf8"),
);
const selection = {
  F01: [
    "trophy-winner-sqy7EcFolv",
    "Reconocimiento al informe terminado",
    0.76,
  ],
  F02: ["success-gHhycGlG5S", "Un semestre de trabajo compartido", 0.6],
  F03: ["rocket-launch-Qz1CEnU0Ia", "Comienza tu recorrido", 0.56],
  F04: ["target-animation-z2UhRwaway", "Un paso más en tu recorrido", 0.9],
  F05: ["man-flying-on-paper-airplane-WB6OSHeTXl", "Nuevos horizontes", 0.6],
  F06: ["fist-bump-79hI3NROvn", "Encuentro completado", 0.6],
  F07: [
    "high-five-lottie-json-animation-4yzxdhUkBE",
    "El trabajo del grupo cuenta",
    0.56,
  ],
  F08: ["high-five-Z6RWXbd9zf", "Gracias por acompañar", 0.5],
  F09: ["thumbs-up-mUxZh7H8iK", "Gracias por compartir tu balance", 0.95],
  F10: ["email-open-xDKj7N8EmE", "Tu opinión ya forma parte del proceso", 0.65],
  F11: ["celebration-fM2BP3az2p", "Una entrega que merece celebrarse", 0.45],
  F12: ["success-J4Wwwz05De", "El registro de apoyo está completo", 0.62],
};
const manifest = [];
for (const [format, [slug, purpose, poster]] of Object.entries(selection)) {
  const source = sources.find((s) => s.slug === slug);
  if (!source?.licensed || source.external)
    throw new Error(`Revisar licencia/recursos de ${slug}`);
  const bytes = await readFile(path.join(candidates, `${slug}.json`));
  const data = JSON.parse(bytes);
  const html = await readFile(path.join(candidates, `${slug}.html`), "utf8");
  const ld = [
    ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
  ].map((m) => JSON.parse(m[1]));
  const entity = ld
    .flatMap((item) => item["@graph"] ?? [])
    .find((item) => item.mainEntity?.creator)?.mainEntity;
  await writeFile(path.join(out, `${format}.json`), bytes);
  manifest.push({
    format,
    title: source.title,
    author: entity?.creator?.name ?? source.title,
    purpose,
    page: source.page,
    source: source.source,
    license: "Lottie Simple License",
    licenseUrl: "https://lottiefiles.com/page/license",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    frames: data.op - data.ip,
    fps: data.fr,
    duration: source.duration,
    poster,
  });
}
await copyFile(
  path.join(candidates, "lottie_light.min.js"),
  path.join(out, "lottie-light-5.13.0.min.js"),
);
const license = await fetch(
  "https://raw.githubusercontent.com/airbnb/lottie-web/v5.13.0/LICENSE.md",
);
if (!license.ok)
  throw new Error("No se pudo obtener licencia del reproductor.");
await writeFile(path.join(out, "LICENSE-Lottie-Web.txt"), await license.text());
await writeFile(
  path.join(out, "CREDITOS.md"),
  "# Animaciones de celebración\n\nArchivos descargados de LottieFiles bajo Lottie Simple License. Se conservan autores, enlaces originales y fuentes en sources.json.\n\nLicencia: https://lottiefiles.com/page/license\n\nReproductor lottie-web Light 5.13.0 de Airbnb, licencia MIT.\n\n" +
    manifest.map((a) => `- ${a.format}: ${a.title}. ${a.page}`).join("\n") +
    "\n",
);
await writeFile(
  path.join(out, "sources.json"),
  JSON.stringify(
    {
      player: {
        name: "lottie-web Light",
        version: "5.13.0",
        source: "https://github.com/airbnb/lottie-web/tree/v5.13.0",
        license: "MIT",
      },
      animations: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Integradas ${manifest.length} animaciones completas, con autores y licencias.`,
);
