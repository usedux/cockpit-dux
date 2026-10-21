// GET /api/sso/product-library?next=/#dux-582 — leva quem está logado no Cockpit direto para o Product Library, sem novo login.
import { route, json, redirect } from "../../lib/http.js";
import { getSession } from "../../lib/auth.js";
import { ssoSecret, safePath, signSsoToken, ssoRedirectUrl, productLibraryUrl } from "../../lib/sso.js";

export default route(async (req, res) => {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "método não permitido" });
  const url = new URL(req.url, "http://x");
  const s = getSession(req);
  if (!s) {
    // volta para esta mesma rota depois do login
    return redirect(res, `/auth/login?return=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const secret = ssoSecret();
  if (!secret) return json(res, 503, { error: "SSO não configurado: cadastre a variável SSO_SHARED_SECRET (o mesmo valor no cockpit-dux e no product-library) e faça um Redeploy." });
  const next = safePath(url.searchParams.get("next"));
  const token = signSsoToken({ email: s.email, name: s.name, secret });
  redirect(res, ssoRedirectUrl({ token, next, base: productLibraryUrl() }));
});
