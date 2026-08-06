/* Acesso a `pedidos` e `pedido_itens`.
 *
 * Os itens viraram linhas proprias. Antes eram um array JSON dentro do pedido,
 * e por isso "mais vendidos do mes" obrigava a carregar todos os pedidos do
 * periodo para dentro do navegador e percorrer na mao. Agora o agrupamento e
 * uma consulta. */
import { getDb, paraSqlite, deSqlite } from "../db/connection.js";

const paraApi = (linha, itens = []) => linha && ({
  id: linha.id,
  createdAt: linha.criado_em,
  status: linha.status,
  channel: linha.canal,
  fulfillment: linha.modalidade,
  customer: linha.cliente,
  phone: linha.telefone,
  place: linha.local,
  note: linha.observacao,
  payment: linha.pagamento,
  tableNumber: linha.mesa_n,
  subtotal: linha.subtotal,
  discount: linha.desconto,
  coupon: linha.cupom_code,
  deliveryFee: linha.taxa_entrega,
  deliveryKm: linha.entrega_km,
  deliveryZone: linha.entrega_faixa,
  total: linha.total,
  printed: deSqlite(linha.impresso),
  stockDeducted: deSqlite(linha.estoque_baixado),
  createdBy: linha.criado_por,
  createdByName: linha.criado_por_nome ?? null,
  items: itens
});

const itemParaApi = linha => ({
  id: linha.produto_id,
  name: linha.nome,
  qty: linha.quantidade,
  price: linha.preco_unit
});

/* Uma consulta para os pedidos e uma para todos os itens desses pedidos.
 * Buscar os itens dentro de um `.map()` faria N+1 consultas — com o movimento
 * de um sabado, o painel abriria centenas delas a cada atualizacao. */
function anexarItens(linhas) {
  if (!linhas.length) return [];
  const marcadores = linhas.map(() => "?").join(",");
  const itens = getDb()
    .prepare(`SELECT * FROM pedido_itens WHERE pedido_id IN (${marcadores}) ORDER BY id`)
    .all(...linhas.map(linha => linha.id));

  const porPedido = new Map();
  for (const item of itens) {
    if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, []);
    porPedido.get(item.pedido_id).push(itemParaApi(item));
  }
  return linhas.map(linha => paraApi(linha, porPedido.get(linha.id) || []));
}

const SELECT_BASE = `
  SELECT p.*, u.nome AS criado_por_nome
    FROM pedidos p
    LEFT JOIN usuarios u ON u.id = p.criado_por
`;

export const pedidosRepo = {
  listar({ desde = null, ate = null, status = null, limite = 500 } = {}) {
    const linhas = getDb().prepare(`
      ${SELECT_BASE}
      WHERE (? IS NULL OR p.criado_em >= ?)
        AND (? IS NULL OR p.criado_em <= ?)
        AND (? IS NULL OR p.status = ?)
      ORDER BY p.criado_em DESC
      LIMIT ?
    `).all(desde, desde, ate, ate, status, status, limite);
    return anexarItens(linhas);
  },

  listarAbertos() {
    const linhas = getDb().prepare(`
      ${SELECT_BASE}
      WHERE p.status IN ('novo', 'preparo', 'pronto')
      ORDER BY p.criado_em ASC
    `).all();
    return anexarItens(linhas);
  },

  /* Alimenta o telao do salao.
   *
   * Nome, situacao e itens — o que o cliente precisa para se reconhecer na
   * chamada e conferir o pedido. Telefone e endereco ficam de fora: e uma tela
   * virada para o salao inteiro, e quem fotografa a TV nao leva o cadastro de
   * ninguem junto. */
  listarParaTelao() {
    const linhas = getDb().prepare(`
      SELECT id, cliente, status, criado_em, modalidade
        FROM pedidos
       WHERE status IN ('preparo', 'pronto')
       ORDER BY criado_em ASC
       LIMIT 40
    `).all();
    if (!linhas.length) return [];

    const marcadores = linhas.map(() => "?").join(",");
    const itens = getDb()
      .prepare(`SELECT pedido_id, nome, quantidade FROM pedido_itens WHERE pedido_id IN (${marcadores}) ORDER BY id`)
      .all(...linhas.map(linha => linha.id));

    const porPedido = new Map();
    for (const item of itens) {
      if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, []);
      porPedido.get(item.pedido_id).push({ name: item.nome, qty: item.quantidade });
    }

    return linhas.map(linha => ({
      id: linha.id,
      customer: linha.cliente,
      status: linha.status,
      createdAt: linha.criado_em,
      fulfillment: linha.modalidade,
      items: porPedido.get(linha.id) || []
    }));
  },

  buscar(id) {
    const linha = getDb().prepare(`${SELECT_BASE} WHERE p.id = ?`).get(id);
    if (!linha) return null;
    return anexarItens([linha])[0];
  },

  listarDaMesa(mesaN) {
    const linhas = getDb().prepare(`${SELECT_BASE} WHERE p.mesa_n = ? AND p.status <> 'cancelado' ORDER BY p.criado_em ASC`).all(mesaN);
    return anexarItens(linhas);
  },

  /* Chamado sempre de dentro de emTransacao(): pedido e itens entram juntos ou
   * nao entram. */
  inserir(pedido) {
    const db = getDb();
    db.prepare(`
      INSERT INTO pedidos (
        id, criado_em, status, canal, modalidade, cliente, telefone, local, observacao,
        pagamento, mesa_n, subtotal, desconto, cupom_code, taxa_entrega, entrega_km,
        entrega_faixa, total, impresso, estoque_baixado, criado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pedido.id, pedido.createdAt, pedido.status, pedido.channel, pedido.fulfillment,
      pedido.customer, pedido.phone, pedido.place, pedido.note, pedido.payment,
      pedido.tableNumber ?? null, pedido.subtotal, pedido.discount, pedido.coupon,
      pedido.deliveryFee, pedido.deliveryKm ?? null, pedido.deliveryZone ?? null,
      pedido.total, paraSqlite(pedido.printed), paraSqlite(pedido.stockDeducted),
      pedido.createdBy ?? null
    );

    const inserirItem = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, nome, quantidade, preco_unit)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of pedido.items) {
      inserirItem.run(pedido.id, item.id, item.name, item.qty, item.price);
    }
    return this.buscar(pedido.id);
  },

  atualizarStatus(id, status) {
    getDb().prepare("UPDATE pedidos SET status = ?, atualizado_em = datetime('now') WHERE id = ?").run(status, id);
    return this.buscar(id);
  },

  marcarImpresso(id) {
    getDb().prepare("UPDATE pedidos SET impresso = 1, atualizado_em = datetime('now') WHERE id = ?").run(id);
  },

  marcarEstoqueDevolvido(id) {
    getDb().prepare("UPDATE pedidos SET estoque_baixado = 0, atualizado_em = datetime('now') WHERE id = ?").run(id);
  },

  // ------------------------------------------------------------ relatorios ---
  /* Agregacoes rodam no banco. O dashboard antigo baixava todos os pedidos e
   * somava em JavaScript a cada troca de periodo. */
  resumoPeriodo({ desde, ate, canal = null }) {
    return getDb().prepare(`
      SELECT COUNT(*) AS pedidos,
             COALESCE(SUM(total), 0) AS faturamento,
             COALESCE(AVG(total), 0) AS ticket_medio,
             COALESCE(SUM(desconto), 0) AS descontos,
             COALESCE(SUM(taxa_entrega), 0) AS taxas_entrega
        FROM pedidos
       WHERE criado_em >= ? AND criado_em <= ?
         AND status <> 'cancelado'
         AND (? IS NULL OR canal = ?)
    `).get(desde, ate, canal, canal);
  },

  porHora({ desde, ate, canal = null }) {
    return getDb().prepare(`
      SELECT strftime('%H', criado_em) AS hora,
             COUNT(*) AS pedidos,
             COALESCE(SUM(total), 0) AS faturamento
        FROM pedidos
       WHERE criado_em >= ? AND criado_em <= ? AND status <> 'cancelado'
         AND (? IS NULL OR canal = ?)
       GROUP BY hora ORDER BY hora
    `).all(desde, ate, canal, canal);
  },

  agruparPor(coluna, { desde, ate, canal = null }) {
    /* Lista fechada: `coluna` vem do controller e nunca e concatenada sem passar
     * por aqui. Nome de coluna nao pode ser parametro em SQL, entao a unica
     * defesa possivel e a lista branca. */
    const PERMITIDAS = { canal: "canal", modalidade: "modalidade", pagamento: "pagamento", status: "status" };
    const campo = PERMITIDAS[coluna];
    if (!campo) throw new Error(`agrupamento nao permitido: ${coluna}`);

    return getDb().prepare(`
      SELECT ${campo} AS rotulo, COUNT(*) AS pedidos, COALESCE(SUM(total), 0) AS faturamento
        FROM pedidos
       WHERE criado_em >= ? AND criado_em <= ? AND status <> 'cancelado'
         AND (? IS NULL OR canal = ?)
       GROUP BY ${campo} ORDER BY faturamento DESC
    `).all(desde, ate, canal, canal);
  },

  maisVendidos({ desde, ate, canal = null, limite = 10 }) {
    return getDb().prepare(`
      SELECT i.nome AS rotulo,
             SUM(i.quantidade) AS quantidade,
             SUM(i.quantidade * i.preco_unit) AS faturamento
        FROM pedido_itens i
        JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.criado_em >= ? AND p.criado_em <= ? AND p.status <> 'cancelado'
         AND (? IS NULL OR p.canal = ?)
       GROUP BY i.nome
       ORDER BY quantidade DESC
       LIMIT ?
    `).all(desde, ate, canal, canal, limite);
  }
};
