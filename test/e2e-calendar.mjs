// Sub-aba "Calendário" dentro do Roadmap de Produtos: visão mensal, períodos tracejados, marcos do Linear coloridos pela saúde, cartões e tela cheia (relógio fixo em 24/11/2026).
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
async function open(opts, hash = "", now = "2026-11-24T12:00:00-03:00") {
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

// 1) pela sub-aba, dia 24/11: cartões, mês, barras, marcos coloridos, navegação, expandir
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await page.waitForSelector('.rm-sub-btn[data-rmsub="calendar"]');
  // não é uma aba de topo: o menu continua com as mesmas abas e o Roadmap abre na sub-aba "Roadmap"
  assert.deepEqual(await page.$$eval(".tabs > *", (els) => els.map((e) => e.getAttribute("data-page") || (e.classList.contains("nav-ext") ? "ext" : "admin"))), ["roadmap", "projects", "tools", "upstream", "ext", "admin"]);
  assert.deepEqual(await page.$$eval(".rm-sub-btn", (els) => els.map((e) => e.textContent.trim())), ["Roadmap", "Calendário"]);
  assert.equal(await page.locator("#rmPanelCalendar").isVisible(), false);
  await page.click('.rm-sub-btn[data-rmsub="calendar"]');
  assert.equal(await page.locator("#rmPanelCalendar").isVisible(), true);
  assert.equal(await page.locator("#rmPanelRoadmap").isVisible(), false);
  assert.match(page.url(), /#calendario$/);
  assert.equal(await page.locator('.tab-btn.active').getAttribute("data-page"), "roadmap");
  // cartões expansíveis: resumo do dia do período e, ao abrir, os marcos do Linear com a saúde
  const cards = await page.locator("#calNow details.cal-card").allInnerTexts();
  assert.equal(cards.length, 2);
  assert.match(cards[0], /Risco Sacado[\s\S]*dia 9 de 15[\s\S]*faltam 6 dias[\s\S]*Próximo marco: 30\/11, Validar as primeiras 20 operações na plataforma\s+At risk/);
  assert.match(cards[1], /Decentral[\s\S]*dia 9 de 21[\s\S]*faltam 12 dias[\s\S]*Próximo marco: 30\/11, Lançamento público\s+At risk/);
  assert.equal(await page.locator("#calNow details[open]").count(), 0);
  await page.locator("#calNow details summary").first().click();
  assert.equal(await page.locator("#calNow details[open]").count(), 1);
  const first = await page.locator("#calNow details").first().innerText();
  assert.match(first, /Última atualização no Linear:\s+On track em 16\/11/);
  assert.match(first, /Completed|On track|At risk|Off track/);
  assert.match(first, /Piloto Risco Sacado- Cliente 1[\s\S]*28\/09 · 81%/);
  assert.equal(await page.locator("#calNow details a.cal-link").first().getAttribute("href"), "https://linear.app/wearedux/project/portal-anti-web-sacado-e8791924463f");
  // visão mensal: novembro de 2026, 5 semanas, hoje destacado
  assert.equal(await page.locator("#calTitle").innerText(), "Novembro de 2026");
  assert.equal(await page.locator("#calMonth .cal-wk").count(), 5);
  assert.equal(await page.locator("#calMonth .cal-day").count(), 35);
  assert.equal((await page.locator("#calMonth .cal-day.today").innerText()).trim(), "24");
  // barras tracejadas por semana (Sacado e Decentral: 3 semanas cada) e marcos coloridos pela saúde
  assert.equal(await page.locator("#calMonth .cal-bar-ev").count(), 6);
  assert.equal(await page.locator("#calMonth .cal-bar-ev").first().evaluate((e) => getComputedStyle(e).borderTopStyle), "dashed");
  const ev = await page.$$eval("#calMonth .cal-ev", (els) => els.map((e) => e.className.match(/cal-h-(\w+)/)[1] + ":" + e.textContent.replace(/\s+/g, " ").trim()));
  assert.deepEqual(ev.sort(), [
    "off:Off trackLançamento privado",
    "risk:At riskLançamento público",
    "risk:At riskValidar as primeiras 20 operações na plataforma",
    "risk:At riskPlano de expansão", // 01/12 aparece na última semana de novembro
  ].sort());
  const colors = await page.$$eval("#calMonth .cal-ev", (els) => els.map((e) => getComputedStyle(e).borderLeftColor));
  assert.equal(new Set(colors).size, 2); // off track (vermelho) e at risk (âmbar)
  await page.locator("#page-roadmap").screenshot({ path: `${out}/calendario-light.png` });
  // navegação: dezembro tem o Plano de expansão (At risk) e as barras que continuam
  await page.click("#calNext");
  assert.equal(await page.locator("#calTitle").innerText(), "Dezembro de 2026");
  assert.match(await page.locator("#calMonth").innerText(), /Plano de expansão/);
  assert.match(await page.locator("#calMonth .cal-bar-ev").first().innerText(), /^◀/);
  await page.click("#calPrev"); await page.click("#calPrev");
  assert.equal(await page.locator("#calTitle").innerText(), "Outubro de 2026");
  assert.equal(await page.locator("#calMonth .cal-bar-ev").count(), 0);
  await page.click("#calPrev");
  assert.equal(await page.locator("#calTitle").innerText(), "Setembro de 2026");
  assert.match(await page.locator("#calMonth .cal-ev").first().innerText(), /off track\s*Piloto Risco Sacado- Cliente 1/i); // 28/09, meta que passou
  await page.click("#calToday");
  assert.equal(await page.locator("#calTitle").innerText(), "Novembro de 2026");
  // expandir: tela cheia, Esc recolhe
  assert.equal(await page.locator("#calBox.expanded").count(), 0);
  await page.click("#calExpand");
  assert.equal(await page.locator("#calBox.expanded").count(), 1);
  assert.equal(await page.locator("#calExpand").innerText(), "Recolher");
  const box = await page.locator("#calBox").boundingBox();
  assert.ok(box.width >= 1270 && box.height >= 890, `expandido deve ocupar a tela: ${JSON.stringify(box)}`);
  await page.screenshot({ path: `${out}/calendario-expandido.png` });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#calBox.expanded").count(), 0);
  assert.equal(await page.locator("#calExpand").innerText(), "Expandir");
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
// 2) link direto + escuro; dia 30/11 (fim do piloto) e 08/12 (depois)
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, "#calendario");
  await page.waitForSelector("#rmPanelCalendar:not([hidden])");
  await page.locator("#calNow details summary").first().click();
  await page.locator("#page-roadmap").screenshot({ path: `${out}/calendario-dark.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, "#calendario", "2026-12-08T09:00:00-03:00");
  await page.waitForSelector("#rmPanelCalendar:not([hidden])");
  const cards = await page.locator("#calNow details.cal-card").allInnerTexts();
  assert.match(cards[0], /Período encerrado em 30\/11/);
  assert.match(cards[0], /Sem marco pela frente/); // o plano de expansão (01/12) já passou
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
