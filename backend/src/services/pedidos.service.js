/* Regras de pedido. E o ponto mais sensivel do sistema.
 *
 * Principio herdado do server.js original e mantido: o navegador do cliente e
 * tratado como nao confiavel. O que chega dele diz apenas O QUE foi pedido —
 * produto e quantidade. Preco, promocao, desconto de cupom, taxa de entrega e
 * total sao refeitos aqui pelo cadastro da casa.
 *
 * Duas correcoes sobre o comportamento antigo:
 *
 * 1. CORRIDA DE ESTOQUE. Havia um `await geocodificar()` entre conferir o
 *    estoque e baixa-lo. Dois pedidos simultaneos passavam pela mesma
 *    verificacao e a casa vendia o que nao tinha. Agora toda chamada de rede
 *    acontece ANTES, e a conferencia + baixa ficam numa transacao sincrona onde
 *    o proprio UPDATE recusa quando o saldo nao cobre.
 *
 * 2. CUPOM CONTAVA USO SEM SER USADO. `cupom.uses += 1` rodava assim que o
 *    cupom era encontrado, mesmo que o pedido fosse recusado logo depois por
 *    endereco fora da area. Agora o uso e registrado no fim, junto do pedido. */
import { emTransacao } from "../db/connection.js";
import { pedidosRepo } from "../repositories/pedidos.repo.js";
import { produtosRepo } from "../repositories/produtos.repo.js";
import { promocoesRepo } from "../repositories/promocoes.repo.js";
import { mesasRepo } from "../repositories/mesas.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { cuponsService } from "./cupons.service.js";
import { entregaService } from "./entrega.service.js";
import { ErroApp, naoEncontrado, conflito } from "../lib/errors.js";
import { publicar, CANAL } from "../lib/events.js";
import { idPedido } from "../lib/ids.js";
import { STATUS_ABERTOS } from "../config/constants.js";

/* Precifica os itens pelo cadastro, ignorando qualquer preco que tenha vindo do
 * cliente. Sincrona: roda dentro da transacao. */
function precificar(itens) {
  const promocoes = new Map(promocoesRepo.listar().map(promo => [promo.productId, promo.price]));

  return itens.map(item => {
    const produto = produtosRepo.buscar(item.id);
    if (!produto) throw new ErroApp(`Produto fora do cardapio.`, 400, "produto_invalido");
    if (!produto.active) throw new ErroApp(`${produto.name} esta pausado no momento.`, 409, "produto_pausado");

    const promocional = promocoes.get(produto.id);
    return {
      id: produto.id,
      name: produto.name,
      qty: item.qty,
      price: promocional != null ? Number(promocional) : Number(produto.price)
    };
  });
}

/* Baixa o estoque item a item. O UPDATE traz `WHERE estoque >= ?` embutido:
 * se outro pedido levou a ultima unidade um instante antes, `changes` volta 0,
 * lancamos, e a transacao inteira e desfeita — inclusive as baixas anteriores. */
function baixarEstoque(itens) {
  for (const item of itens) {
    if (!produtosRepo.baixarEstoque(item.id, item.qty)) {
      const atual = produtosRepo.buscar(item.id);
      throw new ErroApp(
        `${item.name}: restam ${atual?.stock ?? 0} unidades.`,
        409,
        "estoque_insuficiente"
      );
    }
  }
}

export const pedidosService = {
  listar: filtros => pedidosRepo.listar(filtros),
  listarAbertos: () => pedidosRepo.listarAbertos(),
  listarParaTelao: () => pedidosRepo.listarParaTelao(),

  buscar(id) {
    const pedido = pedidosRepo.buscar(id);
    if (!pedido) throw naoEncontrado("Pedido nao encontrado.");
    return pedido;
  },

  /* Pedido vindo do cardapio do cliente (rota publica). */
  async criarPublico(dados, { ip }) {
    /* Passo 1 — rede fora da transacao.
     * A cotacao de entrega precisa da Mapbox; deixa-la aqui e o que permite que
     * o passo 2 seja inteiramente sincrono. */
    let entrega = { taxa: 0, km: null, zona: null, minimo: 0 };
    if (dados.fulfillment === "entrega") {
      const config = entregaService.config();
      if (config.zones.length) {
        if (!dados.place) throw new ErroApp("Informe o endereco de entrega.", 400, "endereco_ausente");
        const cotacao = await entregaService.cotarPorEndereco(dados.place);
        if (!cotacao.dentro) {
          throw new ErroApp(`Endereco fora da area de entrega (${cotacao.km} km da loja).`, 400, "fora_da_area");
        }
        entrega = { taxa: cotacao.taxa, km: cotacao.km, zona: cotacao.zona, minimo: cotacao.minimo };
      }
    }

    /* Passo 2 — tudo o mais numa transacao sincrona. */
    const pedido = emTransacao(() => {
      if (dados.tableNumber != null) {
        const mesa = mesasRepo.buscar(dados.tableNumber);
        if (!mesa || mesa.status !== "aberta") {
          throw new ErroApp("A comanda desta mesa nao esta aberta.", 409, "mesa_fechada");
        }
      }

      const itens = precificar(dados.items);
      const subtotal = itens.reduce((soma, item) => soma + item.price * item.qty, 0);

      const cupom = dados.coupon
        ? cuponsService.avaliar({ code: dados.coupon, subtotal, telefone: dados.phone })
        : { valido: false, desconto: 0 };

      /* Cupom invalido nao derruba o pedido: entra sem desconto, como o sistema
       * antigo fazia. Recusar o pedido inteiro por um codigo digitado errado
       * seria pior para a casa do que vender sem o desconto. */
      const desconto = cupom.valido ? cupom.desconto : 0;

      if (entrega.minimo && subtotal - desconto < entrega.minimo) {
        throw new ErroApp(
          `Pedido minimo de R$ ${entrega.minimo.toFixed(2)} para entrega nessa faixa.`,
          400,
          "abaixo_do_minimo"
        );
      }

      baixarEstoque(itens);

      const novo = pedidosRepo.inserir({
        id: idPedido(),
        createdAt: new Date().toISOString(),
        status: "novo",
        channel: "cardapio",
        fulfillment: dados.fulfillment,
        customer: dados.customer || "Cliente",
        phone: dados.phone,
        place: dados.place,
        note: dados.note,
        payment: dados.payment,
        trocoPara: dados.trocoPara ?? null,
        tableNumber: dados.tableNumber,
        items: itens,
        subtotal,
        discount: desconto,
        coupon: cupom.valido ? cupom.code : "",
        deliveryFee: entrega.taxa,
        deliveryKm: entrega.km,
        deliveryZone: entrega.zona,
        total: Math.round((subtotal - desconto + entrega.taxa) * 100) / 100,
        printed: false,
        stockDeducted: true,
        createdBy: null
      });

      if (cupom.valido) {
        cuponsService.registrarUso({ code: cupom.code, pedidoId: novo.id, telefone: dados.phone });
      }
      if (dados.tableNumber != null) {
        mesasRepo.adicionarItens(dados.tableNumber, novo.id, itens);
      }
      return novo;
    });

    auditoriaRepo.registrar({
      acao: "pedido_criado", entidade: "pedido", entidadeId: pedido.id,
      detalhes: { canal: "cardapio", total: pedido.total, itens: pedido.items.length }, ip
    });
    publicar("pedidos", [CANAL.OPERACAO, CANAL.TELAO, CANAL.PUBLICO]);
    return pedido;
  },

  /* Lancamento manual pelo balcao: iFood, WhatsApp, venda de salao. */
  criarManual(dados, { usuario, ip }) {
    const pedido = emTransacao(() => {
      if (dados.tableNumber != null) {
        const mesa = mesasRepo.buscar(dados.tableNumber);
        if (!mesa) throw naoEncontrado("Mesa nao encontrada.");
        if (mesa.status !== "aberta") throw conflito("Abra a comanda da mesa antes de lancar o pedido.");
      }

      const itens = precificar(dados.items);
      const subtotal = itens.reduce((soma, item) => soma + item.price * item.qty, 0);
      baixarEstoque(itens);

      const novo = pedidosRepo.inserir({
        id: idPedido(),
        createdAt: new Date().toISOString(),
        status: "novo",
        channel: dados.channel,
        fulfillment: dados.fulfillment,
        customer: dados.customer || (dados.tableNumber ? `Mesa ${dados.tableNumber}` : "Balcao"),
        phone: dados.phone,
        place: dados.place,
        note: dados.note,
        payment: dados.payment,
        trocoPara: dados.trocoPara ?? null,
        tableNumber: dados.tableNumber,
        items: itens,
        subtotal,
        discount: 0,
        coupon: "",
        deliveryFee: 0,
        deliveryKm: null,
        deliveryZone: null,
        total: subtotal,
        printed: false,
        stockDeducted: true,
        createdBy: usuario.id
      });

      if (dados.tableNumber != null) mesasRepo.adicionarItens(dados.tableNumber, novo.id, itens);
      return novo;
    });

    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "pedido_lancado",
      entidade: "pedido", entidadeId: pedido.id,
      detalhes: { canal: dados.channel, total: pedido.total, mesa: dados.tableNumber }, ip
    });
    publicar("pedidos", [CANAL.OPERACAO, CANAL.TELAO]);
    return pedido;
  },

  mudarStatus(id, status, { usuario, ip }) {
    const atual = this.buscar(id);
    if (atual.status === status) return atual;

    /* Cancelar tem regra propria (devolve estoque), entao nao entra por aqui. */
    if (status === "cancelado") return this.cancelar(id, "", { usuario, ip });

    const pedido = pedidosRepo.atualizarStatus(id, status);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "pedido_status",
      entidade: "pedido", entidadeId: id, detalhes: { de: atual.status, para: status }, ip
    });
    publicar("pedidos", [CANAL.OPERACAO, CANAL.TELAO]);
    return pedido;
  },

  /* Cancelar devolve o estoque, uma vez so.
   * `estoque_baixado` e o que impede o clique repetido de devolver duas vezes e
   * inflar o estoque — no sistema antigo essa marca existia mas nao era checada
   * de forma atomica. */
  cancelar(id, motivo, { usuario, ip }) {
    const pedido = emTransacao(() => {
      const atual = pedidosRepo.buscar(id);
      if (!atual) throw naoEncontrado("Pedido nao encontrado.");
      if (atual.status === "cancelado") throw conflito("Este pedido ja esta cancelado.");

      if (atual.stockDeducted) {
        for (const item of atual.items) {
          if (item.id) produtosRepo.devolverEstoque(item.id, item.qty);
        }
        pedidosRepo.marcarEstoqueDevolvido(id);
      }
      return pedidosRepo.atualizarStatus(id, "cancelado");
    });

    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "pedido_cancelado",
      entidade: "pedido", entidadeId: id, detalhes: { motivo, total: pedido.total }, ip
    });
    publicar("pedidos", [CANAL.OPERACAO, CANAL.TELAO, CANAL.PUBLICO]);
    return pedido;
  },

  marcarImpresso(id) {
    pedidosRepo.marcarImpresso(id);
  },

  /* Metricas da barra do topo do painel. */
  resumoDoDia() {
    const abertos = pedidosRepo.listarAbertos();
    return {
      abertos: abertos.length,
      porStatus: Object.fromEntries(
        STATUS_ABERTOS.map(status => [status, abertos.filter(pedido => pedido.status === status).length])
      )
    };
  }
};
