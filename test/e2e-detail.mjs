// Detalhamento de produtos: acesso em dois níveis (admin + liberados em Admin → Pessoas), sem vazar o conteúdo.
// Uso: node test/e2e-detail.mjs [pasta-de-capturas]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot, call } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";
import { refreshAll } from "../lib/linear.js";
import { transform } from "../scripts/build-app.mjs";
import { readFileSync } from "node:fs";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const out = process.argv[2] || "/tmp";
const env = await boot();
await runSeed({ log: () => {} });
await refreshAll({ reason: "teste" }); // grava upstream + resumo do downstream (Linear de mentira)
const admin = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const ana = await env.cookieFor("ana@wearedux.com", "Ana Teste");
const anaId = (await (await call(env.base, "/api/db?c=access", { cookie: admin })).json()).docs;
assert.deepEqual(anaId, []);

// 1) Servidor: quem não tem acesso não recebe nada
{
  const r = await call(env.base, "/api/roadmap-detail", { cookie: ana });
  assert.equal(r.status, 403);
  assert.equal((await call(env.base, "/api/roadmap-detail")).status, 401);
  assert.equal((await call(env.base, "/api/db?c=access", { cookie: ana })).status, 403);
  assert.equal((await call(env.base, "/api/db", { cookie: ana, method: "POST", body: { op: "set", c: "access", id: "u_x", data: { detail: true } } })).status, 403);
  const page = await (await call(env.base, "/", { cookie: ana })).text();
  assert.doesNotMatch(page, /Hoje: plataformas soltas|Onde cada produto é oferecido|Alvo: o canal separado|As três camadas|Week Delivery/);
  const ok = await call(env.base, "/api/roadmap-detail", { cookie: admin });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.match(body.html, /Hoje: plataformas soltas/);
  assert.ok(body.downstream.projects.length >= 1, "resumo do downstream gravado");
  assert.ok(body.upstream.lanes.length >= 1, "raias do upstream");
  // /api/db não expõe a coleção "method"
  assert.equal((await call(env.base, "/api/db?c=method", { cookie: admin })).status, 404);
}
// 2) O build nunca deixa o detalhamento dentro do index.html
{
  const { html, detail } = transform(readFileSync(new URL("../src/cockpit.html", import.meta.url), "utf8"));
  assert.doesNotMatch(html, /Hoje: plataformas soltas|class="rm-matrix"|As três camadas|Week Delivery/);
  assert.match(detail, /class="rm-matrix"/);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
async function open(cookie, hash = "", opts = { viewport: { width: 1280, height: 900 }, colorScheme: "light" }) {
  const ctx = await browser.newContext(opts);
  const [n, v] = cookie.split("=");
  await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
  await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(env.base + "/" + hash, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors };
}

// 3) Sem acesso: botão escondido, link direto não abre
{
  const { ctx, page, errors } = await open(ana, "#detalhamento");
  await page.waitForSelector("#page-roadmap:not([hidden])");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#rmDetailBtn").isVisible(), false);
  assert.equal(await page.locator("#page-roadmap-detail").isVisible(), false);
  assert.equal(await page.locator("#page-roadmap").isVisible(), true);
  assert.equal(await page.locator("#rdPanelProdutos .rm-matrix").count(), 0);
  assert.deepEqual(errors.filter((e) => !/403/.test(e)), []);
  await ctx.close();
}
// 4) Admin: botão, página, abas, voltar
{
  const { ctx, page, errors } = await open(admin);
  await page.waitForSelector("#rmDetailBtn:not([hidden])");
  await page.click("#rmDetailBtn");
  await page.waitForSelector("#page-roadmap-detail:not([hidden])");
  assert.match(page.url(), /#detalhamento$/);
  assert.equal(await page.locator(".tab-btn.active").getAttribute("data-page"), "roadmap");
  // abre na Visão geral (resumo metodológico em três camadas)
  assert.equal(await page.locator("#rdPanelVisao").isVisible(), true);
  const vg = await page.locator("#rdPanelVisao").innerText();
  assert.match(vg, /Estratégica[\s\S]*Tática[\s\S]*Operacional/);
  assert.match(vg, /Business Owner/);
  assert.match(vg, /OKRs/);
  assert.equal(await page.locator("#rdPanelVisao .vg-table tbody tr").count(), 4);
  await page.locator("#page-roadmap-detail").screenshot({ path: `${out}/detalhamento-visao.png` });
  await page.click('.rd-tab[data-rd="produtos"]');
  assert.equal(await page.locator("#rdPanelProdutos").isVisible(), true);
  assert.equal(await page.locator("#rdPanelProdutos figure.rm-fig").count() >= 1, true);
  assert.equal(await page.locator("#rdPanelProdutos .rm-lanes").count(), 0); // a Evolução agora está na página principal
  assert.equal(await page.locator("#rdPanelProdutos .rm-matrix .mp").count(), 6);
  await page.locator("#page-roadmap-detail").screenshot({ path: `${out}/detalhamento-produtos.png` });
  await page.click('.rd-tab[data-rd="metodologia"]');
  assert.equal(await page.locator("#rdPanelMetodologia").isVisible(), true);
  assert.equal(await page.locator("#rdPanelProdutos").isVisible(), false);
  const txt = await page.locator("#rdPanelMetodologia").innerText();
  assert.match(txt, /Plano de upstream/);
  assert.match(txt, /Plano de downstream/);
  assert.ok(await page.locator("#rdPanelMetodologia .mt-step").count() >= 1);
  assert.ok(await page.locator("#rdPanelMetodologia .mt-proj").count() >= 1);
  await page.locator("#page-roadmap-detail").screenshot({ path: `${out}/detalhamento-metodologia.png` });
  await page.click("#rdBack");
  assert.equal(await page.locator("#page-roadmap").isVisible(), true);
  assert.doesNotMatch(page.url(), /#detalhamento/);
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 5) Liberar pela área Admin (UI) → a pessoa passa a ver; revogar → volta a bloquear
{
  const { ctx, page, errors } = await open(admin, "");
  await page.waitForSelector("#adminTabBtn:not([hidden])");
  await page.click("#adminTabBtn");
  const row = page.locator(".person", { hasText: "ana@wearedux.com" });
  await row.waitFor();
  await row.locator("[data-grant-id]").click();
  await page.waitForFunction(() => /liberado/.test(document.querySelector('.person [data-grant-id][data-grant-on="1"]')?.textContent || ""));
  await page.screenshot({ path: `${out}/admin-pessoas-liberado.png` });
  assert.equal((await call(env.base, "/api/roadmap-detail", { cookie: ana })).status, 200);
  {
    const a = await open(ana, "#detalhamento");
    await a.page.waitForSelector("#page-roadmap-detail:not([hidden])");
    assert.equal(await a.page.locator("#rdPanelProdutos .rm-matrix .mp").count(), 6);
    await a.page.click("#rdBack");
    assert.equal(await a.page.locator("#rmDetailBtn").isVisible(), true);
    // pessoa liberada não vê o toggle de Admin
    assert.equal(await a.page.locator("#adminTabBtn").isVisible(), false);
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  }
  await row.locator("[data-grant-id]").click();
  await page.waitForFunction(() => document.querySelector('.person [data-grant-id][data-grant-on="0"]'));
  assert.equal((await call(env.base, "/api/roadmap-detail", { cookie: ana })).status, 403);
  assert.deepEqual(errors, []);
  await ctx.close();
}
await browser.close();
await env.close?.();
console.log("e2e-detail ok");
