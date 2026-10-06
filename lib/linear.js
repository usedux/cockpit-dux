// Integração com o Linear (GraphQL) e sincronização dos dados ao vivo do cockpit.
import { PROJECTS, BLOCKERS, UPSTREAM } from "./config.js";
import { buildProjectBlocks } from "./builders.js";
import { store, col } from "./store.js";

const ENDPOINT = "https://api.linear.app/graphql";

export async function gql(query, variables = {}) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw Object.assign(new Error("LINEAR_API_KEY não configurada"), { status: 500 });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.errors) throw new Error(`Linear: ${JSON.stringify(out.errors || out).slice(0, 400)}`);
  return out.data;
}

const ISSUES_Q = `
  query($id: ID!, $after: String) {
    issues(filter: { project: { id: { eq: $id } } }, first: 100, after: $after, orderBy: updatedAt) {
      pageInfo { hasNextPage endCursor }
      nodes {
        identifier title createdAt updatedAt completedAt
        state { name type }
        assignee { name }
        labels { nodes { name } }
        projectMilestone { id }
      }
    }
  }`;

const MILESTONES_Q = `
  query($id: String!) {
    project(id: $id) {
      projectMilestones { nodes { id name progress targetDate sortOrder } }
    }
  }`;

export function normalizeIssue(n) {
  return {
    id: n.identifier,
    title: n.title,
    status: n.state?.name,
    statusType: n.state?.type,
    assignee: n.assignee?.name || null,
    labels: (n.labels?.nodes || []).map((l) => l.name),
    milestoneId: n.projectMilestone?.id || null,
    completedAt: n.completedAt || null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

// O campo `progress` do Linear vem em % (ex.: 67.19). Se um dia vier 0–1, ajuste LINEAR_PROGRESS_SCALE=fraction.
export function normalizeProgress(p) {
  const v = Number(p || 0);
  return process.env.LINEAR_PROGRESS_SCALE === "fraction" ? v * 100 : v;
}

export async function fetchIssues(projectId) {
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const d = await gql(ISSUES_Q, { id: projectId, after });
    out.push(...d.issues.nodes.map(normalizeIssue));
    if (!d.issues.pageInfo.hasNextPage) break;
    after = d.issues.pageInfo.endCursor;
  }
  return out;
}

export async function fetchMilestones(projectId) {
  const d = await gql(MILESTONES_Q, { id: projectId });
  return (d.project?.projectMilestones?.nodes || [])
    .map((m) => ({ id: m.id, name: m.name, progress: normalizeProgress(m.progress), targetDate: m.targetDate || null, sortOrder: m.sortOrder ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchAllProjects() {
  const out = {};
  await Promise.all(
    Object.entries(PROJECTS).map(async ([key, p]) => {
      const [issues, milestones] = await Promise.all([fetchIssues(p.linearProjectId), fetchMilestones(p.linearProjectId)]);
      out[key] = { issues, milestones };
    })
  );
  return out;
}

// ---------- Upstream (board Kanban da aba admin) ----------
const UP_PROJECT_Q = `
  query($slug: String!) {
    projects(filter: { slugId: { eq: $slug } }, first: 1) { nodes { id name url state } }
  }`;
const UP_ISSUES_Q = `
  query($id: ID!, $after: String) {
    issues(filter: { project: { id: { eq: $id } } }, first: 100, after: $after, orderBy: updatedAt) {
      pageInfo { hasNextPage endCursor }
      nodes {
        identifier title url createdAt updatedAt
        state { name type }
        assignee { name }
        creator { name }
        labels { nodes { name color parent { name } } }
      }
    }
  }`;
const UP_LANES_Q = `
  query($g: String!) {
    issueLabels(filter: { parent: { name: { eq: $g } } }, first: 50) { nodes { name color } }
  }`;
const UP_HISTORY_Q = `
  query($id: String!) {
    issue(id: $id) { history(first: 100) { nodes { createdAt addedLabels { name } } } }
  }`;

export async function syncUpstream() {
  const pr = await gql(UP_PROJECT_Q, { slug: UPSTREAM.projectSlug });
  const project = pr.projects.nodes[0];
  if (!project) throw new Error(`Projeto Upstream (${UPSTREAM.projectSlug}) não encontrado no Linear`);

  const nodes = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const d = await gql(UP_ISSUES_Q, { id: project.id, after });
    nodes.push(...d.issues.nodes);
    if (!d.issues.pageInfo.hasNextPage) break;
    after = d.issues.pageInfo.endCursor;
  }

  let lanes = [];
  try {
    const d = await gql(UP_LANES_Q, { g: UPSTREAM.labelGroup });
    lanes = d.issueLabels.nodes.map((l) => ({ name: l.name, color: l.color })).sort((a, b) => a.name.localeCompare(b.name, "pt", { numeric: true }));
  } catch {
    const seen = new Map();
    for (const n of nodes) for (const l of n.labels.nodes) if (l.parent?.name === UPSTREAM.labelGroup) seen.set(l.name, l.color);
    lanes = [...seen].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name, "pt", { numeric: true }));
  }

  const current = await store.hgetall("col:upstream");
  const prevDoc = (id) => { try { return current[id] ? JSON.parse(current[id]) : null; } catch { return null; } };
  const docs = {};
  await Promise.all(
    nodes.map(async (n) => {
      const laneLabel = n.labels.nodes.find((l) => l.parent?.name === UPSTREAM.labelGroup);
      const lane = laneLabel?.name || null;
      let laneSince = n.updatedAt, approx = true;
      const prev = prevDoc(n.identifier);
      if (lane && prev && prev.lane === lane && prev.laneSince) {
        // já sabemos desde quando está nessa raia — evita 1 consulta de histórico por issue a cada webhook
        laneSince = prev.laneSince; approx = !!prev.laneSinceApprox;
      } else if (lane) {
        try {
          const h = await gql(UP_HISTORY_Q, { id: n.identifier });
          const hits = (h.issue.history.nodes || []).filter((x) => (x.addedLabels || []).some((l) => l.name === lane)).map((x) => x.createdAt).sort();
          if (hits.length) { laneSince = hits[hits.length - 1]; approx = false; }
        } catch { /* mantém aproximação por updatedAt */ }
      }
      docs[n.identifier] = {
        identifier: n.identifier, title: n.title, url: n.url,
        status: n.state?.name, statusType: n.state?.type,
        assignee: n.assignee?.name || null, createdBy: n.creator?.name || null,
        labels: n.labels.nodes.filter((l) => l.parent?.name !== UPSTREAM.labelGroup).map((l) => l.name),
        lane, laneSince, laneSinceApprox: approx,
        createdAt: n.createdAt, updatedAt: n.updatedAt,
      };
    })
  );
  docs._meta = {
    lanes, projectName: project.name, projectStatus: project.state, projectUrl: project.url || UPSTREAM.projectUrl,
    source: `Linear · projeto ${project.name}`, syncedAt: new Date().toISOString(),
  };

  const stale = Object.keys(current).filter((id) => !(id in docs));
  await store.hset("col:upstream", Object.fromEntries(Object.entries(docs).map(([id, v]) => [id, JSON.stringify(v)])));
  await store.hdel("col:upstream", ...stale);
  await store.incr("ver:upstream");
  return { issues: nodes.length };
}

// ---------- Atualização completa ----------
// Com trava (evita rajadas de webhook) e "pending": se chegar evento durante a atualização, roda mais uma vez.
export async function refreshAll({ reason = "manual" } = {}) {
  if (!(await store.lock("lock:refresh", 25))) {
    await store.set("refresh:pending", "1");
    return { skipped: true, reason: "já existe uma atualização em andamento (será repetida ao final)" };
  }
  let result;
  try {
    for (let round = 0; round < 3; round++) {
      await store.del("refresh:pending");
      result = await runRefresh(reason);
      if (!(await store.get("refresh:pending"))) break;
    }
  } finally {
    await store.del("lock:refresh");
  }
  return result;
}

async function runRefresh(reason) {
  const all = await fetchAllProjects();
  const writes = {};
  const warnings = [];
  const summary = {};
  for (const [key, { issues, milestones }] of Object.entries(all)) {
    const blocks = buildProjectBlocks({ issues, milestones, blockers: BLOCKERS[key] || [] });
    for (const [section, html] of Object.entries(blocks)) {
      if (section.startsWith("_")) continue;
      writes[`${key}:${section}`] = html;
    }
    for (const w of blocks._warnings) warnings.push(`${PROJECTS[key].name}: ${w}`);
    summary[key] = { issues: issues.length, milestones: milestones.map((m) => ({ name: m.name.trim(), progress: m.progress })) };
  }
  await store.hset("live", writes);
  let upstream = null;
  try { upstream = await syncUpstream(); } catch (e) { warnings.push(`Upstream: ${e.message}`); }
  const meta = { syncedAt: new Date().toISOString(), reason, warnings };
  await store.set("live:meta", JSON.stringify(meta));
  await store.incr("ver:live");
  return { ok: true, syncedAt: meta.syncedAt, summary, upstream, warnings };
}
