/* Acesso a tabela `sessoes`.
 *
 * Guardamos SHA-256 do token, nunca o token. No sistema antigo os tokens iam em
 * claro para data/sessoes.json: quem conseguisse ler o arquivo — um backup em
 * pendrive, a pasta copiada por e-mail — entrava como balcao sem saber a senha.
 * Com o hash, o arquivo deixa de valer alguma coisa. */
import { createHash } from "node:crypto";
import { um, alteradas } from "../db/postgres.js";

export const hashToken = token => createHash("sha256").update(String(token)).digest("hex");

export const sessoesRepo = {
  async criar({ token, csrfToken, usuarioId, expiraEm, ip, agente }) {
    await alteradas(`
      INSERT INTO sessoes (token_hash, usuario_id, csrf_hash, expira_em, ip, agente)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [hashToken(token), usuarioId, hashToken(csrfToken), expiraEm, ip || null, (agente || "").slice(0, 200)]);
  },

  /* Devolve sessao + usuario numa consulta so, ja filtrando sessao vencida e
   * usuario desativado. Desligar alguem no painel corta o acesso na proxima
   * requisicao, sem esperar a sessao expirar.
   *
   * `expira_em` agora e TIMESTAMPTZ; o servico continua mandando a data como
   * texto 'AAAA-MM-DD HH:MM:SS' e o Postgres converte na comparacao. */
  async buscarValida(token) {
    return await um(`
      SELECT s.token_hash, s.csrf_hash, s.expira_em,
             u.id AS usuario_id, u.usuario, u.nome, u.papel, u.abas_ver, u.abas_editar
        FROM sessoes s
        JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ?
         AND s.expira_em > now()
         AND u.ativo = 1
    `, [hashToken(token)]);
  },

  async prorrogar(token, expiraEm) {
    await alteradas("UPDATE sessoes SET expira_em = ? WHERE token_hash = ?", [expiraEm, hashToken(token)]);
  },

  async remover(token) {
    await alteradas("DELETE FROM sessoes WHERE token_hash = ?", [hashToken(token)]);
  },

  /* Chamado ao trocar senha e ao desativar usuario: derruba todo aparelho onde
   * aquela pessoa estava logada. */
  async removerDoUsuario(usuarioId) {
    return await alteradas("DELETE FROM sessoes WHERE usuario_id = ?", [usuarioId]);
  },

  async limparVencidas() {
    return await alteradas("DELETE FROM sessoes WHERE expira_em <= now()");
  }
};
