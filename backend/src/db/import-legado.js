/* Importa o data/baixo-k.json do sistema antigo para o SQLite.
 *
 *   npm run import:legado -- ../data/baixo-k.json
 *
 * Nao apaga nada: o que ja existe no banco e mantido, e so entra o que falta.
 * Rodar duas vezes nao duplica pedido nem produto.
 *
 * Sobre os pedidos antigos: eles entram com `estoque_baixado = 0`. O sistema
 * legado nem sempre marcava essa baixa, e assumir que baixou faria um cancelamento
 * posterior devolver ao estoque unidades que nunca sairam dele. */
import fs from "node:fs";
import path from "node:path";
import { abrirBanco, emTransacao, getDb } from "./connection.js";
import { migrar } from "./migrate.js";
import { CATEGORIAS, CANAIS, MODALIDADES, STATUS_PEDIDO } from "../config/constants.js";

const naFaixa = (valor, lista, padrao) => (lista.includes(valor) ? valor : padrao);
const numero = (valor, padrao = 0) => (Number.isFinite(Number(valor)) ? Number(valor) : padrao);
const texto = (valor, max) => String(valor ?? "").slice(0, max);

/* O legado gravava ISO ou nada. O SQLite compara data como texto, entao
 * normalizamos para 'AAAA-MM-DD HH:MM:SS'. */
function instante(valor) {
  const data = valor ? new Date(valor) : new Date();
  const valida = Number.isNaN(data.getTime()) ? new Date() : data;
  return valida.toISOString().replace("T", " ").slice(0, 19);
}

export function importar(arquivo) {
  abrirBanco();
  migrar();

  const bruto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const dados = JSON.parse(bruto);
  const db = getDb();
  const contagem = { produtos: 0, pedidos: 0, itens: 0, mesas: 0, promocoes: 0, cupons: 0, faixas: 0, ignorados: [] };

  emTransacao(() => {
    // ----------------------------------------------------------- produtos ---
    const inserirProduto = db.prepare(`
      INSERT OR IGNORE INTO produtos (id, nome, categoria, preco, estoque, estoque_min, ativo, imagem, selo, descricao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const produto of dados.products || []) {
      if (!produto?.id || !produto?.name) { contagem.ignorados.push(`produto sem id/nome`); continue; }
      const info = inserirProduto.run(
        String(produto.id).slice(0, 64),
        texto(produto.name, 80),
        naFaixa(produto.category, CATEGORIAS, "porcoes"),
        Math.max(0, numero(produto.price)),
        Math.max(0, Math.floor(numero(produto.stock))),
        Math.max(0, Math.floor(numero(produto.minStock, 4))),
        produto.active === false ? 0 : 1,
        /* Imagem so entra se for caminho do site ou data URL. O legado aceitava
         * qualquer string no campo, e ela ia direto para <img src>. */
        /^(images\/[\w.-]+|data:image\/)/.test(String(produto.image || "")) ? String(produto.image) : "",
        texto(produto.badge, 40),
        texto(produto.description, 300)
      );
      contagem.produtos += info.changes;
    }

    // -------------------------------------------------------------- mesas ---
    const inserirMesa = db.prepare("INSERT OR IGNORE INTO mesas (n, status, aberta_em) VALUES (?, ?, ?)");
    for (const mesa of dados.tables || []) {
      const n = Math.floor(numero(mesa?.n));
      if (n < 1) continue;
      contagem.mesas += inserirMesa.run(
        n,
        naFaixa(mesa.status, ["livre", "aberta", "fechando"], "livre"),
        mesa.openedAt ? instante(mesa.openedAt) : null
      ).changes;
    }

    // ------------------------------------------------------------ pedidos ---
    const inserirPedido = db.prepare(`
      INSERT OR IGNORE INTO pedidos (
        id, criado_em, status, canal, modalidade, cliente, telefone, local, observacao,
        pagamento, mesa_n, subtotal, desconto, cupom_code, taxa_entrega, entrega_km,
        entrega_faixa, total, impresso, estoque_baixado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const inserirItem = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, nome, quantidade, preco_unit)
      VALUES (?, ?, ?, ?, ?)
    `);
    const produtoExiste = db.prepare("SELECT 1 AS ok FROM produtos WHERE id = ?");
    const mesaExiste = db.prepare("SELECT 1 AS ok FROM mesas WHERE n = ?");

    for (const pedido of dados.orders || []) {
      if (!pedido?.id) { contagem.ignorados.push("pedido sem id"); continue; }

      const itens = Array.isArray(pedido.items) ? pedido.items : [];
      const subtotal = numero(pedido.subtotal, itens.reduce((soma, item) => soma + numero(item.price) * numero(item.qty, 1), 0));
      const mesaN = Math.floor(numero(pedido.tableNumber));
      const mesaValida = mesaN > 0 && mesaExiste.get(mesaN);

      /* O legado usava "concluido" numa versao antiga e "entregue" depois. */
      const status = pedido.status === "concluido" ? "entregue" : naFaixa(pedido.status, STATUS_PEDIDO, "entregue");

      const info = inserirPedido.run(
        String(pedido.id).slice(0, 64),
        instante(pedido.createdAt),
        status,
        naFaixa(pedido.channel, CANAIS, "cardapio"),
        naFaixa(pedido.fulfillment, MODALIDADES, "retirada"),
        texto(pedido.customer || "Cliente", 80),
        texto(pedido.phone, 40),
        texto(pedido.place, 160),
        texto(pedido.note, 400),
        texto(pedido.payment, 60),
        mesaValida ? mesaN : null,
        subtotal,
        numero(pedido.discount),
        texto(pedido.coupon, 30),
        numero(pedido.deliveryFee),
        pedido.deliveryKm == null ? null : numero(pedido.deliveryKm),
        pedido.deliveryZone ? texto(pedido.deliveryZone, 40) : null,
        numero(pedido.total, subtotal),
        pedido.printed ? 1 : 0
      );
      if (!info.changes) continue;          // ja existia
      contagem.pedidos += 1;

      for (const item of itens) {
        const qty = Math.max(1, Math.floor(numero(item.qty, 1)));
        /* produto_id vira NULL quando o produto nao existe mais: a FK recusaria,
         * e perder o pedido inteiro por causa de um item descadastrado seria
         * pior do que perder o vinculo. O nome fica gravado na propria linha. */
        const idProduto = item.id && produtoExiste.get(String(item.id)) ? String(item.id) : null;
        inserirItem.run(pedido.id, idProduto, texto(item.name || "Item", 80), qty, Math.max(0, numero(item.price)));
        contagem.itens += 1;
      }
    }

    // ---------------------------------------------------------- promocoes ---
    const inserirPromo = db.prepare(`
      INSERT OR IGNORE INTO promocoes (id, produto_id, preco, ate) VALUES (?, ?, ?, ?)
    `);
    for (const promo of dados.promos || []) {
      if (!promo?.productId || !produtoExiste.get(String(promo.productId))) continue;
      contagem.promocoes += inserirPromo.run(
        String(promo.id || `promo-${promo.productId}`).slice(0, 64),
        String(promo.productId),
        Math.max(0, numero(promo.price)),
        texto(promo.until, 20)
      ).changes;
    }

    // ------------------------------------------------------------- cupons ---
    const inserirCupom = db.prepare(`
      INSERT OR IGNORE INTO cupons (code, tipo, valor, minimo, uso_unico, ate, usos, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cupom of dados.coupons || []) {
      const valor = numero(cupom?.amount);
      if (!cupom?.code || valor <= 0) { contagem.ignorados.push(`cupom invalido: ${cupom?.code}`); continue; }
      contagem.cupons += inserirCupom.run(
        String(cupom.code).toUpperCase().slice(0, 30),
        naFaixa(cupom.kind, ["pct", "val"], "val"),
        valor,
        Math.max(0, numero(cupom.min)),
        cupom.once ? 1 : 0,
        texto(cupom.until, 20),
        Math.max(0, Math.floor(numero(cupom.uses))),
        cupom.active === false ? 0 : 1
      ).changes;
    }

    // ------------------------------------------------------------ entrega ---
    const entrega = dados.delivery || {};
    const lng = Number.isFinite(Number(entrega.lng)) && entrega.lng !== null && entrega.lng !== "" ? Number(entrega.lng) : null;
    const lat = Number.isFinite(Number(entrega.lat)) && entrega.lat !== null && entrega.lat !== "" ? Number(entrega.lat) : null;
    db.prepare("UPDATE entrega_config SET endereco = ?, lng = ?, lat = ? WHERE id = 1")
      .run(texto(entrega.endereco, 200), lng, lat);

    const inserirFaixa = db.prepare("INSERT INTO entrega_faixas (km, taxa, minimo) VALUES (?, ?, ?)");
    for (const faixa of entrega.zones || []) {
      const km = numero(faixa?.km);
      if (km <= 0) continue;
      inserirFaixa.run(km, Math.max(0, numero(faixa.fee)), Math.max(0, numero(faixa.min)));
      contagem.faixas += 1;
    }
  });

  return contagem;
}

if (process.argv[1]?.endsWith("import-legado.js")) {
  const alvo = process.argv[2] || path.resolve("..", "data", "baixo-k.json");
  if (!fs.existsSync(alvo)) {
    console.error(`Arquivo nao encontrado: ${alvo}`);
    console.error("Uso: npm run import:legado -- caminho/para/baixo-k.json");
    process.exit(1);
  }
  try {
    const contagem = importar(alvo);
    console.log("Importacao concluida:");
    console.log(`  produtos:  ${contagem.produtos}`);
    console.log(`  pedidos:   ${contagem.pedidos} (${contagem.itens} itens)`);
    console.log(`  mesas:     ${contagem.mesas}`);
    console.log(`  promocoes: ${contagem.promocoes}`);
    console.log(`  cupons:    ${contagem.cupons}`);
    console.log(`  faixas:    ${contagem.faixas}`);
    if (contagem.ignorados.length) {
      console.log(`\nIgnorados (${contagem.ignorados.length}):`);
      for (const aviso of contagem.ignorados.slice(0, 20)) console.log(`  - ${aviso}`);
    }
    process.exit(0);
  } catch (erro) {
    console.error("Falha na importacao:", erro.message);
    process.exit(1);
  }
}
