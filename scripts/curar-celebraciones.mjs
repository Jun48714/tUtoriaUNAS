import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "artifacts/celebraciones-v3/candidatas");
await mkdir(out, { recursive: true });
const pages = [
  "success-confetti-EMfyCQZ68Q",
  "trophy-winner-sqy7EcFolv",
  "rocket-launch-ISCDGkf0Bc",
  "rocket-launch-UbwVgSoyLR",
  "gift-and-confetti-Ede7pWPWDz",
  "high-five-Z6RWXbd9zf",
  "celebration-fM2BP3az2p",
  "success-checkmark-celebration-confetti-confirmation-OaZF9h03PS",
  "fireworks-Qa0DxeLqfw",
  "thumbs-up-mUxZh7H8iK",
  "fireworks-show-wEqgSSsXsT",
  "rocket-launch-Qz1CEnU0Ia",
  "fist-bump-79hI3NROvn",
  "high-five-lottie-json-animation-4yzxdhUkBE",
  "celebrations-begin-EjWwPBxcRt",
  "success-celebration-Sn1bJRj6pz",
  "target-animation-z2UhRwaway",
  "man-flying-on-paper-airplane-WB6OSHeTXl",
  "close-envelope-send-mail-sMmILDROff",
  "send-mail-yleXae9zp1",
  "pudgy-high-five-CmSttBQn1N",
  "success-gHhycGlG5S",
  "celebration-mAnHKjVEgy",
  "success-J4Wwwz05De",
  "email-open-xDKj7N8EmE",
];
for (const category of ["send-mail", "target", "celebration", "high-five"]) {
  const html = await (
    await fetch(`https://lottiefiles.com/free-animations/${category}`)
  ).text();
  const links = [
    ...new Set(
      [...html.matchAll(/\/free-animation\/([a-zA-Z0-9-]+)/g)].map((m) => m[1]),
    ),
  ];
  console.log(`${category}: ${links.slice(0, 12).join(", ")}`);
  await writeFile(
    path.join(out, `${category}-links.json`),
    JSON.stringify(links, null, 2),
  );
}
const manifest = [];
for (const slug of pages) {
  const page = `https://lottiefiles.com/free-animation/${slug}`;
  const htmlFile = path.join(out, `${slug}.html`);
  let html;
  try {
    html = await readFile(htmlFile, "utf8");
  } catch {
    html = await (await fetch(page)).text();
    await writeFile(htmlFile, html);
  }
  const paths = [
    ...new Set(
      [...html.matchAll(/a\/[a-f0-9-]+\/[a-zA-Z0-9_-]+\.json/g)].map(
        (m) => m[0],
      ),
    ),
  ];
  const source = paths[0] && `https://assets-v2.lottiefiles.com/${paths[0]}`;
  if (!source) {
    console.log(`SIN JSON: ${slug}`);
    continue;
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${slug}: ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.layers) || !data.fr || !data.op)
    throw new Error(`Lottie inválido: ${slug}`);
  const external = (data.assets ?? []).filter(
    (a) => a.p && !a.p.startsWith("data:"),
  );
  const licensed = html.includes("Lottie Simple License");
  await writeFile(path.join(out, `${slug}.json`), JSON.stringify(data));
  const title = html.match(/<title>([^<]+)/)?.[1];
  const info = {
    slug,
    page,
    source,
    title,
    licensed,
    frames: data.op - data.ip,
    duration: (data.op - data.ip) / data.fr,
    width: data.w,
    height: data.h,
    layers: data.layers.length,
    external: external.length,
  };
  manifest.push(info);
  console.log(JSON.stringify(info));
}
await writeFile(
  path.join(out, "catalogo.json"),
  JSON.stringify(manifest, null, 2),
);
const player =
  "https://raw.githubusercontent.com/airbnb/lottie-web/v5.13.0/build/player/lottie_light.min.js";
await writeFile(
  path.join(out, "lottie_light.min.js"),
  await (await fetch(player)).text(),
);
