/* Tratamento central de erro.
 *
 * O server.js antigo respondia `{ erro: error.message }` para qualquer falha,
 * inclusive as internas — um ENOENT devolvia o caminho absoluto do arquivo no
 * disco para o navegador. Aqui so o que foi lancado de proposito (ErroApp)
 * chega ao cliente; o resto vira 500 generico e o detalhe fica no log. */
import { ErroApp } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function rotaNaoEncontrada(req, _res, next) {
  next(new ErroApp(`Rota nao encontrada: ${req.method} ${req.path}`, 404, "rota_desconhecida"));
}

// A assinatura de 4 argumentos e o que faz o Express reconhecer o handler de erro.
// eslint-disable-next-line no-unused-vars
export function tratarErro(erro, req, res, _next) {
  const esperado = erro instanceof ErroApp;
  const status = esperado ? erro.status : 500;

  if (!esperado) {
    logger.error("Erro nao tratado", {
      rota: `${req.method} ${req.path}`,
      erro: erro.message,
      stack: env.ehProducao ? undefined : erro.stack,
      usuario: req.usuario?.usuario
    });
  } else if (status >= 500) {
    logger.error("Erro de servico", { rota: `${req.method} ${req.path}`, erro: erro.message });
  }

  if (res.headersSent) return;

  res.status(status).json({
    erro: esperado ? erro.message : "Erro interno. Tente novamente.",
    codigo: esperado ? erro.codigo : "erro_interno",
    ...(esperado && erro.detalhes ? { detalhes: erro.detalhes } : {})
  });
}
