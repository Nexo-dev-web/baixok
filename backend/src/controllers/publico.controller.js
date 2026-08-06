/* Rotas abertas: o cardapio do cliente e a comanda de mesa por QR code.
 *
 * Este arquivo e a fronteira de exposicao do sistema. Tudo que sai daqui e
 * visivel para qualquer pessoa na internet, entao cada resposta devolve o
 * minimo. E o oposto do /api/state antigo, que mandava o banco quase inteiro —
 * cupons, faixas de entrega com taxa, estoque e itens de todas as mesas — para
 * quem simplesmente abrisse o cardapio. */
import { produtosService } from "../services/produtos.service.js";
import { mesasService } from "../services/mesas.service.js";
import { pedidosService } from "../services/pedidos.service.js";
import { cuponsService } from "../services/cupons.service.js";
import { entregaService } from "../services/entrega.service.js";
import { ajustesRepo } from "../repositories/ajustes.repo.js";
import { tokenPublico, temToken } from "../lib/mapbox.js";
import { ipDe } from "./contexto.js";

export const publicoController = {
  /* Tudo que o cardapio precisa para desenhar, numa chamada. */
  cardapio(_req, res) {
    const ajustes = ajustesRepo.todos();
    res.json({
      produtos: produtosService.cardapioPublico(),
      entrega: entregaService.configPublica(),
      loja: {
        nome: ajustes.nome_loja,
        endereco: ajustes.endereco_loja,
        whatsapp: ajustes.whatsapp_entrega
      }
    });
  },

  /* Situacao da mesa: so o suficiente para o QR saber se pode aceitar pedido. */
  statusMesa(req, res) {
    const comanda = mesasService.comandaPublica(req.validado.params.n);
    res.json(comanda);
  },

  async criarPedido(req, res) {
    const pedido = await pedidosService.criarPublico(req.validado.body, { ip: ipDe(req) });

    /* Devolve so o comprovante do proprio pedido. O sistema antigo respondia
     * com o estado inteiro depois de gravar. */
    res.status(201).json({
      pedido: {
        id: pedido.id,
        createdAt: pedido.createdAt,
        status: pedido.status,
        customer: pedido.customer,
        items: pedido.items,
        subtotal: pedido.subtotal,
        discount: pedido.discount,
        deliveryFee: pedido.deliveryFee,
        total: pedido.total
      }
    });
  },

  /* Valida o cupom que o cliente digitou.
   *
   * Devolve so o efeito no carrinho dele. Nao existe rota publica que liste
   * cupons: o cliente precisa saber o codigo de antemao. O subtotal enviado
   * serve so para a previa — no fechamento o servidor recalcula tudo. */
  validarCupom(req, res) {
    const { code, subtotal, phone } = req.validado.body;
    const resultado = cuponsService.avaliar({ code, subtotal, telefone: phone });
    res.json({
      valido: resultado.valido,
      desconto: resultado.desconto,
      descricao: resultado.descricao || "",
      motivo: resultado.motivo || ""
    });
  },

  async cotarEntrega(req, res) {
    const { q, lng, lat } = req.validado.query;
    /* Com coordenada vinda do widget poupamos uma chamada a Mapbox. Mesmo
     * forjada so engana a propria tela: o pedido e recalculado no fechamento. */
    const resultado = Number.isFinite(lng) && Number.isFinite(lat)
      ? entregaService.calcularParaCoordenada(q, { lng, lat })
      : await entregaService.cotarPorEndereco(q);
    res.json(resultado);
  },

  async buscarEndereco(req, res) {
    res.json({ resultados: await entregaService.buscarEnderecos(req.validado.query.q) });
  },

  /* Informa se o widget da Mapbox pode ser montado no navegador.
   * Token secreto ("sk.") nunca chega aqui: tokenPublico() devolve vazio e o
   * front cai na busca via servidor. */
  statusMapbox(_req, res) {
    res.json({ configurado: temToken(), token: tokenPublico() });
  }
};
