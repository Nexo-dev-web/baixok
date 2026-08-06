/* Acesso a tabela `promocoes`. Uma por produto, garantido pelo UNIQUE. */
import { todos, um, alteradas } from "../db/postgres.js";

const paraApi = linha => linha && ({
  id: linha.id,
  productId: linha.produto_id,
  price: linha.preco,
  until: linha.ate,
  createdAt: linha.criado_em
});

export const promocoesRepo = {
  async listar() {
    return (await todos("SELECT * FROM promocoes ORDER BY criado_em DESC")).map(paraApi);
  },

  /* Cardapio publico: o preco promocional ja e aplicado na vitrine, entao o
   * cliente so precisa saber qual produto esta em promocao e por quanto. */
  async listarPublico() {
    const linhas = await todos("SELECT produto_id, preco FROM promocoes");
    return linhas.map(linha => ({ productId: linha.produto_id, price: linha.preco }));
  },

  async buscarPorProduto(produtoId) {
    return paraApi(await um("SELECT * FROM promocoes WHERE produto_id = ?", [produtoId]));
  },

  /* Substitui a promocao do produto se ja houver uma. O front antigo fazia isso
   * com `filter` + `unshift` no array inteiro; aqui e o UNIQUE do banco. */
  async salvar({ id, productId, price, until = "" }) {
    return paraApi(await um(`
      INSERT INTO promocoes (id, produto_id, preco, ate)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (produto_id) DO UPDATE SET preco = excluded.preco, ate = excluded.ate
      RETURNING *
    `, [id, productId, price, until]));
  },

  async remover(id) {
    return (await alteradas("DELETE FROM promocoes WHERE id = ?", [id])) > 0;
  }
};
