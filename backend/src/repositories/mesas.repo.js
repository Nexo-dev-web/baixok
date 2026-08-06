/* Acesso a `mesas` e `mesa_itens`. */
import { getDb } from "../db/connection.js";

const paraApi = (linha, itens = []) => linha && ({
  n: linha.n,
  status: linha.status,
  openedAt: linha.aberta_em,
  closedAt: linha.fechada_em,
  items: itens
});

const itemParaApi = linha => ({
  id: linha.produto_id,
  name: linha.nome,
  qty: linha.quantidade,
  price: linha.preco_unit,
  orderId: linha.pedido_id
});

export const mesasRepo = {
  listar() {
    const mesas = getDb().prepare("SELECT * FROM mesas ORDER BY n").all();
    if (!mesas.length) return [];
    const itens = getDb().prepare("SELECT * FROM mesa_itens ORDER BY id").all();
    const porMesa = new Map();
    for (const item of itens) {
      if (!porMesa.has(item.mesa_n)) porMesa.set(item.mesa_n, []);
      porMesa.get(item.mesa_n).push(itemParaApi(item));
    }
    return mesas.map(mesa => paraApi(mesa, porMesa.get(mesa.n) || []));
  },

  /* O cliente que le o QR code precisa saber se a mesa esta aberta — e so isso.
   * A comanda dele vem por rota propria; o que a mesa 4 consumiu nao e assunto
   * de quem esta na mesa 7. */
  listarPublico() {
    return getDb().prepare("SELECT n, status FROM mesas ORDER BY n").all();
  },

  buscar(n) {
    const mesa = getDb().prepare("SELECT * FROM mesas WHERE n = ?").get(n);
    if (!mesa) return null;
    const itens = getDb().prepare("SELECT * FROM mesa_itens WHERE mesa_n = ? ORDER BY id").all(n);
    return paraApi(mesa, itens.map(itemParaApi));
  },

  criar(n) {
    getDb().prepare("INSERT INTO mesas (n, status) VALUES (?, 'livre')").run(n);
    return this.buscar(n);
  },

  proximoNumero() {
    const linha = getDb().prepare("SELECT COALESCE(MAX(n), 0) AS maior FROM mesas").get();
    return linha.maior + 1;
  },

  remover(n) {
    return getDb().prepare("DELETE FROM mesas WHERE n = ?").run(n).changes > 0;
  },

  abrir(n) {
    getDb().prepare("UPDATE mesas SET status = 'aberta', aberta_em = datetime('now'), fechada_em = NULL, atualizado_em = datetime('now') WHERE n = ?").run(n);
    return this.buscar(n);
  },

  marcarFechando(n) {
    getDb().prepare("UPDATE mesas SET status = 'fechando', atualizado_em = datetime('now') WHERE n = ?").run(n);
    return this.buscar(n);
  },

  /* Liberar limpa a comanda: a mesa volta a zero para o proximo cliente. Os
   * itens continuam nos pedidos, que sao o registro contabil. */
  liberar(n) {
    const db = getDb();
    db.prepare("DELETE FROM mesa_itens WHERE mesa_n = ?").run(n);
    db.prepare("UPDATE mesas SET status = 'livre', aberta_em = NULL, fechada_em = datetime('now'), atualizado_em = datetime('now') WHERE n = ?").run(n);
    return this.buscar(n);
  },

  adicionarItens(mesaN, pedidoId, itens) {
    const inserir = getDb().prepare(`
      INSERT INTO mesa_itens (mesa_n, pedido_id, produto_id, nome, quantidade, preco_unit)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of itens) inserir.run(mesaN, pedidoId, item.id, item.name, item.qty, item.price);
  },

  totalDaMesa(n) {
    const linha = getDb()
      .prepare("SELECT COALESCE(SUM(quantidade * preco_unit), 0) AS subtotal FROM mesa_itens WHERE mesa_n = ?")
      .get(n);
    return linha.subtotal;
  }
};
