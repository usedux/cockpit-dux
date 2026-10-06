import crypto from "node:crypto";
import { route, json, redirect, setCookie, parseCookies, appUrl, isLocalDev } from "../lib/http.js";
import { googleAuthUrl, googleExchange, upsertUser, sessionCookieValue, SESSION, getSession, domainOk } from "../lib/auth.js";

export default route(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const action = url.searchParams.get("action") || (url.pathname.startsWith("/auth/") ? url.pathname.slice(6) : "") || "me";
  const secure = !isLocalDev();

  if (action === "me") {
    const s = getSession(req);
    if (!s) return json(res, 401, { error: "não autenticado" });
    return json(res, 200, s);
  }

  if (action === "login") {
    // Atalho SÓ para desenvolvimento local (nunca roda na Vercel).
    if (isLocalDev() && process.env.DEV_AUTH_EMAIL) {
      const email = process.env.DEV_AUTH_EMAIL;
      const u = await upsertUser({ email, name: process.env.DEV_AUTH_NAME || "Dev" });
      setCookie(res, SESSION.COOKIE, sessionCookieValue(u), { maxAge: SESSION.MAX_AGE, secure: false });
      return redirect(res, "/");
    }
    if (!process.env.GOOGLE_CLIENT_ID) return json(res, 500, { error: "GOOGLE_CLIENT_ID não configurado" });
    const state = crypto.randomBytes(16).toString("base64url");
    setCookie(res, "dux_oauth_state", state, { maxAge: 600, secure });
    return redirect(res, googleAuthUrl({ redirectUri: `${appUrl(req)}/auth/callback`, state }));
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = parseCookies(req).dux_oauth_state;
    if (!code || !state || !saved || state !== saved) return json(res, 400, { error: "estado inválido, tente entrar de novo" });
    try {
      const g = await googleExchange({ code, redirectUri: `${appUrl(req)}/auth/callback` });
      if (!domainOk(g.email)) return json(res, 403, { error: "Acesso restrito ao domínio da DUX." });
      const u = await upsertUser(g);
      setCookie(res, SESSION.COOKIE, sessionCookieValue(u), { maxAge: SESSION.MAX_AGE, secure });
      setCookie(res, "dux_oauth_state", "", { maxAge: 0, secure });
      return redirect(res, "/");
    } catch (e) {
      res.statusCode = e.status || 401;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><meta charset="utf-8"><title>Acesso negado</title><body style="font:16px system-ui;max-width:480px;margin:15vh auto;padding:0 20px"><h2>Não foi possível entrar</h2><p>${String(e.message).replace(/</g, "&lt;")}</p><p><a href="/auth/login">Tentar de novo</a></p></body>`);
    }
  }

  if (action === "logout") {
    setCookie(res, SESSION.COOKIE, "", { maxAge: 0, secure });
    return redirect(res, "/auth/login");
  }
  return json(res, 404, { error: "ação desconhecida" });
});
