// Teste ponta a ponta no navegador (Playwright), com Linear de mentira e store em memória:
//   login por cookie → página já vem com dados ao vivo → webhook muda o painel sem recarregar →
//   reportar inovação pela tela → aparece na aba "Inovações reportadas" → fechamento semanal aparece no histórico.
// Rodar:  node test/e2e.mjs   (precisa do Playwright: npm i -D playwright, ou o global)
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";
import { refreshAll } from "../lib/linear.js";
import { execFileSync } from "node:child_process";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g").toString().trim();
  return createRequire(root + "/").call ? createRequire(root + "/")("playwright") : null;
}
execFileSync("node", ["scripts/build-app.mjs"], { stdio: "inherit" });

const { chromium } = await loadPlaywright();
const env = await boot();
await runSeed({ log: () => {} });
await refreshAll({ reason: "e2e" });
const cookie = await env.cookieFor("ana@wearedux.com", "Ana Teste");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const [name, value] = cookie.split("=");
await ctx.addCookies([{ name, value: decodeURIComponent(value), url: env.base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("dialog", (d) => { errors.push("dialog: " + d.message()); d.dismiss(); });

let step = 0;
const ok = (msg) => console.log(`✔ ${++step}. ${msg}`);

await page.goto(env.base + "/");
await page.waitForSelector(".tab-btn");
ok("página carrega logada");

// 1) blocos do Linear já vêm renderizados
const html0 = await page.content();
assert.match(html0, /Piloto Risco Sacado/);
ok("bloco de milestones do Linear presente no primeiro carregamento");

// 2) webhook → painel muda sem recarregar
const before = await page.locator("#page-projects").innerText();
env.mock.setStatus("DUX-572", "Done / In Prod");
const raw = JSON.stringify({ type: "Issue", action: "update", webhookTimestamp: Date.now() });
const hr = await fetch(env.base + "/api/linear-webhook", { method: "POST", headers: { "linear-signature": crypto.createHmac("sha256", "whsec_teste").update(raw).digest("hex"), "content-type": "application/json" }, body: raw });
assert.equal(hr.status, 202);
await page.waitForFunction((prev) => document.querySelector("#page-projects").innerText !== prev, before, { timeout: 15000 });
ok("webhook do Linear atualiza o painel aberto, sem recarregar a página");

// 3) sub-abas do levantamento
await page.click('.tab-btn[data-page="tools"]');
assert.equal(await page.locator("#subpanel-portal").isVisible(), true);
assert.equal(await page.locator("#subpanel-inovacoes").isVisible(), false);
await page.click('[data-subtab="inovacoes"]');
assert.equal(await page.locator("#subpanel-inovacoes").isVisible(), true);
ok("sub-abas Portal DUX / Ferramentas reportadas / Inovações reportadas");

// dados migrados aparecem
await page.waitForFunction(() => document.querySelectorAll("#reportedInnovationsBody [data-detail-innov-idx]").length >= 10, null, { timeout: 15000 });
ok("10 inovações migradas aparecem na aba de inovações");
await page.click('[data-subtab="ferramentas"]');
await page.waitForFunction(() => document.querySelectorAll("#reportedToolsBody [data-detail-tool-idx]").length >= 15, null, { timeout: 15000 });
ok("15 ferramentas migradas aparecem na aba de ferramentas");

// print migrado abre pelo /_blob
await page.locator("#reportedToolsBody [data-detail-tool-idx]").first().click();
const withPrint = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll("#detailModalBody img.detail-media-img")];
  return imgs.length;
});
if (withPrint) {
  await page.waitForFunction(() => { const i = document.querySelector("#detailModalBody img.detail-media-img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  ok("print anexado carrega pelo domínio de produção");
}
await page.click('[data-close-modal="detailModalOverlay"]');

// 4) reportar inovação pela tela
await page.click('[data-subtab="inovacoes"]');
await page.click("#openReportInnovationBtn");
await page.fill("#innovationPaste", "===== COLE ISTO NO PORTAL DUX =====\nÁREA: Financeiro\n--- INOVAÇÃO 1 ---\nTÍTULO: Teste E2E de conciliação\nDESCRIÇÃO: Concilia extratos\nFREQUÊNCIA: Diária\nESCOPO: Operacional\nRESUMO: Texto completo do fluxo de teste.\n===== FIM =====");
await page.click("#innovationSubmitBtn");
await page.waitForFunction(() => document.querySelectorAll("#reportedInnovationsBody [data-detail-innov-idx]").length >= 11, null, { timeout: 15000 });
ok("inovação reportada pela tela aparece na lista");
const saved = await (await fetch(env.base + "/api/db?c=innovations", { headers: { cookie } })).json();
const mine = saved.docs.find((d) => d.data.titulo === "Teste E2E de conciliação");
assert.ok(mine && mine.data.submittedById && mine.data.submittedById.startsWith("u_"));
ok("inovação gravada no banco de produção com o autor da sessão");

// 5) fechamento semanal aparece no histórico (navegação temporal só lá)
const cr = await fetch(env.base + "/api/closing", { headers: { authorization: "Bearer cron_teste" } }).then((r) => r.json());
assert.ok(cr.ok || cr.skipped);
await page.click('.tab-btn[data-page="projects"]');
await page.waitForFunction(() => document.getElementById("weekValue").textContent.length > 3, null, { timeout: 15000 });
const wk = await page.locator("#weekValue").innerText();
ok(`histórico semanal visível (${wk})`);

// 6) admin-only: aba admin escondida para não-admin
assert.equal(await page.locator("#adminTabBtn").isHidden(), true);
ok("aba admin/Upstream escondida para quem não é admin");

assert.deepEqual(errors, []);
ok("nenhum erro de JavaScript nem diálogo do navegador");
await browser.close();
await env.close();
console.log("\nE2E OK");
