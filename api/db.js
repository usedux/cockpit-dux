// "Banco" do cockpit: coleções reports / innovations (todos @wearedux.com leem e reportam),
// upstream (somente admin). Regras aplicadas no servidor — o front só espelha.
import { route, json, readJson } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { col } from "../lib/store.js";

const SHARED = new Set(["reports", "innovations"]);
const ADMIN_ONLY = new Set(["upstream"]);
const ID_RE = /^[A-Za-z0-9_\-.:]{1,80}$/;
const PROTECTED = ["submittedById", "submittedAt", "reportadoPor", "editedAt", "editedById"];

function checkCollection(name, session) {
  if (SHARED.has(name)) return;
  if (ADMIN_ONLY.has(name)) { if (!session.isAdmin) throw Object.assign(new Error("apenas admin"), { status: 403 }); return; }
  throw Object.assign(new Error("coleção desconhecida"), { status: 404 });
}

export default route(async (req, res) => {
  const session = requireSession(req);
  const url = new URL(req.url, "http://x");

  if (req.method === "GET") {
    const c = url.searchParams.get("c");
    checkCollection(c, session);
    const version = await col.version(c);
    const since = url.searchParams.get("since");
    if (since !== null && Number(since) === version) return json(res, 200, { unchanged: true, version });
    return json(res, 200, { version, docs: await col.list(c) });
  }

  if (req.method !== "POST") return json(res, 405, { error: "método não suportado" });
  const body = await readJson(req);
  const { op, c, id, data } = body;
  checkCollection(c, session);
  if (!ID_RE.test(id || "")) return json(res, 400, { error: "id inválido" });
  const now = new Date().toISOString();
  const existing = await col.get(c, id);
  const canEdit = session.isAdmin || (existing && existing.submittedById === session.id);

  if (ADMIN_ONLY.has(c)) {
    if (op === "delete") await col.del(c, id);
    else await col.set(c, id, op === "update" ? { ...(existing || {}), ...(data || {}) } : data || {});
    return json(res, 200, { ok: true, version: await col.version(c) });
  }

  if (op === "set") {
    if (existing && !session.isAdmin) return json(res, 409, { error: "registro já existe" });
    const clean = { ...(data || {}) };
    for (const k of PROTECTED) delete clean[k];
    clean.submittedById = existing ? existing.submittedById : session.id;
    clean.submittedAt = existing ? existing.submittedAt : now;
    if (session.isAdmin && data?.reportadoPor) clean.reportadoPor = String(data.reportadoPor).slice(0, 120);
    if (!existing && JSON.stringify(clean).length > 100_000) return json(res, 413, { error: "registro grande demais" });
    await col.set(c, id, clean);
  } else if (op === "update") {
    if (!existing) return json(res, 404, { error: "registro não encontrado" });
    if (!canEdit) return json(res, 403, { error: "você só pode editar o que você mesmo reportou" });
    const changes = { ...(data || {}) };
    for (const k of PROTECTED) if (!(session.isAdmin && k === "reportadoPor")) delete changes[k];
    for (const [k, v] of Object.entries(changes)) if (v && typeof v === "object" && v.__delete__) { delete existing[k]; delete changes[k]; }
    await col.set(c, id, { ...existing, ...changes, editedAt: now, editedById: session.id });
  } else if (op === "delete") {
    if (!existing) return json(res, 404, { error: "registro não encontrado" });
    if (!canEdit) return json(res, 403, { error: "você só pode apagar o que você mesmo reportou" });
    await col.del(c, id);
  } else return json(res, 400, { error: "operação inválida" });

  json(res, 200, { ok: true, version: await col.version(c) });
});
