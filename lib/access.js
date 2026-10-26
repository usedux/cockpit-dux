// Acesso em dois níveis ao "Detalhamento de produtos":
//   1) admin (ADMIN_EMAILS) — sempre;
//   2) quem o admin liberou em Admin → Pessoas (coleção "access", um doc por pessoa com detail:true).
import { col } from "./store.js";

export async function canSeeDetail(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const rec = await col.get("access", session.id);
  return !!(rec && rec.detail === true);
}
