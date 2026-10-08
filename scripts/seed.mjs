// Importa para a produção os dados que viviam no Artifact do claude.ai:
// reports, inovações, board Upstream, histórico de fechamentos e os prints/vídeos anexados.
// Os dados vêm de lib/seed-data.js e lib/seed-assets.js (gerados por `npm run build:seed` a partir de seed/),
// então funcionam igual no terminal e dentro da função da Vercel (api/seed.js).
// Uso:   npm run seed            (precisa das variáveis de ambiente do Redis; veja SETUP-vercel.md)
//        npm run seed -- --dry   (só mostra o que seria importado)
// É seguro rodar de novo: só cria o que ainda não existe; nunca sobrescreve nem apaga o que já está no banco.
import { fileURLToPath } from "node:url";
import { store, col, usingMemory } from "../lib/store.js";
import { putAssetWithId } from "../lib/assets.js";
import { idFromEmail } from "../lib/auth.js";
import seed from "../lib/seed-data.js";

const dry = process.argv.includes("--dry");

// Quantos registros vêm embutidos no deploy (para o painel admin saber se há o que importar).
export async function bundleCounts() {
  const assets = (await import("../lib/seed-assets.js")).default;
  return { reports: Object.keys(seed.reports).length, innovations: Object.keys(seed.innovations).length, upstream: Object.keys(seed.upstream).length, history: seed.history.length, assets: Object.keys(assets).length };
}

export async function runSeed({ log = console.log } = {}) {
  // mapa id antigo → e-mail (opcional; também pode ser feito depois, pela tela Admin → Pessoas)
  const idMap = {};
  let mapped = 0;
  for (const [oldId, v] of Object.entries(seed.legacyPeople)) {
    if (oldId.startsWith("_") || !v?.email) continue;
    if (!/^[^\s@]+@wearedux\.com$/i.test(v.email)) { log(`  ! ${oldId}: e-mail "${v.email}" ignorado (só @wearedux.com)`); continue; }
    const email = v.email.trim().toLowerCase();
    idMap[oldId] = idFromEmail(email);
    mapped++;
    if (!dry) {
      const prev = await col.get("users", idMap[oldId]);
      if (prev) continue; // conta que já existe não é reescrita
      await col.set("users", idMap[oldId], { id: idMap[oldId], email, name: v.nome || prev?.name || email.split("@")[0], firstSeen: prev?.firstSeen || new Date().toISOString(), lastSeen: prev?.lastSeen || null, imported: true });
    }
  }
  const out = { reports: 0, innovations: 0, upstream: 0, assets: 0, assetsFailed: 0, history: 0, mappedPeople: mapped, kept: { reports: 0, innovations: 0, upstream: 0, assets: 0 } };

  // NUNCA sobrescreve: o que já existe no banco (editado pelo admin, ou enviado pela equipe) fica como está.
  // A importação só cria o que ainda não existe — por isso é seguro rodar de novo e atualizar o código sem perder dados.
  for (const c of ["reports", "innovations", "upstream"]) {
    for (const [id, doc] of Object.entries(seed[c])) {
      if (await col.get(c, id)) { out.kept[c]++; continue; }
      const data = { ...doc };
      if (data.submittedById && idMap[data.submittedById]) data.submittedById = idMap[data.submittedById];
      else if (data.submittedById) {
        // já foi associado a um e-mail pela tela Admin? então mantém a associação
        const link = await col.get("legacy-links", data.submittedById);
        if (link?.userId) data.submittedById = link.userId;
      }
      if (!dry) await col.set(c, id, data);
      out[c]++;
    }
  }

  // histórico: só adiciona semanas que ainda não existem (não sobrescreve fechamentos feitos em produção)
  const cur = JSON.parse((await store.get("history")) || "[]");
  const labels = new Set(cur.map((w) => w.label));
  const add = seed.history.filter((w) => !labels.has(w.label));
  out.history = add.length;
  if (!dry && add.length) { await store.set("history", JSON.stringify([...add, ...cur])); await store.incr("ver:history"); }

  // anexos (Vercel Blob): um anexo com problema não derruba a importação do resto
  const assets = (await import("../lib/seed-assets.js")).default;
  for (const [id, a] of Object.entries(assets)) {
    try {
      if (await store.hget("assets", id)) { out.kept.assets++; continue; }
      if (!dry) await putAssetWithId(id, { buf: Buffer.from(a.b64, "base64"), name: a.name, type: a.type });
      out.assets++;
    } catch (e) { out.assetsFailed++; log(`  ! anexo ${a.name}: ${e.message}`); }
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
