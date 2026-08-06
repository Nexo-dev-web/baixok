/* Backup diario do banco.
 *
 * Mantem a garantia que o sistema antigo dava: uma copia por dia, guardando as
 * ultimas 14. A copia usa o VACUUM INTO do proprio SQLite, que produz um arquivo
 * consistente mesmo com escrita acontecendo — copiar o .sqlite com fs.copyFile
 * durante uma transacao geraria um arquivo corrompido.
 *
 * Continua sendo backup no mesmo disco: protege contra arquivo corrompido e
 * contra apagar sem querer, NAO contra o computador queimar. Copiar a pasta
 * data/ para fora de tempos em tempos continua sendo necessario. */
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { getDb } from "./connection.js";
import { logger } from "../lib/logger.js";

const BACKUPS_MANTIDOS = 14;
let backupDoDia = null;

export function fazerBackup({ forcar = false } = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (!forcar && backupDoDia === hoje) return null;

  const destino = path.join(env.BACKUP_DIR, `baixok-${hoje}.sqlite`);
  try {
    fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
    if (fs.existsSync(destino)) fs.unlinkSync(destino);

    /* VACUUM INTO nao aceita parametro: o caminho vai no SQL. Ele vem de
     * env.BACKUP_DIR + data no formato AAAA-MM-DD, nada vindo de requisicao,
     * mas escapamos a aspa simples mesmo assim. */
    getDb().exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    backupDoDia = hoje;

    const antigos = fs.readdirSync(env.BACKUP_DIR)
      .filter(nome => nome.startsWith("baixok-") && nome.endsWith(".sqlite"))
      .sort()
      .reverse()
      .slice(BACKUPS_MANTIDOS);
    for (const nome of antigos) {
      try { fs.unlinkSync(path.join(env.BACKUP_DIR, nome)); } catch { /* ja removido */ }
    }

    logger.info("Backup gravado", { arquivo: destino });
    return destino;
  } catch (erro) {
    /* Backup que falha nao pode derrubar a loja: registra e segue. */
    logger.error("Falha no backup", { erro: erro.message });
    return null;
  }
}
