// Recebe o webhook do Linear (HMAC-SHA256 no header `linear-signature`) e atualiza o cockpit em tempo real.
import crypto from "node:crypto";
import { route, json, readRaw } from "../lib/http.js";
import { refreshAll } from "../lib/linear.js";

const RELEVANT = new Set(["Issue", "Project", "ProjectUpdate", "ProjectMilestone", "IssueLabel", "Cycle"]);

export function verifySignature(raw, header, secret) {
  if (!secret || !header) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(String(header)), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default route(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "este endpoint só recebe o webhook do Linear" });
  const raw = await readRaw(req, 1024 * 1024);
  if (!verifySignature(raw, req.headers["linear-signature"], process.env.LINEAR_WEBHOOK_SECRET)) {
    return json(res, 401, { error: "assinatura inválida" });
  }
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return json(res, 400, { error: "json inválido" }); }

  // Proteção contra replay: o Linear envia webhookTimestamp (ms); rejeita se tiver mais de 60 s.
  if (payload.webhookTimestamp && Math.abs(Date.now() - Number(payload.webhookTimestamp)) > 60_000) {
    return json(res, 401, { error: "timestamp fora da janela" });
  }
  if (!RELEVANT.has(payload.type)) return json(res, 200, { ignored: payload.type });

  const work = refreshAll({ reason: `webhook ${payload.type}/${payload.action}` }).catch((e) => console.error("[webhook refresh]", e));
  // Responde já (o Linear espera resposta rápida) e termina a atualização em segundo plano.
  let waited = false;
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(work); waited = true;
  } catch { /* fora da Vercel: aguarda */ }
  if (!waited) await work;
  json(res, 202, { accepted: true, type: payload.type, action: payload.action });
});
