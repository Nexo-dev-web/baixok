/* Geracao de identificadores.
 *
 * O front antigo montava id com `Math.random().toString(16)`, que nao e
 * criptografico: com o instante do pedido — visivel na tela — da para reduzir
 * bastante o espaco de busca e adivinhar o id de outro pedido. Aqui vem de
 * randomBytes, e a geracao mudou de lado: quem cria id e o servidor. */
import { randomBytes } from "node:crypto";

export const uid = prefixo => `${prefixo}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;

export const idPedido = () => uid("ped");
