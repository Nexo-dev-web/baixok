/* Regras do salao: abertura, comanda e fechamento de conta.
 *
 * A taxa de servico de 10% era a constante SERVICE_FEE dentro do app.js — logo,
 * editavel por qualquer cliente no devtools antes de a conta ser montada. Agora
 * vem dos ajustes da casa e o total e fechado aqui. */
import { emTransacao } from "../db/connection.js";
import { mesasRepo } from "../repositories/mesas.repo.js";
import { pedidosRepo } from "../repositories/pedidos.repo.js";
import { ajustesRepo } from "../repositories/ajustes.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { naoEncontrado, conflito } from "../lib/errors.js";
import { publicar, CANAL } from "../lib/events.js";

function montarConta(mesa) {
  const subtotal = mesa.items.reduce((soma, item) => soma + item.price * item.qty, 0);
  const percentual = ajustesRepo.lerNumero("taxa_servico_mesa");
  const servico = Math.round(subtotal * percentual * 100) / 100;
  return {
    subtotal,
    percentualServico: percentual,
    servico,
    total: Math.round((subtotal + servico) * 100) / 100
  };
}

export const mesasService = {
  listar() {
    return mesasRepo.listar().map(mesa => ({ ...mesa, conta: montarConta(mesa) }));
  },

  listarPublico: () => mesasRepo.listarPublico(),

  buscar(n) {
    const mesa = mesasRepo.buscar(n);
    if (!mesa) throw naoEncontrado("Mesa nao encontrada.");
    return { ...mesa, conta: montarConta(mesa) };
  },

  /* Comanda que o cliente ve depois de ler o QR code.
   * So itens e valores da propria mesa: nada de telefone, nome de outro cliente
   * ou qualquer coisa das demais mesas. */
  comandaPublica(n) {
    const mesa = mesasRepo.buscar(n);
    if (!mesa) throw naoEncontrado("Mesa nao encontrada.");
    return {
      n: mesa.n,
      status: mesa.status,
      aberta: mesa.status === "aberta",
      items: mesa.items.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
      conta: montarConta(mesa)
    };
  },

  adicionar({ usuario, ip }) {
    const n = mesasRepo.proximoNumero();
    const mesa = mesasRepo.criar(n);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "mesa_criada",
      entidade: "mesa", entidadeId: n, ip
    });
    publicar("mesas", [CANAL.OPERACAO, CANAL.PUBLICO]);
    return mesa;
  },

  remover(n, { usuario, ip }) {
    const mesa = this.buscar(n);
    if (mesa.status !== "livre") throw conflito("Feche a comanda antes de remover a mesa.");
    mesasRepo.remover(n);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "mesa_removida",
      entidade: "mesa", entidadeId: n, ip
    });
    publicar("mesas", [CANAL.OPERACAO, CANAL.PUBLICO]);
  },

  /* Abrir a mesa e o que libera o QR code a aceitar pedido. */
  abrir(n, { usuario, ip }) {
    const mesa = this.buscar(n);
    if (mesa.status === "aberta") return mesa;
    const aberta = mesasRepo.abrir(n);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "mesa_aberta",
      entidade: "mesa", entidadeId: n, ip
    });
    publicar("mesas", [CANAL.OPERACAO, CANAL.PUBLICO]);
    return { ...aberta, conta: montarConta(aberta) };
  },

  /* Fechar a conta trava o QR e devolve o extrato para impressao. O pagamento
   * acontece no balcao; liberar a mesa e um segundo passo, deliberadamente. */
  fecharConta(n, { usuario, ip }) {
    const mesa = this.buscar(n);
    if (mesa.status === "livre") throw conflito("Esta mesa nao tem comanda aberta.");

    mesasRepo.marcarFechando(n);
    const conta = montarConta(mesa);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "mesa_conta_fechada",
      entidade: "mesa", entidadeId: n, detalhes: conta, ip
    });
    publicar("mesas", [CANAL.OPERACAO, CANAL.PUBLICO]);

    return {
      mesa: n,
      abertaEm: mesa.openedAt,
      items: mesa.items,
      pedidos: pedidosRepo.listarDaMesa(n).map(pedido => pedido.id),
      ...conta
    };
  },

  /* Libera a mesa para o proximo cliente e zera a comanda. Os itens continuam
   * nos pedidos, que sao o registro contabil. */
  liberar(n, { usuario, ip }) {
    const mesa = this.buscar(n);
    const liberada = emTransacao(() => mesasRepo.liberar(n));
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "mesa_liberada",
      entidade: "mesa", entidadeId: n, detalhes: { itensNaComanda: mesa.items.length }, ip
    });
    publicar("mesas", [CANAL.OPERACAO, CANAL.PUBLICO]);
    return liberada;
  }
};
