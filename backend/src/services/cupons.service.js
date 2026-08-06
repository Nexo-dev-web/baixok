/* Regras de cupom.
 *
 * O desconto e resolvido aqui e so aqui. O carrinho do cliente calcula um valor
 * para mostrar na tela, mas o que vale e o que sai desta funcao no fechamento
 * do pedido. */
import { cuponsRepo } from "../repositories/cupons.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { conflito, naoEncontrado } from "../lib/errors.js";
import { publicar, CANAL } from "../lib/events.js";

/* Resultado uniforme: { valido, desconto, motivo }.
 *
 * Nunca informa se o codigo existe mas esta inativo, nem se venceu — a resposta
 * para qualquer cupom inutilizavel e a mesma. Diferenciar permitiria descobrir
 * codigos por tentativa. */
function recusar(motivo) {
  return { valido: false, desconto: 0, motivo };
}

export const cuponsService = {
  listar: () => cuponsRepo.listar(),

  /* Avaliacao usada tanto pela previa do carrinho quanto pelo fechamento.
   * Sincrona de proposito: roda dentro da transacao do pedido. */
  avaliar({ code, subtotal, telefone = "" }) {
    if (!code) return recusar("Informe um codigo.");

    const cupom = cuponsRepo.buscarAtivo(code);
    if (!cupom) return recusar("Cupom invalido ou expirado.");

    if (subtotal < Number(cupom.min || 0)) {
      /* Este motivo pode ser especifico: o cliente ja provou conhecer o codigo,
       * e sem a explicacao ele nao sabe o que fazer para usar o desconto. */
      return recusar(`Este cupom vale a partir de R$ ${Number(cupom.min).toFixed(2)}.`);
    }

    if (cupom.once && telefone && cuponsRepo.jaUsouPorTelefone(cupom.code, telefone)) {
      return recusar("Este cupom ja foi usado neste telefone.");
    }

    const bruto = cupom.kind === "pct" ? subtotal * (Number(cupom.amount) / 100) : Number(cupom.amount);
    const desconto = Math.min(subtotal, Math.round(bruto * 100) / 100);

    return {
      valido: true,
      desconto,
      code: cupom.code,
      descricao: cupom.kind === "pct" ? `${cupom.amount}% de desconto` : `R$ ${Number(cupom.amount).toFixed(2)} de desconto`,
      motivo: ""
    };
  },

  /* Chamado dentro da transacao do pedido, depois do desconto aplicado. */
  registrarUso({ code, pedidoId, telefone }) {
    cuponsRepo.incrementarUsos(code);
    cuponsRepo.registrarResgate({ code, pedidoId, telefone });
  },

  criar(dados, { usuario, ip }) {
    if (cuponsRepo.buscar(dados.code)) throw conflito("Ja existe um cupom com esse codigo.");
    const cupom = cuponsRepo.criar(dados);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "cupom_criado",
      entidade: "cupom", entidadeId: cupom.code, detalhes: { tipo: cupom.kind, valor: cupom.amount }, ip
    });
    publicar("cupons", [CANAL.OPERACAO]);
    return cupom;
  },

  alternarAtivo(code, { usuario, ip }) {
    if (!cuponsRepo.buscar(code)) throw naoEncontrado("Cupom nao encontrado.");
    const cupom = cuponsRepo.alternarAtivo(code);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario,
      acao: cupom.active ? "cupom_ativado" : "cupom_desativado",
      entidade: "cupom", entidadeId: code, ip
    });
    publicar("cupons", [CANAL.OPERACAO]);
    return cupom;
  },

  remover(code, { usuario, ip }) {
    if (!cuponsRepo.remover(code)) throw naoEncontrado("Cupom nao encontrado.");
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "cupom_removido",
      entidade: "cupom", entidadeId: code, ip
    });
    publicar("cupons", [CANAL.OPERACAO]);
  }
};
