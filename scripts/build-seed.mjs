// Empacota a pasta seed/ em módulos JS (lib/seed-data.js e lib/seed-assets.js).
// Motivo: na Vercel, ler arquivos soltos em tempo de execução depende de "includeFiles" e falha em silêncio;
// já o que é importado por `import` vai junto no pacote da função, sempre. Rode `npm run build:seed` se mudar algo em seed/.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedDir = join(root, "seed");
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".pdf": "application/pdf" };
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const docs = (c) => {
  const dir = join(seedDir, c);
  const out = {};
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) out[f.replace(/\.json$/, "")] = readJson(join(dir, f));
  return out;
};

const data = {
  reports: docs("reports"), innovations: docs("innovations"), upstream: docs("upstream"),
  history: existsSync(join(seedDir, "history.json")) ? readJson(join(seedDir, "history.json")) : [],
  legacyPeople: existsSync(join(seedDir, "legacy-people.json")) ? readJson(join(seedDir, "legacy-people.json")) : {},
};
writeFileSync(join(root, "lib", "seed-data.js"), `// GERADO por scripts/build-seed.mjs a partir de seed/ — não edite à mão.\nexport default ${JSON.stringify(data)};\n`);

const assets = {};
const aDir = join(seedDir, "assets");
if (existsSync(aDir)) {
  for (const f of readdirSync(aDir).sort()) {
    const type = TYPES[extname(f).toLowerCase()];
    const id = f.replace(/\.[^.]+$/, "");
    if (!type || !/^[0-9a-f]{32}$/.test(id)) continue;
    assets[id] = { name: f, type, b64: readFileSync(join(aDir, f)).toString("base64") };
  }
}
writeFileSync(join(root, "lib", "seed-assets.js"), `// GERADO por scripts/build-seed.mjs a partir de seed/assets — não edite à mão.\nexport default ${JSON.stringify(assets)};\n`);
console.log(`seed empacotado: ${Object.keys(data.reports).length} reports, ${Object.keys(data.innovations).length} inovações, ${Object.keys(data.upstream).length} upstream, ${data.history.length} semanas, ${Object.keys(assets).length} anexos`);
