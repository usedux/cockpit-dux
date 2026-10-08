// Cenário real do primeiro acesso: Vercel com banco vazio → admin entra → importação automática → listas e pessoas aparecem.
// Uso: node test/e2e-seed.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { refreshAll } from "../lib/linear.js";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const env = await boot();
await refreshAll({ reason: "e2e-seed" }); // Linear já sincronizado, mas SEM importar os dados do Artifact
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const [n, v] = cookie.split("=");
await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(env.base + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#adminTabBtn:not([hidden])");
// a importação automática recarrega a página; esperamos o segundo carregamento já com dados
await page.waitForFunction(() => /Importado:|Última importação/.test(document.getElementById("adminSeedText")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(3000);
await page.waitForSelector("#adminTabBtn:not([hidden])");
await page.click("#adminTabBtn");
await page.waitForFunction(() => document.getElementById("adminStatInnov")?.textContent === "10", null, { timeout: 15000 });
const stats = await page.evaluate(() => ({ people: document.getElementById("adminStatPeople").textContent, reports: document.getElementById("adminStatReports").textContent, innov: document.getElementById("adminStatInnov").textContent, seed: document.getElementById("adminSeedText").textContent }));
console.log(stats);
assert.equal(stats.reports, "15");
assert.equal(stats.innov, "10");
assert.ok(Number(stats.people) >= 4, "lista de pessoas deve incluir quem reportou na versão anterior");
const peopleText = await page.locator("#adminPeopleBody").innerText();
assert.match(peopleText, /Lucas Albino/);
assert.match(peopleText, /Ainda não entrou/);
// associar e-mail a um autor antigo pela tela
const row = page.locator(".person", { hasText: "Lucas Albino" }).first();
await row.locator("input[type=email]").fill("lucas.albino@wearedux.com");
await row.locator("button[type=submit]").click();
await page.waitForFunction(() => /lucas\.albino@wearedux\.com/.test(document.getElementById("adminPeopleBody")?.innerText || ""), null, { timeout: 20000 });
const afterLink = await page.locator(".person", { hasText: "Lucas Albino" }).first().innerText();
assert.match(afterLink, /lucas\.albino@wearedux\.com/);
assert.doesNotMatch(afterLink, /Ainda não entrou/);
console.log("associação por e-mail OK");
// listas públicas também
await page.click('.tab-btn[data-page="tools"]');
await page.click('[data-subtab="inovacoes"]');
await page.waitForFunction(() => document.querySelectorAll("#reportedInnovationsBody [data-detail-innov-idx]").length === 10);
await page.click('[data-subtab="ferramentas"]');
await page.waitForFunction(() => document.querySelectorAll("#reportedToolsBody [data-detail-tool-idx]").length >= 15, null, { timeout: 15000 }).catch(async () => { console.log("tools rows:", await page.evaluate(() => document.querySelectorAll("#reportedToolsBody [data-detail-tool-idx]").length), await page.locator("#reportedToolsBody").innerText().then((t) => t.slice(0, 200))); throw new Error("lista de ferramentas incompleta"); });
console.log("linhas de ferramentas:", await page.evaluate(() => document.querySelectorAll("#reportedToolsBody [data-detail-tool-idx]").length));
assert.deepEqual(errors, []);
console.log("E2E SEED OK");
await browser.close(); await env.close();
