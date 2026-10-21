// Entrada direta (SSO) do Cockpit para o Product Library: o Cockpit assina um token curto e o Product Library valida.
// token = base64url(payload) + "." + base64url(HMAC-SHA256(SSO_SHARED_SECRET, base64url(payload)))
import crypto from "node:crypto";

export const PRODUCT_LIBRARY_DEFAULT = "https://product-library-dux.vercel.app";
export const SSO_TTL_MS = 60 * 1000;

// Segredo compartilhado (mesmo valor nos dois projetos da Vercel). null quando ausente/curto demais.
export function ssoSecret(env = process.env) {
  const s = env.SSO_SHARED_SECRET;
  return s && String(s).length >= 16 ? String(s) : null;
}

export function productLibraryUrl(env = process.env) {
  const raw = String(env.PRODUCT_LIBRARY_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return PRODUCT_LIBRARY_DEFAULT;
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname.replace(/\/+$/, "") : PRODUCT_LIBRARY_DEFAULT; }
  catch { return PRODUCT_LIBRARY_DEFAULT; }
}

// Caminho local seguro: começa com "/", não com "//", sem barra invertida nem caracteres de controle. Senão: "/".
export function safePath(v, fallback = "/") {
  const s = typeof v === "string" ? v : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.length > 600) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return fallback;
  return s;
}

export function signSsoToken({ email, name, aud = "product-library", secret, now = Date.now(), ttlMs = SSO_TTL_MS }) {
  const payload = { email: String(email).toLowerCase(), name: name || String(email).split("@")[0], aud, iat: now, exp: now + ttlMs, nonce: crypto.randomBytes(16).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function ssoRedirectUrl({ token, next, base }) {
  return `${base}/auth/sso?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
}
