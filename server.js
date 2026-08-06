/* Baixo K - servidor de sincronia entre aparelhos.
 *
 * Sem dependencias: roda com `node server.js`. Serve os arquivos do site e
 * guarda o estado compartilhado (pedidos, mesas, produtos, promocoes, cupons)
 * em data/baixo-k.json.
 *
 * Sem este servidor o site continua funcionando sozinho, guardando tudo no
 * localStorage do proprio navegador - so que ai cada aparelho fica com a sua
 * copia. Com ele, o celular do cliente e o tablet do balcao veem a mesma fila.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "baixo-k.json");
const SENHA_FILE = path.join(DATA_DIR, "senha.txt");

/* Paginas do balcao pedem senha; o cardapio do cliente e aberto. */
const PAGINAS_RESTRITAS = new Set(["/admin.html", "/telao.html"]);
const sessoes = new Set();

function senhaDaLoja() {
  if (process.env.BAIXOK_SENHA) return process.env.BAIXOK_SENHA;
  try {
    return fs.readFileSync(SENHA_FILE, "utf8").trim();
  } catch {
    const nova = crypto.randomInt(100000, 999999).toString();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SENHA_FILE, nova + "\n", "utf8");
    return nova;
  }
}
function ehBalcao(req) {
  const cookie = req.headers.cookie || "";
  const achou = cookie.split(";").map(p => p.trim()).find(p => p.startsWith("bk_sessao="));
  return Boolean(achou && sessoes.has(achou.slice("bk_sessao=".length)));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const EMPTY = {
  products: [], orders: [], tables: [], promos: [], coupons: [],
  // area de entrega: ponto da loja e faixas de raio, em km crescente
  delivery: { endereco: "", lng: null, lat: null, zones: [] }
};

const MAPBOX_FILE = path.join(DATA_DIR, "mapbox.txt");
// permite apontar para outro endereco em teste ou atras de um proxy proprio
const MAPBOX_API = process.env.MAPBOX_API || "https://api.mapbox.com";
function tokenMapbox() {
  if (process.env.MAPBOX_TOKEN) return process.env.MAPBOX_TOKEN.trim();
  try { return fs.readFileSync(MAPBOX_FILE, "utf8").trim(); } catch { return ""; }
}

/* Distancia em linha reta, em km. E o que "raio de entrega" quer dizer:
 * nao mede trajeto, mede afastamento da loja. */
function distanciaKm(aLng, aLat, bLng, bLat) {
  const R = 6371;
  const rad = grau => (grau * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function faixaDaDistancia(km, zones) {
  return [...(zones || [])].sort((a, b) => a.km - b.km).find(zone => km <= Number(zone.km)) || null;
}

async function geocodificar(texto) {
  const token = tokenMapbox();
  if (!token) throw new Error("Mapbox nao configurado no servidor");
  const loja = state.delivery || {};
  const params = new URLSearchParams({
    q: String(texto).slice(0, 256),
    access_token: token,
    country: "br",
    language: "pt",
    limit: "5",
    types: "address,street,place,neighborhood"
  });
  // proximity puxa os resultados para perto da loja: "Rua Sacadura Cabral" existe em varias cidades
  if (loja.lng != null && loja.lat != null) params.set("proximity", `${loja.lng},${loja.lat}`);

  const resposta = await fetch(`${MAPBOX_API}/search/geocode/v6/forward?${params}`);
  if (!resposta.ok) throw new Error(`Mapbox respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return (dados.features || []).map(f => ({
    id: f.properties?.mapbox_id || "",
    nome: f.properties?.name || "",
    detalhe: f.properties?.place_formatted || "",
    lng: f.properties?.coordinates?.longitude,
    lat: f.properties?.coordinates?.latitude,
    precisao: f.properties?.coordinates?.accuracy || ""
  })).filter(r => Number.isFinite(r.lng) && Number.isFinite(r.lat));
}

/* Taxa calculada aqui, nunca aceita do navegador. */
function taxaParaEndereco(endereco, coordenada) {
  const loja = state.delivery || {};
  if (loja.lng == null || loja.lat == null || !(loja.zones || []).length) {
    return { configurado: false, taxa: 0, km: null, zona: null };
  }
  const km = distanciaKm(loja.lng, loja.lat, coordenada.lng, coordenada.lat);
  const zona = faixaDaDistancia(km, loja.zones);
  return {
    configurado: true,
    dentro: Boolean(zona),
    km: Math.round(km * 10) / 10,
    taxa: zona ? Number(zona.fee) : 0,
    minimo: zona ? Number(zona.min || 0) : 0,
    zona: zona ? `ate ${zona.km} km` : null,
    endereco
  };
}
let state = { ...EMPTY, rev: 0 };
let listeners = [];

const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUPS_MANTIDOS = 14;

function lerArquivo(file) {
  const dados = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!dados || typeof dados !== "object" || !Array.isArray(dados.products)) {
    throw new Error("formato invalido");
  }
  return dados;
}
function backupsMaisNovosPrimeiro() {
  try {
    return fs.readdirSync(BACKUP_DIR).filter(n => n.endsWith(".json")).sort().reverse()
      .map(n => path.join(BACKUP_DIR, n));
  } catch {
    return [];
  }
}
function load() {
  const candidatos = [DATA_FILE, ...backupsMaisNovosPrimeiro()];
  for (const file of candidatos) {
    try {
      state = { ...EMPTY, rev: 0, ...lerArquivo(file) };
      if (file !== DATA_FILE) {
        console.log(`AVISO: ${DATA_FILE} ilegivel. Restaurado de ${file}`);
        gravar();   // reescreve ja: o arquivo quebrado nao pode continuar no disco
      }
      return;
    } catch (error) {
      if (fs.existsSync(file)) console.log(`AVISO: ${file} nao pode ser lido (${error.message})`);
    }
  }
  state = { ...EMPTY, rev: 0 };
}

let saveTimer = null;
let backupDoDia = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(gravar, 120);
}
/* Grava em arquivo temporario e renomeia. O rename e atomico no mesmo disco:
 * ou o arquivo antigo continua inteiro, ou o novo esta completo. Nunca truncado. */
function gravar() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const texto = JSON.stringify(state, null, 2);
  const temporario = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporario, texto, "utf8");
  fs.renameSync(temporario, DATA_FILE);

  const hoje = new Date().toISOString().slice(0, 10);
  if (backupDoDia === hoje) return;
  backupDoDia = hoje;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, `baixo-k-${hoje}.json`), texto, "utf8");
  backupsMaisNovosPrimeiro().slice(BACKUPS_MANTIDOS).forEach(velho => {
    try { fs.unlinkSync(velho); } catch {}
  });
}
function bump() {
  state.rev += 1;
  save();
  const line = `data: ${state.rev}\n\n`;
  listeners = listeners.filter(res => {
    try { res.write(line); return true; } catch { return false; }
  });
}

/* Mescla por chave em vez de substituir a lista inteira: um aparelho com a
 * copia atrasada nunca apaga o pedido que outro acabou de criar. */
function mergeBy(key, current, incoming) {
  const out = current.slice();
  incoming.forEach(row => {
    const at = out.findIndex(item => item[key] === row[key]);
    if (at >= 0) out[at] = { ...out[at], ...row };
    else out.push(row);
  });
  return out;
}

function applyPatch(patch) {
  if (Array.isArray(patch.orders)) state.orders = mergeBy("id", state.orders, patch.orders);
  if (Array.isArray(patch.products)) state.products = mergeBy("id", state.products, patch.products);
  if (Array.isArray(patch.tables)) state.tables = mergeBy("n", state.tables, patch.tables);
  // promos e cupons so mudam no painel, entao substituir e seguro e permite remover
  if (Array.isArray(patch.promos)) state.promos = patch.promos;
  if (Array.isArray(patch.coupons)) state.coupons = patch.coupons;
  if (Array.isArray(patch.removeTables)) {
    state.tables = state.tables.filter(table => !patch.removeTables.includes(table.n));
  }
  if (patch.delivery && typeof patch.delivery === "object") {
    state.delivery = {
      endereco: String(patch.delivery.endereco || "").slice(0, 200),
      lng: Number.isFinite(Number(patch.delivery.lng)) ? Number(patch.delivery.lng) : null,
      lat: Number.isFinite(Number(patch.delivery.lat)) ? Number(patch.delivery.lat) : null,
      zones: (Array.isArray(patch.delivery.zones) ? patch.delivery.zones : [])
        .map(z => ({ km: Number(z.km) || 0, fee: Number(z.fee) || 0, min: Number(z.min) || 0 }))
        .filter(z => z.km > 0)
        .sort((a, b) => a.km - b.km)
    };
  }
  bump();
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 5e6) reject(new Error("corpo grande demais"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("acesso negado");
    return;
  }
  fs.readFile(file, (error, buffer) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("nao encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": buffer.length,
      // sem cache: toda edicao aparece com um F5, e o app pega versao nova na hora
      "Cache-Control": "no-store, must-revalidate"
    });
    res.end(buffer);
  });
}

/* O cliente do salao recebe cardapio e mesas, mas nunca a lista de pedidos:
 * ela carrega nome, telefone e endereco de todo mundo que ja pediu hoje. */
function estadoPara(balcao) {
  return balcao ? state : { ...state, orders: [] };
}

/* Pedido vindo do cliente: o servidor refaz o preco pelo proprio cadastro.
 * O que chega do navegador so diz o que foi pedido, nunca quanto custa. */
async function registrarPedido(corpo) {
  const pedido = corpo.order || {};
  const itens = Array.isArray(pedido.items) ? pedido.items : [];
  if (!itens.length) throw new Error("pedido sem itens");

  const mesa = corpo.tableNumber == null ? null : state.tables.find(t => t.n === Number(corpo.tableNumber));
  if (corpo.tableNumber != null && (!mesa || mesa.status !== "aberta")) {
    throw new Error("a comanda desta mesa nao esta aberta");
  }

  const conferidos = itens.map(item => {
    const produto = state.products.find(p => p.id === item.id);
    if (!produto) throw new Error(`produto fora do cardapio: ${item.name || item.id}`);
    if (produto.active === false) throw new Error(`${produto.name} esta pausado`);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1)));
    if (qty > Number(produto.stock || 0)) throw new Error(`${produto.name} sem estoque suficiente`);
    const promo = state.promos.find(p => p.productId === produto.id);
    return { id: produto.id, name: produto.name, qty, price: promo ? Number(promo.price) : Number(produto.price) };
  });

  const subtotal = conferidos.reduce((soma, item) => soma + item.price * item.qty, 0);
  let desconto = 0;
  const cupom = state.coupons.find(c => c.code === pedido.coupon && c.active);
  if (cupom && subtotal >= Number(cupom.min || 0)) {
    const bruto = cupom.kind === "pct" ? subtotal * (Number(cupom.amount) / 100) : Number(cupom.amount);
    desconto = Math.min(subtotal, Math.round(bruto * 100) / 100);
    cupom.uses = Number(cupom.uses || 0) + 1;
  }

  /* Entrega: o servidor geocodifica de novo o endereco que veio e refaz a conta.
   * Coordenada mandada pelo navegador nao entra: seria so trocar por uma perto
   * da loja para pagar frete de graca. */
  let entrega = { taxa: 0, km: null, zona: null };
  const ehEntrega = pedido.fulfillment === "entrega";
  if (ehEntrega && (state.delivery?.zones || []).length) {
    const achados = await geocodificar(pedido.place || "");
    if (!achados.length) throw new Error("nao encontramos esse endereco");
    const calculo = taxaParaEndereco(pedido.place, achados[0]);
    if (!calculo.dentro) throw new Error(`endereco fora da area de entrega (${calculo.km} km da loja)`);
    if (subtotal - desconto < calculo.minimo) {
      throw new Error(`pedido minimo de R$ ${calculo.minimo.toFixed(2)} para entrega nessa faixa`);
    }
    entrega = { taxa: calculo.taxa, km: calculo.km, zona: calculo.zona };
  }

  const novo = {
    id: `ped-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    status: "novo",
    printed: false,
    customer: String(pedido.customer || "Cliente").slice(0, 80),
    phone: String(pedido.phone || "").slice(0, 40),
    place: String(pedido.place || "").slice(0, 160),
    note: String(pedido.note || "").slice(0, 400),
    payment: String(pedido.payment || "").slice(0, 60),
    channel: "cardapio",
    fulfillment: ["retirada", "entrega", "mesa"].includes(pedido.fulfillment) ? pedido.fulfillment : "retirada",
    items: conferidos,
    subtotal,
    coupon: desconto ? cupom.code : "",
    discount: desconto,
    deliveryFee: entrega.taxa,
    deliveryKm: entrega.km,
    deliveryZone: entrega.zona,
    total: subtotal - desconto + entrega.taxa
  };
  state.orders = [novo, ...state.orders];
  if (mesa) mesa.items = [...(mesa.items || []), ...conferidos];
  bump();
  return novo;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  const balcao = ehBalcao(req);

  if (pathname === "/api/state") {
    return sendJson(res, 200, estadoPara(balcao));
  }

  if (pathname === "/api/me") {
    return sendJson(res, 200, { balcao });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const corpo = await readBody(req).catch(() => ({}));
    if (String(corpo.senha || "") !== senhaDaLoja()) {
      return sendJson(res, 401, { erro: "Senha incorreta." });
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessoes.add(token);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `bk_sessao=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
      "Cache-Control": "no-store"
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === "/api/order" && req.method === "POST") {
    try {
      return sendJson(res, 200, { pedido: await registrarPedido(await readBody(req)), estado: estadoPara(false) });
    } catch (error) {
      return sendJson(res, 400, { erro: error.message });
    }
  }

  /* Busca de endereco e mapa passam pelo servidor: o token nunca vai ao navegador. */
  if (pathname === "/api/entrega/buscar") {
    const q = (url.parse(req.url, true).query.q || "").toString().trim();
    if (q.length < 3) return sendJson(res, 200, { resultados: [] });
    try {
      return sendJson(res, 200, { resultados: await geocodificar(q) });
    } catch (error) {
      return sendJson(res, 502, { erro: error.message });
    }
  }

  if (pathname === "/api/entrega/taxa") {
    const q = (url.parse(req.url, true).query.q || "").toString().trim();
    if (q.length < 3) return sendJson(res, 400, { erro: "endereco muito curto" });
    try {
      const achados = await geocodificar(q);
      if (!achados.length) return sendJson(res, 404, { erro: "endereco nao encontrado" });
      return sendJson(res, 200, taxaParaEndereco(q, achados[0]));
    } catch (error) {
      return sendJson(res, 502, { erro: error.message });
    }
  }

  if (pathname === "/api/entrega/mapa") {
    const token = tokenMapbox();
    const loja = state.delivery || {};
    if (!token || loja.lng == null) return sendJson(res, 404, { erro: "mapa indisponivel" });
    const raios = (loja.zones || []).map(z => Number(z.km)).filter(Boolean);
    const zoom = raios.length ? Math.max(9, 14 - Math.log2(Math.max(...raios) || 1)) : 14;
    const pino = `pin-l-restaurant+c97443(${loja.lng},${loja.lat})`;
    const alvo = `${MAPBOX_API}/styles/v1/mapbox/dark-v11/static/${pino}/${loja.lng},${loja.lat},${zoom.toFixed(1)}/640x420@2x?access_token=${token}&attribution=true&logo=true`;
    try {
      const imagem = await fetch(alvo);
      if (!imagem.ok) return sendJson(res, 502, { erro: `Mapbox respondeu ${imagem.status}` });
      const buffer = Buffer.from(await imagem.arrayBuffer());
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buffer.length, "Cache-Control": "no-store" });
      return res.end(buffer);
    } catch (error) {
      return sendJson(res, 502, { erro: error.message });
    }
  }

  if (pathname === "/api/entrega/status") {
    return sendJson(res, 200, { configurado: Boolean(tokenMapbox()) });
  }

  if (pathname === "/api/patch" && req.method === "POST") {
    if (!balcao) return sendJson(res, 401, { erro: "precisa entrar com a senha da loja" });
    try {
      applyPatch(await readBody(req));
      return sendJson(res, 200, state);
    } catch (error) {
      return sendJson(res, 400, { erro: error.message });
    }
  }

  if (pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });
    res.write(`data: ${state.rev}\n\n`);
    listeners.push(res);
    req.on("close", () => { listeners = listeners.filter(item => item !== res); });
    return;
  }

  if (pathname.startsWith("/api/")) return sendJson(res, 404, { erro: "rota desconhecida" });

  if (PAGINAS_RESTRITAS.has(pathname) && !balcao) return serveStatic(req, res, "/entrar.html");

  serveStatic(req, res, pathname);
});

load();
server.listen(PORT, () => {
  const senha = senhaDaLoja();
  console.log(`Baixo K rodando em http://localhost:${PORT}`);
  console.log(`Estado compartilhado em ${DATA_FILE}`);
  console.log(`Senha do balcao: ${senha}`);
  if (!process.env.BAIXOK_SENHA) console.log(`(guardada em ${SENHA_FILE} - troque com a variavel BAIXOK_SENHA)`);
});
