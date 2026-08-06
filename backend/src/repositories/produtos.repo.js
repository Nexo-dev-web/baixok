/* Acesso a tabela `produtos`.
 *
 * Sobre os nomes: as colunas seguem o vocabulario do dominio em portugues, mas
 * o contrato da API mantem os nomes que o front ja usava (name, minStock,
 * active...). O de-para vive aqui, que e justamente o papel do repositorio —
 * trocar o esquema do banco depois nao obriga a mexer em tela nenhuma. */
import { getDb, paraSqlite, deSqlite } from "../db/connection.js";

const paraApi = linha => linha && ({
  id: linha.id,
  name: linha.nome,
  category: linha.categoria,
  price: linha.preco,
  stock: linha.estoque,
  minStock: linha.estoque_min,
  active: deSqlite(linha.ativo),
  image: linha.imagem,
  badge: linha.selo,
  description: linha.descricao,
  createdAt: linha.criado_em,
  updatedAt: linha.atualizado_em
});

export const produtosRepo = {
  listar() {
    return getDb().prepare("SELECT * FROM produtos ORDER BY categoria, nome").all().map(paraApi);
  },

  /* Cardapio publico: so o que esta a venda, e sem estoque_min nem custo —
   * quantas unidades restam e informacao de operacao, nao de vitrine. */
  listarPublico() {
    return getDb()
      .prepare("SELECT id, nome, categoria, preco, imagem, selo, descricao, estoque FROM produtos WHERE ativo = 1 AND estoque > 0 ORDER BY categoria, nome")
      .all()
      .map(linha => ({
        id: linha.id,
        name: linha.nome,
        category: linha.categoria,
        price: linha.preco,
        image: linha.imagem,
        badge: linha.selo,
        description: linha.descricao,
        disponivel: linha.estoque > 0
      }));
  },

  buscar(id) {
    return paraApi(getDb().prepare("SELECT * FROM produtos WHERE id = ?").get(id));
  },

  criar(produto) {
    getDb().prepare(`
      INSERT INTO produtos (id, nome, categoria, preco, estoque, estoque_min, ativo, imagem, selo, descricao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      produto.id, produto.name, produto.category, produto.price,
      produto.stock, produto.minStock, paraSqlite(produto.active),
      produto.image, produto.badge, produto.description
    );
    return this.buscar(produto.id);
  },

  atualizar(id, produto) {
    getDb().prepare(`
      UPDATE produtos
         SET nome = ?, categoria = ?, preco = ?, estoque = ?, estoque_min = ?,
             ativo = ?, imagem = ?, selo = ?, descricao = ?, atualizado_em = datetime('now')
       WHERE id = ?
    `).run(
      produto.name, produto.category, produto.price, produto.stock, produto.minStock,
      paraSqlite(produto.active), produto.image, produto.badge, produto.description, id
    );
    return this.buscar(id);
  },

  remover(id) {
    return getDb().prepare("DELETE FROM produtos WHERE id = ?").run(id).changes > 0;
  },

  alternarAtivo(id) {
    getDb().prepare("UPDATE produtos SET ativo = CASE ativo WHEN 1 THEN 0 ELSE 1 END, atualizado_em = datetime('now') WHERE id = ?").run(id);
    return this.buscar(id);
  },

  /* Ajuste manual de estoque, com piso em zero na propria consulta: um clique a
   * mais no "-" nao pode deixar estoque negativo. */
  ajustarEstoque(id, delta) {
    getDb().prepare("UPDATE produtos SET estoque = MAX(0, estoque + ?), atualizado_em = datetime('now') WHERE id = ?").run(delta, id);
    return this.buscar(id);
  },

  definirEstoque(id, quantidade) {
    getDb().prepare("UPDATE produtos SET estoque = ?, atualizado_em = datetime('now') WHERE id = ?").run(Math.max(0, quantidade), id);
    return this.buscar(id);
  },

  /* Usados dentro da transacao de pedido. O WHERE estoque >= ? faz a baixa e a
   * conferencia virarem um passo so: se outro pedido levou o ultimo item entre
   * uma coisa e outra, `changes` volta 0 e a transacao inteira e desfeita. */
  baixarEstoque(id, quantidade) {
    return getDb()
      .prepare("UPDATE produtos SET estoque = estoque - ?, atualizado_em = datetime('now') WHERE id = ? AND estoque >= ?")
      .run(quantidade, id, quantidade).changes > 0;
  },

  devolverEstoque(id, quantidade) {
    getDb().prepare("UPDATE produtos SET estoque = estoque + ?, atualizado_em = datetime('now') WHERE id = ?").run(quantidade, id);
  },

  emFalta() {
    return getDb()
      .prepare("SELECT * FROM produtos WHERE estoque <= estoque_min ORDER BY estoque ASC")
      .all()
      .map(paraApi);
  }
};
