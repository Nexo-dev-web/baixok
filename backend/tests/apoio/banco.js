/* Banco de teste no Postgres.
 *
 * Com o SQLite cada suite abria um arquivo novo numa pasta temporaria e jogava
 * fora no fim — isolamento de graca. O Postgres nao tem equivalente disso, e a
 * alternativa ingenua (rodar na mesma base do sistema) apagaria dado real.
 *
 * O desenho aqui: cada execucao cria um SCHEMA proprio, com nome sorteado, roda
 * as migrations dentro dele e o derruba no fim. Duas suites em paralelo, ou dois
 * `npm test` ao mesmo tempo, nao se enxergam.
 *
 * REGRA QUE NAO PODE CAIR: so TEST_DATABASE_URL e aceita. Nunca cair para a
 * SUPABASE_DATABASE_URL do .env — ela aponta para a base da loja, e um
 * `DROP SCHEMA ... CASCADE` la levaria o movimento junto. Sem a variavel, as
 * suites avisam e nao rodam. */
import { randomBytes } from "node:crypto";
import pg from "pg";

export const URL_TESTE = process.env.TEST_DATABASE_URL || "";
export const temBancoDeTeste = Boolean(URL_TESTE);

export const AVISO_SEM_BANCO =
  "TEST_DATABASE_URL nao definida: suite pulada.\n" +
  "  Suba um Postgres qualquer e aponte para ele, por exemplo:\n" +
  "    docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=teste postgres:16\n" +
  "    TEST_DATABASE_URL='postgresql://postgres:teste@localhost:5433/postgres?sslmode=disable' npm test\n" +
  "  Nao use a base do Supabase da loja: a suite cria e derruba schema.";

/* Acrescenta ?options=-c search_path=... a URL, preservando o que ja houver.
 * E assim que o `pg` manda a opcao de sessao para o servidor sem precisarmos
 * tocar no db/postgres.js so por causa do teste. */
function comSearchPath(url, schema) {
  const alvo = new URL(url);
  alvo.searchParams.set("options", `-c search_path=${schema}`);
  return alvo.toString();
}

/* Prepara um schema limpo e devolve como limpa-lo.
 *
 * Precisa rodar ANTES de qualquer import de src/: tanto config/env.js quanto
 * db/postgres.js leem process.env na importacao. */
export async function prepararSchema(prefixo) {
  const schema = `teste_${prefixo}_${randomBytes(4).toString("hex")}`;
  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();

  try {
    /* As migrations qualificam o tipo como `extensions.CITEXT`, que e a
     * convencao do Supabase. Num Postgres cru esse schema nao existe. */
    await cliente.query("CREATE SCHEMA IF NOT EXISTS extensions");
    await cliente.query("CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions");
    await cliente.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await cliente.end();
  }

  process.env.SUPABASE_DATABASE_URL = comSearchPath(URL_TESTE, schema);
  process.env.SUPABASE_INSECURE_TLS = "1";

  return {
    schema,
    async derrubar() {
      const faxina = new pg.Client({ connectionString: URL_TESTE });
      await faxina.connect();
      try {
        await faxina.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await faxina.end();
      }
    }
  };
}
