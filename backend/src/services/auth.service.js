/* Autenticacao: login, sessao e troca de senha.
 *
 * O que mudou em relacao ao sistema antigo: la havia uma senha unica da loja,
 * guardada em texto puro em data/senha.txt, e a sessao era um booleano
 * ("balcao: sim/nao"). Quem entrava podia tudo, e nada ficava registrado.
 * Agora cada pessoa tem login proprio, papel e rastro na auditoria. */
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { usuariosRepo } from "../repositories/usuarios.repo.js";
import { sessoesRepo } from "../repositories/sessoes.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { gerarHashSenha, conferirSenha, gastarTempoDeHash } from "../lib/password.js";
import { ErroApp, naoAutenticado, conflito } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/* Trava por conta, alem do limite por IP que o middleware ja aplica.
 * Sozinho, o limite por IP nao protege: uma botnet distribui as tentativas e
 * cada IP fica abaixo do teto. Travar a conta fecha esse caminho. */
const falhas = new Map();
const MAX_FALHAS = 8;
const JANELA_TRAVA_MS = 15 * 60 * 1000;

function registrarFalha(usuario) {
  const chave = String(usuario).toLowerCase();
  const agora = Date.now();
  const atual = falhas.get(chave);
  if (!atual || agora > atual.ate) {
    falhas.set(chave, { contagem: 1, ate: agora + JANELA_TRAVA_MS });
    return;
  }
  atual.contagem += 1;
}

function contaTravada(usuario) {
  const atual = falhas.get(String(usuario).toLowerCase());
  if (!atual || Date.now() > atual.ate) return false;
  return atual.contagem >= MAX_FALHAS;
}

const limparFalhas = usuario => falhas.delete(String(usuario).toLowerCase());

export function limparFalhasVencidas() {
  const agora = Date.now();
  for (const [chave, registro] of falhas) {
    if (agora > registro.ate) falhas.delete(chave);
  }
}

export const authService = {
  async login({ usuario, senha, ip, agente }) {
    if (contaTravada(usuario)) {
      throw new ErroApp("Conta bloqueada por tentativas seguidas. Espere 15 minutos.", 429, "conta_travada");
    }

    const encontrado = usuariosRepo.buscarPorUsuarioComHash(usuario);

    /* Mesmo sem usuario gastamos o tempo do hash. Sem isso, "login inexistente"
     * responde na hora e "senha errada" demora ~100ms — a diferenca entrega
     * quais logins existem na loja. */
    if (!encontrado || encontrado.ativo !== 1) {
      await gastarTempoDeHash();
      registrarFalha(usuario);
      logger.warn("Login recusado", { usuario, motivo: encontrado ? "inativo" : "inexistente", ip });
      throw new ErroApp("Usuario ou senha invalidos.", 401, "credenciais_invalidas");
    }

    if (!(await conferirSenha(senha, encontrado.senha_hash))) {
      registrarFalha(usuario);
      logger.warn("Login recusado", { usuario, motivo: "senha", ip });
      throw new ErroApp("Usuario ou senha invalidos.", 401, "credenciais_invalidas");
    }

    limparFalhas(usuario);

    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiraEm = new Date(Date.now() + env.SESSION_TTL_MS).toISOString().replace("T", " ").slice(0, 19);

    sessoesRepo.criar({ token, csrfToken, usuarioId: encontrado.id, expiraEm, ip, agente });
    usuariosRepo.registrarLogin(encontrado.id);
    auditoriaRepo.registrar({
      usuarioId: encontrado.id, usuario: encontrado.usuario, acao: "login", entidade: "sessao", ip
    });

    return {
      token,
      csrfToken,
      usuario: {
        id: encontrado.id,
        usuario: encontrado.usuario,
        nome: encontrado.nome,
        papel: encontrado.papel
      }
    };
  },

  logout({ token, usuarioAtual, ip }) {
    if (!token) return;
    sessoesRepo.remover(token);
    if (usuarioAtual) {
      auditoriaRepo.registrar({
        usuarioId: usuarioAtual.id, usuario: usuarioAtual.usuario, acao: "logout", entidade: "sessao", ip
      });
    }
  },

  /* Resolve a sessao do cookie. Devolve null em vez de lancar: quem decide se a
   * rota exige login e o middleware, nao esta funcao — o cardapio publico
   * tambem chama isto so para saber se deve mostrar o link do painel. */
  resolverSessao(token) {
    if (!token) return null;
    const sessao = sessoesRepo.buscarValida(token);
    if (!sessao) return null;
    return {
      usuario: {
        id: sessao.usuario_id,
        usuario: sessao.usuario,
        nome: sessao.nome,
        papel: sessao.papel
      },
      csrfHash: sessao.csrf_hash,
      expiraEm: sessao.expira_em
    };
  },

  async trocarPropriaSenha({ usuarioAtual, senhaAtual, senhaNova, token, ip }) {
    const encontrado = usuariosRepo.buscarPorUsuarioComHash(usuarioAtual.usuario);
    if (!encontrado || !(await conferirSenha(senhaAtual, encontrado.senha_hash))) {
      throw naoAutenticado("Senha atual incorreta.");
    }
    if (await conferirSenha(senhaNova, encontrado.senha_hash)) {
      throw conflito("A senha nova precisa ser diferente da atual.");
    }

    usuariosRepo.trocarSenha(encontrado.id, await gerarHashSenha(senhaNova));

    /* Derruba as outras sessoes da pessoa e mantem a atual. Trocar senha porque
     * "acho que alguem viu" so serve se expulsar quem estava dentro. */
    sessoesRepo.removerDoUsuario(encontrado.id);
    const csrfToken = randomBytes(32).toString("base64url");
    const novoToken = token || randomBytes(32).toString("base64url");
    const expiraEm = new Date(Date.now() + env.SESSION_TTL_MS).toISOString().replace("T", " ").slice(0, 19);
    sessoesRepo.criar({ token: novoToken, csrfToken, usuarioId: encontrado.id, expiraEm, ip, agente: "" });

    auditoriaRepo.registrar({
      usuarioId: encontrado.id, usuario: encontrado.usuario, acao: "senha_trocada", entidade: "usuario",
      entidadeId: encontrado.id, ip
    });

    return { token: novoToken, csrfToken };
  }
};
