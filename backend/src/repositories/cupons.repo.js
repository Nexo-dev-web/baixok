/* Acesso a `cupons` e `cupons_resgatados`.
 *
 * Ponto de seguranca: NAO existe metodo "listar tudo" exposto ao publico. No
 * sistema antigo /api/state devolvia a lista inteira de cupons para qualquer
 * visitante — codigo, valor e ate os desativados. Quem abrisse o devtools no
 * cardapio via a campanha antes de ela ir ao ar. Aqui o cliente so consegue
 * validar um codigo que ele ja digitou. */
import { todos, um, alteradas, paraBanco, doBanco } from "../db/postgres.js";

const paraApi = linha => linha && ({
  code: linha.code,
  kind: linha.tipo,
  amount: linha.valor,
  min: linha.minimo,
  once: doBanco(linha.uso_unico),
  until: linha.ate,
  uses: linha.usos,
  active: doBanco(linha.ativo),
  createdAt: linha.criado_em
});

export const cuponsRepo = {
  /* Só para o painel. Exige papel admin na rota. */
  async listar() {
    return (await todos("SELECT * FROM cupons ORDER BY criado_em DESC")).map(paraApi);
  },

  /* `code` e citext no Postgres: BEMVINDO e bemvindo continuam o mesmo cupom,
   * como o COLLATE NOCASE do SQLite garantia. */
  async buscar(code) {
    return paraApi(await um("SELECT * FROM cupons WHERE code = ?", [code]));
  },

  /* Usado na validacao vinda do cliente: so devolve cupom ativo, e a busca
   * exige o codigo exato. Nao ha listagem nem prefixo. */
  async buscarAtivo(code) {
    return paraApi(await um("SELECT * FROM cupons WHERE code = ? AND ativo = 1", [code]));
  },

  async criar({ code, kind, amount, min = 0, once = false, until = "" }) {
    return paraApi(await um(`
      INSERT INTO cupons (code, tipo, valor, minimo, uso_unico, ate)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [code, kind, amount, min, paraBanco(once), until]));
  },

  async alternarAtivo(code) {
    return paraApi(await um(`
      UPDATE cupons SET ativo = CASE ativo WHEN 1 THEN 0 ELSE 1 END WHERE code = ?
      RETURNING *
    `, [code]));
  },

  async remover(code) {
    return (await alteradas("DELETE FROM cupons WHERE code = ?", [code])) > 0;
  },

  async incrementarUsos(code) {
    await alteradas("UPDATE cupons SET usos = usos + 1 WHERE code = ?", [code]);
  },

  /* Fecha a limitacao que o README listava como conhecida: "cupom de uso unico
   * por cliente nao e aplicado". O telefone do pedido e a chave possivel sem
   * cadastro de cliente — imperfeita (da para trocar de numero), mas suficiente
   * para o uso acidental repetido, que e o caso real. */
  async jaUsouPorTelefone(code, telefone) {
    if (!telefone) return false;
    const linha = await um(
      "SELECT 1 AS achou FROM cupons_resgatados WHERE cupom_code = ? AND telefone = ? LIMIT 1",
      [code, telefone]
    );
    return Boolean(linha);
  },

  async registrarResgate({ code, pedidoId, telefone = "" }) {
    await alteradas(
      "INSERT INTO cupons_resgatados (cupom_code, pedido_id, telefone) VALUES (?, ?, ?)",
      [code, pedidoId, telefone]
    );
  }
};
