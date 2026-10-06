// Serve o app SOMENTE para quem está logado com conta @wearedux.com (o HTML tem conteúdo interno).
// Os blocos ao vivo e o histórico já vão embutidos, então a primeira pintura não "pisca" com dado velho.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { route, redirect, send } from "../lib/http.js";
import { getSession } from "../lib/auth.js";
import { store } from "../lib/store.js";
import { applyLiveBlocks } from "../lib/inject.js";

let cached;
function template() {
  if (!cached) cached = readFileSync(join(process.cwd(), "app", "index.html"), "utf8");
  return cached;
}

export default route(async (req, res) => {
  const s = getSession(req);
  if (!s) return redirect(res, "/auth/login");
  let html = template();
  try {
    const [blocks, hist] = await Promise.all([store.hgetall("live"), store.get("history")]);
    html = applyLiveBlocks(html, blocks);
    if (hist) html = html.replace('<script id="weekHistoryData" type="application/json">[]</script>', () => `<script id="weekHistoryData" type="application/json">${hist.replace(/</g, "\\u003c")}</script>`);
  } catch (e) { console.error("[page] sem dados ao vivo no carregamento:", e.message); }
  send(res, 200, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" });
});
