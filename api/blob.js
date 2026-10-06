import { route, json, redirect, send } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { getAsset } from "../lib/assets.js";

export default route(async (req, res) => {
  requireSession(req);
  const u = new URL(req.url, "http://x");
  const id = u.searchParams.get("id") || (u.pathname.startsWith("/_blob/") ? u.pathname.slice(7) : null);
  const a = await getAsset(id);
  if (!a) return json(res, 404, { error: "arquivo não encontrado" });
  if (a.url) return redirect(res, a.url);
  send(res, 200, Buffer.from(a.b64 || "", "base64"), { "Content-Type": a.type, "Cache-Control": "private, max-age=3600" });
});
