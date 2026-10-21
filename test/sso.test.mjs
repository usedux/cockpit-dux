import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { boot, call } from "./helpers.mjs";
import { safePath, signSsoToken } from "../lib/sso.js";
import { col } from "../lib/store.js";

const SECRET = "segredo-sso-compartilhado-de-teste-123456";
let env, ana;
before(async () => {
  env = await boot();
  ana = await env.cookieFor("ana@wearedux.com", "Ana Souza");
  delete process.env.PRODUCT_LIBRARY_URL;
});
after(() => { delete process.env.SSO_SHARED_SECRET; return env.close(); });

const decode = (token) => {
  const [body, sig] = token.split(".");
  return { payload: JSON.parse(Buffer.from(body, "base64url").toString("utf8")), body, sig };
};

test("SSO: sem sessão manda para o login e volta para a mesma rota", async () => {
  process.env.SSO_SHARED_SECRET = SECRET;
  const r = await call(env.base, "/api/sso/product-library?next=" + encodeURIComponent("/#dux-582"));
  assert.equal(r.status, 302);
  const loc = r.headers.get("location");
  assert.ok(loc.startsWith("/auth/login?return="));
  assert.equal(decodeURIComponent(loc.split("return=")[1]), "/api/sso/product-library?next=" + encodeURIComponent("/#dux-582"));
});

test("SSO: login com return (modo dev) volta para a rota; return malicioso vira /", async () => {
  process.env.DEV_AUTH_EMAIL = "ana@wearedux.com";
  try {
    const ok = await call(env.base, "/auth/login?return=" + encodeURIComponent("/api/sso/product-library?next=%2F"));
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get("location"), "/api/sso/product-library?next=%2F");
    for (const evil of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
      const r = await call(env.base, "/auth/login?return=" + encodeURIComponent(evil));
      assert.equal(r.headers.get("location"), "/", evil);
    }
  } finally { delete process.env.DEV_AUTH_EMAIL; }
});

test("SSO: com sessão responde 302 para o Product Library com token assinado e válido", async () => {
  process.env.SSO_SHARED_SECRET = SECRET;
  const before = Date.now();
  const r = await call(env.base, "/api/sso/product-library?next=" + encodeURIComponent("/#dux-582.discovery"), { cookie: ana });
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get("location"));
  assert.equal(u.origin, "https://product-library-dux.vercel.app");
  assert.equal(u.pathname, "/auth/sso");
  assert.equal(u.searchParams.get("next"), "/#dux-582.discovery");
  const { payload, body, sig } = decode(u.searchParams.get("token"));
  assert.deepEqual(Object.keys(payload), ["email", "name", "aud", "iat", "exp", "nonce"]);
  assert.equal(payload.email, "ana@wearedux.com");
  assert.equal(payload.name, "Ana Souza");
  assert.equal(payload.aud, "product-library");
  assert.ok(payload.iat >= before && payload.iat <= Date.now());
  assert.equal(payload.exp - payload.iat, 60_000);
  assert.match(payload.nonce, /^[0-9a-f]{32}$/);
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  assert.equal(sig, expected);
  // cada token tem nonce próprio
  const r2 = await call(env.base, "/api/sso/product-library", { cookie: ana });
  assert.notEqual(decode(new URL(r2.headers.get("location")).searchParams.get("token")).payload.nonce, payload.nonce);
});

test("SSO: next malicioso ou ausente vira /", async () => {
  process.env.SSO_SHARED_SECRET = SECRET;
  for (const evil of ["//evil.com", "https://evil.com/x", "evil", "/\\evil.com", "/a\r\nSet-Cookie:x=1", ""]) {
    const r = await call(env.base, "/api/sso/product-library?next=" + encodeURIComponent(evil), { cookie: ana });
    assert.equal(r.status, 302);
    assert.equal(new URL(r.headers.get("location")).searchParams.get("next"), "/", JSON.stringify(evil));
  }
  const r = await call(env.base, "/api/sso/product-library", { cookie: ana });
  assert.equal(new URL(r.headers.get("location")).searchParams.get("next"), "/");
});

test("SSO: PRODUCT_LIBRARY_URL troca o destino", async () => {
  process.env.SSO_SHARED_SECRET = SECRET;
  process.env.PRODUCT_LIBRARY_URL = "https://pl-preview.example.vercel.app/";
  try {
    const r = await call(env.base, "/api/sso/product-library", { cookie: ana });
    assert.equal(new URL(r.headers.get("location")).origin, "https://pl-preview.example.vercel.app");
  } finally { delete process.env.PRODUCT_LIBRARY_URL; }
});

test("SSO: sem SSO_SHARED_SECRET (ou curto demais) responde 503 com mensagem clara", async () => {
  delete process.env.SSO_SHARED_SECRET;
  let r = await call(env.base, "/api/sso/product-library", { cookie: ana });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /SSO_SHARED_SECRET/);
  process.env.SSO_SHARED_SECRET = "curto";
  r = await call(env.base, "/api/sso/product-library", { cookie: ana });
  assert.equal(r.status, 503);
  delete process.env.SSO_SHARED_SECRET;
});

test("safePath e assinatura (unidade)", () => {
  assert.equal(safePath("/#dux-1"), "/#dux-1");
  assert.equal(safePath("//x"), "/");
  assert.equal(safePath(undefined), "/");
  const t = signSsoToken({ email: "A@wearedux.com", secret: SECRET, now: 1000 });
  assert.equal(decode(t).payload.email, "a@wearedux.com");
  assert.equal(decode(t).payload.exp, 61_000);
});

test("Pessoas: login grava apps.cockpit e preserva campos de outros apps (ex.: product-library)", async () => {
  const { upsertUser, idFromEmail } = await import("../lib/auth.js");
  const email = "carla@wearedux.com";
  const id = idFromEmail(email);
  // o Product Library grava a pessoa na mesma lista, sem papel
  await col.set("users", id, { id, email, name: "Carla", firstSeen: "2026-10-20T10:00:00.000Z", lastSeen: "2026-10-20T10:00:00.000Z", apps: { "product-library": "2026-10-20T10:00:00.000Z" } });
  const rec = await upsertUser({ email, name: "Carla M." });
  assert.equal(rec.firstSeen, "2026-10-20T10:00:00.000Z");
  assert.equal(rec.apps["product-library"], "2026-10-20T10:00:00.000Z");
  assert.ok(rec.apps.cockpit);
  assert.equal(rec.role, undefined);
  // lista do admin expõe apps
  const admin = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
  const list = await (await call(env.base, "/api/people", { cookie: admin })).json();
  const c = list.find((p) => p.email === email);
  assert.deepEqual(Object.keys(c.apps).sort(), ["cockpit", "product-library"]);
});
