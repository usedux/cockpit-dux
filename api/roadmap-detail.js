// Detalhamento de produtos (acesso restrito): o HTML da página e os dados da Metodologia de produto só saem
// daqui para o admin e para quem ele liberou (lib/access.js). O index.html servido a todos NÃO contém esse conteúdo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { route, json } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { canSeeDetail } from "../lib/access.js";
import { col } from "../lib/store.js";

let cached;
function detailHtml() {
  if (cached === undefined) {
    try { cached = readFileSync(join(process.cwd(), "app", "roadmap-detail.html"), "utf8"); } catch { cached = ""; }
  }
  return cached;
}

export default route(async (req, res) => {
  const session = requireSession(req);
  if (req.method !== "GET") return json(res, 405, { error: "método não suportado" });
  if (!(await canSeeDetail(session))) return json(res, 403, { error: "acesso restrito: peça liberação ao admin" });
  const [upDocs, downstream] = await Promise.all([col.list("upstream"), col.get("method", "downstream")]);
  const meta = upDocs.find((d) => d.id === "_meta")?.data || {};
  const items = upDocs
    .filter((d) => d.id !== "_meta")
    .map((d) => d.data)
    .map(({ identifier, title, url, status, statusType, assignee, lane, updatedAt }) => ({ identifier, title, url, status, statusType, assignee, lane, updatedAt }));
  json(res, 200, {
    html: detailHtml(),
    canManage: !!session.isAdmin,
    upstream: { lanes: meta.lanes || [], items, syncedAt: meta.syncedAt || null, projectUrl: meta.projectUrl || null },
    downstream: downstream || null,
  });
});
