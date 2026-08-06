/* Gestao de usuarios. Restrito ao papel admin nas rotas. */
import { usuariosRepo } from "../repositories/usuarios.repo.js";
import { sessoesRepo } from "../repositories/sessoes.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { gerarHashSenha } from "../lib/password.js";
import { naoEncontrado, conflito, ErroApp } from "../lib/errors.js";
import { PAPEIS } from "../config/constants.js";
import { logger } from "../lib/logger.js";
import { supabaseAuth } from "./supabase-auth.js";

const ABAS_POR_PADRAO = {
  [PAPEIS.ADMIN]: ["pedidos", "mesas", "produtos", "promos", "entrega", "estoque", "dashboard", "plano", "usuarios"],
  [PAPEIS.CAIXA]: ["pedidos", "mesas", "estoque"],
  [PAPEIS.COZINHA]: ["pedidos"]
};

const EDITAVEIS_POR_PADRAO = {
  [PAPEIS.ADMIN]: ["pedidos", "mesas", "produtos", "promos", "entrega", "estoque", "dashboard", "plano", "usuarios"],
  [PAPEIS.CAIXA]: ["pedidos", "mesas", "estoque"],
  [PAPEIS.COZINHA]: []
};

function normalizarLista(valor, fallback = []) {
  if (Array.isArray(valor)) return [...new Set(valor.map(item => String(item).trim()).filter(Boolean))];
  return [...fallback];
}

async function resolverAuthId(usuario) {
  if (!supabaseAuth.ativo()) return null;
  if (usuario?.authId) return usuario.authId;
  const auth = await supabaseAuth.buscarUsuarioPorEmail(usuario?.usuario);
  return auth?.id || null;
}

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
    if (supabaseAuth.ativo()) {
      const authExistente = await supabaseAuth.buscarUsuarioPorEmail(dados.usuario);
      if (authExistente) throw conflito("Ja existe alguem com esse nome de usuario.");
    }
    const abasVer = normalizarLista(dados.abasVer, ABAS_POR_PADRAO[dados.papel] || ["pedidos"]);
    const abasEditar = normalizarLista(dados.abasEditar, EDITAVEIS_POR_PADRAO[dados.papel] || []);
    const senhaHash = await gerarHashSenha(dados.senha);
    let authId = null;

    if (supabaseAuth.ativo()) {
      const authUser = await supabaseAuth.criarUsuario({
        email: dados.usuario,
        senha: dados.senha,
        nome: dados.nome,
        papel: dados.papel,
        abasVer,
        abasEditar
      });
      authId = authUser.id;
    }

    let criado;
    try {
      criado = usuariosRepo.criar({
        usuario: dados.usuario,
        nome: dados.nome,
        senhaHash,
        papel: dados.papel,
        abasVer,
        abasEditar,
        authId
      });
    } catch (erro) {
      if (authId && supabaseAuth.ativo()) {
        try {
          await supabaseAuth.removerUsuario(authId);
        } catch (limpezaErro) {
          logger.warn("Falha ao desfazer usuario no Supabase apos erro local", {
            authId,
            erro: limpezaErro.message
          });
        }
      }
      throw erro;
    }
    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "usuario_criado",
      entidade: "usuario", entidadeId: criado.id, detalhes: { usuario: criado.usuario, papel: criado.papel }, ip
    });
    return criado;
  },

  async atualizar(id, dados, { usuario: autor, ip }) {
    const alvo = this.buscar(id);
    garantirQueSobraAdmin(alvo, dados);

    /* Ninguem muda o proprio papel: um caixa que conseguisse chamar esta rota se
     * promoveria a admin sozinho. Trocar de papel exige outra pessoa admin. */
    if (alvo.id === autor.id && dados.papel && dados.papel !== alvo.papel) {
      throw new ErroApp("Voce nao pode alterar o proprio papel.", 403, "auto_promocao");
    }

    const abasVer = dados.abasVer === undefined ? undefined : normalizarLista(dados.abasVer, []);
    const abasEditar = dados.abasEditar === undefined ? undefined : normalizarLista(dados.abasEditar, []);
    const atualizado = usuariosRepo.atualizar(id, { ...dados, abasVer, abasEditar });

    if (supabaseAuth.ativo()) {
      const authId = await resolverAuthId(atualizado);
      if (authId) {
        try {
          await supabaseAuth.sincronizarMetadados(authId, {
            nome: atualizado.nome,
            papel: atualizado.papel,
            abasVer: atualizado.abasVer,
            abasEditar: atualizado.abasEditar
          });
        } catch (erro) {
          logger.warn("Nao foi possivel sincronizar metadados do usuario no Supabase", {
            authId,
            usuarioId: atualizado.id,
            erro: erro.message
          });
        }
      }
    }

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
    if (supabaseAuth.ativo()) {
      const authId = await resolverAuthId(alvo);
      if (authId) {
        await supabaseAuth.atualizarSenha(authId, senha);
      }
    }
    usuariosRepo.trocarSenha(id, await gerarHashSenha(senha));
    const derrubadas = sessoesRepo.removerDoUsuario(id);

    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "senha_redefinida",
      entidade: "usuario", entidadeId: id, detalhes: { alvo: alvo.usuario, sessoesEncerradas: derrubadas }, ip
    });
  },

  async remover(id, { usuario: autor, ip }) {
    const alvo = this.buscar(id);
    if (alvo.id === autor.id) throw conflito("Voce nao pode remover o proprio usuario.");
    garantirQueSobraAdmin(alvo, { ativo: false });

    sessoesRepo.removerDoUsuario(id);
    if (supabaseAuth.ativo()) {
      const authId = await resolverAuthId(alvo);
      if (authId) await supabaseAuth.removerUsuario(authId);
    }
    usuariosRepo.remover(id);
    auditoriaRepo.registrar({
      usuarioId: autor.id, usuario: autor.usuario, acao: "usuario_removido",
      entidade: "usuario", entidadeId: id, detalhes: { usuario: alvo.usuario }, ip
    });
  },

  auditoria: filtros => auditoriaRepo.listar(filtros)
};
