/* Acesso a tabela `sessoes`.
 *
 * Guardamos SHA-256 do token, nunca o token. No sistema antigo os tokens iam em
 * claro para data/sessoes.json: quem conseguisse ler o arquivo — um backup em
 * pendrive, a pasta copiada por e-mail — entrava como balcao sem saber a senha.
 * Com o hash, o arquivo deixa de valer alguma coisa. */
import { createHash } from "node:crypto";
import { getDb } from "../db/connection.js";

export const hashToken = token => createHash("sha256").update(String(token)).digest("hex");

export const sessoesRepo = {
  criar({ token, csrfToken, usuarioId, expiraEm, ip, agente }) {
    getDb().prepare(`
      INSERT INTO sessoes (token_hash, usuario_id, csrf_hash, expira_em, ip, agente)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(hashToken(token), usuarioId, hashToken(csrfToken), expiraEm, ip || null, (agente || "").slice(0, 200));
  },

  /* Devolve sessao + usuario numa consulta so, ja filtrando sessao vencida e
   * usuario desativado. Desligar alguem no painel corta o acesso na proxima
   * requisicao, sem esperar a sessao expirar. */
  buscarValida(token) {
    return getDb().prepare(`
      SELECT s.token_hash, s.csrf_hash, s.expira_em,
             u.id AS usuario_id, u.usuario, u.nome, u.papel
        FROM sessoes s
        JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ?
         AND s.expira_em > datetime('now')
         AND u.ativo = 1
    `).get(hashToken(token)) || null;
  },

  prorrogar(token, expiraEm) {
    getDb().prepare("UPDATE sessoes SET expira_em = ? WHERE token_hash = ?").run(expiraEm, hashToken(token));
  },

  remover(token) {
    getDb().prepare("DELETE FROM sessoes WHERE token_hash = ?").run(hashToken(token));
  },

  /* Chamado ao trocar senha e ao desativar usuario: derruba todo aparelho onde
   * aquela pessoa estava logada. */
  removerDoUsuario(usuarioId) {
    return getDb().prepare("DELETE FROM sessoes WHERE usuario_id = ?").run(usuarioId).changes;
  },

  limparVencidas() {
    return getDb().prepare("DELETE FROM sessoes WHERE expira_em <= datetime('now')").run().changes;
  }
};
