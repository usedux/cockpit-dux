import { route, json, readJson } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { col } from "../lib/store.js";

// GET ?q=  (admin) → lista/busca de quem já entrou no cockpit, com e-mail
// POST {ids} (qualquer logado) → { id: { name } } só com nomes (para "Reportado por")
export default route(async (req, res) => {
  const s = requireSession(req);
  const users = await col.list("users");
  if (req.method === "POST") {
    const { ids = [] } = await readJson(req);
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
