/* Migrations versionadas.
 *
 * Cada arquivo .sql da pasta migrations roda uma vez, em ordem de nome, dentro
 * de uma transacao, e fica registrado. Rodar duas vezes nao repete nada — o que
 * permite chamar isto na subida do servidor sem passo manual na loja. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";
import { logger } from "../lib/logger.js";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function migrar() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      nome       TEXT PRIMARY KEY,
      aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const aplicadas = new Set(db.prepare("SELECT nome FROM migrations").all().map(linha => linha.nome));
  const arquivos = fs.readdirSync(PASTA).filter(nome => nome.endsWith(".sql")).sort();
  const novas = arquivos.filter(nome => !aplicadas.has(nome));

  if (!novas.length) {
    logger.debug("Banco ja atualizado", { migrations: arquivos.length });
    return { aplicadas: [] };
  }

  for (const nome of novas) {
    const sql = fs.readFileSync(path.join(PASTA, nome), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (nome) VALUES (?)").run(nome);
      db.exec("COMMIT");
      logger.info("Migration aplicada", { nome });
    } catch (erro) {
      db.exec("ROLLBACK");
      logger.error("Migration falhou", { nome, erro: erro.message });
      throw new Error(`Migration ${nome} falhou: ${erro.message}`);
    }
  }
  return { aplicadas: novas };
}

/* Execucao direta: npm run migrate */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrate.js")) {
  const { aplicadas } = migrar();
  console.log(aplicadas.length ? `Aplicadas: ${aplicadas.join(", ")}` : "Nada a aplicar. Banco atualizado.");
}
