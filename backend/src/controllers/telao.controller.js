/* Telao do salao.
 *
 * Fica numa TV virada para o publico, entao a resposta carrega o minimo: nome
 * de chamada e situacao. Telefone, endereco, itens e valores nao aparecem nem
 * na resposta da API — quem fotografar a tela nao leva dado de ninguem. */
import { pedidosService } from "../services/pedidos.service.js";

export const telaoController = {
  async fila(_req, res) {
    const fila = await pedidosService.listarParaTelao();
    res.set("Cache-Control", "no-store").json({
      preparo: fila.filter(pedido => pedido.status === "preparo"),
      pronto: fila.filter(pedido => pedido.status === "pronto")
    });
  }
};
