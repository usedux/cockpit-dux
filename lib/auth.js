// Sessão (cookie assinado) + login com Google restrito ao domínio @wearedux.com.
import crypto from "node:crypto";
import { parseCookies } from "./http.js";
import { ALLOWED_DOMAIN, ADMIN_DEFAULT } from "./config.js";
import { col } from "./store.js";

const COOKIE = "dux_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET ausente ou curto demais (use 32+ caracteres aleatórios).");
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString("base64url");
const hmac = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function signToken(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}
export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = hmac(body);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.exp && p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

// id estável derivado do e-mail (permite mapear registros antigos por e-mail)
export function idFromEmail(email) {
  return "u_" + crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("base64url").slice(0, 22);
}

export function adminEmails() {
  return String(process.env.ADMIN_EMAILS || ADMIN_DEFAULT).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export const isAdminEmail = (email) => adminEmails().includes(String(email).toLowerCase());
export const domainOk = (email) => String(email).toLowerCase().endsWith("@" + ALLOWED_DOMAIN);

export function sessionCookieValue(user) {
  return signToken({ uid: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + MAX_AGE });
}
export const SESSION = { COOKIE, MAX_AGE };

// Retorna { id, email, name, isAdmin } ou null
export function getSession(req) {
  const p = verifyToken(parseCookies(req)[COOKIE]);
  if (!p || !domainOk(p.email)) return null;
  return { id: p.uid, email: p.email, name: p.name || p.email.split("@")[0], isAdmin: isAdminEmail(p.email) };
}

export async function upsertUser({ email, name }) {
  const id = idFromEmail(email);
  const prev = await col.get("users", id);
  const rec = { id, email: email.toLowerCase(), name: name || prev?.name || email.split("@")[0], firstSeen: prev?.firstSeen || new Date().toISOString(), lastSeen: new Date().toISOString() };
  await col.set("users", id, rec);
  return rec;
}

// ---- Google OAuth ----
export function googleAuthUrl({ redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: ALLOWED_DOMAIN,
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function googleExchange({ code, redirectUri }) {
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  const tj = await tok.json();
  if (!tok.ok || !tj.id_token) throw Object.assign(new Error("Falha ao trocar o código do Google."), { status: 401 });
  // tokeninfo valida assinatura/expiração do id_token no lado do Google
  const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tj.id_token)}`)).json();
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) throw Object.assign(new Error("Token não é deste app."), { status: 401 });
  if (!["accounts.google.com", "https://accounts.google.com"].includes(info.iss)) throw Object.assign(new Error("Emissor inválido."), { status: 401 });
  if (String(info.email_verified) !== "true") throw Object.assign(new Error("E-mail não verificado."), { status: 401 });
  if (!domainOk(info.email) || (info.hd && info.hd !== ALLOWED_DOMAIN)) {
    throw Object.assign(new Error(`Acesso restrito a contas @${ALLOWED_DOMAIN}.`), { status: 403 });
  }
  return { email: info.email, name: info.name || info.email.split("@")[0] };
}

export function requireSession(req) {
  const s = getSession(req);
  if (!s) throw Object.assign(new Error("não autenticado"), { status: 401 });
  return s;
}
export function requireAdmin(req) {
  const s = requireSession(req);
  if (!s.isAdmin) throw Object.assign(new Error("apenas admin"), { status: 403 });
  return s;
}
// Para crons/webhooks internos: Bearer CRON_SECRET, ou admin logado
export function requireCronOrAdmin(req) {
  const h = String(req.headers.authorization || "");
  if (process.env.CRON_SECRET && h === `Bearer ${process.env.CRON_SECRET}`) return { cron: true };
  return requireAdmin(req);
}
