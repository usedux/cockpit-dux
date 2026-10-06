// Helpers mínimos para as funções Node da Vercel.
export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, path = "/", httpOnly = true, sameSite = "Lax", secure = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

export function redirect(res, location, status = 302) {
  send(res, status, "", { Location: location, "Cache-Control": "no-store" });
}

export async function readRaw(req, max = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) { const e = new Error("payload_too_large"); e.status = 413; throw e; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, max = 200 * 1024) {
  const raw = await readRaw(req, max);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); }
  catch { const e = new Error("invalid_json"); e.status = 400; throw e; }
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function isLocalDev() {
  return !process.env.VERCEL && !process.env.VERCEL_ENV;
}

// Envolve um handler para capturar erros e devolver JSON consistente.
export function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[api]", err);
      if (!res.headersSent) json(res, status, { error: err.message || "erro" });
    }
  };
}
