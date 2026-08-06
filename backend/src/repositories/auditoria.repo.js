/* Registro de quem fez o que.
 *
 * Nao existia: com uma senha unica compartilhada, "quem cancelou o pedido 042?"
 * era pergunta sem resposta possivel. Agora toda acao que muda dinheiro,
 * estoque ou cadastro passa por aqui. */
import { todos, alteradas } from "../db/postgres.js";
import { logger } from "../lib/logger.js";

export const auditoriaRepo = {
  async registrar({ usuarioId = null, usuario = null, acao, entidade = null, entidadeId = null, detalhes = null, ip = null }) {
    try {
      await alteradas(`
        INSERT INTO auditoria (usuario_id, usuario, acao, entidade, entidade_id, detalhes, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        usuarioId, usuario, acao, entidade,
        entidadeId === null ? null : String(entidadeId),
        detalhes ? JSON.stringify(detalhes).slice(0, 4000) : null,
        ip
      ]);
    } catch (erro) {
      /* Auditoria nunca derruba a operacao: perder a linha de log e ruim, mas
       * recusar o fechamento de uma conta por causa disso e pior. Fica no log
       * da aplicacao para nao passar despercebido.
       *
       * Cuidado a mais depois da migracao: como agora e async, quem chama sem
       * await nao veria nem a excecao. Por isso o catch fica aqui dentro. */
      logger.error("Falha ao gravar auditoria", { acao, erro: erro.message });
    }
  },

  async listar({ limite = 200, entidade = null, usuarioId = null } = {}) {
    const linhas = await todos(`
      SELECT * FROM auditoria
       WHERE (?::text IS NULL OR entidade = ?::text)
         AND (?::bigint IS NULL OR usuario_id = ?::bigint)
       ORDER BY criado_em DESC, id DESC
       LIMIT ?
    `, [entidade, entidade, usuarioId, usuarioId, limite]);

    return linhas.map(linha => ({ ...linha, detalhes: linha.detalhes ? JSON.parse(linha.detalhes) : null }));
  }
};
