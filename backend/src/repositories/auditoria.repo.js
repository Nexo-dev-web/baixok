/* Registro de quem fez o que.
 *
 * Nao existia: com uma senha unica compartilhada, "quem cancelou o pedido 042?"
 * era pergunta sem resposta possivel. Agora toda acao que muda dinheiro,
 * estoque ou cadastro passa por aqui. */
import { getDb } from "../db/connection.js";
import { logger } from "../lib/logger.js";

export const auditoriaRepo = {
  registrar({ usuarioId = null, usuario = null, acao, entidade = null, entidadeId = null, detalhes = null, ip = null }) {
    try {
      getDb().prepare(`
        INSERT INTO auditoria (usuario_id, usuario, acao, entidade, entidade_id, detalhes, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        usuarioId, usuario, acao, entidade,
        entidadeId === null ? null : String(entidadeId),
        detalhes ? JSON.stringify(detalhes).slice(0, 4000) : null,
        ip
      );
    } catch (erro) {
      /* Auditoria nunca derruba a operacao: perder a linha de log e ruim, mas
       * recusar o fechamento de uma conta por causa disso e pior. Fica no log
       * da aplicacao para nao passar despercebido. */
      logger.error("Falha ao gravar auditoria", { acao, erro: erro.message });
    }
  },

  listar({ limite = 200, entidade = null, usuarioId = null } = {}) {
    return getDb().prepare(`
      SELECT * FROM auditoria
       WHERE (? IS NULL OR entidade = ?)
         AND (? IS NULL OR usuario_id = ?)
       ORDER BY criado_em DESC, id DESC
       LIMIT ?
    `).all(entidade, entidade, usuarioId, usuarioId, limite)
      .map(linha => ({ ...linha, detalhes: linha.detalhes ? JSON.parse(linha.detalhes) : null }));
  }
};
