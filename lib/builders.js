// Geração dos blocos "ao vivo" de cada card do cockpit a partir dos dados do Linear.
// Funções puras (sem rede) — o mesmo código roda no webhook (Vercel) e nos testes.
//
// Regras (v33):
//  - Tudo que é métrica (distribuição, áreas, tipos) considera SÓ as tasks que pertencem a milestones do projeto.
//  - Milestone "em execução" = tem ao menos 1 task em In Progress / In Review / QA - In Test, ou já tem entrega.
//    Milestone "próximo" = mapeado, mas ainda sem nenhuma task em execução nem em produção.
//  - Blocker só aparece enquanto a task ligada a ele (que precisa estar num milestone) estiver aberta.

export const STATUS = {
  BACKLOG: "Backlog",
  REFINEMENT: "Product Refinement",
  PRIORIZED: "Priorized",
  READY: "Ready To Dev",
  PROGRESS: "In Progress",
  REVIEW: "In Review",
  QA: "QA - In Test",
  DONE: "Done / In Prod",
  CANCELED: "Canceled",
  DUPLICATE: "Duplicate", // no Linear é um estado do tipo "cancelado"
};

const PT_STATUS = {
  [STATUS.BACKLOG]: "Backlog",
  [STATUS.REFINEMENT]: "Refinamento",
  [STATUS.PRIORIZED]: "Priorizado",
  [STATUS.READY]: "Pronto p/ dev",
};
const TODO_ORDER = [STATUS.READY, STATUS.PRIORIZED, STATUS.REFINEMENT, STATUS.BACKLOG];

// Abreviações usadas nos cards (nome no Linear → como aparece no cockpit).
export const SHORT_NAMES = {
  "Lucas Albino DUX": "Lucas A.",
  "Lucas Henning": "Lucas H.",
  "Guilherme Zaidan": "Zaidan",
  "Thiago Tiburcio": "Thiago",
  "Felipe Tiburcio": "Felipe",
  "Luma Americano": "Luma",
  "André @ DUX": "André",
  "Hyago Bitencourt | DUX": "Hyago",
  JP: "JP",
};

export function shortName(name) {
  if (!name) return null;
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  return String(name).split(/[\s|@]+/)[0];
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TZ = "America/Sao_Paulo";
const fmtDM = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dm = (iso) => fmtDM.format(new Date(iso));
const dayKey = (iso) => fmtDay.format(new Date(iso));
function targetDM(t) {
  if (!t) return null;
  const [, m, d] = String(t).slice(0, 10).split("-");
  return `${d}/${m}`;
}

const isExec = (i) => i.status === STATUS.PROGRESS || i.status === STATUS.REVIEW;
// Canceled e Duplicate saem da conta (o Linear trata os dois como "cancelado").
export const isCanceled = (i) => i.status === STATUS.CANCELED || i.status === STATUS.DUPLICATE || i.statusType === "canceled";
const isOpen = (i) => i.status !== STATUS.DONE && !isCanceled(i);

function who(i, suffix) {
  const n = shortName(i.assignee) || "sem responsável";
  return suffix ? `${n} · ${suffix}` : n;
}

function taskHtml(i, whoText) {
  return `<div class="task"><span class="id mono">${esc(i.id)}</span><span class="title">${esc(i.title)}</span><span class="who">${esc(whoText)}</span></div>`;
}

// Coluna "quente" (execução / teste): sempre aberta, mostra as primeiras tasks e o resto em "+N mais".
function colHtml(cls, color, title, items, whoFn, emptyMsg, limit = 4) {
  let h = `<div class="col ${cls}"><div class="col-head"><span class="dot" style="background:${color}"></span>${title}<span class="n">${items.length}</span></div>`;
  if (!items.length) return h + `<div class="empty">${emptyMsg}</div></div>`;
  h += items.slice(0, limit).map((i) => taskHtml(i, whoFn(i))).join("");
  if (items.length > limit) {
    h += `<details class="more"><summary>+${items.length - limit} mais</summary>${items.slice(limit).map((i) => taskHtml(i, whoFn(i))).join("")}</details>`;
  }
  return h + "</div>";
}

// Bloco "frio" (faltam entregar / em produção): recolhido por padrão, só o contador aparece.
function coldHtml(cls, color, title, items, whoFn, emptyMsg) {
  const head = `<span class="dot" style="background:${color}"></span>${title}<span class="n">${items.length}</span>`;
  if (!items.length) return `<div class="cold ${cls} is-empty"><div class="cold-sum">${head}</div><div class="empty">${emptyMsg}</div></div>`;
  return `<details class="cold ${cls}"><summary>${head}</summary><div class="cold-list">${items.map((i) => taskHtml(i, whoFn(i))).join("")}</div></details>`;
}

function sortDone(items) {
  // mais recentes primeiro, por dia (BRT); empate mantém a ordem do Linear.
  return items
    .map((i, idx) => ({ i, idx, k: i.completedAt ? dayKey(i.completedAt) : "" }))
    .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.idx - b.idx))
    .map((x) => x.i);
}

export function milestoneState(m, issues) {
  const tasks = issues.filter((i) => i.milestoneId === m.id);
  const live = tasks.filter((i) => [STATUS.PROGRESS, STATUS.REVIEW, STATUS.QA].includes(i.status));
  const done = tasks.filter((i) => i.status === STATUS.DONE);
  const next = live.length === 0 && done.length === 0;
  return { tasks, live, done, next };
}

// Barra de status do milestone: uma faixa proporcional + contadores grandes por etapa.
function statusStrip(tasks) {
  const rows = DISTRO.map(([st, label, color, extra]) => ({ label, color, extra, n: tasks.filter((i) => (st === STATUS.CANCELED ? isCanceled(i) : i.status === st)).length })).filter((r) => r.n > 0);
  if (!rows.length) return "";
  const total = tasks.length;
  const bar = rows.map((r) => `<div style="width:${((r.n / total) * 100).toFixed(1)}%; background:${r.color}${r.extra}"></div>`).join("");
  const stats = rows.map((r) => `<span class="ms-stat"><i style="background:${r.color}${r.extra}"></i><b>${r.n}</b>${r.label}</span>`).join("");
  return `<div class="distro" title="Distribuição das tasks do milestone por etapa">${bar}</div><div class="ms-stats">${stats}</div>`;
}

function panelHtml(m, issues) {
  const st = milestoneState(m, issues);
  const name = String(m.name).trim();
  const pct = Math.round(m.progress ?? 0);
  const meta = targetDM(m.targetDate) ? `Meta ${targetDM(m.targetDate)}` : "Sem meta definida";
  const counted = st.tasks.filter((i) => !isCanceled(i));
  const canceled = st.tasks.length - counted.length;
  let h = `<div class="ms"><div class="ms-top"><div><div class="ms-label">🎯 Milestone</div><div class="ms-name">${esc(name)}</div></div><div class="ms-pct">${pct}<small>%</small></div></div>`;
  h += `<div class="ms-bar"><div style="width:${pct}%"></div></div>`;
  if (!st.tasks.length) {
    return h + `<div class="ms-meta"><span>Nenhuma task vinculada a este milestone ainda</span><span class="date">${meta}</span></div></div>`;
  }
  const summary = `${st.done.length} de ${counted.length} tasks em produção` + (canceled ? ` · ${canceled} cancelada${canceled > 1 ? "s" : ""} fora da conta` : "");
  h += `<div class="ms-meta"><span>${summary}</span><span class="date">${meta}</span></div>`;

  // Visão macro: status do milestone + tasks por área e por tipo
  h += `<div class="ms-metrics">${statusStrip(st.tasks)}`;
  h += `<div class="ms-chiprow"><span class="k">Área</span><div class="chips">${areasHtml(st.tasks)}</div></div>`;
  h += `<div class="ms-chiprow"><span class="k">Tipo</span><div class="chips">${typesHtml(st.tasks)}</div></div></div>`;

  const prog = counted.filter(isExec);
  const qa = counted.filter((i) => i.status === STATUS.QA);
  const done = sortDone(counted.filter((i) => i.status === STATUS.DONE));
  const todo = TODO_ORDER.flatMap((s) => counted.filter((i) => i.status === s));
  // Em destaque: o que está acontecendo agora
  h += `<div class="ms-hot">`;
  h += colHtml("progress", "var(--st-progress)", "Em execução / revisão", prog, (i) => who(i, i.status === STATUS.REVIEW ? "em review" : "em andamento"), "Nada em execução");
  h += colHtml("qa", "var(--st-qa)", "Em teste", qa, (i) => who(i, "em teste"), "Nada em teste");
  h += `</div>`;
  // Menos destaque, recolhidos: o que falta e o que já saiu
  h += `<div class="ms-cold">`;
  h += coldHtml("todo", "var(--ink-faint)", "Faltam entregar", todo, (i) => who(i, PT_STATUS[i.status]), "Nada pendente");
  h += coldHtml("done", "var(--st-done)", "Em produção", done, (i) => who(i, i.completedAt ? dm(i.completedAt) : ""), "Nada em produção ainda");
  h += `</div>`;
  return h + `</div>`;
}

function outsideHtml(issues, milestoneIds) {
  const out = issues.filter((i) => !milestoneIds.has(i.milestoneId) && !isCanceled(i));
  const exec = out.filter(isExec);
  const qa = out.filter((i) => i.status === STATUS.QA);
  const prod = out.filter((i) => i.status === STATUS.DONE);
  const back = out.length - exec.length - qa.length - prod.length;
  const text = `Fora de milestone · ${out.length} tasks · ${exec.length} em execução · ${qa.length} em teste · ${prod.length} em produção · ${back} no backlog/refino`;
  const hot = out.filter((i) => isExec(i) || i.status === STATUS.QA);
  if (!hot.length) return `<div class="ms-outside-note">${text}</div>`;
  return `<details class="ms-outside"><summary>${text}</summary>${hot
    .map((i) => taskHtml(i, who(i, i.status === STATUS.QA ? "em teste" : i.status === STATUS.REVIEW ? "em review" : "em andamento")))
    .join("")}</details>`;
}

export function buildMilestonesBlock(issues, milestones) {
  const ids = new Set(milestones.map((m) => m.id));
  const running = milestones.filter((m) => !milestoneState(m, issues).next);
  let h = `<div class="ms-wrap"><div class="ms-wrap-head">Milestones do projeto</div>`;
  if (running.length) h += running.map((m) => panelHtml(m, issues)).join("");
  else h += `<div class="ms-empty">Nenhum milestone em execução no momento — veja os próximos mais abaixo.</div>`;
  h += outsideHtml(issues, ids);
  return h + `</div>`;
}

export function buildNextMilestones(issues, milestones) {
  const next = milestones.filter((m) => milestoneState(m, issues).next);
  if (!next.length) {
    return `<div class="next-ms-empty">Nenhum milestone mapeado além dos que já estão em execução. Quando um novo milestone for criado no Linear, ele aparece aqui.</div>`;
  }
  return next
    .map((m) => {
      const st = milestoneState(m, issues);
      const open = st.tasks.filter((i) => !isCanceled(i));
      const ready = open.filter((i) => i.status === STATUS.READY || i.status === STATUS.PRIORIZED).length;
      const date = targetDM(m.targetDate) ? `Meta ${targetDM(m.targetDate)}` : "Sem meta definida";
      const scope = open.length
        ? `${open.length} task${open.length > 1 ? "s" : ""} mapeada${open.length > 1 ? "s" : ""}` +
          (ready ? ` · ${ready} priorizada${ready > 1 ? "s" : ""}/pronta${ready > 1 ? "s" : ""} p/ dev` : " · nenhuma pronta p/ dev ainda")
        : "ainda sem tasks vinculadas";
      return `<div class="next-ms-item"><div class="next-ms-name">${esc(String(m.name).trim())}</div><div class="next-ms-meta"><span>${scope}</span><span class="date">${date}</span></div><div class="next-ms-state">Aguardando início — nenhuma task em execução</div></div>`;
    })
    .join("");
}

const DISTRO = [
  [STATUS.BACKLOG, "Backlog", "var(--ink-faint)", ""],
  [STATUS.REFINEMENT, "Refinamento", "var(--ink-soft)", ""],
  [STATUS.PRIORIZED, "Priorizado", "var(--st-priorized)", ""],
  [STATUS.READY, "Pronto p/ dev", "var(--st-progress-soft)", ";outline:1px solid var(--ink-faint)"],
  [STATUS.PROGRESS, "Em execução", "var(--st-progress)", ""],
  [STATUS.REVIEW, "Em revisão", "var(--blk-int)", ""],
  [STATUS.QA, "Em teste", "var(--st-qa)", ""],
  [STATUS.DONE, "Produção", "var(--st-done)", ""],
  [STATUS.CANCELED, "Cancelado", "var(--st-build)", ""],
];

export function scopedIssues(issues, milestones) {
  const ids = new Set(milestones.map((m) => m.id));
  return issues.filter((i) => ids.has(i.milestoneId));
}

export function buildDistro(issues, milestones) {
  const scope = scopedIssues(issues, milestones);
  const rows = DISTRO.map(([s, label, color, extra]) => ({ label, color, extra, n: scope.filter((i) => (s === STATUS.CANCELED ? isCanceled(i) : i.status === s)).length })).filter((r) => r.n > 0);
  if (!rows.length) {
    return { bars: "", legend: `<span class="distro-empty">Ainda não há tasks em milestones</span>` };
  }
  const total = scope.length;
  return {
    bars: rows.map((r) => `<div style="width:${((r.n / total) * 100).toFixed(1)}%; background:${r.color}${r.extra}"></div>`).join("\n"),
    legend: rows.map((r) => `<span><span class="dot" style="background:${r.color}${r.extra}"></span>${r.label} · ${r.n}</span>`).join("\n"),
  };
}

function areasHtml(scope) {
  let mkt = 0, fin = 0, ops = 0, none = 0;
  for (const i of scope) {
    const l = i.labels || [];
    if (l.includes("Marketing")) mkt++;
    else if (l.includes("Financeiro")) fin++;
    else if (l.includes("Operação") || l.includes("Operações")) ops++;
    else none++;
  }
  return [
    `<span class="chip mkt">Marketing · ${mkt}</span>`,
    `<span class="chip fin">Financeiro · ${fin}</span>`,
    `<span class="chip ops">Operações · ${ops}</span>`,
    `<span class="chip other" title="Tasks sem label de área">Sem área · ${none}</span>`,
  ].join("\n");
}

function typesHtml(scope) {
  let bug = 0, mel = 0, feat = 0, out = 0;
  for (const i of scope) {
    const l = i.labels || [];
    if (l.includes("Bug")) bug++;
    else if (l.includes("Improvement") || l.includes("Melhoria")) mel++;
    else if (l.includes("Feature") || l.includes("Nova Funcionalidade")) feat++;
    else out++;
  }
  return [
    `<span class="tchip bug">Bug · ${bug}</span>`,
    `<span class="tchip melhoria">Melhoria · ${mel}</span>`,
    `<span class="tchip feature">Nova Funcionalidade · ${feat}</span>`,
    `<span class="tchip outros">Outros · ${out}</span>`,
  ].join("\n");
}

export const buildAreas = (issues, milestones) => areasHtml(scopedIssues(issues, milestones));
export const buildTypes = (issues, milestones) => typesHtml(scopedIssues(issues, milestones));

// blockers: [{ tag: "interno" | "externo", text, issue: "DUX-123" }]
export function buildBlockers(issues, milestones, blockers = []) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const msName = new Map(milestones.map((m) => [m.id, String(m.name).trim()]));
  const warnings = [];
  const shown = [];
  for (const b of blockers) {
    const it = byId.get(b.issue);
    if (!it) { warnings.push(`${b.issue}: task não encontrada no projeto — blocker oculto`); continue; }
    if (!msName.has(it.milestoneId)) { warnings.push(`${b.issue}: task fora de milestone — blocker oculto`); continue; }
    if (!isOpen(it)) { warnings.push(`${b.issue}: task já está "${it.status}" — blocker resolvido, oculto`); continue; }
    shown.push({ b, it });
  }
  const html = shown.length
    ? shown
        .map(({ b, it }) => {
          const tag = b.tag === "externo" ? "externo" : "interno";
          return `<div class="blocker"><span class="blocker-tag ${tag}">${tag === "externo" ? "Externo" : "Interno"}</span><p>${esc(b.text)}<span class="blocker-ref"><span class="mono">${esc(it.id)}</span> · ${esc(msName.get(it.milestoneId))}</span></p></div>`;
        })
        .join("\n")
    : `<div class="empty">Nenhum blocker nos milestones no momento</div>`;
  const count = { interno: shown.filter((s) => s.b.tag !== "externo").length, externo: shown.filter((s) => s.b.tag === "externo").length };
  return { html, count, warnings };
}

// ---------- Última atualização do projeto (status update publicado no Linear) ----------
const HEALTH = { onTrack: ["ok", "No prazo"], atRisk: ["risk", "Em risco"], offTrack: ["off", "Fora do prazo"] };

function inlineMd(t) {
  let h = esc(t);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  return h;
}

// Markdown do Linear (negrito, listas com recuo, links) → HTML seguro. Tudo é escapado antes.
export function mdToHtml(md) {
  const out = [];
  let depth = -1;
  const close = (to) => { while (depth > to) { out.push("</li></ul>"); depth--; } };
  for (const raw of String(md || "").replace(/\r/g, "").split("\n")) {
    const m = /^(\s*)[*-]\s+(.*)$/.exec(raw);
    if (m) {
      const lvl = Math.min(Math.floor(m[1].replace(/\t/g, "  ").length / 2), 3);
      if (lvl > depth) { while (depth < lvl) { out.push("<ul><li>"); depth++; if (depth < lvl) out.push(""); } out.push(inlineMd(m[2])); }
      else { close(lvl); out.push("</li><li>" + inlineMd(m[2])); }
    } else if (raw.trim()) {
      close(-1);
      out.push(`<p>${inlineMd(raw.trim())}</p>`);
    }
  }
  close(-1);
  return out.join("");
}

export function buildUpdate(update) {
  if (!update || !update.body) return `<div class="empty">Nenhuma atualização publicada no Linear ainda.</div>`;
  const lines = String(update.body).replace(/\r/g, "").split("\n");
  const first = (lines.find((l) => l.trim()) || "").trim();
  let title = "";
  let body = update.body;
  if (first && !/^[*-]\s/.test(first) && first.replace(/\*\*/g, "").length <= 90) {
    title = first.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const idx = lines.findIndex((l) => l.trim());
    body = lines.slice(idx + 1).join("\n");
  }
  const when = dm(update.createdAt);
  const [cls, label] = HEALTH[update.health] || ["", ""];
  const author = shortName(update.author);
  const link = /^https:\/\//.test(update.url || "") ? `<a class="upd-link" href="${esc(update.url)}" target="_blank" rel="noopener">Abrir no Linear ↗</a>` : "";
  return `<div class="upd"><div class="upd-top"><span class="upd-title">${esc(title || `Atualização de ${when}`)}</span><span class="upd-meta">${label ? `<span class="upd-health ${cls}">${label}</span>` : ""}<time datetime="${esc(update.createdAt)}">${when}</time>${author ? ` · ${esc(author)}` : ""}</span></div><div class="upd-body">${mdToHtml(body)}</div>${link}</div>`;
}

export function buildProjectBlocks({ issues, milestones, blockers, update }) {
  const bl = buildBlockers(issues, milestones, blockers);
  return {
    milestones: buildMilestonesBlock(issues, milestones),
    blockers: bl.html,
    "next-milestones": buildNextMilestones(issues, milestones),
    update: buildUpdate(update),
    _warnings: bl.warnings,
  };
}
