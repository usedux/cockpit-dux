import { route, json, readRaw } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { putAsset, MAX_UPLOAD } from "../lib/assets.js";

export default route(async (req, res) => {
  const s = requireSession(req);
  if (req.method !== "POST") return json(res, 405, { error: "método não suportado" });
  const url = new URL(req.url, "http://x");
  const type = String(req.headers["content-type"] || "").split(";")[0].trim();
  const buf = await readRaw(req, MAX_UPLOAD + 1024);
  const out = await putAsset({ buf, name: url.searchParams.get("filename") || "arquivo", type, by: s.id });
  json(res, 200, { id: out.id, type: out.type, size: out.size });
});
