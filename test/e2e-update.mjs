// Botão "Update" (Painel de Projetos + Upstream): força /api/refresh, mostra resultado e erro, sem recarregar a página.
// Uso: node test/e2e-update.mjs [captura.png]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";
import { store } from "../lib/store.js";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const env = await boot();
await runSeed({ log: () => {} });
// já existe uma sincronização anterior (senão o Admin dispara a primeira sozinho)
await store.set("live:meta", JSON.stringify({ syncedAt: new Date(Date.now() - 3600e3).toISOString(), warnings: [] }));
await store.incr("ver:live");
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const [n, v] = cookie.split("=");
await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let mode = "ok", calls = 0, navs = 0;
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });
await page.route("**/api/refresh", async (r) => {
  calls++;
  await new Promise((ok) => setTimeout(ok, 400));
  if (mode === "ok") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, syncedAt: new Date().toISOString(), summary: { a: { issues: 40 }, b: { issues: 12 } }, upstream: { issues: 9 }, warnings: [] }) });
  if (mode === "skipped") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ skipped: true }) });
  return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "LINEAR_API_KEY ausente" }) });
});
await page.goto(env.base + "/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => [...document.querySelectorAll("[data-update]")].every((b) => !b.hidden), null, { timeout: 15000 });
assert.equal(await page.locator("[data-update]").count(), 2, "um botão no painel e um no Upstream");
const startNavs = navs;

// 1) painel de projetos: sucesso
await page.click("#page-projects [data-update]");
assert.match(await page.locator("#page-projects [data-update] .lbl").textContent(), /Atualizando/);
await page.waitForFunction(() => /Atualizado agora/.test(document.querySelector("#page-projects [data-update-msg]").textContent), null, { timeout: 10000 });
const okMsg = await page.locator("#page-projects [data-update-msg]").textContent();
assert.match(okMsg, /52 tasks dos projetos, 9 no Upstream/);
assert.match(await page.locator("#page-projects [data-update] .lbl").textContent(), /^Update$/);
await page.locator("#page-projects .section-head").screenshot({ path: process.argv[2] || "/tmp/update-head.png" });

// 2) Upstream (aba admin): erro mostra o motivo e reabilita o botão
mode = "err";
await page.evaluate(() => window.__cockpitShowPage && window.__cockpitShowPage("upstream"));
await page.waitForSelector("#page-upstream:not([hidden])");
await page.click("#page-upstream [data-update]");
await page.waitForFunction(() => /Não foi possível/.test(document.querySelector("#page-upstream [data-update-msg]").textContent), null, { timeout: 10000 });
const errMsg = await page.locator("#page-upstream [data-update-msg]").textContent();
assert.match(errMsg, /LINEAR_API_KEY/);
assert.equal(await page.locator("#page-upstream [data-update]").isDisabled(), false);
await page.locator("#page-upstream .section-head").screenshot({ path: (process.argv[2] || "/tmp/update-head.png").replace(/\.png$/, "-up.png") });

assert.equal(calls, 2);
assert.equal(navs, startNavs, "não recarrega a página");
assert.deepEqual(errors, []);
await browser.close(); await env.close?.();
console.log("botão Update OK");
process.exit(0);
