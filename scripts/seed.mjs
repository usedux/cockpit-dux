// Importa para a produção os dados que hoje vivem no Artifact do claude.ai:
// reports, inovações, board Upstream, histórico de fechamentos e os prints/vídeos anexados.
// Uso:   npm run seed            (precisa das variáveis de ambiente do Redis; veja SETUP-vercel.md)
//        npm run seed -- --dry   (só mostra o que seria importado)
// É idempotente: pode rodar de novo (sobrescreve os mesmos ids; não apaga nada que a equipe tenha criado depois).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { store, col, usingMemory } from "../lib/store.js";
import { putAssetWithId } from "../lib/assets.js";
import { idFromEmail } from "../lib/auth.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedDir = join(root, "seed");
const dry = process.argv.includes("--dry");
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".pdf": "application/pdf" };
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const listJson = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

export async function runSeed({ log = console.log } = {}) {
  // mapa id antigo → e-mail (opcional)
  const legacyFile = join(seedDir, "legacy-people.json");
  const legacy = existsSync(legacyFile) ? readJson(legacyFile) : {};
  const idMap = {};
  let mapped = 0;
  for (const [oldId, v] of Object.entries(legacy)) {
    if (oldId.startsWith("_") || !v?.email) continue;
    if (!/^[^\s@]+@wearedux\.com$/i.test(v.email)) { log(`  ! ${oldId}: e-mail "${v.email}" ignorado (só @wearedux.com)`); continue; }
    const email = v.email.trim().toLowerCase();
    idMap[oldId] = idFromEmail(email);
    mapped++;
    if (!dry) {
      const prev = await col.get("users", idMap[oldId]);
      await col.set("users", idMap[oldId], { id: idMap[oldId], email, name: v.nome || prev?.name || email.split("@")[0], firstSeen: prev?.firstSeen || new Date().toISOString(), lastSeen: prev?.lastSeen || null, imported: true });
    }
  }
  const out = { reports: 0, innovations: 0, upstream: 0, assets: 0, history: 0, mappedPeople: mapped };

  for (const c of ["reports", "innovations", "upstream"]) {
    for (const f of listJson(join(seedDir, c))) {
      const id = f.replace(/\.json$/, "");
      const data = readJson(join(seedDir, c, f));
      if (data.submittedById && idMap[data.submittedById]) data.submittedById = idMap[data.submittedById];
      if (!dry) await col.set(c, id, data);
      out[c]++;
    }
  }

  const assetsDir = join(seedDir, "assets");
  if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
      const type = TYPES[extname(f).toLowerCase()];
      if (!type) continue;
      const id = f.replace(/\.[^.]+$/, "");
      if (!/^[0-9a-f]{32}$/.test(id)) continue;
      if (!dry) await putAssetWithId(id, { buf: readFileSync(join(assetsDir, f)), name: f, type });
      out.assets++;
    }
  }

  // histórico: só adiciona semanas que ainda não existem (não sobrescreve fechamentos feitos em produção)
  const histFile = join(seedDir, "history.json");
  if (existsSync(histFile)) {
    const incoming = readJson(histFile);
    const cur = JSON.parse((await store.get("history")) || "[]");
    const labels = new Set(cur.map((w) => w.label));
    const add = incoming.filter((w) => !labels.has(w.label));
    out.history = add.length;
    if (!dry && add.length) { await store.set("history", JSON.stringify([...add, ...cur])); await store.incr("ver:history"); }
  }
  log(`${dry ? "[simulação] " : ""}importado: ${JSON.stringify(out)}`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (usingMemory() && !dry) {
    console.error("Redis não configurado (KV_REST_API_URL / KV_REST_API_TOKEN). Rode `vercel env pull .env.local` e use `node --env-file=.env.local scripts/seed.mjs`.");
    process.exit(1);
  }
  runSeed().catch((e) => { console.error(e); process.exit(1); });
}
