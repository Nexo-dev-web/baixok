/* Server-Sent Events: avisa os aparelhos que algo mudou.
 *
 * O canal depende de quem esta pedindo, e nao de um parametro da URL. Sem isso,
 * bastaria pedir `?canal=operacao` para o navegador de um cliente ficar sabendo
 * de toda movimentacao da cozinha. O evento nao carrega dado — so diz "pedidos
 * mudaram" — mas ate esse sinal e informacao sobre o movimento da casa. */
import { Router } from "express";
import { inscrever, cancelarInscricao, revisaoAtual, CANAL } from "../lib/events.js";
import { telaoController } from "../controllers/telao.controller.js";
import { exigirLogin } from "../middlewares/auth.js";

export const rotasEventos = Router();

function abrirFluxo(req, res, canais) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  if (!inscrever(res, canais)) {
    res.write(`event: cheio\ndata: {}\n\n`);
    return res.end();
  }

  res.write(`event: pronto\ndata: ${JSON.stringify({ rev: revisaoAtual() })}\n\n`);
  req.on("close", () => cancelarInscricao(res));
}

/* Cardapio do cliente: so sabe que o cardapio mudou. */
rotasEventos.get("/publico", (req, res) => abrirFluxo(req, res, [CANAL.PUBLICO]));

/* Painel e cozinha: precisa de sessao. */
rotasEventos.get("/operacao", exigirLogin, (req, res) => abrirFluxo(req, res, [CANAL.OPERACAO]));

/* Telao do salao: precisa de sessao, e recebe so a fila de chamada. */
rotasEventos.get("/telao", exigirLogin, (req, res) => abrirFluxo(req, res, [CANAL.TELAO]));

/* A fila em si, consumida pelo telao a cada aviso. */
rotasEventos.get("/telao/fila", exigirLogin, telaoController.fila);
