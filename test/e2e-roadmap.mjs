// Página "Roadmap de Produtos": abre pela aba e por #roadmap, mostra os 4 blocos e não estoura a largura no celular.
// Uso: node test/e2e-roadmap.mjs [pasta-de-capturas]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const out = process.argv[2] || "/tmp";
const env = await boot();
await runSeed({ log: () => {} });
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const [n, v] = cookie.split("=");
async function open(opts, hash = "") {
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
  await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(env.base + "/" + hash, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors };
}

// 1) pela aba
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await page.waitForSelector('.tab-btn[data-page="roadmap"]');
  // abre direto no Roadmap, que é a primeira aba
  assert.equal(await page.locator("#page-roadmap").isVisible(), true);
  assert.equal(await page.locator("#page-projects").isVisible(), false);
  assert.deepEqual(await page.$$eval(".tabs > *", (els) => els.map((e) => e.getAttribute("data-page") || (e.classList.contains("nav-ext") ? "ext" : "admin"))), ["roadmap", "projects", "tools", "upstream", "ext", "admin"]);
  assert.equal(await page.locator('.tab-btn.active').getAttribute("data-page"), "roadmap");
  await page.click('.tab-btn[data-page="projects"]');
  assert.equal(await page.locator("#page-projects").isVisible(), true);
  assert.match(page.url(), /#projetos$/);
  await page.click('.tab-btn[data-page="roadmap"]');
  assert.equal(await page.locator("#page-roadmap").isVisible(), true);
  // página principal: 1. Evolução de cada produto (tabela) e 2. Estratégia de produto (8 cards); o resto fica no Detalhamento
  assert.equal(await page.locator("#page-roadmap .rm-lanes .rm-rowhead").count(), 8);
  assert.equal(await page.locator("#page-roadmap .rm-card").count(), 8);
  assert.equal(await page.locator("#page-roadmap figure.rm-fig").count(), 0);
  assert.equal(await page.locator("#page-roadmap .rm-matrix").count(), 0);
  const lanes = await page.locator("#page-roadmap .rm-lanes").innerText();
  // AdSense: estudo hoje → piloto do NWB no Q4 (Onda 1) → produtização (Onda 2)
  assert.match(lanes, /Estudo de viabilidade[\s\S]*Piloto do NWB, para destravar um negócio atual[\s\S]*Produtização/);
  // Gestão de caixa entra no Q4 (Onda 1) e a célula da Onda 2 fica vazia; Abertura de conta no Q1 = modelagem de negócio
  const row = async (name) => page.locator("#page-roadmap .rm-lanes .rm-rowhead", { hasText: name }).evaluate((h) => [1, 2, 3, 4].map((n) => h.parentElement.children[[...h.parentElement.children].indexOf(h) + n].textContent.trim()));
  const caixa = await row("Gestão de caixa");
  assert.match(caixa[1], /Vira ferramenta separada/); assert.equal(caixa[2], "·");
  assert.match((await row("Abertura de conta"))[2], /Modelagem de negócio/);
  assert.deepEqual(await page.$$eval("#page-roadmap .rm-h3", (els) => els.map((e) => e.textContent)), ["1. Evolução de cada produto", "2. Estratégia de produto"]);
  assert.equal(await page.locator("#rmDetailBtn").isVisible(), true); // admin
  assert.doesNotMatch(page.url(), /#/);
  await page.locator("#page-roadmap").screenshot({ path: `${out}/roadmap-light.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 2) link direto + escuro
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, "#roadmap");
  await page.waitForSelector("#page-roadmap:not([hidden])");
  await page.locator("#page-roadmap").screenshot({ path: `${out}/roadmap-dark.png` });
  await page.screenshot({ path: `${out}/nav-dark.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } });
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 3) celular: a página não rola de lado (só os diagramas, dentro do próprio contêiner)
{
  const { ctx, page, errors } = await open({ viewport: { width: 400, height: 800 }, colorScheme: "light" }, "#roadmap");
  await page.waitForSelector("#page-roadmap:not([hidden])");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, `rolagem horizontal da página: ${over}px`);
  await page.screenshot({ path: `${out}/roadmap-mobile.png`, fullPage: false });
  assert.deepEqual(errors, []);
  await ctx.close();
}
await browser.close();
await env.close?.();
console.log("e2e-roadmap ok");
