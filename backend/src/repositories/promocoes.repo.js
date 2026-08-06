/* Acesso a tabela `promocoes`. Uma por produto, garantido pelo UNIQUE. */
import { getDb } from "../db/connection.js";

const paraApi = linha => linha && ({
  id: linha.id,
  productId: linha.produto_id,
  price: linha.preco,
  until: linha.ate,
  createdAt: linha.criado_em
});

export const promocoesRepo = {
  listar() {
    return getDb().prepare("SELECT * FROM promocoes ORDER BY criado_em DESC").all().map(paraApi);
  },

  /* Cardapio publico: o preco promocional ja e aplicado na vitrine, entao o
   * cliente so precisa saber qual produto esta em promocao e por quanto. */
  listarPublico() {
    return getDb().prepare("SELECT produto_id, preco FROM promocoes").all()
      .map(linha => ({ productId: linha.produto_id, price: linha.preco }));
  },

  buscarPorProduto(produtoId) {
    return paraApi(getDb().prepare("SELECT * FROM promocoes WHERE produto_id = ?").get(produtoId));
  },

  /* Substitui a promocao do produto se ja houver uma. O front antigo fazia isso
   * com `filter` + `unshift` no array inteiro; aqui e o UNIQUE do banco. */
  salvar({ id, productId, price, until = "" }) {
    getDb().prepare(`
      INSERT INTO promocoes (id, produto_id, preco, ate)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (produto_id) DO UPDATE SET preco = excluded.preco, ate = excluded.ate
    `).run(id, productId, price, until);
    return this.buscarPorProduto(productId);
  },

  remover(id) {
    return getDb().prepare("DELETE FROM promocoes WHERE id = ?").run(id).changes > 0;
  }
};
