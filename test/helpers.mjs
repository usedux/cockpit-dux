import { sessionCookieValue, upsertUser } from "../lib/auth.js";
import { store } from "../lib/store.js";
import { startServer } from "../dev/server.mjs";
import { createMock } from "../dev/mock-linear.mjs";

process.env.SESSION_SECRET = "teste-segredo-com-mais-de-16-caracteres";
process.env.LINEAR_API_KEY = "mock";
process.env.LINEAR_WEBHOOK_SECRET = "whsec_teste";
process.env.CRON_SECRET = "cron_teste";
process.env.ADMIN_EMAILS = "lucashenning@wearedux.com";
delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.REDIS_URL;

export async function boot() {
  store._reset();
  const mock = createMock().install();
  const srv = await startServer({ port: 0 });
  const base = `http://localhost:${srv.port}`;
  const cookieFor = async (email, name) => { const u = await upsertUser({ email, name }); return `dux_session=${encodeURIComponent(sessionCookieValue(u))}`; };
  return { base, mock, srv, cookieFor, close: async () => { mock.uninstall(); await srv.close(); } };
}
export const call = (base, path, { cookie, method = "GET", body, headers = {} } = {}) =>
  fetch(base + path, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
