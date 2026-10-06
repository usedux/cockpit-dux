// Linear de mentira (só para testes e para `npm run dev` sem chave): responde às consultas GraphQL do cockpit
// com os dados das fixtures e permite "mexer" no Linear (mock.setStatus) para simular uma mudança + webhook.
import * as F from "../test/fixtures.mjs";
import { PROJECTS } from "../lib/config.js";

const byProject = { "anti-banking": F.bancking, "anti-sacado": F.sacado, decentral: F.decentral, "gestao-conhecimento": F.gestao };
const TYPE_OF = { "Done / In Prod": "completed", Canceled: "canceled", Backlog: "backlog", "In Progress": "started", "In Review": "started", "QA - In Test": "started" };

export function createMock() {
  const state = { calls: 0, issues: {}, milestones: {}, upstream: [{ identifier: "DUX-900", title: "Ideia de teste", lane: "1. Backlog de Ideias" }] };
  for (const [key, fx] of Object.entries(byProject)) {
    const id = PROJECTS[key].linearProjectId;
    state.issues[id] = fx.issues.map((i) => ({ ...i, createdAt: i.createdAt || "2026-09-20T12:00:00.000Z", updatedAt: i.completedAt || "2026-10-05T12:00:00.000Z" }));
    state.milestones[id] = fx.milestones.map((m, n) => ({ ...m, sortOrder: n }));
  }
  const node = (i) => ({
    identifier: i.id, title: i.title, createdAt: i.createdAt, updatedAt: i.updatedAt, completedAt: i.completedAt,
    state: { name: i.status, type: TYPE_OF[i.status] || "unstarted" },
    assignee: i.assignee ? { name: i.assignee } : null,
    labels: { nodes: (i.labels || []).map((name) => ({ name })) },
    projectMilestone: i.milestoneId ? { id: i.milestoneId } : null,
  });
  const respond = (query, v) => {
    if (/issues\(filter: \{ project: \{ id: \{ eq: \$id \} \} \}/.test(query) && /projectMilestone/.test(query)) {
      return { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: (state.issues[v.id] || []).map(node) } };
    }
    if (/projectMilestones/.test(query)) return { project: { projectMilestones: { nodes: (state.milestones[v.id] || []).map((m) => ({ id: m.id, name: m.name, progress: m.progress, targetDate: m.targetDate, sortOrder: m.sortOrder })) } } };
    if (/slugId/.test(query)) return { projects: { nodes: [{ id: "up-1", name: "Upstream - Novos Projetos", url: "https://linear.app/wearedux/project/upstream-novos-projetos-e6787a72646c", state: "started" }] } };
    if (/creator \{ name \}/.test(query)) {
      return { issues: { pageInfo: { hasNextPage: false }, nodes: state.upstream.map((u) => ({ identifier: u.identifier, title: u.title, url: `https://linear.app/x/${u.identifier}`, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", state: { name: "Backlog", type: "backlog" }, assignee: null, creator: { name: "Lucas Henning" }, labels: { nodes: [{ name: u.lane, color: "#95A2B3", parent: { name: "Upstream" } }] } })) } };
    }
    if (/issueLabels/.test(query)) return { issueLabels: { nodes: [{ name: "1. Backlog de Ideias", color: "#95A2B3" }, { name: "2. Discovery", color: "#4EA7FC" }] } };
    if (/history\(first/.test(query)) return { issue: { history: { nodes: [] } } };
    throw new Error("mock-linear: consulta não reconhecida: " + query.slice(0, 80));
  };
  const realFetch = globalThis.fetch;
  const mock = {
    state,
    install() {
      globalThis.fetch = async (url, opts) => {
        if (String(url).startsWith("https://api.linear.app/graphql")) {
          state.calls++;
          const { query, variables } = JSON.parse(opts.body);
          try { return new Response(JSON.stringify({ data: respond(query, variables || {}) }), { status: 200 }); }
          catch (e) { return new Response(JSON.stringify({ errors: [{ message: e.message }] }), { status: 200 }); }
        }
        return realFetch(url, opts);
      };
      return mock;
    },
    uninstall() { globalThis.fetch = realFetch; },
    setStatus(identifier, status, completedAt = null) {
      for (const list of Object.values(state.issues)) for (const i of list) if (i.id === identifier) { i.status = status; i.completedAt = status === "Done / In Prod" ? (completedAt || new Date().toISOString()) : null; }
    },
  };
  return mock;
}
