// Painel de Projetos (v58): topo com última atualização, macro do milestone, execução/teste em destaque, faltam entregar/produção recolhidos.
// Uso: node test/e2e-painel.mjs [captura.png]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const env = await boot();
await runSeed({ log: () => {} });
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const [n, v] = cookie.split("=");
await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(env.base + "/#projetos", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#page-projects .grid > .card .ms");

const card = page.locator("#page-projects .grid > .card", { has: page.locator("h2", { hasText: "Anti Sacado" }) });
// 1) topo: última atualização ao lado de pessoas/objetivos
assert.match(await card.locator(".card-top-r .upd-head").textContent(), /Última atualização/);
assert.ok((await card.locator(".card-top-r .upd-title").textContent()).length > 3, "título da atualização");
assert.ok((await card.locator(".card-top-r .upd-body li").count()) > 1, "itens da atualização");
assert.equal(await card.locator(".card-top-l .people").count(), 1);
// 2) ordem vertical: macro (%, barra, métricas) → em destaque → recolhidos
const y = async (sel) => (await card.locator(sel).first().boundingBox()).y;
const ys = [await y(".ms-top"), await y(".ms-metrics"), await y(".ms-hot"), await y(".ms-cold")];
assert.deepEqual([...ys].sort((a, b) => a - b), ys, "ordem: milestone → métricas → execução/teste → recolhidos");
assert.ok(await y(".ms-top") > (await y(".card-top")), "milestone vem depois do topo");
// 3) métricas: contadores por etapa, área e tipo
assert.ok((await card.locator(".ms-stat").count()) >= 3);
assert.equal(await card.locator(".ms-chiprow .chip").count(), 4);
assert.equal(await card.locator(".ms-chiprow .tchip").count(), 4);
// 4) execução e teste sempre abertos; faltam entregar e produção recolhidos e expansíveis
assert.equal(await card.locator(".ms-hot .col.progress .task").first().isVisible(), true);
const prod = card.locator("details.cold.done");
assert.equal(await prod.evaluate((d) => d.open), false);
assert.equal(await prod.locator(".task").first().isVisible(), false, "produção recolhida");
await prod.locator("summary").click();
assert.equal(await prod.locator(".task").first().isVisible(), true, "produção abre ao clicar");
// 5) projeto sem milestone em execução continua legível
const bank = page.locator("#page-projects .grid > .card", { has: page.locator("h2", { hasText: "Anti Banking" }) });
assert.match(await bank.locator(".ms-empty").textContent(), /Nenhum milestone em execução/);
assert.match(await bank.locator(".card-top-r").textContent(), /Última atualização/);
await card.screenshot({ path: process.argv[2] || "/tmp/painel-card.png" });
assert.deepEqual(errors, []);
await browser.close(); await env.close?.();
console.log("e2e-painel ok");
process.exit(0);
