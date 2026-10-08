import { route, json, readJson } from "../lib/http.js";
import { requireSession, idFromEmail } from "../lib/auth.js";
import { col } from "../lib/store.js";

// POST {op:"link", legacyId, email, name?} (admin) → associa os registros antigos (id do Artifact) a uma conta @wearedux.com
// GET ?q=  (admin) → lista/busca de quem já entrou no cockpit, com e-mail
// POST {ids} (qualquer logado) → { id: { name } } só com nomes (para "Reportado por")
export default route(async (req, res) => {
  const s = requireSession(req);
  const users = await col.list("users");
  if (req.method === "POST") {
    const body = await readJson(req);
    if (body.op === "link") return linkLegacy(s, body, res);
    const { ids = [] } = body;
    const want = new Set(ids.slice(0, 64));
    const out = {};
    for (const u of users) if (want.has(u.id) && u.data.name) out[u.id] = { name: u.data.name };
    return json(res, 200, out);
  }
  if (!s.isAdmin) return json(res, 403, { error: "apenas admin" });
  const q = (new URL(req.url, "http://x").searchParams.get("q") || "").trim().toLowerCase();
  const list = users
    .map((u) => ({ id: u.id, name: u.data.name, email: u.data.email, lastSeen: u.data.lastSeen }))
    .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  json(res, 200, list);
});

// Reatribui reports/inovações do id antigo para a conta do e-mail informado e deixa a associação gravada
// (a importação dos dados antigos passa a respeitá-la). Quando a pessoa entrar com o Google, já é "dela".
async function linkLegacy(s, body, res) {
  if (!s.isAdmin) return json(res, 403, { error: "apenas admin" });
  const legacyId = String(body.legacyId || "");
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^u_[A-Za-z0-9_-]{6,40}$/.test(legacyId)) return json(res, 400, { error: "identificador antigo inválido" });
  if (!/^[^\s@]+@wearedux\.com$/.test(email)) return json(res, 400, { error: "informe um e-mail @wearedux.com" });
  const userId = idFromEmail(email);
  const prev = await col.get("users", userId);
  const name = String(body.name || "").trim().slice(0, 120) || prev?.name || email.split("@")[0];
  await col.set("users", userId, { id: userId, email, name, firstSeen: prev?.firstSeen || new Date().toISOString(), lastSeen: prev?.lastSeen || null, imported: prev?.imported ?? true });
  await col.set("legacy-links", legacyId, { userId, email, at: new Date().toISOString(), by: s.email });
  let moved = 0;
  for (const c of ["reports", "innovations"]) {
    for (const r of await col.list(c)) {
      if (r.data.submittedById !== legacyId) continue;
      await col.set(c, r.id, { ...r.data, submittedById: userId });
      moved++;
    }
  }
  json(res, 200, { ok: true, moved, userId, email, name });
}
