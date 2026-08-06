/* Conexao unica com o SQLite embutido do Node.
 *
 * Sobre nao usar better-sqlite3: ele exige compilacao nativa, e a rede da loja
 * intercepta TLS — o download do binario pre-compilado falha e o node-gyp nao
 * completa. node:sqlite entrega a mesma API sincrona sem nada para compilar,
 * entao `npm ci` funciona em qualquer maquina.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

let db = null;

export function abrirBanco() {
  if (db) return db;

  fs.mkdirSync(path.dirname(env.DB_FILE), { recursive: true });
  db = new DatabaseSync(env.DB_FILE);

  /* WAL: leitura nao trava escrita. O telao e o KDS ficam consultando o tempo
   * todo enquanto o caixa grava — no modo padrao um segurava o outro. */
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  logger.info("Banco aberto", { arquivo: env.DB_FILE });
  return db;
}

export function getDb() {
  return db || abrirBanco();
}

/* Transacao de verdade em volta das operacoes compostas.
 *
 * E o que corrige a corrida de estoque do server.js: la havia um
 * `await geocodificar()` entre conferir o estoque e baixa-lo, e dois pedidos
 * simultaneos passavam pela mesma verificacao e vendiam o mesmo ultimo item.
 * Aqui o callback e sincrono por imposicao — nada de I/O de rede no meio. */
export function emTransacao(callback) {
  const banco = getDb();
  banco.exec("BEGIN IMMEDIATE");
  try {
    const resultado = callback(banco);
    banco.exec("COMMIT");
    return resultado;
  } catch (erro) {
    try { banco.exec("ROLLBACK"); } catch { /* transacao ja desfeita */ }
    throw erro;
  }
}

export function fecharBanco() {
  if (!db) return;
  try { db.close(); } catch { /* ja fechado */ }
  db = null;
}

/* Conversores: o SQLite nao tem booleano, e node:sqlite recusa `true` como
 * parametro. Centralizado aqui para nao virar `? 1 : 0` espalhado. */
export const paraSqlite = valor => (valor ? 1 : 0);
export const deSqlite = valor => valor === 1;
