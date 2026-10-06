// Fechamento semanal (sexta 18h BRT) — roda no ambiente de produção (cron da Vercel), não no computador de ninguém.
// Escopo (v33): só tasks que pertencem a milestones, em todos os projetos do cockpit.
// Números 100% determinísticos; a IA (opcional) só redige destaques/sugestões em cima deles, com fallback sem IA.
import { PROJECTS, BLOCKERS } from "./config.js";
import { scopedIssues, shortName, esc, STATUS } from "./builders.js";
import { fetchAllProjects } from "./linear.js";
import { store } from "./store.js";

const BRT_OFFSET_H = 3; // BRT = UTC-3 (sem horário de verão desde 2019)
const DAY = 86400000;
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX"];

// Paleta categórica fixa (mesma do fechamento anterior) — Total + projetos.
export const SERIES_COLORS = {
  total: "#2a78d6",
  "anti-banking": "#eb6834",
  "anti-sacado": "#1baf7a",
  decentral: "#eda100",
  "gestao-conhecimento": "#7a5bd1",
};

// ---------- Datas (tudo em BRT) ----------
// Retorna o instante UTC que corresponde a 00:00 BRT do dia (Y,M,D).
const brtMidnightUtc = (y, m, d) => Date.UTC(y, m, d) + BRT_OFFSET_H * 3600000;

export function weekOf(now = new Date()) {
  const shifted = new Date(now.getTime() - BRT_OFFSET_H * 3600000); // "relógio de parede" em BRT, lido via getUTC*
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay(); // 0 = domingo
  const monUtc = new Date(Date.UTC(y, m, d) - ((dow + 6) % 7) * DAY);
  const days = [0, 1, 2, 3, 4].map((i) => {
    const day = new Date(monUtc.getTime() + i * DAY);
    const start = brtMidnightUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    return { start: new Date(start), end: new Date(start + DAY - 1), ymd: day.toISOString().slice(0, 10) };
  });
  const mon = days[0], fri = days[4];
  const monD = new Date(mon.ymd + "T00:00:00Z"), friD = new Date(fri.ymd + "T00:00:00Z");
  const dd = (x) => String(x.getUTCDate()).padStart(2, "0");
  const label = `${dd(monD)}${monD.getUTCMonth() !== friD.getUTCMonth() ? " " + MESES[monD.getUTCMonth()] : ""} — ${dd(friD)} ${MESES[friD.getUTCMonth()]} ${friD.getUTCFullYear()}`;
  return { label, days, start: mon.start, end: fri.end, startYmd: mon.ymd, endYmd: fri.ymd };
}

// ---------- Métricas ----------
export function areaOf(issue) {
  const l = issue.labels || [];
  if (l.includes("Marketing")) return "Marketing";
  if (l.includes("Financeiro")) return "Financeiro";
  if (l.includes("Operação") || l.includes("Operações")) return "Operações";
  return "Sem área";
}

const isCanceled = (i) => i.status === STATUS.CANCELED || i.statusType === "canceled";
const inRange = (iso, a, b) => !!iso && new Date(iso) >= a && new Date(iso) <= b;

export function isOpenOnDay(issue, endOfDay) {
  const created = new Date(issue.createdAt);
  const completed = issue.completedAt ? new Date(issue.completedAt) : null;
  return created <= endOfDay && (!completed || completed > endOfDay);
}

export function computeWeekStats(all, week) {
  // all: { key: { issues, milestones } }
  const perProject = {};
  const areas = { Marketing: { criadas: 0, concluidas: 0 }, Financeiro: { criadas: 0, concluidas: 0 }, "Operações": { criadas: 0, concluidas: 0 }, "Sem área": { criadas: 0, concluidas: 0 } };
  const deliverers = {};
  const aggregate = week.days.map(() => 0);
  let created = 0, completed = 0;
  const milestones = [];
  const blockers = [];

  for (const [key, { issues, milestones: ms }] of Object.entries(all)) {
    const scope = scopedIssues(issues, ms).filter((i) => !isCanceled(i));
    const createdIn = scope.filter((i) => inRange(i.createdAt, week.start, week.end));
    const doneIn = scope.filter((i) => inRange(i.completedAt, week.start, week.end));
    created += createdIn.length; completed += doneIn.length;
    createdIn.forEach((i) => areas[areaOf(i)].criadas++);
    doneIn.forEach((i) => {
      areas[areaOf(i)].concluidas++;
      const n = shortName(i.assignee) || "Sem responsável";
      deliverers[n] = (deliverers[n] || 0) + 1;
    });
    const daily = week.days.map((d) => scope.filter((i) => isOpenOnDay(i, d.end)).length);
    daily.forEach((v, idx) => { aggregate[idx] += v; });
    perProject[key] = { label: PROJECTS[key]?.name || key, abertasPorDia: daily, criadas: createdIn.length, concluidas: doneIn.length, tasksEmMilestones: scope.length };

    for (const m of ms) {
      const tasks = scope.filter((i) => i.milestoneId === m.id);
      milestones.push({ projeto: PROJECTS[key]?.name || key, nome: String(m.name).trim(), progresso: Math.round(m.progress ?? 0), concluidas: tasks.filter((i) => i.status === STATUS.DONE).length, total: tasks.length });
    }
    const byId = new Map(issues.map((i) => [i.id, i]));
    const msIds = new Set(ms.map((m) => m.id));
    for (const b of BLOCKERS[key] || []) {
      const it = byId.get(b.issue);
      if (it && msIds.has(it.milestoneId) && it.status !== STATUS.DONE && !isCanceled(it)) blockers.push({ id: b.issue, projeto: PROJECTS[key]?.name || key, tag: b.tag, texto: b.text });
    }
  }
  const topEntregas = Object.entries(deliverers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }));
  const acumulo = Object.entries(areas).sort((a, b) => (b[1].criadas - b[1].concluidas) - (a[1].criadas - a[1].concluidas))[0];
  return {
    semana: `${week.startYmd} a ${week.endYmd}`,
    totalAtualizacoes: created + completed,
    tasksCriadas: created,
    tasksConcluidas: completed,
    abertasPorDiaTotal: aggregate,
    porArea: areas,
    areaComMaisAcumulo: acumulo && acumulo[1].criadas - acumulo[1].concluidas > 0 ? acumulo[0] : null,
    topEntregas,
    porProjeto: perProject,
    milestones,
    blockersAbertos: blockers,
  };
}

// ---------- Burndown (SVG) ----------
export function buildBurndownSvg(week, stats) {
  const series = [{ key: "total", label: "Total", values: stats.abertasPorDiaTotal }];
  for (const [key, p] of Object.entries(stats.porProjeto)) if (p.tasksEmMilestones > 0) series.push({ key, label: p.label, values: p.abertasPorDia });
  const W = 560, H = 220, padL = 34, padR = 12, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i) => padL + (i / (week.days.length - 1)) * plotW;
  const y = (v) => padT + plotH - (v / maxV) * plotH;
  const grid = [0, 0.5, 1].map((f) => {
    const yy = padT + plotH * (1 - f);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--ink-faint)">${Math.round(maxV * f)}</text>`;
  }).join("");
  const labels = week.days.map((_, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--ink-faint)">${WEEKDAYS[i]}</text>`).join("");
  const lines = series.map((s) => {
    const color = SERIES_COLORS[s.key] || "#888";
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const lx = x(s.values.length - 1), ly = y(s.values[s.values.length - 1]);
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${color}"/>`;
  }).join("");
  const legend = series.map((s) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;"><span style="width:8px;height:8px;border-radius:50%;background:${SERIES_COLORS[s.key] || "#888"};display:inline-block;"></span>${esc(s.label)}</span>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Burndown da semana: tasks de milestones em aberto por dia">${grid}${lines}${labels}</svg><div style="display:flex;flex-wrap:wrap;font-size:11px;color:var(--ink-soft);margin-top:6px;">${legend}</div>`;
}

// ---------- Texto: destaques e sugestões ----------
export function deterministicNarrative(stats) {
  const hl = [], sg = [];
  hl.push(`${stats.tasksConcluidas} task(s) de milestones concluída(s) e ${stats.tasksCriadas} criada(s) na semana — ${stats.totalAtualizacoes} atualizações no total.`);
  const proj = Object.values(stats.porProjeto).filter((p) => p.concluidas || p.criadas).sort((a, b) => b.concluidas - a.concluidas);
  if (proj[0]) hl.push(`${proj[0].label} liderou a semana: ${proj[0].concluidas} concluída(s) e ${proj[0].criadas} criada(s).`);
  const t = stats.abertasPorDiaTotal; 
  if (t.length) hl.push(`Tasks de milestones em aberto: ${t[0]} na segunda → ${t[t.length - 1]} na sexta.`);
  if (stats.topEntregas.length) hl.push(`Quem mais entregou: ${stats.topEntregas.slice(0, 3).map((d) => `${d.nome} (${d.qtd})`).join(", ")}.`);
  const nextRunning = stats.milestones.filter((m) => m.total > 0 && m.progresso < 100);
  if (nextRunning.length) hl.push(`Milestones em andamento: ${nextRunning.map((m) => `${m.nome} (${m.progresso}%)`).join(" · ")}.`);
  if (stats.blockersAbertos.length) sg.push(`${stats.blockersAbertos.length} blocker(s) ainda abertos (${stats.blockersAbertos.map((b) => b.id).join(", ")}) — definir dono e data para destravar.`);
  if (stats.areaComMaisAcumulo) sg.push(`${stats.areaComMaisAcumulo} acumulou mais tasks novas do que concluídas — rever capacidade ou prioridade da área.`);
  if (stats.porArea["Sem área"].criadas > 0) sg.push(`${stats.porArea["Sem área"].criadas} task(s) criadas sem label de área — classificar para manter as métricas por área confiáveis.`);
  if (!sg.length) sg.push("Sem alertas relevantes nos números desta semana — manter o ritmo e revisar os próximos milestones.");
  return { highlights: hl.map(esc), suggestions: sg.map(esc) };
}

async function aiNarrative(stats) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `Você recebe números já calculados (não invente nem recalcule nada) sobre a semana de operação dos projetos de produto da DUX no Linear — considerando apenas tasks que pertencem a milestones. Escreva um JSON estrito, sem markdown: {"highlights": ["..."], "suggestions": ["..."]}. Regras: 3 a 5 destaques, 2 a 4 sugestões; cada item é um tópico curto (até ~20 palavras), direto, em português. Destaques = o que mudou de mais relevante. Sugestões = como amadurecer o processo, com base em gargalos que os números mostram (áreas com acúmulo, blockers persistentes, tasks sem área). Análise dos projetos em conjunto.\n\nDados:\n${JSON.stringify(stats)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
  });
  const out = await res.json();
  if (out.error) throw new Error(JSON.stringify(out.error));
  const text = out.content?.[0]?.text || "{}";
  const parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
  const clean = (a) => (Array.isArray(a) ? a.map((s) => esc(String(s)).slice(0, 400)).slice(0, 6) : []);
  const r = { highlights: clean(parsed.highlights), suggestions: clean(parsed.suggestions) };
  return r.highlights.length ? r : null;
}

export async function buildNarrative(stats) {
  try { const ai = await aiNarrative(stats); if (ai) return { ...ai, source: "ia" }; }
  catch (e) { console.error("[closing] narrativa por IA falhou, usando texto padrão:", e.message); }
  return { ...deterministicNarrative(stats), source: "padrao" };
}

// ---------- Histórico ----------
export async function readHistory() {
  const raw = await store.get("history");
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function writeHistory(list) {
  await store.set("history", JSON.stringify(list));
  await store.incr("ver:history");
}

// Gera (e grava) o fechamento da semana de `now`. Idempotente: se a semana já foi fechada, não refaz (a menos que force).
export async function runClosing({ now = new Date(), force = false, dry = false, data = null } = {}) {
  const week = weekOf(now);
  const history = await readHistory();
  const existing = history.findIndex((w) => w.label === week.label);
  if (existing !== -1 && !force && !dry) return { skipped: true, label: week.label, reason: "semana já fechada" };
  if (!dry && !(await store.lock("lock:closing", 120))) return { skipped: true, label: week.label, reason: "fechamento em andamento" };
  try {
    const all = data || (await fetchAllProjects());
    const stats = computeWeekStats(all, week);
    const narrative = await buildNarrative(stats);
    const entry = {
      label: week.label,
      start: week.startYmd,
      end: week.endYmd,
      closedAt: new Date().toISOString(),
      open: false,
      report: { burndownSvg: buildBurndownSvg(week, stats), highlights: narrative.highlights, suggestions: narrative.suggestions },
      stats,
      narrativeSource: narrative.source,
    };
    if (dry) return { dry: true, label: week.label, narrative: narrative.source, entry };
    const next = existing !== -1 ? history.map((w, i) => (i === existing ? entry : w)) : [...history, entry];
    await writeHistory(next);
    return { ok: true, label: week.label, replaced: existing !== -1, narrative: narrative.source, totalAtualizacoes: stats.totalAtualizacoes };
  } finally {
    if (!dry) await store.del("lock:closing");
  }
}
