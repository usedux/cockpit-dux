// Atualização manual/agendada (rede de segurança diária e botão de admin): puxa o Linear e regrava os blocos.
import { route, json } from "../lib/http.js";
import { requireCronOrAdmin } from "../lib/auth.js";
import { refreshAll } from "../lib/linear.js";

export default route(async (req, res) => {
  requireCronOrAdmin(req);
  json(res, 200, await refreshAll({ reason: "refresh agendado/manual" }));
});
