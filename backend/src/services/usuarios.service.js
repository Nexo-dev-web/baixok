/* Gestao de usuarios. Restrito ao papel admin nas rotas. */
import { usuariosRepo } from "../repositories/usuarios.repo.js";
import { sessoesRepo } from "../repositories/sessoes.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { gerarHashSenha } from "../lib/password.js";
import { naoEncontrado, conflito, ErroApp } from "../lib/errors.js";
import { PAPEIS } from "../config/constants.js";

/* Guarda contra o sistema ficar sem ninguem capaz de administrar: rebaixar ou
 * desativar o ultimo admin ativo deixaria a loja sem quem cadastre usuario,
 * mexa em cupom ou configure entrega. */
function garantirQueSobraAdmin(alvo, mudanca) {
  const perdendoAdmin =
    alvo.papel === PAPEIS.ADMIN &&
    alvo.ativo &&
    ((mudanca.papel && mudanca.papel !== PAPEIS.ADMIN) || mudanca.ativo === false);

  if (perdendoAdmin && usuariosRepo.contarAdminsAtivos() <= 1) {
    throw conflito("Este e o unico administrador ativo. Promova outra pessoa antes.");
  }
}

export const usuariosService = {
  listar: () => usuariosRepo.listar(),

  buscar(id) {
    const usuario = usuariosRepo.buscar(id);
    if (!usuario) throw naoEncontrado("Usuario nao encontrado.");
    return usuario;
  },

  async criar(dados, { usuario: autor, ip }) {
    if (usuariosRepo.buscarPorUsuario(dados.usuario)) {
      throw conflito("Ja existe alguem com esse nome de usuario.");
    }
    const criado = usuariosRepo.criar({
      usuario: dados.usuario,
      nome: dados.nome,
      senhaHash: await gerarHashSenha(dados.senha),
      papel: dados.papel
    });
    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "usuario_criado",
      entidade: "usuario", entidadeId: criado.id, detalhes: { usuario: criado.usuario, papel: criado.papel }, ip
    });
    return criado;
  },

  atualizar(id, dados, { usuario: autor, ip }) {
    const alvo = this.buscar(id);
    garantirQueSobraAdmin(alvo, dados);

    /* Ninguem muda o proprio papel: um caixa que conseguisse chamar esta rota se
     * promoveria a admin sozinho. Trocar de papel exige outra pessoa admin. */
    if (alvo.id === autor.id && dados.papel && dados.papel !== alvo.papel) {
      throw new ErroApp("Voce nao pode alterar o proprio papel.", 403, "auto_promocao");
    }

    const atualizado = usuariosRepo.atualizar(id, dados);

    /* Desativar derruba as sessoes na hora, sem esperar os 30 dias. */
    if (dados.ativo === false) sessoesRepo.removerDoUsuario(id);

    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "usuario_alterado",
      entidade: "usuario", entidadeId: id, detalhes: dados, ip
    });
    return atualizado;
  },

  async redefinirSenha(id, senha, { usuario: autor, ip }) {
    const alvo = this.buscar(id);
    usuariosRepo.trocarSenha(id, await gerarHashSenha(senha));
    const derrubadas = sessoesRepo.removerDoUsuario(id);

    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "senha_redefinida",
      entidade: "usuario", entidadeId: id, detalhes: { alvo: alvo.usuario, sessoesEncerradas: derrubadas }, ip
    });
  },

  remover(id, { usuario: autor, ip }) {
    const alvo = this.buscar(id);
    if (alvo.id === autor.id) throw conflito("Voce nao pode remover o proprio usuario.");
    garantirQueSobraAdmin(alvo, { ativo: false });

    sessoesRepo.removerDoUsuario(id);
    usuariosRepo.remover(id);
    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "usuario_removido",
      entidade: "usuario", entidadeId: id, detalhes: { usuario: alvo.usuario }, ip
    });
  },

  auditoria: filtros => auditoriaRepo.listar(filtros)
};
