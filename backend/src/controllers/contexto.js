/* Contexto da requisicao passado aos services.
 *
 * Os services nunca recebem `req`. Eles pedem exatamente { usuario, ip } — o
 * que os torna testaveis sem simular o Express e impede que alguem, la no
 * fundo da regra de negocio, alcance um header ou o corpo cru da requisicao. */
import { env } from "../config/env.js";

export const ipDe = req =>
  (env.TRUST_PROXY ? req.ip : req.socket?.remoteAddress) || "desconhecido";

export const contexto = req => ({
  usuario: req.usuario,
  ip: ipDe(req)
});
