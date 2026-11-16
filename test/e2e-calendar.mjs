// Sub-aba "Calendário" dentro do Roadmap de Produtos: abre pela sub-aba e por #calendario, mostra Risco Sacado e Decentral com período tracejado,
// checkpoints e status do dia (relógio fixo em 16/11/2026), navega entre meses e não estoura a largura no celular.
// Uso: node test/e2e-calendar.mjs [pasta-de-capturas]
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
async function open(opts, hash = "", now = "2026-11-16T12:00:00-03:00") {
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
  await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(now) });
  await page.goto(env.base + "/" + hash, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors };
}

// 1) pela aba, dia 16/11: status, barras, checkpoints, navegação
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await page.waitForSelector('.rm-sub-btn[data-rmsub="calendar"]');
  // não é uma aba de topo: o menu continua com as mesmas abas e o Roadmap abre na sub-aba "Roadmap"
  assert.deepEqual(await page.$$eval(".tabs > *", (els) => els.map((e) => e.getAttribute("data-page") || (e.classList.contains("nav-ext") ? "ext" : "admin"))), ["roadmap", "projects", "tools", "upstream", "ext", "admin"]);
  assert.deepEqual(await page.$$eval(".rm-sub-btn", (els) => els.map((e) => e.textContent.trim())), ["Roadmap", "Calendário"]);
  assert.equal(await page.locator("#rmPanelRoadmap").isVisible(), true);
  assert.equal(await page.locator("#rmPanelCalendar").isVisible(), false);
  await page.click('.rm-sub-btn[data-rmsub="calendar"]');
  assert.equal(await page.locator("#rmPanelCalendar").isVisible(), true);
  assert.equal(await page.locator("#rmPanelRoadmap").isVisible(), false);
  assert.match(page.url(), /#calendario$/);
  assert.equal(await page.locator('.tab-btn.active').getAttribute("data-page"), "roadmap");
  assert.equal(await page.locator('.rm-sub-btn.active').innerText(), "Calendário");
  // cartões de status
  const cards = await page.locator("#calNow .cal-card").allInnerTexts();
  assert.equal(cards.length, 2);
  assert.match(cards[0], /Risco Sacado[\s\S]*dia 1 de 15[\s\S]*faltam 14 dias[\s\S]*20 operações[\s\S]*01\/12/);
  assert.match(cards[1], /Decentral[\s\S]*dia 1 de 21[\s\S]*faltam 20 dias[\s\S]*3 semanas[\s\S]*07\/12/);
  // calendário: dois meses (nov + dez), hoje destacado, uma barra tracejada e um checkpoint por produto
  assert.match(await page.locator("#calTitle").innerText(), /novembro e dezembro de 2026/i);
  assert.equal(await page.locator("#calGrid .cal-dh").count(), 61);
  assert.equal(await page.locator("#calGrid .cal-dh.today").innerText().then((t) => t.replace(/\s+/g, " ").trim()), "S 16");
  assert.equal(await page.locator("#calGrid .cal-span").count(), 2);
  assert.equal(await page.locator("#calGrid .cal-ck").count(), 2);
  const style = await page.locator("#calGrid .cal-span").first().evaluate((e) => getComputedStyle(e).borderTopStyle);
  assert.equal(style, "dashed");
  // as barras começam no dia 16 e terminam em 30/11 (Sacado) e 06/12 (Decentral)
  const cols = await page.$$eval("#calGrid .cal-span", (els) => els.map((e) => e.style.gridColumn));
  assert.deepEqual(cols, ["17 / 32", "17 / 38"]);
  assert.equal((await page.locator("#calGrid .cal-ck").allInnerTexts()).join("|"), "01/12 · Revisar meta de 20 operações|07/12 · Fim das 3 semanas");
  await page.locator("#page-roadmap").screenshot({ path: `${out}/calendario-light.png` });
  // navegação: próximo mês corta as barras no início (◀) e Hoje volta
  await page.click("#calNext");
  assert.match(await page.locator("#calTitle").innerText(), /dezembro e janeiro de 2026–2027/i);
  assert.match(await page.locator("#calGrid .cal-span").first().innerText(), /^◀/);
  await page.click("#calPrev"); await page.click("#calPrev"); await page.click("#calPrev");
  assert.equal(await page.locator("#calGrid .cal-span").count(), 0);
  await page.click("#calToday");
  assert.match(await page.locator("#calTitle").innerText(), /novembro e dezembro/i);
  // voltar para a sub-aba Roadmap limpa o hash; ir para outra aba esconde o calendário
  await page.click('.rm-sub-btn[data-rmsub="roadmap"]');
  assert.equal(await page.locator("#rmPanelRoadmap").isVisible(), true);
  assert.doesNotMatch(page.url(), /#/);
  assert.equal(await page.locator("#page-roadmap .rm-lanes .rm-rowhead").count(), 8);
  await page.click('.rm-sub-btn[data-rmsub="calendar"]');
  await page.click('.tab-btn[data-page="projects"]');
  assert.equal(await page.locator("#page-roadmap").isVisible(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 2) link direto + escuro + dia 20/11 (meio do piloto) e depois do fim
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, "#calendario", "2026-11-20T09:00:00-03:00");
  await page.waitForSelector("#rmPanelCalendar:not([hidden])");
  const cards = await page.locator("#calNow .cal-card").allInnerTexts();
  assert.match(cards[0], /dia 5 de 15[\s\S]*faltam 10 dias/);
  assert.match(cards[1], /dia 5 de 21[\s\S]*faltam 16 dias/);
  await page.locator("#page-roadmap").screenshot({ path: `${out}/calendario-dark.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, "#calendario", "2026-12-08T09:00:00-03:00");
  await page.waitForSelector("#rmPanelCalendar:not([hidden])");
  const cards = await page.locator("#calNow .cal-card").allInnerTexts();
  assert.match(cards[0], /Período encerrado em 30\/11[\s\S]*Sem checkpoint pela frente/);
  assert.match(cards[1], /Período encerrado em 06\/12/);
  assert.deepEqual(errors, []);
  await ctx.close();
}
// 3) celular: a página não rola de lado (só o calendário, dentro do próprio contêiner)
{
  const { ctx, page, errors } = await open({ viewport: { width: 400, height: 800 }, colorScheme: "light" }, "#calendario");
  await page.waitForSelector("#rmPanelCalendar:not([hidden])");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, `rolagem horizontal da página: ${over}px`);
  await page.screenshot({ path: `${out}/calendario-mobile.png`, fullPage: false });
  assert.deepEqual(errors, []);
  await ctx.close();
}
await browser.close();
await env.close?.();
console.log("e2e-calendar ok");
