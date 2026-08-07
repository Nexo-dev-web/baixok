/* Regras de taxa de entrega, no pedido do cardapio e no lancamento manual.
 *
 * O bug real que motivou esta suite: o lancamento manual (balcao/iFood/
 * WhatsApp) sempre gravava deliveryFee = 0, mesmo com faixas configuradas e
 * endereco valido — porque criarManual nunca chamava o entregaService. Some
 * dos dois caminhos usam agora a mesma funcao interna (cotarEntregaSeNecessario,
 * em pedidos.service.js); estes testes travam o comportamento dos dois juntos,
 * para uma regressao futura em qualquer um dos dois acusar aqui.
 *
 * A geocodificacao (Mapbox) e mockada com t.mock.method: sem isso o teste
 * dependeria de rede e da conta da Mapbox so para validar uma regra de
 * negocio que nao tem nada a ver com geocodificar de verdade. */
import test from "node:test";
import assert from "node:assert/strict";
import { prepararSchema, temBancoDeTeste, AVISO_SEM_BANCO } from "./apoio/banco.js";

if (!temBancoDeTeste) {
  test("suite de entrega", { skip: AVISO_SEM_BANCO }, () => {});
  process.exit(0);
}

const banco = await prepararSchema("entrega");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.ADMIN_BOOTSTRAP_PASSWORD = "senha-do-teste-1234";
process.env.LIMITE_PEDIDO = "500";
process.env.LIMITE_GERAL = "5000";
process.env.LIMITE_LOGIN = "10";

const { abrirPool, fecharPool } = await import("../src/db/postgres.js");
const { migrar } = await import("../src/db/migrate.js");
const { semear } = await import("../src/db/seed.js");
const { criarApp } = await import("../src/app.js");
const { produtosRepo } = await import("../src/repositories/produtos.repo.js");
const { entregaService } = await import("../src/services/entrega.service.js");

abrirPool();
await migrar();
await semear({ silencioso: true });

const servidor = criarApp().listen(0);
await new Promise(resolve => servidor.once("listening", resolve));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

test.after(async () => {
  servidor.close();
  await fecharPool();
  await banco.derrubar();
});

async function chamar(caminho, { metodo = "GET", corpo, sessao } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (sessao) {
    headers.Cookie = sessao.cookie;
    headers["X-CSRF-Token"] = sessao.csrf;
  }
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

async function entrar(usuario, senha) {
  const resposta = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha })
  });
  assert.equal(resposta.status, 200, `login de ${usuario} deveria funcionar`);
  const cookies = resposta.headers.getSetCookie();
  const pegar = nome => cookies.find(item => item.startsWith(`${nome}=`))?.split(";")[0].split("=")[1];
  return {
    cookie: cookies.map(item => item.split(";")[0]).join("; "),
    csrf: decodeURIComponent(pegar("bk_csrf"))
  };
}

const sessaoAdmin = await entrar("admin", "senha-do-teste-1234");

/* Faixa unica: ate 5 km custa 12, com pedido minimo de 30. Endereco "fora"
 * simula um resultado fora de qualquer faixa. */
const ZONAS = [{ km: 5, fee: 12, min: 30 }];

function mockarEntrega(t, { dentro }) {
  t.mock.method(entregaService, "config", async () => ({
    zones: ZONAS, lng: -43.2, lat: -22.9
  }));
  t.mock.method(entregaService, "cotarPorEndereco", async endereco => (
    dentro
      ? { configurado: true, dentro: true, km: 3, taxa: 12, minimo: 30, zona: "ate 5 km", endereco }
      : { configurado: true, dentro: false, km: 40, taxa: 0, minimo: 0, zona: null, endereco }
  ));
}

async function produtoDeTeste(id, price) {
  return produtosRepo.criar({
    id, name: `Produto ${id}`, category: "porcoes", price,
    stock: 20, minStock: 0, active: true, image: "", badge: "Teste", description: ""
  });
}

// ============================================================ cardapio ===
test("pedido do cardapio com endereco dentro da area soma a taxa ao total", async t => {
  mockarEntrega(t, { dentro: true });
  const produto = await produtoDeTeste("teste-entrega-publico-ok", 50);

  const { status, corpo } = await chamar("/api/publico/pedidos", {
    metodo: "POST",
    corpo: {
      customer: "Cliente Entrega", items: [{ id: produto.id, qty: 1 }],
      fulfillment: "entrega", place: "Rua Teste, 123"
    }
  });

  assert.equal(status, 201);
  assert.equal(corpo.pedido.deliveryFee, 12);
  assert.equal(corpo.pedido.deliveryKm, 3);
  assert.equal(corpo.pedido.total, 62, "total deve ser subtotal + taxa de entrega");
});

test("pedido do cardapio com endereco fora da area e recusado", async t => {
  mockarEntrega(t, { dentro: false });
  const produto = await produtoDeTeste("teste-entrega-publico-fora", 50);

  const { status, corpo } = await chamar("/api/publico/pedidos", {
    metodo: "POST",
    corpo: {
      customer: "Cliente Longe", items: [{ id: produto.id, qty: 1 }],
      fulfillment: "entrega", place: "Rua Muito Longe, 999"
    }
  });

  assert.equal(status, 400);
  assert.equal(corpo.codigo, "fora_da_area");
});

test("pedido do cardapio abaixo do minimo da faixa e recusado", async t => {
  mockarEntrega(t, { dentro: true });
  const produto = await produtoDeTeste("teste-entrega-publico-minimo", 10);

  const { status, corpo } = await chamar("/api/publico/pedidos", {
    metodo: "POST",
    corpo: {
      customer: "Cliente Pobre", items: [{ id: produto.id, qty: 1 }],
      fulfillment: "entrega", place: "Rua Teste, 123"
    }
  });

  assert.equal(status, 400);
  assert.equal(corpo.codigo, "abaixo_do_minimo");
});

// ======================================================= lancamento manual ===
test("lancamento manual com entrega calcula e soma a taxa (regressao: antes ficava sempre 0)", async t => {
  mockarEntrega(t, { dentro: true });
  const produto = await produtoDeTeste("teste-entrega-manual-ok", 50);

  const { status, corpo } = await chamar("/api/painel/pedidos", {
    metodo: "POST", sessao: sessaoAdmin,
    corpo: {
      items: [{ id: produto.id, qty: 1 }], customer: "Cliente WhatsApp",
      phone: "21988887777", place: "Rua Teste, 123", payment: "Dinheiro",
      channel: "whatsapp", fulfillment: "entrega"
    }
  });

  assert.equal(status, 201);
  assert.equal(corpo.pedido.deliveryFee, 12, "lancamento manual tambem precisa cobrar a taxa da faixa");
  assert.equal(corpo.pedido.deliveryKm, 3);
  assert.equal(corpo.pedido.deliveryZone, "ate 5 km");
  assert.equal(corpo.pedido.total, 62);
});

test("lancamento manual com endereco fora da area e recusado", async t => {
  mockarEntrega(t, { dentro: false });
  const produto = await produtoDeTeste("teste-entrega-manual-fora", 50);

  const { status, corpo } = await chamar("/api/painel/pedidos", {
    metodo: "POST", sessao: sessaoAdmin,
    corpo: {
      items: [{ id: produto.id, qty: 1 }], customer: "Cliente Longe",
      phone: "21988887777", place: "Rua Muito Longe, 999", payment: "Dinheiro",
      channel: "whatsapp", fulfillment: "entrega"
    }
  });

  assert.equal(status, 400);
  assert.equal(corpo.codigo, "fora_da_area");
});

test("lancamento manual abaixo do minimo da faixa e recusado", async t => {
  mockarEntrega(t, { dentro: true });
  const produto = await produtoDeTeste("teste-entrega-manual-minimo", 10);

  const { status, corpo } = await chamar("/api/painel/pedidos", {
    metodo: "POST", sessao: sessaoAdmin,
    corpo: {
      items: [{ id: produto.id, qty: 1 }], customer: "Cliente Pobre",
      phone: "21988887777", place: "Rua Teste, 123", payment: "Dinheiro",
      channel: "whatsapp", fulfillment: "entrega"
    }
  });

  assert.equal(status, 400);
  assert.equal(corpo.codigo, "abaixo_do_minimo");
});

test("lancamento manual de retirada nao chama geocodificacao nem cobra taxa", async t => {
  /* Sem mock nenhum: se o codigo tentar geocodificar aqui, o teste falha com
   * "MAPBOX_TOKEN nao configurado" em vez de silenciosamente passar. */
  const produto = await produtoDeTeste("teste-entrega-manual-retirada", 50);

  const { status, corpo } = await chamar("/api/painel/pedidos", {
    metodo: "POST", sessao: sessaoAdmin,
    corpo: {
      items: [{ id: produto.id, qty: 1 }], customer: "Cliente Balcao",
      payment: "Dinheiro", channel: "loja", fulfillment: "retirada"
    }
  });

  assert.equal(status, 201);
  assert.equal(corpo.pedido.deliveryFee, 0);
  assert.equal(corpo.pedido.total, 50);
});

test("lancamento manual de entrega sem endereco e recusado", async t => {
  mockarEntrega(t, { dentro: true });
  const produto = await produtoDeTeste("teste-entrega-manual-sem-endereco", 50);

  const { status, corpo } = await chamar("/api/painel/pedidos", {
    metodo: "POST", sessao: sessaoAdmin,
    corpo: {
      items: [{ id: produto.id, qty: 1 }], customer: "Cliente Esquecido",
      phone: "21988887777", payment: "Dinheiro", channel: "whatsapp", fulfillment: "entrega"
    }
  });

  assert.equal(status, 400);
  assert.equal(corpo.codigo, "endereco_ausente");
});
