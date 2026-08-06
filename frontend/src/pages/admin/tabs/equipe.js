/* Equipe e auditoria. Aba nova.
 *
 * Substitui a senha unica compartilhada: cada pessoa tem login, papel e rastro.
 * A auditoria responde "quem cancelou aquele pedido de sabado?", que antes nao
 * tinha resposta possivel. */
import { el, render, $, delegar } from "../../../utils/dom.js";
import { dataHora } from "../../../utils/formato.js";
import { PAPEIS_ROTULO } from "../../../utils/categorias.js";
import { apiUsuarios } from "../../../services/api.js";
import { estado } from "../store.js";
import { toast, toastFalha } from "../../../components/toast.js";

let usuarios = [];

const DESCRICAO_ACAO = {
  login: "entrou no sistema",
  logout: "saiu do sistema",
  pedido_criado: "pedido pelo cardapio",
  pedido_lancado: "lancou pedido manual",
  pedido_status: "mudou status do pedido",
  pedido_cancelado: "cancelou pedido",
  produto_criado: "criou produto",
  produto_alterado: "alterou produto",
  produto_removido: "excluiu produto",
  produto_pausado: "pausou produto",
  produto_ativado: "reativou produto",
  estoque_ajustado: "ajustou estoque",
  promocao_salva: "criou promocao",
  promocao_encerrada: "encerrou promocao",
  cupom_criado: "criou cupom",
  cupom_ativado: "ativou cupom",
  cupom_desativado: "desativou cupom",
  cupom_removido: "excluiu cupom",
  mesa_aberta: "abriu mesa",
  mesa_conta_fechada: "fechou conta da mesa",
  mesa_liberada: "liberou mesa",
  entrega_configurada: "configurou area de entrega",
  usuario_criado: "cadastrou usuario",
  usuario_alterado: "alterou usuario",
  usuario_removido: "removeu usuario",
  senha_trocada: "trocou a propria senha",
  senha_redefinida: "redefiniu senha de outro usuario"
};

function linhaUsuario(usuario) {
  const euMesmo = usuario.id === estado.usuario?.id;

  return el("div.user-row", { class: usuario.ativo ? "" : "muted", dataset: { id: String(usuario.id) } },
    el("div", {},
      el("strong", {}, usuario.nome),
      el("span", {}, `@${usuario.usuario}${euMesmo ? " (voce)" : ""}`)
    ),
    el("select", { dataset: { acao: "papel", id: String(usuario.id) }, disabled: euMesmo },
      ...Object.entries(PAPEIS_ROTULO).map(([chave, rotulo]) =>
        el("option", { value: chave, selected: usuario.papel === chave }, rotulo))
    ),
    el("span.small", {}, usuario.ultimoLogin ? `ultimo acesso ${dataHora(usuario.ultimoLogin)}` : "nunca acessou"),
    el("div.row-actions", {},
      el("button.ghost.small", { type: "button", dataset: { acao: "senha", id: String(usuario.id) } }, "Nova senha"),
      euMesmo ? null : el("button.ghost.small", { type: "button", dataset: { acao: "ativo", id: String(usuario.id), valor: String(!usuario.ativo) } },
        usuario.ativo ? "Desativar" : "Reativar"),
      euMesmo ? null : el("button.danger.small", { type: "button", dataset: { acao: "remover", id: String(usuario.id) } }, "Remover")
    )
  );
}

export async function desenharEquipe() {
  try {
    usuarios = (await apiUsuarios.listar()).usuarios;
  } catch (erro) {
    return toastFalha(erro, "Equipe");
  }

  render($("#user-list"), ...usuarios.map(linhaUsuario));

  try {
    const { registros } = await apiUsuarios.auditoria({ limite: 100 });
    render($("#audit-list"), ...registros.map(registro =>
      el("div.audit-row", {},
        el("span.audit-when", {}, dataHora(registro.criado_em)),
        el("strong", {}, registro.usuario || "cliente"),
        el("span", {}, DESCRICAO_ACAO[registro.acao] || registro.acao),
        el("span.small.faint", {}, registro.entidade_id ? `#${String(registro.entidade_id).slice(-8)}` : "")
      )
    ));
  } catch {
    render($("#audit-list"), el("p.faint", {}, "Nao foi possivel carregar a auditoria."));
  }
}

export function ligarEquipe() {
  $("#form-usuario")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const erro = $("#user-error");

    try {
      await apiUsuarios.criar({
        usuario: $("#user-login").value.trim().toLowerCase(),
        nome: $("#user-name").value.trim(),
        senha: $("#user-password").value,
        papel: $("#user-role").value
      });
      evento.target.reset();
      erro.classList.add("hidden");
      await desenharEquipe();
      toast("Usuario criado.");
    } catch (falha) {
      erro.textContent = falha.message;
      erro.classList.remove("hidden");
    }
  });

  const lista = $("#user-list");

  delegar(lista, "change", "[data-acao='papel']", async (_e, select) => {
    try {
      await apiUsuarios.atualizar(Number(select.dataset.id), { papel: select.value });
      await desenharEquipe();
      toast("Papel atualizado.");
    } catch (erro) {
      toastFalha(erro);
      await desenharEquipe();
    }
  });

  delegar(lista, "click", "[data-acao='ativo']", async (_e, botao) => {
    try {
      await apiUsuarios.atualizar(Number(botao.dataset.id), { ativo: botao.dataset.valor === "true" });
      await desenharEquipe();
    } catch (erro) { toastFalha(erro); }
  });

  delegar(lista, "click", "[data-acao='senha']", async (_e, botao) => {
    const senha = prompt("Nova senha (minimo 10 caracteres):");
    if (!senha) return;
    try {
      await apiUsuarios.redefinirSenha(Number(botao.dataset.id), senha);
      /* Redefinir derruba as sessoes daquela pessoa em todos os aparelhos. */
      toast("Senha redefinida. As sessoes desse usuario foram encerradas.");
    } catch (erro) { toastFalha(erro); }
  });

  delegar(lista, "click", "[data-acao='remover']", async (_e, botao) => {
    const usuario = usuarios.find(item => item.id === Number(botao.dataset.id));
    if (!confirm(`Remover ${usuario?.nome}? O historico de auditoria e mantido.`)) return;
    try {
      await apiUsuarios.remover(Number(botao.dataset.id));
      await desenharEquipe();
      toast("Usuario removido.");
    } catch (erro) { toastFalha(erro); }
  });
}
