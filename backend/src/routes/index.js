/* Mapa das rotas da API.
 *
 * Tres grupos, com fronteira de acesso explicita:
 *   /api/publico  - aberto, sem sessao
 *   /api/auth     - login e sessao
 *   /api/painel   - exige sessao; o papel e checado rota a rota
 *   /api/eventos  - SSE, canal conforme o publico
 */
import { Router } from "express";
import { rotasPublicas } from "./publico.routes.js";
import { rotasAuth } from "./auth.routes.js";
import { rotasPainel } from "./painel.routes.js";
import { rotasEventos } from "./eventos.routes.js";
import { totalOuvintes } from "../lib/events.js";

export const rotasApi = Router();

rotasApi.get("/saude", (_req, res) => res.json({
  ok: true,
  versao: process.env.npm_package_version || "2.0.0",
  ouvintes: totalOuvintes()
}));

rotasApi.use("/publico", rotasPublicas);
rotasApi.use("/auth", rotasAuth);
rotasApi.use("/painel", rotasPainel);
rotasApi.use("/eventos", rotasEventos);
