/* Acesso a `cupons` e `cupons_resgatados`.
 *
 * Ponto de seguranca: NAO existe metodo "listar tudo" exposto ao publico. No
 * sistema antigo /api/state devolvia a lista inteira de cupons para qualquer
 * visitante — codigo, valor e ate os desativados. Quem abrisse o devtools no
 * cardapio via a campanha antes de ela ir ao ar. Aqui o cliente so consegue
 * validar um codigo que ele ja digitou. */
import { getDb, paraSqlite, deSqlite } from "../db/connection.js";

const paraApi = linha => linha && ({
  code: linha.code,
  kind: linha.tipo,
  amount: linha.valor,
  min: linha.minimo,
  once: deSqlite(linha.uso_unico),
  until: linha.ate,
  uses: linha.usos,
  active: deSqlite(linha.ativo),
  createdAt: linha.criado_em
});

export const cuponsRepo = {
  /* Só para o painel. Exige papel admin na rota. */
  listar() {
    return getDb().prepare("SELECT * FROM cupons ORDER BY criado_em DESC").all().map(paraApi);
  },

  buscar(code) {
    return paraApi(getDb().prepare("SELECT * FROM cupons WHERE code = ?").get(code));
  },

  /* Usado na validacao vinda do cliente: so devolve cupom ativo, e a busca
   * exige o codigo exato. Nao ha listagem nem prefixo. */
  buscarAtivo(code) {
    return paraApi(getDb().prepare("SELECT * FROM cupons WHERE code = ? AND ativo = 1").get(code));
  },

  criar({ code, kind, amount, min = 0, once = false, until = "" }) {
    getDb().prepare(`
      INSERT INTO cupons (code, tipo, valor, minimo, uso_unico, ate)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, kind, amount, min, paraSqlite(once), until);
    return this.buscar(code);
  },

  alternarAtivo(code) {
    getDb().prepare("UPDATE cupons SET ativo = CASE ativo WHEN 1 THEN 0 ELSE 1 END WHERE code = ?").run(code);
    return this.buscar(code);
  },

  remover(code) {
    return getDb().prepare("DELETE FROM cupons WHERE code = ?").run(code).changes > 0;
  },

  incrementarUsos(code) {
    getDb().prepare("UPDATE cupons SET usos = usos + 1 WHERE code = ?").run(code);
  },

  /* Fecha a limitacao que o README listava como conhecida: "cupom de uso unico
   * por cliente nao e aplicado". O telefone do pedido e a chave possivel sem
   * cadastro de cliente — imperfeita (da para trocar de numero), mas suficiente
   * para o uso acidental repetido, que e o caso real. */
  jaUsouPorTelefone(code, telefone) {
    if (!telefone) return false;
    const linha = getDb()
      .prepare("SELECT 1 AS achou FROM cupons_resgatados WHERE cupom_code = ? AND telefone = ? LIMIT 1")
      .get(code, telefone);
    return Boolean(linha);
  },

  registrarResgate({ code, pedidoId, telefone = "" }) {
    getDb().prepare("INSERT INTO cupons_resgatados (cupom_code, pedido_id, telefone) VALUES (?, ?, ?)")
      .run(code, pedidoId, telefone);
  }
};
