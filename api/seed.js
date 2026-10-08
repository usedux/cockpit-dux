// Importa para o banco de produção os dados que vinham do Artifact do claude.ai (ferramentas, inovações,
// board Upstream, histórico semanal e anexos) — os arquivos vão embutidos no deploy (pasta seed/).
// Só admin. GET → situação; POST → importa ({auto:true} só importa se o banco estiver vazio e nunca tiver sido importado).
// É idempotente (veja scripts/seed.mjs): rodar de novo não duplica nem apaga o que a equipe criou depois.
import { route, json, readJson } from "../lib/http.js";
import { requireAdmin } from "../lib/auth.js";
import { store, col } from "../lib/store.js";
import { runSeed, bundleCounts } from "../scripts/seed.mjs";

async function situation() {
  const [reports, innovations, upstream, seededAt] = await Promise.all([
    col.list("reports"), col.list("innovations"), col.list("upstream"), store.get("seed:done"),
  ]);
  const bundled = bundleCounts();
  const present = { reports: reports.length, innovations: innovations.length, upstream: upstream.length };
  const hasBundle = bundled.reports + bundled.innovations + bundled.upstream > 0;
  const needsImport = hasBundle && !seededAt && present.reports + present.innovations === 0;
  return { bundled, present, seededAt: seededAt || null, needsImport };
}

export default route(async (req, res) => {
  requireAdmin(req);
  if (req.method === "GET") return json(res, 200, await situation());
  if (req.method !== "POST") return json(res, 405, { error: "método não suportado" });
  const body = await readJson(req).catch(() => ({}));
  const before = await situation();
  if (body?.auto && !before.needsImport) return json(res, 200, { skipped: true, ...before });
  const logs = [];
  const out = await runSeed({ log: (m) => logs.push(m) });
  await store.set("seed:done", new Date().toISOString());
  json(res, 200, { imported: out, logs: logs.slice(-10), ...(await situation()) });
});
