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
  await page.click('.tab-btn[data-page="roadmap"]');
  assert.equal(await page.locator("#page-roadmap").isVisible(), true);
  assert.equal(await page.locator("#page-projects").isVisible(), false);
  assert.equal(await page.locator("#page-roadmap figure.rm-fig").count(), 2);
  assert.equal(await page.locator("#page-roadmap .rm-lanes .rm-rowhead").count(), 6);
  assert.equal(await page.locator("#page-roadmap .rm-matrix .mp").count(), 6);
  assert.match(page.url(), /#roadmap$/);
  await page.locator("#page-roadmap").screenshot({ path: `${out}/roadmap-light.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 2) link direto + escuro
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, "#roadmap");
  await page.waitForSelector("#page-roadmap:not([hidden])");
  await page.locator("#page-roadmap").screenshot({ path: `${out}/roadmap-dark.png` });
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
