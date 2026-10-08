import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { boot, call } from "./helpers.mjs";
import { verifySignature } from "../api/linear-webhook.js";
import { readFileSync } from "node:fs";
import { applyLiveBlocks, liveMarkerNames } from "../lib/inject.js";
import { transform } from "../scripts/build-app.mjs";

let env, admin, ana, bruno, outsider;
before(async () => {
  env = await boot();
  admin = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
  ana = await env.cookieFor("ana@wearedux.com", "Ana");
  bruno = await env.cookieFor("bruno@wearedux.com", "Bruno");
});
after(() => env.close());

test("sem login: página redireciona e API responde 401", async () => {
  const p = await call(env.base, "/");
  assert.equal(p.status, 302);
  assert.equal(p.headers.get("location"), "/auth/login");
  assert.equal((await call(env.base, "/api/db?c=reports")).status, 401);
  assert.equal((await call(env.base, "/api/live")).status, 401);
});

test("cookie de outro domínio é recusado", async () => {
  const { sessionCookieValue } = await import("../lib/auth.js");
  const c = `dux_session=${encodeURIComponent(sessionCookieValue({ id: "u_x", email: "alguem@gmail.com", name: "X" }))}`;
  assert.equal((await call(env.base, "/api/auth?action=me", { cookie: c })).status, 401);
});

test("cookie adulterado é recusado", async () => {
  const bad = ana.slice(0, -3) + "xyz";
  assert.equal((await call(env.base, "/api/auth?action=me", { cookie: bad })).status, 401);
});

test("página logada traz o shim e o app", async () => {
  const r = await call(env.base, "/", { cookie: ana });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<script src="\/shim\.js">/);
  assert.match(html, /Cockpit de Projetos/);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});

test("reports: qualquer @wearedux.com cria; só dono ou admin edita/apaga; campos protegidos não são forjáveis", async () => {
  const mk = { nome: "Planilha X", descritivo: "d", submittedById: "u_forjado", submittedAt: "2000-01-01" };
  let r = await call(env.base, "/api/db", { cookie: ana, method: "POST", body: { op: "set", c: "reports", id: "r1", data: mk } });
  assert.equal(r.status, 200);
  let list = await (await call(env.base, "/api/db?c=reports", { cookie: bruno })).json();
  const doc = list.docs.find((d) => d.id === "r1").data;
  assert.notEqual(doc.submittedById, "u_forjado");
  assert.notEqual(doc.submittedAt, "2000-01-01");
  // outro usuário não edita nem apaga
  r = await call(env.base, "/api/db", { cookie: bruno, method: "POST", body: { op: "update", c: "reports", id: "r1", data: { nome: "hack" } } });
  assert.equal(r.status, 403);
  r = await call(env.base, "/api/db", { cookie: bruno, method: "POST", body: { op: "delete", c: "reports", id: "r1" } });
  assert.equal(r.status, 403);
  // não sobrescreve registro existente com "set"
  r = await call(env.base, "/api/db", { cookie: bruno, method: "POST", body: { op: "set", c: "reports", id: "r1", data: { nome: "x" } } });
  assert.equal(r.status, 409);
  // dono edita (sem trocar o dono)
  r = await call(env.base, "/api/db", { cookie: ana, method: "POST", body: { op: "update", c: "reports", id: "r1", data: { nome: "Planilha Y", submittedById: "u_outro" } } });
  assert.equal(r.status, 200);
  list = await (await call(env.base, "/api/db?c=reports", { cookie: ana })).json();
  const upd = list.docs.find((d) => d.id === "r1").data;
  assert.equal(upd.nome, "Planilha Y");
  assert.equal(upd.submittedById, doc.submittedById);
  // admin apaga
  r = await call(env.base, "/api/db", { cookie: admin, method: "POST", body: { op: "delete", c: "reports", id: "r1" } });
  assert.equal(r.status, 200);
});

test("db: versão permite resposta 'unchanged'; coleção desconhecida é 404; upstream só admin", async () => {
  const a = await (await call(env.base, "/api/db?c=innovations", { cookie: ana })).json();
  const b = await (await call(env.base, `/api/db?c=innovations&since=${a.version}`, { cookie: ana })).json();
  assert.equal(b.unchanged, true);
  assert.equal((await call(env.base, "/api/db?c=users", { cookie: admin })).status, 404);
  assert.equal((await call(env.base, "/api/db?c=upstream", { cookie: ana })).status, 403);
  assert.equal((await call(env.base, "/api/db?c=upstream", { cookie: admin })).status, 200);
});

test("people: admin lista com e-mail; usuário comum só resolve nomes", async () => {
  assert.equal((await call(env.base, "/api/people", { cookie: ana })).status, 403);
  const list = await (await call(env.base, "/api/people?q=ana", { cookie: admin })).json();
  assert.ok(list.some((p) => p.email === "ana@wearedux.com"));
  const me = await (await call(env.base, "/api/auth?action=me", { cookie: ana })).json();
  const names = await (await call(env.base, "/api/people", { cookie: bruno, method: "POST", body: { ids: [me.id] } })).json();
  assert.deepEqual(names[me.id], { name: "Ana" });
  assert.equal(names[me.id].email, undefined);
});

test("upload: aceita imagem pequena, serve de volta, recusa tipo e tamanho inválidos", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  let r = await fetch(env.base + "/api/upload?filename=a.png", { method: "POST", headers: { cookie: ana, "content-type": "image/png" }, body: png });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const got = await fetch(env.base + `/_blob/${id}`, { headers: { cookie: bruno } });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await got.arrayBuffer()).length, png.length);
  assert.equal((await fetch(env.base + `/_blob/${id}`)).status, 401);
  r = await fetch(env.base + "/api/upload?filename=a.exe", { method: "POST", headers: { cookie: ana, "content-type": "application/x-msdownload" }, body: png });
  assert.equal(r.status, 415);
  r = await fetch(env.base + "/api/upload?filename=big.png", { method: "POST", headers: { cookie: ana, "content-type": "image/png" }, body: Buffer.alloc(4 * 1024 * 1024 + 10) });
  assert.ok([413, 500].includes(r.status));
});

const sign = (body, secret = "whsec_teste") => crypto.createHmac("sha256", secret).update(body).digest("hex");
const hook = (payload, { secret, sig } = {}) => {
  const raw = JSON.stringify(payload);
  return fetch(env.base + "/api/linear-webhook", { method: "POST", headers: { "linear-signature": sig ?? sign(raw, secret), "content-type": "application/json" }, body: raw });
};

test("webhook: assinatura inválida/ausente → 401; replay antigo → 401", async () => {
  assert.equal((await hook({ type: "Issue", action: "update" }, { sig: "00" })).status, 401);
  assert.equal((await hook({ type: "Issue", action: "update" }, { secret: "outro" })).status, 401);
  assert.equal((await fetch(env.base + "/api/linear-webhook", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await hook({ type: "Issue", webhookTimestamp: Date.now() - 5 * 60_000 })).status, 401);
  assert.equal((await fetch(env.base + "/api/linear-webhook")).status, 405);
  assert.equal(verifySignature(Buffer.from("x"), sign("x"), "whsec_teste"), true);
});

test("webhook: evento irrelevante é ignorado; evento de Issue atualiza o cockpit", async () => {
  assert.equal((await (await hook({ type: "Reaction", webhookTimestamp: Date.now() })).json()).ignored, "Reaction");
  const r = await hook({ type: "Issue", action: "update", webhookTimestamp: Date.now() });
  assert.equal(r.status, 202);
  const live = await (await call(env.base, "/api/live", { cookie: ana })).json();
  assert.match(live.blocks["anti-sacado:milestones"], /Piloto Risco Sacado/);
  assert.equal(live.meta.warnings.length > 0, true); // DUX-510/511 ocultos
  assert.match(live.blocks["meta:synced"], /<time datetime="\d{4}-\d{2}-\d{2}T[^"]+Z"><\/time>/); // carimbo "última atualização do Linear"
  // muda algo no "Linear" e dispara de novo → versão muda e o bloco reflete
  env.mock.setStatus("DUX-572", "Done / In Prod");
  await hook({ type: "Issue", action: "update", webhookTimestamp: Date.now() });
  const live2 = await (await call(env.base, "/api/live", { cookie: ana })).json();
  assert.notEqual(live2.version, live.version);
  assert.notEqual(live2.blocks["anti-sacado:milestones"], live.blocks["anti-sacado:milestones"]);
  const same = await (await call(env.base, `/api/live?v=${live2.version}`, { cookie: ana })).json();
  assert.equal(same.unchanged, true);
});

test("refresh/closing: só cron (Bearer) ou admin", async () => {
  for (const path of ["/api/refresh", "/api/closing"]) {
    assert.equal((await call(env.base, path)).status, 401);
    assert.equal((await call(env.base, path, { cookie: ana })).status, 403);
    assert.equal((await call(env.base, path, { headers: { authorization: "Bearer errado" } })).status, 401);
  }
  assert.equal((await call(env.base, "/api/refresh", { headers: { authorization: "Bearer cron_teste" } })).status, 200);
});

test("closing via cron: grava no histórico, é idempotente e o /api/live devolve o histórico", async () => {
  const run = () => call(env.base, "/api/closing", { headers: { authorization: "Bearer cron_teste" } }).then((r) => r.json());
  const first = await run();
  assert.equal(first.ok, true);
  const second = await run();
  assert.equal(second.skipped, true);
  const live = await (await call(env.base, "/api/live", { cookie: ana })).json();
  const entry = live.history.find((w) => w.label === first.label);
  assert.ok(entry && entry.open === false);
  assert.match(entry.report.burndownSvg, /<svg/);
  assert.ok(entry.report.highlights.length >= 1);
  const forced = await call(env.base, "/api/closing?force=1", { headers: { authorization: "Bearer cron_teste" } }).then((r) => r.json());
  assert.equal(forced.replaced, true);
});

test("build: HTML de produção sem referências ao claude.ai, histórico zerado, todos os marcadores LIVE intactos", () => {
  const src = readFileSync(new URL("../src/cockpit.html", import.meta.url), "utf8");
  const { html } = transform(src);
  assert.doesNotMatch(html, /claude\.ai/);
  assert.match(html, /<script id="weekHistoryData" type="application\/json">\[\]<\/script>/);
  assert.equal(liveMarkerNames(html).length, 29);
  const filled = applyLiveBlocks(html, { "anti-sacado:areas": "<span>TESTE</span>" });
  assert.match(filled, /LIVE:anti-sacado:areas:start -->\n<span>TESTE<\/span>\n<!-- LIVE:anti-sacado:areas:end/);
});

test("closing?dry=1 não grava nada (dá pra testar no meio da semana sem travar o fechamento de sexta)", async () => {
  const { store } = await import("../lib/store.js");
  await store.del("history");
  const out = await call(env.base, "/api/closing?dry=1", { headers: { authorization: "Bearer cron_teste" } }).then((r) => r.json());
  assert.equal(out.dry, true);
  assert.ok(out.entry.report.burndownSvg);
  assert.equal(await store.get("history"), null);
  const real = await call(env.base, "/api/closing", { headers: { authorization: "Bearer cron_teste" } }).then((r) => r.json());
  assert.equal(real.ok, true);
});

test("/api/seed: só admin; banco vazio importa sozinho uma vez (auto) e depois não repete", async () => {
  const { store, col } = await import("../lib/store.js");
  store._reset();
  const admin = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
  const user = await env.cookieFor("ana@wearedux.com", "Ana Teste");
  assert.equal((await call(env.base, "/api/seed", { cookie: user })).status, 403);
  assert.equal((await call(env.base, "/api/seed")).status, 401);
  const st = await (await call(env.base, "/api/seed", { cookie: admin })).json();
  assert.equal(st.needsImport, true);
  assert.deepEqual({ r: st.bundled.reports, i: st.bundled.innovations }, { r: 15, i: 10 });
  const run = await (await call(env.base, "/api/seed", { cookie: admin, method: "POST", body: { auto: true } })).json();
  assert.equal(run.imported.reports, 15);
  assert.equal(run.imported.innovations, 10);
  assert.equal(run.needsImport, false);
  assert.equal((await col.list("innovations")).length, 10);
  const again = await (await call(env.base, "/api/seed", { cookie: admin, method: "POST", body: { auto: true } })).json();
  assert.equal(again.skipped, true);
  // se o admin apagar tudo depois, o automático não traz de volta (só o botão manual)
  for (const r of await col.list("reports")) await col.del("reports", r.id);
  for (const r of await col.list("innovations")) await col.del("innovations", r.id);
  assert.equal((await (await call(env.base, "/api/seed", { cookie: admin })).json()).needsImport, false);
});
