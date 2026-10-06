// Servidor local que imita a Vercel (rewrites + /api/*) — `npm run dev`.
// Sem Redis configurado usa memória; com DEV_AUTH_EMAIL entra direto (login do Google não é necessário no local).
//   MOCK_LINEAR=1 usa dados de exemplo no lugar do Linear real.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function startServer({ port = 3000 } = {}) {
  const handlers = {};
  const load = async (name) => (handlers[name] ||= (await import(pathToFileURL(join(root, "api", name + ".js")).href)).default);
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    let name = null, extra = "";
    if (u.pathname === "/") name = "page";
    else if (u.pathname.startsWith("/auth/")) { name = "auth"; extra = "action=" + u.pathname.slice(6); }
    else if (u.pathname.startsWith("/_blob/")) { name = "blob"; extra = "id=" + u.pathname.slice(7); }
    else if (/^\/api\/[a-z-]+$/.test(u.pathname)) name = u.pathname.slice(5);
    if (name && existsSync(join(root, "api", name + ".js"))) {
      const q = [u.search.replace(/^\?/, ""), extra].filter(Boolean).join("&");
      req.url = u.pathname + (q ? "?" + q : "");
      return (await load(name))(req, res);
    }
    const file = join(root, "public", u.pathname.replace(/^\/+/, ""));
    if (u.pathname !== "/" && file.startsWith(join(root, "public")) && existsSync(file)) {
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type }); return res.end(readFileSync(file));
    }
    res.writeHead(404, { "Content-Type": "application/json" }); res.end('{"error":"não encontrado"}');
  });
  await new Promise((r) => server.listen(port, r));
  return { server, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.env.DEV_AUTH_EMAIL ||= "lucashenning@wearedux.com";
  process.env.SESSION_SECRET ||= "dev-secret-nao-usar-em-producao";
  if (process.env.MOCK_LINEAR) { (await import("./mock-linear.mjs")).createMock().install(); process.env.LINEAR_API_KEY ||= "mock"; }
  const { runSeed } = await import("../scripts/seed.mjs");
  await runSeed({ log: () => {} });
  const { refreshAll } = await import("../lib/linear.js");
  if (process.env.LINEAR_API_KEY) await refreshAll({ reason: "dev" }).catch((e) => console.error("refresh:", e.message));
  const s = await startServer({ port: Number(process.env.PORT || 3000) });
  console.log(`Cockpit local em http://localhost:${s.port}  (login automático como ${process.env.DEV_AUTH_EMAIL})`);
}
