/* Testes do importador do data/baixo-k.json antigo.
 *
 * A migracao acontece uma vez so, na madrugada da virada, com a loja parada e
 * alguem cansado olhando. Se ela perder pedido ou derrubar por um campo
 * estranho, o prejuizo e real — dai valer teste proprio. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "baixok-import-"));
process.env.NODE_ENV = "test";
process.env.DATA_DIR = PASTA;
process.env.LOG_LEVEL = "silent";

const { abrirBanco, fecharBanco, getDb } = await import("../src/db/connection.js");
const { importar } = await import("../src/db/import-legado.js");

/* Arquivo no formato do sistema antigo, com os casos-limite que aparecem em
 * base de verdade. */
const LEGADO = {
  products: [
    { id: "pizza-calabresa", name: "Pizza Calabresa", category: "pizzas", price: 39.9, stock: 18, minStock: 4, active: true, image: "", badge: "Pizza", description: "Mussarela e calabresa." },
    { id: "burguer-bacon", name: "Burguer Bacon", category: "burgues", price: 27.9, stock: 0, minStock: 6, active: false, image: "images/produto-burguer.png", badge: "Bacon", description: "" },
    /* Imagem com javascript: — o painel antigo aceitava qualquer string. */
    { id: "item-xss", name: "Item Suspeito", category: "drinks", price: 10, stock: 5, active: true, image: "javascript:alert(1)", description: "" },
    /* Categoria que nao existe mais no dominio. */
    { id: "item-orfao", name: "Item Sem Categoria", category: "sobremesas", price: 12, stock: 3, active: true, image: "", description: "" },
    /* Registro quebrado: precisa ser ignorado sem derrubar a importacao. */
    { name: "Sem id" }
  ],
  tables: [
    { n: 1, status: "aberta", openedAt: "2026-08-05T22:10:00.000Z", items: [] },
    { n: 2, status: "livre", openedAt: null, items: [] }
  ],
  orders: [
    {
      id: "ped-1", createdAt: "2026-08-05T22:30:00.000Z", status: "concluido",
      customer: "Maria", phone: "21999990000", place: "Rua A, 10", payment: "Pix",
      channel: "cardapio", fulfillment: "entrega", printed: true,
      items: [{ id: "pizza-calabresa", name: "Pizza Calabresa", price: 39.9, qty: 2 }],
      subtotal: 79.8, discount: 0, deliveryFee: 5, total: 84.8
    },
    {
      id: "ped-2", createdAt: "2026-08-05T23:00:00.000Z", status: "novo",
      customer: "Joao", place: "Mesa 1 - salao", fulfillment: "mesa", tableNumber: 1,
      items: [
        { id: "burguer-bacon", name: "Burguer Bacon", price: 27.9, qty: 1 },
        /* Item cujo produto nao existe mais no cadastro. */
        { id: "produto-apagado", name: "Combo Antigo", price: 30, qty: 1 }
      ],
      total: 57.9
    },
    /* Sem createdAt e sem total: precisa entrar com valores derivados. */
    { id: "ped-3", customer: "Ana", items: [{ id: "pizza-calabresa", name: "Pizza", price: 39.9, qty: 1 }] },
    { customer: "Sem id" }
  ],
  promos: [
    { id: "promo-1", productId: "pizza-calabresa", price: 34.9, until: "10/08" },
    { id: "promo-2", productId: "produto-apagado", price: 20, until: "" }
  ],
  coupons: [
    { code: "baixo10", kind: "pct", amount: 10, min: 50, once: true, until: "sem data", uses: 3, active: true },
    { code: "SEMVALOR", kind: "val", amount: 0, active: true }
  ],
  delivery: {
    endereco: "Sacadura Cabral, 10",
    lng: -43.1875, lat: -22.8975,
    zones: [{ km: 3, fee: 5, min: 30 }, { km: 6, fee: 9, min: 50 }, { km: 0, fee: 1, min: 0 }]
  },
  rev: 42
};

const arquivo = path.join(PASTA, "baixo-k.json");
fs.writeFileSync(arquivo, JSON.stringify(LEGADO), "utf8");

abrirBanco();
const contagem = importar(arquivo);
const db = getDb();

test.after(() => {
  fecharBanco();
  fs.rmSync(PASTA, { recursive: true, force: true });
});

test("importa produtos validos e descarta os quebrados", () => {
  assert.equal(contagem.produtos, 4, "os 4 com id entram; o sem id fica de fora");
  const nomes = db.prepare("SELECT nome FROM produtos ORDER BY nome").all().map(linha => linha.nome);
  assert.ok(!nomes.includes("Sem id"));
});

test("imagem com javascript: nao entra no banco", () => {
  const produto = db.prepare("SELECT imagem FROM produtos WHERE id = 'item-xss'").get();
  assert.equal(produto.imagem, "", "so caminho do site ou data URL passa");
});

test("imagem valida do proprio site e preservada", () => {
  const produto = db.prepare("SELECT imagem FROM produtos WHERE id = 'burguer-bacon'").get();
  assert.equal(produto.imagem, "images/produto-burguer.png");
});

test("categoria desconhecida cai num valor aceito em vez de derrubar", () => {
  const produto = db.prepare("SELECT categoria FROM produtos WHERE id = 'item-orfao'").get();
  assert.equal(produto.categoria, "porcoes");
});

test("status 'concluido' da versao antiga vira 'entregue'", () => {
  const pedido = db.prepare("SELECT status FROM pedidos WHERE id = 'ped-1'").get();
  assert.equal(pedido.status, "entregue");
});

test("pedido sem id e ignorado, os demais entram", () => {
  assert.equal(contagem.pedidos, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM pedidos").get().total, 3);
});

test("item de produto apagado mantem o pedido, perdendo so o vinculo", () => {
  const itens = db.prepare("SELECT nome, produto_id FROM pedido_itens WHERE pedido_id = 'ped-2' ORDER BY nome").all();
  assert.equal(itens.length, 2, "os dois itens precisam sobreviver");

  const orfao = itens.find(item => item.nome === "Combo Antigo");
  assert.equal(orfao.produto_id, null, "produto inexistente vira NULL, e o nome fica gravado na linha");
});

test("pedido sem data nem total entra com valores derivados", () => {
  const pedido = db.prepare("SELECT criado_em, total, subtotal FROM pedidos WHERE id = 'ped-3'").get();
  assert.ok(pedido.criado_em, "recebe o instante da importacao");
  assert.equal(pedido.subtotal, 39.9, "subtotal calculado a partir dos itens");
  assert.equal(pedido.total, 39.9);
});

test("pedidos antigos entram sem marca de estoque baixado", () => {
  const linhas = db.prepare("SELECT estoque_baixado FROM pedidos").all();
  assert.ok(linhas.every(linha => linha.estoque_baixado === 0),
    "assumir a baixa faria um cancelamento devolver unidade que nunca saiu");
});

test("mesa referenciada e vinculada; pedido de mesa inexistente fica sem vinculo", () => {
  assert.equal(contagem.mesas, 2);
  assert.equal(db.prepare("SELECT mesa_n FROM pedidos WHERE id = 'ped-2'").get().mesa_n, 1);
  assert.equal(db.prepare("SELECT mesa_n FROM pedidos WHERE id = 'ped-1'").get().mesa_n, null);
});

test("promocao de produto inexistente e descartada", () => {
  assert.equal(contagem.promocoes, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM promocoes").get().total, 1);
});

test("cupom vira maiusculo e o sem valor e recusado", () => {
  assert.equal(contagem.cupons, 1);
  const cupom = db.prepare("SELECT * FROM cupons").get();
  assert.equal(cupom.code, "BAIXO10");
  assert.equal(cupom.usos, 3, "o historico de usos e preservado");
  assert.equal(cupom.uso_unico, 1);
});

test("faixa com km zero e descartada e as demais ficam ordenadas", () => {
  assert.equal(contagem.faixas, 2);
  const faixas = db.prepare("SELECT km FROM entrega_faixas ORDER BY km").all();
  assert.deepEqual(faixas.map(faixa => faixa.km), [3, 6]);
});

test("coordenada da loja e preservada", () => {
  const config = db.prepare("SELECT * FROM entrega_config WHERE id = 1").get();
  assert.equal(config.lat, -22.8975);
  assert.equal(config.lng, -43.1875);
  assert.equal(config.endereco, "Sacadura Cabral, 10");
});

test("importar duas vezes nao duplica nada", () => {
  const segunda = importar(arquivo);
  assert.equal(segunda.produtos, 0);
  assert.equal(segunda.pedidos, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM pedidos").get().total, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM pedido_itens").get().total, 4);
});
