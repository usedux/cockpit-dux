// Fechamento semanal — chamado pelo cron da Vercel (sexta, 21h UTC = 18h BRT) ou manualmente por um admin.
//   GET /api/closing            → fecha a semana atual (se ainda não foi fechada)
//   GET /api/closing?dry=1      → só mostra como ficaria o fechamento (não grava nada) — use para testar no meio da semana
//   GET /api/closing?force=1    → refaz o fechamento da semana atual (admin/cron)
import { route, json } from "../lib/http.js";
import { requireCronOrAdmin } from "../lib/auth.js";
import { runClosing } from "../lib/closing.js";

export default route(async (req, res) => {
  requireCronOrAdmin(req);
  const q = new URL(req.url, "http://x").searchParams;
  json(res, 200, await runClosing({ force: q.get("force") === "1", dry: q.get("dry") === "1" }));
});
