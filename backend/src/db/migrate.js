/* Migrations versionadas, agora no Postgres.
 *
 * Cada arquivo .sql de migrations/postgres roda uma vez, em ordem de nome,
 * dentro de uma transacao, e fica registrado. Rodar duas vezes nao repete nada
 * — o que permite chamar isto na subida do servidor sem passo manual na loja.
 *
 * A pasta migrations/ (raiz) guarda a versao SQLite do mesmo esquema. Ela nao e
 * mais executada por ninguem: fica como referencia do que cada script Postgres
 * traduz, e e por isso que os dois lados mantem a mesma numeracao.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emTransacao, fecharPool } from "./postgres.js";
import { logger } from "../lib/logger.js";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations", "postgres");

/* Chave arbitraria e fixa do advisory lock.
 *
 * Diferente do SQLite (um arquivo, um processo), o Postgres do Supabase atende
 * varias instancias do backend ao mesmo tempo. Sem esta trava, dois processos
 * subindo juntos leem "nenhuma migration aplicada" e tentam criar as mesmas
 * tabelas — o segundo morre no CREATE TABLE e derruba a subida. Com ela, o
 * segundo espera, reconsulta ja dentro da transacao e nao encontra nada a
 * fazer. `_xact_` solta sozinho no COMMIT ou no ROLLBACK. */
const TRAVA_MIGRATIONS = 8410723;

/* Adota um banco que ja tem o esquema, mas nao tem o registro.
 *
 * O cabecalho dos .sql manda rodar 001 -> 004 no SQL Editor do Supabase, e e o
 * que foi feito antes de existir este runner. Nesse banco as tabelas existem e
 * a tabela `migrations` esta vazia — entao a primeira subida tentaria
 * `CREATE TABLE usuarios` de novo, tomaria "relation already exists" e o
 * processo morreria sem nunca atender uma requisicao.
 *
 * Marcar tudo como aplicado e o que fecha esse caso. So dispara quando o
 * esquema esta la E o registro esta vazio; num banco em branco nao acontece
 * nada e as migrations rodam normalmente. */
async function adotarEsquemaExistente(cliente, arquivos) {
  const registro = await cliente.query("SELECT 1 FROM migrations LIMIT 1");
  if (registro.rowCount) return false;

  const esquema = await cliente.query("SELECT to_regclass('usuarios') AS tabela");
  if (!esquema.rows[0].tabela) return false;

  for (const nome of arquivos) {
    await cliente.query("INSERT INTO migrations (nome) VALUES ($1) ON CONFLICT DO NOTHING", [nome]);
  }
  logger.warn("Esquema ja existia sem registro de migrations: adotado como aplicado", {
    migrations: arquivos.length
  });
  return true;
}

export async function migrar() {
  const arquivos = fs.readdirSync(PASTA).filter(nome => nome.endsWith(".sql")).sort();
  const aplicadas = [];

  for (const nome of arquivos) {
    const sql = fs.readFileSync(path.join(PASTA, nome), "utf8");

    /* Uma transacao por migration, e nao uma para todas: se a 003 falhar, a 001
     * e a 002 continuam aplicadas e registradas, e a proxima subida retoma da
     * 003. Com transacao unica, corrigir a 003 exigiria recriar tudo. */
    const rodou = await emTransacao(async cliente => {
      await cliente.query("SELECT pg_advisory_xact_lock($1)", [TRAVA_MIGRATIONS]);

      await cliente.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          nome        TEXT PRIMARY KEY,
          aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      await adotarEsquemaExistente(cliente, arquivos);

      const jaAplicada = await cliente.query("SELECT 1 FROM migrations WHERE nome = $1", [nome]);
      if (jaAplicada.rowCount) return false;

      /* Sem parametros na chamada: o `pg` usa o protocolo simples e aceita o
       * arquivo inteiro, com varios comandos, numa query so. */
      await cliente.query(sql);
      await cliente.query("INSERT INTO migrations (nome) VALUES ($1)", [nome]);
      return true;
    }).catch(erro => {
      logger.error("Migration falhou", { nome, erro: erro.message });
      throw new Error(`Migration ${nome} falhou: ${erro.message}`);
    });

    if (rodou) {
      aplicadas.push(nome);
      logger.info("Migration aplicada", { nome });
    }
  }

  if (!aplicadas.length) logger.debug("Banco ja atualizado", { migrations: arquivos.length });
  return { aplicadas };
}

/* Execucao direta: npm run migrate */
if (process.argv[1]?.endsWith("migrate.js")) {
  try {
    const { aplicadas } = await migrar();
    console.log(aplicadas.length ? `Aplicadas: ${aplicadas.join(", ")}` : "Nada a aplicar. Banco atualizado.");
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  } finally {
    await fecharPool();
  }
}
