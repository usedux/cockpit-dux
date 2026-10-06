import test from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs";
import { weekOf, computeWeekStats, buildBurndownSvg, deterministicNarrative, areaOf, isOpenOnDay } from "../lib/closing.js";

test("weekOf: semana segunda–sexta em BRT, rótulo igual ao da página", () => {
  assert.equal(weekOf(new Date("2026-10-02T21:00:00Z")).label, "28 SET — 02 OUT 2026"); // sexta 18h BRT
  assert.equal(weekOf(new Date("2026-09-30T12:00:00Z")).label, "28 SET — 02 OUT 2026");
  assert.equal(weekOf(new Date("2026-09-21T12:00:00Z")).label, "21 — 25 SET 2026");
  // domingo 22h BRT ainda é a semana anterior; segunda 00:30 BRT já é a nova
  assert.equal(weekOf(new Date("2026-10-05T01:00:00Z")).label, "28 SET — 02 OUT 2026");
  assert.equal(weekOf(new Date("2026-10-05T03:30:00Z")).label, "05 — 09 OUT 2026");
  const w = weekOf(new Date("2026-10-02T21:00:00Z"));
  assert.equal(w.startYmd, "2026-09-28");
  assert.equal(w.endYmd, "2026-10-02");
  assert.equal(w.start.toISOString(), "2026-09-28T03:00:00.000Z");
  assert.equal(w.days[4].end.toISOString(), "2026-10-03T02:59:59.999Z");
});

test("areaOf segue a prioridade Marketing > Financeiro > Operações > Sem área", () => {
  assert.equal(areaOf({ labels: ["Operação", "Marketing"] }), "Marketing");
  assert.equal(areaOf({ labels: ["Financeiro", "Operações"] }), "Financeiro");
  assert.equal(areaOf({ labels: ["Operação"] }), "Operações");
  assert.equal(areaOf({ labels: ["Bug"] }), "Sem área");
});

const week = weekOf(new Date("2026-10-02T21:00:00Z"));
const T = (d) => `2026-${d}`;
const data = {
  "anti-sacado": {
    milestones: [{ id: "m1", name: "Piloto", progress: 50 }],
    issues: [
      { id: "DUX-1", title: "a", status: "Done / In Prod", statusType: "completed", assignee: "Guilherme Zaidan", labels: ["Operação"], milestoneId: "m1", createdAt: T("09-20T12:00:00Z"), completedAt: T("09-30T15:00:00Z") },
      { id: "DUX-2", title: "b", status: "In Progress", assignee: "Lucas Henning", labels: ["Marketing"], milestoneId: "m1", createdAt: T("09-29T12:00:00Z"), completedAt: null },
      { id: "DUX-3", title: "fora de milestone", status: "Backlog", labels: [], milestoneId: null, createdAt: T("09-29T12:00:00Z"), completedAt: null },
      { id: "DUX-4", title: "cancelada", status: "Canceled", statusType: "canceled", labels: [], milestoneId: "m1", createdAt: T("09-29T12:00:00Z"), completedAt: null },
      { id: "DUX-5", title: "antiga concluída antes da semana", status: "Done / In Prod", labels: [], milestoneId: "m1", createdAt: T("09-01T12:00:00Z"), completedAt: T("09-10T12:00:00Z") },
    ],
  },
};

test("computeWeekStats: só tasks de milestone, sem canceladas; criadas/concluídas e burndown por dia", () => {
  const s = computeWeekStats(data, week);
  assert.equal(s.tasksCriadas, 1);      // DUX-2
  assert.equal(s.tasksConcluidas, 1);   // DUX-1
  assert.equal(s.totalAtualizacoes, 2);
  assert.equal(s.porArea["Operações"].concluidas, 1);
  assert.equal(s.porArea.Marketing.criadas, 1);
  assert.deepEqual(s.topEntregas, [{ nome: "Zaidan", qtd: 1 }]);
  // seg 28: DUX-1 aberta (criada 20/09, concluída 30/09) → 1 ; ter 29: DUX-1 + DUX-2 → 2 ; qua 30 (concluída às 15h UTC = 12h BRT): DUX-2 → 1
  assert.deepEqual(s.abertasPorDiaTotal, [1, 2, 1, 1, 1]);
  assert.equal(s.milestones[0].concluidas, 2);
});

test("blockers abertos entram no resumo só enquanto a task está aberta", () => {
  const s = computeWeekStats({ "anti-banking": { milestones: [{ id: "m", name: "M", progress: 0 }], issues: [{ id: "DUX-523", title: "x", status: "In Progress", labels: [], milestoneId: "m", createdAt: T("09-20T00:00:00Z"), completedAt: null }] } }, week);
  assert.equal(s.blockersAbertos.length, 1);
  assert.equal(s.blockersAbertos[0].id, "DUX-523");
});

test("burndown SVG e texto padrão (sem IA) saem coerentes", () => {
  const s = computeWeekStats(data, week);
  const svg = buildBurndownSvg(week, s);
  assert.match(svg, /<svg[^>]*viewBox/);
  assert.match(svg, /SEG/); assert.match(svg, /SEX/);
  assert.match(svg, /Anti Sacado/);
  const n = deterministicNarrative(s);
  assert.ok(n.highlights.length >= 2 && n.suggestions.length >= 1);
  assert.match(n.highlights[0], /1 task\(s\) de milestones concluída/);
});

test("isOpenOnDay respeita criação e conclusão", () => {
  const eod = new Date("2026-09-29T02:59:59.999Z");
  assert.equal(isOpenOnDay({ createdAt: "2026-09-28T10:00:00Z", completedAt: null }, eod), true);
  assert.equal(isOpenOnDay({ createdAt: "2026-09-29T10:00:00Z", completedAt: null }, eod), false);
  assert.equal(isOpenOnDay({ createdAt: "2026-09-01T00:00:00Z", completedAt: "2026-09-28T12:00:00Z" }, eod), false);
});
