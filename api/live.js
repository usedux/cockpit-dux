// Dados "ao vivo" que alimentam os cards do painel (blocos HTML gerados do Linear) e o histórico de fechamentos.
import { route, json } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { store } from "../lib/store.js";

export default route(async (req, res) => {
  requireSession(req);
  const [lv, hv] = await Promise.all([store.get("ver:live"), store.get("ver:history")]);
  const version = `${lv || 0}.${hv || 0}`;
  const since = new URL(req.url, "http://x").searchParams.get("v");
  if (since === version) return json(res, 200, { unchanged: true, version });
  const [blocks, meta, history] = await Promise.all([store.hgetall("live"), store.get("live:meta"), store.get("history")]);
  json(res, 200, {
    version,
    meta: meta ? JSON.parse(meta) : null,
    blocks,
    history: history ? JSON.parse(history) : [],
  });
});
