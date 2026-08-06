const DB_KEY = "baixoKSystem.v1";
const CART_KEY = "baixoKCart.v1";
const COUPON_KEY = "baixoKCoupon.v1";
const ACTIVE_LOGO = "images/baixok-logo-v2.png";
const DELIVERY_WHATSAPP = "5521990180151";
const CATEGORY_IMAGES = {
  pizzas: "images/produto-pizza.png",
  burgues: "images/produto-burguer.png",
  massas: "images/produto-massa.png",
  drinks: "images/produto-drinks.png",
  porcoes: "images/produto-burguer.png"
};
const SCREEN_REFRESH_MS = 3000;
const CHANNELS = {
  cardapio: "Cardapio",
  loja: "Loja",
  ifood: "iFood",
  "99food": "99Food",
  rappi: "Rappi",
  whatsapp: "WhatsApp"
};
const FULFILLMENT = {
  retirada: "Retirada",
  entrega: "Entrega",
  mesa: "Mesa"
};
const CATEGORIES = {
  todos: "Todos",
  pizzas: "Pizzas",
  burgues: "Burgues",
  massas: "Massas",
  drinks: "Drinks",
  porcoes: "Porcoes"
};
const STATUS = {
  novo: "Novo",
  preparo: "Em preparo",
  pronto: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado"
};
const DEFAULT_PRODUCTS = [
  { id: "pizza-calabresa", name: "Pizza Calabresa", category: "pizzas", price: 39.9, stock: 18, minStock: 4, active: true, image: "", badge: "Pizza", description: "Mussarela, calabresa, cebola e oregano." },
  { id: "pizza-frango", name: "Pizza Frango Catupiry", category: "pizzas", price: 44.9, stock: 14, minStock: 4, active: true, image: "", badge: "Pizza", description: "Frango temperado, catupiry e mussarela." },
  { id: "pizza-baixo-k", name: "Pizza Baixo K", category: "pizzas", price: 49.9, stock: 10, minStock: 3, active: true, image: "", badge: "Mais pedida", description: "Massa da casa, mix de queijos, bacon e finalizacao especial." },
  { id: "burguer-classico", name: "Burguer Classico", category: "burgues", price: 22.9, stock: 30, minStock: 6, active: true, image: "", badge: "Burguer", description: "Pao brioche, carne, queijo, salada e molho da casa." },
  { id: "burguer-bacon", name: "Burguer Bacon", category: "burgues", price: 27.9, stock: 24, minStock: 6, active: true, image: "", badge: "Bacon", description: "Carne, cheddar, bacon crocante e cebola caramelizada." },
  { id: "burguer-duplo", name: "Burguer Duplo K", category: "burgues", price: 34.9, stock: 16, minStock: 4, active: true, image: "", badge: "Duplo", description: "Duas carnes, queijo duplo, bacon e molho especial." },
  { id: "massa-bolonhesa", name: "Massa Bolonhesa", category: "massas", price: 31.9, stock: 12, minStock: 3, active: true, image: "", badge: "Massa", description: "Massa ao molho bolonhesa com parmesao." },
  { id: "massa-alfredo", name: "Massa Alfredo", category: "massas", price: 33.9, stock: 12, minStock: 3, active: true, image: "", badge: "Cremosa", description: "Molho branco cremoso, frango e toque de ervas." },
  { id: "batata-k", name: "Batata Baixo K", category: "porcoes", price: 24.9, stock: 20, minStock: 5, active: true, image: "", badge: "Porcao", description: "Batata frita com cheddar, bacon e molho da casa." },
  { id: "refri-lata", name: "Refrigerante Lata", category: "drinks", price: 7.9, stock: 48, minStock: 12, active: true, image: "", badge: "Gelado", description: "Lata 350ml gelada." },
  { id: "refri-2l", name: "Refrigerante 2L", category: "drinks", price: 14.9, stock: 18, minStock: 6, active: true, image: "", badge: "2 litros", description: "Garrafa 2L gelada." },
  { id: "drink-limao", name: "Drink Limao", category: "drinks", price: 16.9, stock: 22, minStock: 5, active: true, image: "", badge: "Drink", description: "Drink refrescante de limao para acompanhar o pedido." },
  { id: "drink-maracuja", name: "Drink Maracuja", category: "drinks", price: 18.9, stock: 18, minStock: 5, active: true, image: "", badge: "Assinatura", description: "Maracuja, gelo e finalizacao da casa." }
];

const DEFAULT_TABLE_COUNT = 8;
const PHOTO_PRESETS = [
  { label: "Pizza", src: "images/produto-pizza.png" },
  { label: "Burguer", src: "images/produto-burguer.png" },
  { label: "Massa", src: "images/produto-massa.png" },
  { label: "Drink", src: "images/produto-drinks.png" }
];
const MENU_URL = "https://nexo-dev-web.github.io/baixok/";

let currentCategory = "todos";
let fulfillmentMode = "retirada";
let tableSession = null;
let manualCart = [];
let screenSnapshot = "";
let installPrompt = null;
let screenSoundEnabled = false;
let screenAudioContext = null;

const money = value => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[char]));
const defaultTables = () => Array.from({ length: DEFAULT_TABLE_COUNT }, (unused, index) => ({ n: index + 1, status: "livre", openedAt: null, items: [] }));
const db = () => {
  const stored = JSON.parse(localStorage.getItem(DB_KEY) || "null");
  if (stored?.products?.length) {
    stored.orders = (stored.orders || []).map(order => order.status === "concluido" ? { ...order, status: "entregue", stockDeducted: true } : order);
    if (!stored.tables?.length) stored.tables = defaultTables();
    if (!Array.isArray(stored.promos)) stored.promos = [];
    if (!Array.isArray(stored.coupons)) stored.coupons = [];
    return stored;
  }
  const initial = { products: DEFAULT_PRODUCTS, orders: [], tables: defaultTables(), promos: [], coupons: [], lastHighlightedOrderId: null };
  localStorage.setItem(DB_KEY, JSON.stringify(initial));
  return initial;
};
const saveDb = data => {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
  if (sync.on && !sync.applying) syncPush(data);
  window.dispatchEvent(new Event("baixoKDataChanged"));
};

/* — sincronia entre aparelhos —
 * Com o server.js no ar, o estado passa a morar no servidor e o localStorage
 * vira so um espelho local. Sem ele, tudo continua funcionando offline, cada
 * navegador com a sua copia. O resto do app nao muda: quem escreve continua
 * chamando saveDb, quem le continua lendo db(). */
const sync = { on: false, staff: false, rev: -1, applying: false, base: null };
const SYNC_COLLECTIONS = ["products", "orders", "tables", "promos", "coupons"];

async function initSync() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return false;
    const remote = await response.json();
    sync.on = true;
    sync.staff = Boolean((await (await fetch("/api/me", { cache: "no-store" })).json()).balcao);
    if (remote.products?.length) applyRemote(remote);
    else if (sync.staff) await syncSend(pickCollections(db()));  // servidor vazio: sobe o que ja existe aqui
    watchRemote();
    return true;
  } catch {
    return false;                                  // sem servidor: modo local, como antes
  }
}
function pickCollections(data) {
  const patch = SYNC_COLLECTIONS.reduce((acc, key) => ({ ...acc, [key]: data[key] || [] }), {});
  if (data.delivery) patch.delivery = data.delivery;
  return patch;
}
function applyRemote(remote) {
  sync.applying = true;
  const local = db();
  SYNC_COLLECTIONS.forEach(key => { local[key] = remote[key] || []; });
  if (remote.delivery) local.delivery = remote.delivery;
  localStorage.setItem(DB_KEY, JSON.stringify(local));
  sync.rev = remote.rev;
  sync.base = pickCollections(remote);
  sync.applying = false;
  window.dispatchEvent(new Event("baixoKDataChanged"));
}
async function syncSend(patch) {
  const response = await fetch("/api/patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (response.ok) applyRemote(await response.json());
}
function syncPush(data) {
  if (!sync.staff) return;  // o cliente do salao nao empurra estado: pedido dele vai por /api/order
  const patch = pickCollections(data);
  // mesa removida some da lista: o servidor mescla por chave e precisa do aviso
  const gone = (sync.base?.tables || []).map(table => table.n).filter(n => !patch.tables.some(table => table.n === n));
  if (gone.length) patch.removeTables = gone;
  syncSend(patch).catch(() => toast("Sem conexao com o servidor. A alteracao ficou so neste aparelho."));
}
/* Pedido do cliente vai por rota propria: o servidor confere cardapio, estoque,
 * promocao e cupom, e refaz o total. Nada de preco vindo do navegador. */
async function enviarPedidoAoServidor(order, tableNumber = null) {
  const response = await fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order, tableNumber })
  });
  const dados = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(dados.erro || "Nao foi possivel enviar o pedido.");
  applyRemote(dados.estado);
  return dados.pedido;
}
function watchRemote() {
  const stream = new EventSource("/api/events");
  stream.onmessage = async event => {
    if (Number(event.data) === sync.rev) return;   // eco da nossa propria escrita
    const response = await fetch("/api/state", { cache: "no-store" });
    if (response.ok) applyRemote(await response.json());
  };
}
const getProducts = () => db().products;
const getOrders = () => db().orders;
const getTables = () => db().tables;
const getPromos = () => db().promos;
const getCoupons = () => db().coupons;
const saveProducts = products => {
  const data = db();
  data.products = products;
  saveDb(data);
};
const saveTables = tables => {
  const data = db();
  data.tables = tables;
  saveDb(data);
};
const savePromos = promos => {
  const data = db();
  data.promos = promos;
  saveDb(data);
};
const saveCoupons = coupons => {
  const data = db();
  data.coupons = coupons;
  saveDb(data);
};
const promoFor = (id, promos = getPromos()) => promos.find(promo => promo.productId === id) || null;
const effectivePrice = (product, promos = getPromos()) => {
  const promo = promoFor(product.id, promos);
  return promo ? Number(promo.price) : Number(product.price || 0);
};
function localDateKey(value) {
  return new Date(value).toLocaleDateString("pt-BR");
}
function orderQueueNumber(order, orders = getOrders()) {
  const day = localDateKey(order.createdAt);
  const rows = orders
    .filter(item => item.createdAt && localDateKey(item.createdAt) === day)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const index = rows.findIndex(item => item.id === order.id);
  return String(index >= 0 ? index + 1 : rows.length + 1).padStart(3, "0");
}
function orderQueueLabel(order, orders = getOrders()) {
  return `Pedido ${orderQueueNumber(order, orders)}`;
}
const productImage = product => {
  const placeholderImages = new Set(["images/baixok-logo-simples.jpg", ...Object.values(CATEGORY_IMAGES)]);
  if (!product?.image || placeholderImages.has(product.image)) return "";
  return product.image;
};
const productImageMarkup = (product, alt = "") => {
  const src = productImage(product);
  if (!src) return `<div class="no-photo">Sem foto<br><small>Cadastre no painel</small></div>`;
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || product.name || "")}" loading="lazy" decoding="async" onerror="this.replaceWith(noPhotoNode())">`;
};
function noPhotoNode() {
  const node = document.createElement("div");
  node.className = "no-photo";
  node.innerHTML = "Sem foto<br><small>Cadastre no painel</small>";
  return node;
}
const updateProductPhotoPreview = value => {
  const preview = document.getElementById("product-photo-preview");
  const empty = document.querySelector(".photo-empty");
  if (preview) {
    preview.src = value || "";
    preview.classList.toggle("hidden", !value);
  }
  if (empty) empty.classList.toggle("hidden", Boolean(value));
};
const saveOrders = orders => {
  const data = db();
  data.orders = orders;
  saveDb(data);
};
const activeProducts = () => getProducts().filter(product => product.active !== false && Number(product.stock || 0) > 0);
const cart = () => JSON.parse(localStorage.getItem(CART_KEY) || "[]");
const saveCart = rows => localStorage.setItem(CART_KEY, JSON.stringify(rows));
const orderTotal = order => (order.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function toast(message) {
  const target = document.getElementById("toast");
  if (!target) return;
  target.textContent = message;
  target.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => target.classList.remove("show"), 2600);
}
function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    document.getElementById("install-app")?.classList.remove("hidden");
  });
}
async function installApp() {
  if (!installPrompt) {
    toast("No celular, use o menu do navegador e toque em Adicionar a tela inicial.");
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.getElementById("install-app")?.classList.add("hidden");
}
function openSupport() {
  document.getElementById("support-modal")?.classList.remove("hidden");
}
function closeSupport() {
  document.getElementById("support-modal")?.classList.add("hidden");
}
function localTime(value) {
  return new Date(value).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function initMenu() {
  if (!document.querySelector('[data-page="menu"]')) return;
  startTableSession();
  renderFilters();
  renderSignatureProducts();
  renderMenu();
  renderCart();
  if (!tableSession) setFulfillment("retirada");
  const refresh = () => {
    renderSignatureProducts();
    renderMenu();
    renderCart();
    refreshTableSession();
  };
  window.addEventListener("baixoKDataChanged", refresh);
  window.addEventListener("storage", refresh);
  initSync();
}

/* — modo mesa: cardapio aberto pelo QR code da mesa — */
function tableFromUrl() {
  const raw = new URLSearchParams(location.search).get("mesa");
  const number = Number(raw);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function tableRecord(number) {
  return getTables().find(table => table.n === number) || null;
}
function startTableSession() {
  const number = tableFromUrl();
  if (!number) return;
  tableSession = { n: number };
  fulfillmentMode = "mesa";
  document.body.dataset.mode = "mesa";
  const sendButton = document.getElementById("send-order");
  if (sendButton) sendButton.textContent = "Enviar para a cozinha";
  const nameField = document.getElementById("customer-name");
  if (nameField) nameField.placeholder = "Nome de quem esta pedindo (opcional)";
  refreshTableSession();
  showTableView(tableRecord(number)?.items?.length ? "comanda" : "inicio");
}
function refreshTableSession() {
  if (!tableSession) return;
  const table = tableRecord(tableSession.n);
  const open = table?.status === "aberta";
  document.getElementById("table-bar")?.classList.remove("hidden");
  document.getElementById("table-bar-title").textContent = `Mesa n${String.fromCharCode(186)} ${tableSession.n}`;
  document.getElementById("table-bar-status").textContent = open ? "Comanda aberta" : table ? "Comanda fechada" : "Mesa nao encontrada";
  document.getElementById("table-nav")?.classList.toggle("hidden", !open);
  if (!open) {
    document.getElementById("blocked-title").textContent = table?.status === "conta" ? "Conta ja fechada" : "Comanda fechada";
    document.getElementById("blocked-text").textContent = table
      ? table.status === "conta"
        ? "A conta desta mesa ja foi fechada no balcao. Para pedir de novo, chame o atendente."
        : "Chame o atendente para abrir a mesa e liberar os pedidos por aqui."
      : "Nao encontramos essa mesa. Confira o QR code ou chame o atendente.";
    showTableView("blocked");
    return;
  }
  renderTableComanda();
}
function showTableView(view) {
  if (!tableSession) return;
  const blocked = view === "blocked";
  document.getElementById("table-blocked")?.classList.toggle("hidden", !blocked);
  document.getElementById("table-comanda")?.classList.toggle("hidden", view !== "comanda");
  document.querySelectorAll(".shop-layout, .hero, .mobile-cart, .nexo-footer").forEach(node => {
    node.classList.toggle("hidden", view !== "inicio");
  });
  document.querySelectorAll(".table-tab").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (blocked) closeCart();
  if (view !== "inicio") window.scrollTo({ top: 0 });
}
function tableComandaTotals(table) {
  const consumo = (table?.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
  const servico = consumo * SERVICE_FEE;
  return { consumo, servico, total: consumo + servico };
}
function renderTableComanda() {
  if (!tableSession) return;
  const table = tableRecord(tableSession.n);
  const items = table?.items || [];
  const count = items.reduce((sum, item) => sum + Number(item.qty || 1), 0);
  const badge = document.getElementById("comanda-count");
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
  }
  document.getElementById("comanda-empty")?.classList.toggle("hidden", items.length > 0);
  document.getElementById("comanda-body")?.classList.toggle("hidden", items.length === 0);
  const title = document.getElementById("comanda-title");
  if (title) title.textContent = `Mesa ${tableSession.n}`;
  const list = document.getElementById("comanda-items");
  if (list) {
    list.innerHTML = items.map(item => `
      <div class="comanda-line">
        <span>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</span>
        <span>R$ ${money(Number(item.price || 0) * Number(item.qty || 1))}</span>
      </div>
    `).join("");
  }
  const totals = document.getElementById("comanda-totals");
  if (totals) {
    const { consumo, servico, total } = tableComandaTotals(table);
    totals.innerHTML = `
      <div class="comanda-line"><span>Consumo</span><span>R$ ${money(consumo)}</span></div>
      <div class="comanda-line"><span>Servico (10%)</span><span>R$ ${money(servico)}</span></div>
      <div class="comanda-line total"><span>Total da comanda</span><span>R$ ${money(total)}</span></div>
    `;
  }
}
function openPaymentInfo() {
  document.getElementById("payment-modal")?.classList.remove("hidden");
}
function closePaymentInfo(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("payment-modal")?.classList.add("hidden");
}
async function sendTableOrder() {
  const rows = cart();
  if (!rows.length) return alert("Adicione pelo menos um item.");
  const table = tableRecord(tableSession.n);
  if (table?.status !== "aberta") {
    refreshTableSession();
    return alert("A comanda desta mesa nao esta aberta. Chame o atendente.");
  }
  const note = document.getElementById("order-note").value.trim();
  const customer = document.getElementById("customer-name").value.trim() || `Mesa ${tableSession.n}`;
  const items = rows.map(item => ({ id: item.id, name: item.name, price: Number(item.price), qty: Number(item.qty) }));
  const order = {
    customer, phone: "", place: `Mesa ${tableSession.n} - salao`, payment: "Pagar no balcao",
    note, channel: "cardapio", fulfillment: "mesa", items, total: cartTotal()
  };
  if (sync.on && !sync.staff) {
    try {
      await enviarPedidoAoServidor(order, tableSession.n);
    } catch (error) {
      return alert(error.message);
    }
  } else {
    createOrder(order);
    saveTables(getTables().map(row => row.n === tableSession.n ? { ...row, items: [...(row.items || []), ...items] } : row));
  }
  clearCart();
  closeCart();
  ["customer-name", "order-note"].forEach(id => document.getElementById(id).value = "");
  showTableView("comanda");
  toast("Pedido enviado para a cozinha.");
}
function signatureProducts() {
  const products = activeProducts();
  const picked = [];
  const add = product => {
    if (product && !picked.some(item => item.id === product.id)) picked.push(product);
  };
  add(products.find(product => /baixo k|mais pedida|especial/i.test(`${product.name} ${product.badge || ""}`)));
  ["burgues", "drinks", "pizzas", "massas"].forEach(category => add(products.find(product => product.category === category)));
  products.forEach(add);
  return picked.slice(0, 3);
}
function renderSignatureProducts() {
  const target = document.getElementById("signature");
  if (!target) return;
  const labels = ["Destaque da casa", "Pedido forte", "Combina com tudo"];
  const rows = signatureProducts();
  target.innerHTML = rows.length ? rows.map((product, index) => `
    <article onclick="setCategory('${product.category}'); document.getElementById('menu-shell')?.scrollIntoView({ behavior: 'smooth' })">
      ${productImageMarkup(product)}
      <div>
        <span>${escapeHtml(product.badge || labels[index] || CATEGORIES[product.category] || "Destaque")}</span>
        <strong>${escapeHtml(product.name)}</strong>
        <em>R$ ${money(product.price)}</em>
      </div>
    </article>
  `).join("") : "";
}
function renderFilters() {
  const target = document.getElementById("filters");
  if (!target) return;
  target.innerHTML = Object.entries(CATEGORIES).map(([key, label]) => `<button class="filter ${currentCategory === key ? "active" : ""}" onclick="setCategory('${key}')">${label}</button>`).join("");
}
function setCategory(category) {
  currentCategory = category;
  renderFilters();
  renderMenu();
}
function renderMenu() {
  const target = document.getElementById("menu");
  if (!target) return;
  const search = (document.getElementById("search")?.value || "").trim().toLowerCase();
  const list = activeProducts().filter(product => {
    const categoryOk = currentCategory === "todos" || product.category === currentCategory;
    const searchOk = !search || `${product.name} ${product.description} ${product.badge || ""}`.toLowerCase().includes(search);
    return categoryOk && searchOk;
  });
  const promos = getPromos();
  target.innerHTML = list.length ? list.map(product => {
    const price = effectivePrice(product, promos);
    const onSale = price < Number(product.price || 0);
    return `
    <article class="product ${onSale ? "on-sale" : ""}">
      <span class="badge">${onSale ? "Promocao" : escapeHtml(product.badge || CATEGORIES[product.category] || "Item")}</span>
      ${productImageMarkup(product)}
      <div class="product-body">
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.description)}</p>
        <div class="stock-chip">${Number(product.stock || 0)} disponiveis</div>
        <div class="price-row">
          <span>${onSale ? `<s>R$ ${money(product.price)}</s> ` : ""}R$ ${money(price)}</span>
          <button class="primary" onclick="addToCart('${product.id}')">Adicionar</button>
        </div>
      </div>
    </article>
  `;
  }).join("") : "<p>Nenhum item disponivel nesse filtro.</p>";
}
function setFulfillment(mode) {
  fulfillmentMode = mode;
  document.getElementById("mode-retirada")?.classList.toggle("active", mode === "retirada");
  document.getElementById("mode-entrega")?.classList.toggle("active", mode === "entrega");
  const banner = document.getElementById("pickup-banner");
  const label = document.getElementById("place-label");
  const place = document.getElementById("customer-place");
  if (banner) banner.textContent = mode === "retirada" ? "RETIRADA" : "ENTREGA";
  if (label) label.classList.toggle("hidden", mode === "retirada");
  if (label) label.firstChild.textContent = "Endereco de entrega";
  if (place) {
    place.placeholder = "Endereco completo";
    if (mode === "retirada") place.value = "";
  }
}
function addToCart(id) {
  const product = getProducts().find(item => item.id === id);
  if (!product || Number(product.stock || 0) <= 0) return toast("Item sem estoque.");
  const rows = cart();
  const existing = rows.find(item => item.id === id);
  const nextQty = (existing?.qty || 0) + 1;
  if (nextQty > Number(product.stock || 0)) return toast("Quantidade maior que o estoque.");
  if (existing) existing.qty = nextQty;
  else rows.push({ id: product.id, name: product.name, price: effectivePrice(product), qty: 1, image: productImage(product) });
  saveCart(rows);
  renderCart();
  openCart();
  toast("Item adicionado ao pedido.");
}
function openCart() {
  document.body.classList.add("cart-open");
}
function closeCart() {
  document.body.classList.remove("cart-open");
}
function changeQty(id, delta) {
  let rows = cart();
  const item = rows.find(row => row.id === id);
  const product = getProducts().find(row => row.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty > Number(product?.stock || 0)) item.qty = Number(product?.stock || 0);
  if (item.qty <= 0) rows = rows.filter(row => row.id !== id);
  saveCart(rows);
  renderCart();
}
/* — endereco e taxa de entrega no carrinho — */
let cotacaoEntrega = null;
let buscaEnderecoTimer = null;

function limparCotacao() {
  cotacaoEntrega = null;
  const aviso = document.getElementById("entrega-aviso");
  if (aviso) aviso.classList.add("hidden");
  renderCart();
}
function buscarEnderecoCliente(termo) {
  clearTimeout(buscaEnderecoTimer);
  const alvo = document.getElementById("endereco-sugestoes");
  if (!alvo) return;
  cotacaoEntrega = null;
  if (termo.trim().length < 4) {
    alvo.innerHTML = "";
    return renderCart();
  }
  buscaEnderecoTimer = setTimeout(async () => {
    try {
      const { resultados = [] } = await (await fetch(`/api/entrega/buscar?q=${encodeURIComponent(termo)}`)).json();
      alvo.innerHTML = resultados.map(r => `
        <button type="button" class="sugestao" onclick="escolherEndereco('${escapeHtml(`${r.nome}, ${r.detalhe}`).replace(/'/g, "&#39;")}')">
          <strong>${escapeHtml(r.nome)}</strong><span>${escapeHtml(r.detalhe)}</span>
        </button>
      `).join("");
    } catch {
      alvo.innerHTML = "";
    }
  }, 350);
}
async function escolherEndereco(endereco) {
  document.getElementById("customer-place").value = endereco;
  document.getElementById("endereco-sugestoes").innerHTML = "";
  const aviso = document.getElementById("entrega-aviso");
  try {
    const dados = await (await fetch(`/api/entrega/taxa?q=${encodeURIComponent(endereco)}`)).json();
    if (!dados.configurado) {
      cotacaoEntrega = null;
    } else if (dados.dentro) {
      cotacaoEntrega = dados;
      aviso.className = "entrega-aviso ok";
      aviso.textContent = `Entrega em ${dados.km} km · taxa R$ ${money(dados.taxa)}${dados.minimo ? ` · pedido minimo R$ ${money(dados.minimo)}` : ""}`;
    } else {
      cotacaoEntrega = { ...dados, dentro: false };
      aviso.className = "entrega-aviso erro";
      aviso.textContent = `Esse endereco esta a ${dados.km} km da loja, fora da area de entrega.`;
    }
    aviso.classList.toggle("hidden", !dados.configurado);
  } catch {
    cotacaoEntrega = null;
    aviso.classList.add("hidden");
  }
  renderCart();
}
const taxaEntrega = () => (fulfillmentMode === "entrega" && cotacaoEntrega?.dentro ? Number(cotacaoEntrega.taxa) : 0);

function cartSubtotal() {
  return cart().reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
}
function cartTotal() {
  return Math.max(0, cartSubtotal() - couponDiscount()) + taxaEntrega();
}

/* — cupons no carrinho do cliente — */
function storedCouponCode() {
  return localStorage.getItem(COUPON_KEY) || "";
}
function activeCoupon() {
  const code = storedCouponCode();
  if (!code || tableSession) return null;
  const coupon = getCoupons().find(row => row.code === code);
  if (!coupon || !coupon.active) return null;
  if (Number(coupon.min || 0) > cartSubtotal()) return null;
  return coupon;
}
function couponDiscount() {
  const coupon = activeCoupon();
  if (!coupon) return 0;
  const subtotal = cartSubtotal();
  const raw = coupon.kind === "pct" ? subtotal * (Number(coupon.amount) / 100) : Number(coupon.amount);
  return Math.min(subtotal, Math.round(raw * 100) / 100);
}
function couponDescription(coupon) {
  const value = coupon.kind === "pct" ? `${coupon.amount}% off` : `R$ ${money(coupon.amount)} off`;
  return Number(coupon.min || 0) ? `${value} · min. R$ ${money(coupon.min)}` : value;
}
function couponFeedback(message, tone = "error") {
  const target = document.getElementById("coupon-feedback");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("hidden", !message);
  target.classList.toggle("ok", tone === "ok");
}
function applyCoupon() {
  const field = document.getElementById("coupon-code-input");
  const code = (field?.value || "").trim().toUpperCase();
  if (!code) return couponFeedback("Digite o codigo do cupom.");
  const coupon = getCoupons().find(row => row.code === code);
  if (!coupon) return couponFeedback("Cupom nao encontrado.");
  if (!coupon.active) return couponFeedback("Esse cupom nao esta mais ativo.");
  if (!cart().length) return couponFeedback("Adicione itens antes de aplicar o cupom.");
  if (Number(coupon.min || 0) > cartSubtotal()) return couponFeedback(`Pedido minimo de R$ ${money(coupon.min)} para usar esse cupom.`);
  localStorage.setItem(COUPON_KEY, coupon.code);
  couponFeedback("");
  if (field) field.value = "";
  renderCart();
  toast("Cupom aplicado.");
}
function removeCoupon() {
  localStorage.removeItem(COUPON_KEY);
  couponFeedback("");
  renderCart();
}
function renderCouponState() {
  const wrap = document.getElementById("coupon-field");
  if (!wrap) return;
  wrap.classList.toggle("hidden", Boolean(tableSession));
  const coupon = activeCoupon();
  const applied = document.getElementById("coupon-applied");
  applied?.classList.toggle("hidden", !coupon);
  if (coupon) {
    document.getElementById("coupon-applied-code").textContent = coupon.code;
    document.getElementById("coupon-applied-desc").textContent = couponDescription(coupon);
  } else if (storedCouponCode()) {
    // guardado mas invalido agora: some do total e avisa o motivo
    const stored = getCoupons().find(row => row.code === storedCouponCode());
    couponFeedback(stored && Number(stored.min || 0) > cartSubtotal()
      ? `Faltam R$ ${money(Number(stored.min) - cartSubtotal())} para o cupom ${stored.code} valer.`
      : "O cupom aplicado nao esta mais disponivel.");
  }
}
function renderCart() {
  const target = document.getElementById("cart-items");
  if (!target) return;
  const rows = cart();
  const products = getProducts();
  target.innerHTML = rows.length ? rows.map(item => `
    <div class="cart-row">
      <div class="cart-thumb">${productImageMarkup({ name: item.name, image: item.image || productImage(products.find(product => product.id === item.id)) }, item.name)}</div>
      <div class="cart-row-body">
        <div class="price-row">
          <strong>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</strong>
          <span>R$ ${money(item.price * item.qty)}</span>
        </div>
        <div class="qty-actions">
          <button onclick="changeQty('${item.id}', -1)">-</button>
          <button onclick="changeQty('${item.id}', 1)">+</button>
        </div>
      </div>
    </div>
  `).join("") : "<p>Nenhum item no pedido.</p>";
  renderCouponState();
  const subtotal = cartSubtotal();
  const discount = couponDiscount();
  document.getElementById("cart-subtotal").textContent = money(subtotal);
  document.getElementById("cart-discount").textContent = money(discount);
  const frete = taxaEntrega();
  document.getElementById("cart-delivery").textContent = money(frete);
  document.getElementById("delivery-line").classList.toggle("hidden", frete === 0);
  document.getElementById("subtotal-line").classList.toggle("hidden", discount === 0 && frete === 0);
  document.getElementById("discount-line").classList.toggle("hidden", discount === 0);
  document.getElementById("cart-total").textContent = money(cartTotal());
  document.getElementById("mobile-total").textContent = money(cartTotal());
  document.getElementById("cart-count").textContent = rows.reduce((sum, item) => sum + item.qty, 0);
}
function clearCart() {
  saveCart([]);
  localStorage.removeItem(COUPON_KEY);
  couponFeedback("");
  renderCart();
}
function createOrder(order) {
  const data = db();
  data.orders.unshift({ ...order, id: uid("ped"), createdAt: new Date().toISOString(), status: "novo", printed: false });
  data.lastHighlightedOrderId = data.orders[0].id;
  saveDb(data);
  return data.orders[0];
}
function orderWhatsappText(order) {
  const items = order.items.map(item => `- ${item.qty}x ${item.name} | R$ ${money(Number(item.price || 0) * Number(item.qty || 1))}`).join("\n");
  return [
    "Novo pedido de ENTREGA - Baixo K",
    `Pedido: #${String(order.id).slice(-5)}`,
    `Cliente: ${order.customer}`,
    order.phone ? `Telefone: ${order.phone}` : "",
    `Endereco: ${order.place}`,
    `Pagamento: ${order.payment}`,
    "",
    "Itens:",
    items,
    "",
    Number(order.discount || 0) > 0 ? `Subtotal: R$ ${money(order.subtotal || order.total)}` : "",
    Number(order.discount || 0) > 0 ? `Cupom ${order.coupon}: - R$ ${money(order.discount)}` : "",
    `Total: R$ ${money(order.total)}`,
    order.note ? `Observacao: ${order.note}` : ""
  ].filter(Boolean).join("\n");
}
function openDeliveryWhatsapp(order) {
  const url = `https://wa.me/${DELIVERY_WHATSAPP}?text=${encodeURIComponent(orderWhatsappText(order))}`;
  window.open(url, "_blank", "noopener");
}
async function sendOrder() {
  if (tableSession) return sendTableOrder();
  const rows = cart();
  if (!rows.length) return alert("Adicione pelo menos um item.");
  const customer = document.getElementById("customer-name").value.trim();
  const phone = document.getElementById("customer-phone").value.trim();
  const placeValue = document.getElementById("customer-place").value.trim();
  const payment = document.getElementById("payment-method").value;
  const note = document.getElementById("order-note").value.trim();
  const place = fulfillmentMode === "retirada" ? "Retirada" : placeValue;
  if (!customer || !payment || (fulfillmentMode === "entrega" && !placeValue)) return alert(fulfillmentMode === "entrega" ? "Preencha cliente, endereco e pagamento." : "Preencha cliente e pagamento.");
  if (fulfillmentMode === "entrega" && cotacaoEntrega && !cotacaoEntrega.dentro) {
    return alert(`Esse endereco esta a ${cotacaoEntrega.km} km da loja, fora da area de entrega.`);
  }
  if (fulfillmentMode === "entrega" && cotacaoEntrega?.minimo && cartSubtotal() - couponDiscount() < cotacaoEntrega.minimo) {
    return alert(`O pedido minimo para entrega nessa faixa e R$ ${money(cotacaoEntrega.minimo)}.`);
  }
  const coupon = activeCoupon();
  const discount = couponDiscount();
  const draft = {
    customer, phone, place, payment, note, channel: "cardapio", fulfillment: fulfillmentMode,
    items: rows, subtotal: cartSubtotal(), coupon: coupon?.code || "", discount, total: cartTotal()
  };
  let order;
  if (sync.on && !sync.staff) {
    try {
      order = await enviarPedidoAoServidor(draft);   // servidor confere preco, estoque e cupom
    } catch (error) {
      return alert(error.message);
    }
  } else {
    order = createOrder(draft);
    if (coupon) {
      saveCoupons(getCoupons().map(row => row.code === coupon.code ? { ...row, uses: Number(row.uses || 0) + 1 } : row));
    }
  }
  if (fulfillmentMode === "entrega") openDeliveryWhatsapp(order);
  clearCart();
  closeCart();
  ["customer-name", "customer-phone", "customer-place", "order-note"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("payment-method").value = "";
  toast(fulfillmentMode === "entrega" ? "Pedido enviado e WhatsApp aberto para entrega." : "Pedido enviado para a cozinha.");
}

const ADMIN_TABS = {
  pedidos: {
    title: "Fila de pedidos",
    sub: "Fila unica do cardapio, WhatsApp e lancamentos manuais."
  },
  cozinha: {
    title: "Painel de Cozinha (KDS)",
    sub: "Tela grande para o tablet da cozinha, entrega e retirada juntos."
  },
  mesas: {
    title: "Mesas do salao",
    sub: "Comanda por mesa com QR code, parcial e fechamento de conta."
  },
  produtos: {
    title: "Produtos",
    sub: "Catalogo do cardapio: foto, descricao, preco, categoria e estoque."
  },
  promos: {
    title: "Promocoes e cupons",
    sub: "Precos promocionais, cupons e dicas geradas pelas vendas."
  },
  entrega: {
    title: "Area de entrega",
    sub: "Ponto da loja, faixas de raio e taxa cobrada em cada uma."
  },
  estoque: {
    title: "Estoque",
    sub: "Contador por produto com ajuste manual na entrada de mercadoria."
  },
  dashboard: {
    title: "Dashboard",
    sub: "Faturamento, canais, ranking e historico completo com filtros."
  }
};
const SERVICE_FEE = 0.1;
const LATE_MINUTES = 15;

let adminTab = "pedidos";
let dashPeriod = "hoje";
let manualChannel = "loja";
let manualPayment = "Dinheiro";
let manualTable = null;
let couponKind = "pct";
let couponOnce = false;

function initAdmin() {
  if (!document.querySelector('[data-page="admin"]')) return;
  renderChannelFilter();
  renderManualChips();
  renderPhotoPresets();
  resetProductForm();
  showAdminTab("pedidos");
  setInterval(renderAdmin, 6000);
  window.addEventListener("storage", renderAdmin);
  window.addEventListener("baixoKDataChanged", renderAdmin);
  initSync();
}
function showAdminTab(tab) {
  adminTab = ADMIN_TABS[tab] ? tab : "pedidos";
  document.querySelectorAll(".admin-tab").forEach(section => section.classList.add("hidden"));
  document.getElementById(`tab-${adminTab}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.tab === adminTab));
  document.getElementById("page-title").textContent = ADMIN_TABS[adminTab].title;
  document.getElementById("page-sub").textContent = ADMIN_TABS[adminTab].sub;
  renderAdmin();
}
function renderAdmin() {
  renderPageMetrics();
  renderOrdersKanban();
  renderKds();
  renderTablesGrid();
  renderProductsAdmin();
  renderPromos();
  renderCoupons();
  renderEntrega();
  renderStock();
  renderDashboard();
}
function renderPageMetrics() {
  const orders = getOrders();
  const open = orders.filter(order => ["novo", "preparo", "pronto"].includes(order.status));
  const waiting = orders.filter(order => order.status === "novo").length;
  const low = getProducts().filter(product => Number(product.stock || 0) <= Number(product.minStock || 0));
  const badge = document.getElementById("nav-badge");
  if (badge) {
    badge.textContent = waiting;
    badge.classList.toggle("hidden", waiting === 0);
  }
  const target = document.getElementById("mini-metrics");
  if (!target) return;
  target.innerHTML = `
    <div class="mini-metric ${waiting ? "alert-copper" : ""}"><strong>${open.length}</strong><span>Pedidos abertos</span></div>
    <div class="mini-metric ${low.length ? "alert-danger" : ""}"><strong class="${low.length ? "danger-text" : "ok-text"}">${low.length}</strong><span>Itens em alerta</span></div>
  `;
}

/* — fila de pedidos — */
function elapsedMinutes(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}
function waitLabel(minutes) {
  return minutes < 1 ? "agora" : `${minutes} min`;
}
function byPriority(rows) {
  return [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
function statusActions(order) {
  if (order.status === "novo") {
    return `
      <button class="primary small" onclick="moveOrder('${order.id}', 'preparo')">Aprovar e imprimir</button>
      <button class="danger small" onclick="cancelOrder('${order.id}')">Recusar</button>
    `;
  }
  if (order.status === "preparo") {
    return `
      <button class="primary small" onclick="moveOrder('${order.id}', 'pronto')">${order.fulfillment === "retirada" ? "Pronto - chamar no telao" : "Despachar entrega"}</button>
      <button class="secondary small" onclick="reprintOrder('${order.id}')">Reimprimir</button>
    `;
  }
  if (order.status === "pronto") return `<button class="ghost-green small" onclick="completeOrder('${order.id}')">Marcar entregue</button>`;
  return "";
}
function orderCard(order) {
  const wait = elapsedMinutes(order.createdAt);
  const priority = order.status === "entregue" ? "normal" : wait >= LATE_MINUTES * 2 ? "urgent" : wait >= LATE_MINUTES ? "attention" : "normal";
  return `
    <article class="order-card status-${order.status} priority-${priority}" draggable="true" ondragstart="dragOrder(event, '${order.id}')">
      <div class="order-top">
        <strong class="order-num">#${orderQueueNumber(order)}</strong>
        <strong class="order-customer">${escapeHtml(order.customer)}</strong>
        <strong class="order-total">R$ ${money(order.total)}</strong>
      </div>
      <div class="order-flags">
        <span class="flag">${escapeHtml(CHANNELS[order.channel] || order.channel)}</span>
        <span class="flag">${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</span>
        <span class="flag ${/pix/i.test(order.payment || "") ? "paid" : ""}">${escapeHtml(order.payment)}</span>
        <span class="flag time">${waitLabel(wait)}</span>
      </div>
      <p class="order-items-line">${escapeHtml(order.items.map(item => `${item.qty}x ${item.name}`).join("  ·  "))}</p>
      ${order.note ? `<p class="order-note"><strong>Obs:</strong> ${escapeHtml(order.note)}</p>` : ""}
      <p class="order-place">${escapeHtml(order.place)}${order.phone ? ` | ${escapeHtml(order.phone)}` : ""}</p>
      ${order.printed ? `<div class="order-flags"><span class="flag done">🖨 Cozinha ✓</span><span class="flag done">🖨 Balcao ✓</span></div>` : ""}
      <div class="order-actions">${statusActions(order)}</div>
    </article>
  `;
}
function renderOrdersKanban() {
  const target = document.getElementById("orders-kanban");
  if (!target) return;
  const orders = getOrders().filter(order => order.status !== "cancelado");
  const columns = [["novo", "Aguardando aprovacao"], ["preparo", "Em preparo"], ["pronto", "Pronto / A caminho"], ["entregue", "Entregue"]];
  target.innerHTML = columns.map(([status, title]) => {
    const rows = byPriority(orders.filter(order => order.status === status));
    return `<div class="kanban-column status-zone-${status}" ondragover="allowOrderDrop(event)" ondrop="dropOrder(event, '${status}')"><h2>${title} <span>${rows.length}</span></h2>${rows.length ? rows.map(orderCard).join("") : "<p>Nenhum pedido aqui.</p>"}</div>`;
  }).join("");
}
function dragOrder(event, id) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
}
function allowOrderDrop(event) {
  event.preventDefault();
}
function dropOrder(event, status) {
  event.preventDefault();
  const id = event.dataTransfer.getData("text/plain");
  if (!id) return;
  if (status === "entregue") completeOrder(id);
  else moveOrder(id, status);
}
function moveOrder(id, status) {
  const currentOrder = getOrders().find(order => order.id === id);
  saveOrders(getOrders().map(order => order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order));
  if (status === "preparo" && currentOrder && !currentOrder.printed) {
    setTimeout(() => printOrder(id, "kitchen"), 80);
    setTimeout(() => printOrder(id, "counter"), 900);
  }
  toast(`Pedido marcado como ${STATUS[status]}.`);
}
function reprintOrder(id) {
  printOrder(id, "kitchen");
  setTimeout(() => printOrder(id, "counter"), 900);
}
function cancelOrder(id) {
  if (!confirm("Recusar este pedido?")) return;
  saveOrders(getOrders().map(order => order.id === id ? { ...order, status: "cancelado", updatedAt: new Date().toISOString() } : order));
  toast("Pedido recusado.");
}
function completeOrder(id) {
  const orders = getOrders();
  const order = orders.find(item => item.id === id);
  if (!order) return;
  const products = getProducts().map(product => {
    const sold = order.items.find(item => item.id === product.id);
    return sold && !order.stockDeducted ? { ...product, stock: Math.max(0, Number(product.stock || 0) - Number(sold.qty || 1)) } : product;
  });
  const data = db();
  data.products = products;
  data.orders = orders.map(item => item.id === id ? { ...item, status: "entregue", stockDeducted: true, completedAt: item.completedAt || new Date().toISOString() } : item);
  saveDb(data);
  toast("Pedido entregue. Venda registrada e estoque baixado.");
}

/* — cozinha (KDS) — */
function renderKds() {
  const target = document.getElementById("kds-board");
  if (!target) return;
  const columns = [["preparo", "PREPARANDO", "TOQUE QUANDO FICAR PRONTO →"], ["pronto", "PRONTO", "TOQUE QUANDO SAIR / FOR RETIRADO ✓"]];
  target.innerHTML = columns.map(([status, title, hint]) => {
    const rows = byPriority(getOrders().filter(order => order.status === status));
    const cards = rows.map(order => {
      const wait = elapsedMinutes(order.createdAt);
      const late = wait >= LATE_MINUTES;
      return `
        <article class="kds-card ${late ? "late" : ""} kds-${status}" onclick="advanceKds('${order.id}', '${status}')">
          <div class="kds-top">
            <strong class="kds-num">#${orderQueueNumber(order)}</strong>
            <strong class="kds-customer">${escapeHtml(order.customer)}</strong>
            <span class="kds-time">${waitLabel(wait)}</span>
          </div>
          <span class="flag">${escapeHtml((FULFILLMENT[order.fulfillment] || order.fulfillment).toUpperCase())}</span>
          <div class="kds-items">${order.items.map(item => `<div>${escapeHtml(item.qty)}× ${escapeHtml(item.name)}</div>`).join("")}</div>
          ${order.note ? `<div class="kds-note">${escapeHtml(order.note)}</div>` : ""}
          <div class="kds-hint">${hint}</div>
        </article>
      `;
    }).join("");
    return `<div class="kds-column"><div class="kds-head"><span class="kds-title status-${status}">${title}</span><span class="kds-count">${rows.length}</span></div><div class="kds-list">${cards || `<p class="kds-empty">Nenhum pedido aqui.</p>`}</div></div>`;
  }).join("");
}
function advanceKds(id, status) {
  if (status === "preparo") moveOrder(id, "pronto");
  else completeOrder(id);
}

/* — mesas do salao — */
function tableTotal(table) {
  return (table.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
}
function updateTable(number, patch) {
  saveTables(getTables().map(table => table.n === number ? { ...table, ...patch } : table));
}
function addTable() {
  const tables = getTables();
  saveTables([...tables, { n: Math.max(0, ...tables.map(table => table.n)) + 1, status: "livre", openedAt: null, items: [] }]);
}
function removeTable() {
  const tables = getTables();
  if (tables.length <= 1) return toast("Mantenha pelo menos uma mesa.");
  const last = tables[tables.length - 1];
  if (last.status !== "livre" && !confirm(`A mesa ${last.n} nao esta livre. Remover mesmo assim?`)) return;
  saveTables(tables.slice(0, -1));
}
function openTable(number) {
  updateTable(number, { status: "aberta", openedAt: new Date().toISOString(), items: [] });
  toast(`Mesa ${number} aberta. QR liberado.`);
}
function closeTableBill(number) {
  const table = getTables().find(item => item.n === number);
  if (!table) return;
  updateTable(number, { status: "conta" });
  printTableBill(table);
}
function releaseTable(number) {
  updateTable(number, { status: "livre", openedAt: null, items: [] });
  toast(`Mesa ${number} liberada.`);
}
function printTableBill(table) {
  const consumo = tableTotal(table);
  const servico = consumo * SERVICE_FEE;
  sendToPrinter(buildReceipt({
    id: `mesa-${table.n}`,
    codeLabel: `MESA ${table.n}`,
    createdAt: table.openedAt || new Date().toISOString(),
    channel: "loja",
    fulfillment: "mesa",
    customer: `Mesa ${table.n}`,
    place: `Mesa ${table.n} - salao`,
    payment: "Conta fechada",
    note: `Servico (10%): R$ ${money(servico)}`,
    total: consumo + servico,
    items: table.items || []
  }, "counter"));
}
function renderTablesGrid() {
  const target = document.getElementById("tables-grid");
  if (!target) return;
  const tables = getTables();
  const counter = document.getElementById("table-count");
  if (counter) counter.textContent = tables.length;
  target.innerHTML = tables.map(table => {
    const consumo = tableTotal(table);
    const servico = consumo * SERVICE_FEE;
    const statusLabel = table.status === "livre" ? "Livre" : table.status === "aberta" ? "Aberta - QR ativo" : "Conta fechada";
    const head = `
      <div class="table-head">
        <strong>Mesa ${table.n}</strong>
        <button class="qr-btn" onclick="openTableQr(${table.n})">▦ QR</button>
        <span class="table-status is-${table.status}">${statusLabel}</span>
      </div>
    `;
    if (table.status === "livre") {
      return `<article class="table-card is-livre">${head}
        <p>Mesa livre. Abrir a comanda libera o QR code para pedidos desta mesa.</p>
        <button class="primary wide" onclick="openTable(${table.n})">Abrir mesa</button>
      </article>`;
    }
    const lines = (table.items || []).map(item => `<div class="table-line"><span>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</span><span>R$ ${money(item.price * item.qty)}</span></div>`).join("");
    if (table.status === "aberta") {
      return `<article class="table-card is-aberta">${head}
        <div class="order-flags">
          <span class="flag">aberta ha ${waitLabel(elapsedMinutes(table.openedAt))}</span>
          <span class="flag">${(table.items || []).length} ${(table.items || []).length === 1 ? "item" : "itens"}</span>
        </div>
        <div class="table-lines">${lines || `<p class="faint">Nenhum pedido ainda. QR ativo.</p>`}</div>
        <div class="table-total"><span>Parcial</span><span>R$ ${money(consumo)}</span></div>
        <div class="field-row">
          <button class="secondary" onclick="openManualSale(${table.n})">+ Lancar pedido</button>
          <button class="primary" onclick="closeTableBill(${table.n})">Fechar conta</button>
        </div>
      </article>`;
    }
    return `<article class="table-card is-conta">${head}
      <div class="table-lines">
        <div class="table-line"><span>Consumo</span><span>R$ ${money(consumo)}</span></div>
        <div class="table-line"><span>Servico (10%)</span><span>R$ ${money(servico)}</span></div>
      </div>
      <div class="table-total"><span>Total</span><span>R$ ${money(consumo + servico)}</span></div>
      <p class="ok-text small">🖨 Nota impressa no balcao. QR desativado.</p>
      <button class="ghost-green wide" onclick="releaseTable(${table.n})">Pago - liberar mesa</button>
    </article>`;
  }).join("");
}
function tableMenuUrl(number) {
  return `${MENU_URL}?mesa=${number}`;
}
function openTableQr(number) {
  const url = tableMenuUrl(number);
  document.getElementById("qr-title").textContent = `Mesa ${number}`;
  document.getElementById("qr-image").src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(url)}`;
  document.getElementById("qr-url").textContent = url;
  document.getElementById("qr-print").href = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=20&data=${encodeURIComponent(url)}`;
  document.getElementById("qr-modal").classList.remove("hidden");
}
function closeTableQr(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("qr-modal").classList.add("hidden");
}

/* — lancamento manual — */
function openManualSale(tableNumber = null) {
  manualTable = tableNumber;
  manualCart = [];
  document.getElementById("manual-title").textContent = tableNumber ? `Lancar pedido - Mesa ${tableNumber}` : "Lancar pedido manual";
  document.getElementById("manual-customer").value = tableNumber ? `Mesa ${tableNumber}` : "";
  document.getElementById("manual-search").value = "";
  if (tableNumber) manualChannel = "loja";
  setManualError("");
  renderManualChips();
  renderManualProducts();
  renderManualCart();
  document.getElementById("manual-modal").classList.remove("hidden");
}
function closeManualSale(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("manual-modal").classList.add("hidden");
  manualTable = null;
  manualCart = [];
}
function setManualChannel(key) {
  manualChannel = key;
  renderManualChips();
}
function setManualPayment(label) {
  manualPayment = label;
  renderManualChips();
}
function setManualError(message) {
  const target = document.getElementById("manual-error");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("hidden", !message);
}
function renderManualChips() {
  const channels = document.getElementById("manual-channels");
  const payments = document.getElementById("manual-payments");
  if (!channels || !payments) return;
  channels.innerHTML = Object.entries(CHANNELS)
    .filter(([key]) => key !== "cardapio")
    .map(([key, label]) => `<button class="chip ${manualChannel === key ? "active" : ""}" type="button" onclick="setManualChannel('${key}')">${label}</button>`)
    .join("");
  payments.innerHTML = ["Pix", "Cartao", "Dinheiro", "Online"]
    .map(label => `<button class="chip ${manualPayment === label ? "active" : ""}" type="button" onclick="setManualPayment('${label}')">${label}</button>`)
    .join("");
  const hint = document.getElementById("manual-hint");
  if (hint) {
    hint.textContent = manualTable
      ? `O pedido entra na fila da cozinha e soma na comanda da mesa ${manualTable}.`
      : manualChannel === "loja"
        ? "Pedido de balcao entra na fila como novo, imprime e segue o fluxo normal."
        : `Venda de ${CHANNELS[manualChannel]} entra direto como entregue, so para consolidar o faturamento.`;
  }
}
function renderManualProducts() {
  const target = document.getElementById("manual-products");
  if (!target) return;
  const search = (document.getElementById("manual-search")?.value || "").toLowerCase();
  const promos = getPromos();
  const products = activeProducts().filter(product => `${product.name} ${product.category}`.toLowerCase().includes(search)).slice(0, 8);
  target.innerHTML = products.map(product => `
    <div class="manual-product">
      <span class="manual-name">${escapeHtml(product.name)}</span>
      <span class="manual-price">R$ ${money(effectivePrice(product, promos))}</span>
      <button class="round-add" type="button" onclick="addManualItem('${product.id}')" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>
    </div>
  `).join("") || `<p class="faint">Nenhum produto encontrado.</p>`;
}
function addManualItem(id) {
  const product = getProducts().find(item => item.id === id);
  if (!product) return;
  const row = manualCart.find(item => item.id === id);
  if (row) row.qty += 1;
  else manualCart.push({ id: product.id, name: product.name, price: effectivePrice(product), qty: 1 });
  setManualError("");
  renderManualCart();
}
function changeManualQty(id, delta) {
  const row = manualCart.find(item => item.id === id);
  if (!row) return;
  row.qty += delta;
  if (row.qty <= 0) manualCart = manualCart.filter(item => item.id !== id);
  renderManualCart();
}
function renderManualCart() {
  const target = document.getElementById("manual-cart");
  if (!target) return;
  if (!manualCart.length) {
    target.innerHTML = "";
    return;
  }
  const total = manualCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  target.innerHTML = `
    ${manualCart.map(item => `
      <div class="manual-cart-row">
        <span>${item.qty}x ${escapeHtml(item.name)}</span>
        <span class="manual-price">R$ ${money(item.price * item.qty)}</span>
        <button type="button" onclick="changeManualQty('${item.id}', -1)" aria-label="Menos um">−</button>
        <button type="button" onclick="changeManualQty('${item.id}', 1)" aria-label="Mais um">+</button>
      </div>
    `).join("")}
    <div class="manual-cart-total"><span>Total</span><span>R$ ${money(total)}</span></div>
  `;
}
function clearManualCart() {
  manualCart = [];
  renderManualCart();
}
function saveManualSale() {
  if (!manualCart.length) return setManualError("Adicione pelo menos um produto.");
  const table = manualTable;
  const customer = document.getElementById("manual-customer").value.trim() || (table ? `Mesa ${table}` : CHANNELS[manualChannel]);
  const fulfillment = table ? "mesa" : "retirada";
  const place = table ? `Mesa ${table} - salao` : manualChannel === "loja" ? "Retirada no balcao" : "Venda externa";
  const items = manualCart.map(item => ({ ...item }));
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const order = createOrder({ channel: manualChannel, fulfillment, customer, place, payment: manualPayment, note: "", phone: "", items, total });
  if (table) {
    const current = getTables().find(row => row.n === table);
    updateTable(table, { items: [...(current?.items || []), ...items] });
  } else if (manualChannel !== "loja") {
    completeOrder(order.id);
  }
  closeManualSale();
  toast(table ? `Pedido lancado na mesa ${table}.` : "Venda registrada na fila.");
}

/* — produtos — */
function renderPhotoPresets() {
  const target = document.getElementById("photo-presets");
  if (!target) return;
  target.innerHTML = PHOTO_PRESETS.map(preset => `<img src="${preset.src}" alt="${preset.label}" onclick="pickPresetPhoto('${preset.src}')">`).join("");
}
function pickPresetPhoto(src) {
  document.getElementById("product-image").value = src;
  updateProductPhotoPreview(src);
}
function saveProductForm(event) {
  event.preventDefault();
  const id = document.getElementById("product-id").value || uid("prod");
  const products = getProducts();
  const current = products.find(product => product.id === id);
  const category = document.getElementById("product-category").value;
  const product = {
    id,
    name: document.getElementById("product-name").value.trim(),
    category,
    price: Number(document.getElementById("product-price").value || 0),
    stock: Number(document.getElementById("product-stock").value || 0),
    minStock: Number(current?.minStock ?? 4),
    active: document.getElementById("product-active").checked,
    image: document.getElementById("product-image").value.trim(),
    badge: CATEGORIES[category] || "Item",
    description: document.getElementById("product-description").value.trim()
  };
  saveProducts(current ? products.map(item => item.id === id ? product : item) : [product, ...products]);
  resetProductForm();
  toast("Produto salvo.");
}
function handleProductPhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Escolha um arquivo de imagem.");
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const max = 900;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      document.getElementById("product-image").value = dataUrl;
      updateProductPhotoPreview(dataUrl);
      toast("Foto carregada no produto.");
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function editProduct(id) {
  const product = getProducts().find(item => item.id === id);
  if (!product) return;
  document.getElementById("product-id").value = product.id;
  document.getElementById("product-name").value = product.name;
  document.getElementById("product-category").value = product.category;
  document.getElementById("product-price").value = product.price;
  document.getElementById("product-stock").value = product.stock;
  document.getElementById("product-image").value = product.image || "";
  document.getElementById("product-description").value = product.description;
  document.getElementById("product-active").checked = product.active !== false;
  document.getElementById("product-form-title").textContent = "Editar produto";
  document.getElementById("product-save-label").textContent = "Salvar alteracoes";
  updateProductPhotoPreview(productImage(product));
  renderProductsAdmin();
  document.querySelector(".panel-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function resetProductForm() {
  ["product-id", "product-name", "product-price", "product-stock", "product-image", "product-description"].forEach(id => document.getElementById(id).value = "");
  const file = document.getElementById("product-photo-file");
  if (file) file.value = "";
  document.getElementById("product-category").value = "pizzas";
  document.getElementById("product-active").checked = true;
  document.getElementById("product-form-title").textContent = "Novo produto";
  document.getElementById("product-save-label").textContent = "Cadastrar produto";
  updateProductPhotoPreview("");
  renderProductsAdmin();
}
function toggleProduct(id) {
  saveProducts(getProducts().map(product => product.id === id ? { ...product, active: product.active === false } : product));
}
function zeroProduct(id) {
  saveProducts(getProducts().map(product => product.id === id ? { ...product, stock: 0 } : product));
  toast("Produto marcado como esgotado.");
}
function renderProductsAdmin() {
  const target = document.getElementById("product-admin-list");
  if (!target) return;
  const editing = document.getElementById("product-id")?.value || "";
  const promos = getPromos();
  target.innerHTML = getProducts().map(product => {
    const stock = Number(product.stock || 0);
    const low = stock <= Number(product.minStock || 0);
    const paused = product.active === false;
    const statusLabel = paused ? "Pausado" : stock === 0 ? "Esgotado" : "Ativo";
    const statusClass = paused ? "is-paused" : stock === 0 ? "is-out" : "is-active";
    const promo = promoFor(product.id, promos);
    return `
      <div class="data-row product-row ${paused ? "muted" : ""} ${editing === product.id ? "editing" : ""}">
        <span class="thumb" style="background-image:url('${escapeHtml(productImage(product) || CATEGORY_IMAGES[product.category] || "")}')"></span>
        <span class="cell-main"><strong>${escapeHtml(product.name)}</strong><em>${escapeHtml(product.description)}</em></span>
        <span>${escapeHtml(CATEGORIES[product.category] || product.category)}</span>
        <span class="price">${promo ? `<s>R$ ${money(product.price)}</s> R$ ${money(promo.price)}` : `R$ ${money(product.price)}`}</span>
        <span class="${low ? "danger-text" : ""}">${stock} un.</span>
        <span><span class="pill ${statusClass}">${statusLabel}</span></span>
        <span class="row-actions">
          <button class="secondary small" onclick="editProduct('${product.id}')">Editar</button>
          <button class="ghost small" onclick="toggleProduct('${product.id}')">${paused ? "Ativar" : "Pausar"}</button>
          <button class="danger small" onclick="zeroProduct('${product.id}')">Esgotar</button>
        </span>
      </div>
    `;
  }).join("");
}

/* — promocoes e cupons — */
function promoTips() {
  const delivered = getOrders().filter(order => order.status === "entregue");
  const sold = new Set();
  delivered.forEach(order => order.items.forEach(item => sold.add(item.name)));
  const products = getProducts().filter(product => product.active !== false);
  const tips = [];
  products.filter(product => !sold.has(product.name)).slice(0, 2).forEach(product => {
    tips.push({ product, text: `${product.name} esta sem vendas registradas. Vale um preco promocional.` });
  });
  products.filter(product => Number(product.stock || 0) >= 20).slice(0, 1).forEach(product => {
    tips.push({ product, text: `${product.name} tem ${product.stock} un. paradas em estoque. Sugerir combo ou promocao.` });
  });
  return tips.slice(0, 3);
}
function renderPromos() {
  const tips = document.getElementById("promo-tips");
  if (tips) {
    tips.innerHTML = promoTips().map(tip => `
      <div class="tip-row">
        <span class="tip-mark">✦</span>
        <span>${escapeHtml(tip.text)}</span>
        <button class="primary small" onclick="applyPromoTip('${tip.product.id}')">Criar promocao</button>
      </div>
    `).join("");
  }
  const select = document.getElementById("promo-product");
  if (select) {
    const value = select.value;
    select.innerHTML = getProducts().map(product => `<option value="${product.id}">${escapeHtml(product.name)} - R$ ${money(product.price)}</option>`).join("");
    if (value) select.value = value;
  }
  const list = document.getElementById("promo-list");
  if (!list) return;
  const products = getProducts();
  const promos = getPromos();
  list.innerHTML = promos.map(promo => {
    const product = products.find(item => item.id === promo.productId);
    return `
      <div class="promo-row">
        <div>
          <strong>${escapeHtml(product ? product.name : promo.productId)}</strong>
          <span><s>R$ ${money(product ? product.price : 0)}</s> → <b class="ok-text">R$ ${money(promo.price)}</b>${promo.until ? ` · ate ${escapeHtml(promo.until)}` : " · sem prazo"}</span>
        </div>
        <button class="danger small" onclick="removePromo('${promo.id}')">Encerrar</button>
      </div>
    `;
  }).join("") || `<p class="faint">Nenhuma promocao ativa.</p>`;
}
function applyPromoTip(productId) {
  const product = getProducts().find(item => item.id === productId);
  if (!product) return;
  document.getElementById("promo-product").value = productId;
  document.getElementById("promo-price").value = money(Number(product.price) * 0.85);
  document.getElementById("promo-until").value = "";
  setFormError("promo-error", "");
  document.getElementById("promo-price").focus();
}
function setFormError(id, message) {
  const target = document.getElementById(id);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("hidden", !message);
}
function savePromo() {
  const productId = document.getElementById("promo-product").value;
  const price = Number(String(document.getElementById("promo-price").value).replace(",", "."));
  const until = document.getElementById("promo-until").value.trim();
  const product = getProducts().find(item => item.id === productId);
  if (!price || price <= 0) return setFormError("promo-error", "Informe o preco promocional.");
  if (product && price >= Number(product.price)) return setFormError("promo-error", `O preco promocional precisa ser menor que R$ ${money(product.price)}.`);
  savePromos([{ id: uid("promo"), productId, price, until }, ...getPromos().filter(promo => promo.productId !== productId)]);
  document.getElementById("promo-price").value = "";
  document.getElementById("promo-until").value = "";
  setFormError("promo-error", "");
  toast("Promocao ativada.");
}
function removePromo(id) {
  savePromos(getPromos().filter(promo => promo.id !== id));
  toast("Promocao encerrada.");
}
function setCouponKind(kind) {
  couponKind = kind;
  document.getElementById("coupon-kind-pct").classList.toggle("active", kind === "pct");
  document.getElementById("coupon-kind-val").classList.toggle("active", kind === "val");
  document.getElementById("coupon-amount").placeholder = kind === "pct" ? "Desconto (%)" : "Desconto (R$)";
}
function toggleCouponOnce() {
  couponOnce = !couponOnce;
  const button = document.getElementById("coupon-once");
  button.classList.toggle("active", couponOnce);
  button.textContent = couponOnce ? "✓ Uso unico por cliente" : "Uso unico por cliente";
}
function renderCoupons() {
  const target = document.getElementById("coupon-list");
  if (!target) return;
  target.innerHTML = getCoupons().map(coupon => {
    const parts = [
      coupon.kind === "pct" ? `${coupon.amount}% off` : `R$ ${money(coupon.amount)} off`,
      coupon.min ? `min. R$ ${money(coupon.min)}` : "",
      coupon.once ? "uso unico" : "",
      coupon.until === "sem data" ? "sem prazo" : `ate ${coupon.until}`,
      `${coupon.uses} usos`
    ].filter(Boolean);
    return `
      <div class="coupon-row ${coupon.active ? "" : "muted"}">
        <code>${escapeHtml(coupon.code)}</code>
        <span>${escapeHtml(parts.join(" · "))}</span>
        <button class="ghost small" onclick="toggleCoupon('${coupon.code}')">${coupon.active ? "Desativar" : "Ativar"}</button>
      </div>
    `;
  }).join("") || `<p class="faint">Nenhum cupom cadastrado.</p>`;
}
function saveCoupon() {
  const code = document.getElementById("coupon-code").value.trim().toUpperCase();
  const amount = Number(String(document.getElementById("coupon-amount").value).replace(",", "."));
  const min = Number(String(document.getElementById("coupon-min").value).replace(",", ".")) || 0;
  const until = document.getElementById("coupon-until").value.trim() || "sem data";
  if (!code) return setFormError("coupon-error", "De um codigo ao cupom.");
  if (getCoupons().some(coupon => coupon.code === code)) return setFormError("coupon-error", "Ja existe um cupom com esse codigo.");
  if (!amount || amount <= 0) return setFormError("coupon-error", "Informe o valor do desconto.");
  saveCoupons([{ code, kind: couponKind, amount, min, once: couponOnce, until, uses: 0, active: true }, ...getCoupons()]);
  ["coupon-code", "coupon-amount", "coupon-min", "coupon-until"].forEach(id => document.getElementById(id).value = "");
  if (couponOnce) toggleCouponOnce();
  setCouponKind("pct");
  setFormError("coupon-error", "");
  toast("Cupom criado.");
}
function toggleCoupon(code) {
  saveCoupons(getCoupons().map(coupon => coupon.code === code ? { ...coupon, active: !coupon.active } : coupon));
}

/* — area de entrega (Mapbox) — */
const getDelivery = () => db().delivery || { endereco: "", lng: null, lat: null, zones: [] };
function saveDelivery(delivery) {
  const data = db();
  data.delivery = delivery;
  saveDb(data);
}
let mapboxPronto = null;
let buscaLojaTimer = null;

async function mapboxConfigurado() {
  if (mapboxPronto !== null) return mapboxPronto;
  try {
    mapboxPronto = Boolean((await (await fetch("/api/entrega/status")).json()).configurado);
  } catch {
    mapboxPronto = false;
  }
  return mapboxPronto;
}
function buscarLojaNoMapa(termo) {
  clearTimeout(buscaLojaTimer);
  const alvo = document.getElementById("loja-sugestoes");
  if (!alvo) return;
  if (termo.trim().length < 3) return (alvo.innerHTML = "");
  buscaLojaTimer = setTimeout(async () => {
    try {
      const { resultados = [], erro } = await (await fetch(`/api/entrega/buscar?q=${encodeURIComponent(termo)}`)).json();
      if (erro) return (alvo.innerHTML = `<p class="form-error">${escapeHtml(erro)}</p>`);
      alvo.innerHTML = resultados.map(r => `
        <button type="button" class="sugestao" onclick="definirLoja(${r.lng}, ${r.lat}, '${escapeHtml(`${r.nome} ${r.detalhe}`).replace(/'/g, "&#39;")}')">
          <strong>${escapeHtml(r.nome)}</strong><span>${escapeHtml(r.detalhe)}</span>
        </button>
      `).join("") || `<p class="faint">Nenhum endereco encontrado.</p>`;
    } catch {
      alvo.innerHTML = `<p class="form-error">Nao foi possivel buscar agora.</p>`;
    }
  }, 350);
}
function definirLoja(lng, lat, endereco) {
  saveDelivery({ ...getDelivery(), lng, lat, endereco });
  document.getElementById("loja-sugestoes").innerHTML = "";
  document.getElementById("loja-busca").value = "";
  toast("Ponto da loja definido.");
}
function adicionarFaixa() {
  const zones = getDelivery().zones || [];
  const ultima = zones[zones.length - 1];
  const km = ultima ? Number(ultima.km) + 2 : 2;
  saveDelivery({ ...getDelivery(), zones: [...zones, { km, fee: 0, min: 0 }] });
}
function removerFaixa(indice) {
  const zones = (getDelivery().zones || []).filter((unused, i) => i !== indice);
  saveDelivery({ ...getDelivery(), zones });
}
function editarFaixa(indice, campo, valor) {
  const zones = (getDelivery().zones || []).map((zone, i) =>
    i === indice ? { ...zone, [campo]: Number(String(valor).replace(",", ".")) || 0 } : zone);
  saveDelivery({ ...getDelivery(), zones });
}
async function renderEntrega() {
  const alvo = document.getElementById("entrega-painel");
  if (!alvo) return;
  const configurado = await mapboxConfigurado();
  if (!configurado) {
    alvo.innerHTML = `
      <div class="setup-card">
        <h2>Mapbox ainda nao configurado</h2>
        <p>A area de entrega precisa de um token da Mapbox para transformar endereco em coordenada.
           O token fica no servidor e nunca aparece no navegador.</p>
        <ol>
          <li>Crie a conta em <b>account.mapbox.com</b> e gere um token.</li>
          <li>Guarde em <code>data/mapbox.txt</code> ou na variavel <code>MAPBOX_TOKEN</code>.</li>
          <li>Reinicie o <code>node server.js</code> e recarregue esta aba.</li>
        </ol>
        <p class="faint">Enquanto isso, a entrega segue funcionando com endereco digitado livremente, sem taxa automatica.</p>
      </div>`;
    return;
  }
  const loja = getDelivery();
  const zones = [...(loja.zones || [])].sort((a, b) => a.km - b.km);
  alvo.innerHTML = `
    <div class="entrega-grid">
      <section class="panel">
        <h2>Ponto de partida</h2>
        <p class="faint">${loja.endereco ? escapeHtml(loja.endereco) : "Nenhum endereco definido ainda."}</p>
        <input id="loja-busca" placeholder="Buscar o endereco da loja..." oninput="buscarLojaNoMapa(this.value)" autocomplete="off">
        <div class="sugestoes" id="loja-sugestoes"></div>
        ${loja.lng != null ? `<img class="mapa-loja" src="/api/entrega/mapa?v=${Date.now()}" alt="Mapa da loja">` : ""}
      </section>
      <section class="panel">
        <div class="section-head"><h2>Faixas de raio</h2></div>
        <p class="faint">A distancia e medida em linha reta a partir da loja. O cliente paga a taxa da primeira faixa que alcanca.</p>
        <div class="faixas">
          <div class="faixa-head"><span>Ate (km)</span><span>Taxa (R$)</span><span>Pedido min. (R$)</span><span></span></div>
          ${zones.map((zone, i) => `
            <div class="faixa">
              <input type="number" step="0.5" min="0" value="${zone.km}" onchange="editarFaixa(${i}, 'km', this.value)">
              <input type="number" step="0.5" min="0" value="${zone.fee}" onchange="editarFaixa(${i}, 'fee', this.value)">
              <input type="number" step="1" min="0" value="${zone.min}" onchange="editarFaixa(${i}, 'min', this.value)">
              <button class="danger small" onclick="removerFaixa(${i})">Remover</button>
            </div>
          `).join("") || `<p class="faint">Nenhuma faixa criada. Sem faixa, a entrega nao cobra taxa e nao recusa endereco.</p>`}
        </div>
        <button class="secondary" onclick="adicionarFaixa()">+ Adicionar faixa</button>
        ${loja.lng == null && zones.length ? `<p class="form-error">Defina o ponto da loja para as faixas valerem.</p>` : ""}
      </section>
    </div>`;
}

/* — estoque — */
function adjustStock(id, delta) {
  saveProducts(getProducts().map(product => product.id === id ? { ...product, stock: Math.max(0, Number(product.stock || 0) + delta) } : product));
}
function renderStock() {
  const target = document.getElementById("stock-grid");
  if (!target) return;
  target.innerHTML = getProducts().map(product => {
    const low = Number(product.stock || 0) <= Number(product.minStock || 0);
    return `
      <article class="stock-card ${low ? "low" : ""}">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(CATEGORIES[product.category] || product.category)} · min. ${product.minStock || 0}</span>
        <div class="stock-line"><span class="stock-number">${product.stock}</span>${low ? `<em>abaixo do minimo</em>` : ""}</div>
        <div class="qty-actions">
          <button onclick="adjustStock('${product.id}', -1)">−1</button>
          <button onclick="adjustStock('${product.id}', 1)">+1</button>
          <button class="filled" onclick="adjustStock('${product.id}', 6)">+6</button>
        </div>
      </article>
    `;
  }).join("");
}

/* — dashboard — */
function setDashPeriod(period) {
  dashPeriod = period;
  document.querySelectorAll(".period-btn").forEach(button => button.classList.toggle("active", button.dataset.period === period));
  renderDashboard();
}
function renderChannelFilter() {
  const target = document.getElementById("filter-channel");
  if (!target) return;
  target.innerHTML = `<option value="todos">Canal: todos</option>${Object.entries(CHANNELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}`;
}
function filteredOrders() {
  const status = document.getElementById("filter-status")?.value || "todos";
  const channel = document.getElementById("filter-channel")?.value || "todos";
  const payment = document.getElementById("filter-payment")?.value || "todos";
  const dayMs = 86400000;
  return getOrders().filter(order => {
    const age = Date.now() - new Date(order.createdAt).getTime();
    const periodOk = dashPeriod === "tudo" || (dashPeriod === "hoje" ? age < dayMs : age < 7 * dayMs);
    const statusOk = status === "todos" || (status === "abertos" ? ["novo", "preparo", "pronto"].includes(order.status) : order.status === status);
    const channelOk = channel === "todos" || order.channel === channel;
    const paymentOk = payment === "todos" || String(order.payment || "").toLowerCase().startsWith(payment.toLowerCase());
    return periodOk && statusOk && channelOk && paymentOk;
  });
}
function renderDashboard() {
  const metrics = document.getElementById("dashboard-metrics");
  if (!metrics) return;
  const rows = filteredOrders();
  const delivered = rows.filter(order => order.status === "entregue");
  const total = delivered.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const avg = delivered.length ? total / delivered.length : 0;
  metrics.innerHTML = `
    <div class="metric"><strong>R$ ${money(total)}</strong><span>Faturamento entregue</span></div>
    <div class="metric"><strong>${delivered.length}</strong><span>Pedidos entregues</span></div>
    <div class="metric"><strong>R$ ${money(avg)}</strong><span>Ticket medio</span></div>
    <div class="metric"><strong>${getProducts().reduce((sum, product) => sum + Number(product.stock || 0), 0)}</strong><span>Itens em estoque</span></div>
  `;
  renderChannelChart(delivered);
  renderPaymentChart(delivered);
  renderBestItems(delivered);
  renderStockAlertChart();
  renderAllOrdersDashboard(rows);
}
function renderChannelChart(rows) {
  const target = document.getElementById("channel-chart");
  if (!target) return;
  const grouped = {};
  rows.forEach(order => grouped[order.channel] = (grouped[order.channel] || 0) + Number(order.total || 0));
  const entries = Object.entries(grouped).map(([key, value]) => [CHANNELS[key] || key, value]);
  target.innerHTML = chartRows(entries, value => `R$ ${money(value)}`) || `<p class="faint">Sem pedidos entregues.</p>`;
}
function renderPaymentChart(rows) {
  const target = document.getElementById("payment-chart");
  if (!target) return;
  const grouped = {};
  rows.forEach(order => {
    const label = String(order.payment || "Outros").split(" ")[0];
    grouped[label] = (grouped[label] || 0) + Number(order.total || 0);
  });
  target.innerHTML = chartRows(Object.entries(grouped), value => `R$ ${money(value)}`, "sage") || `<p class="faint">Sem pedidos entregues.</p>`;
}
function renderBestItems(rows) {
  const target = document.getElementById("best-items");
  if (!target) return;
  const grouped = {};
  rows.forEach(order => order.items.forEach(item => {
    if (!grouped[item.name]) grouped[item.name] = { qty: 0, revenue: 0 };
    grouped[item.name].qty += Number(item.qty || 1);
    grouped[item.name].revenue += Number(item.price || 0) * Number(item.qty || 1);
  }));
  target.innerHTML = Object.entries(grouped).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6)
    .map(([name, info], index) => `<div class="ranking"><strong>${index + 1}</strong><span>${escapeHtml(name)}</span><em>${info.qty} un. | R$ ${money(info.revenue)}</em></div>`)
    .join("") || `<p class="faint">Sem pedidos entregues.</p>`;
}
function renderStockAlertChart() {
  const target = document.getElementById("stock-alert-chart");
  if (!target) return;
  const rows = getProducts()
    .filter(product => Number(product.stock || 0) <= Number(product.minStock || 0))
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    .slice(0, 8);
  target.innerHTML = rows.map(product => `<div class="ranking alert"><strong>${product.stock}</strong><span>${escapeHtml(product.name)}</span><em>min. ${product.minStock || 0}</em></div>`).join("")
    || `<p class="ok-text">Nenhum item critico ✓</p>`;
}
function renderAllOrdersDashboard(rows = filteredOrders()) {
  const target = document.getElementById("all-orders-dashboard");
  if (!target) return;
  const count = document.getElementById("orders-count");
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "pedido" : "pedidos"}`;
  const sorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  target.innerHTML = sorted.map(order => `
    <div class="data-row order-row">
      <span class="order-num">#${orderQueueNumber(order)}</span>
      <span><strong>${escapeHtml(order.customer)}</strong></span>
      <span>${escapeHtml(CHANNELS[order.channel] || order.channel)}</span>
      <span>${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</span>
      <span>${escapeHtml(order.payment)}</span>
      <span><span class="pill status-${order.status}">${escapeHtml(STATUS[order.status] || order.status)}</span></span>
      <span>${new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
      <span class="right price">R$ ${money(order.total)}</span>
    </div>
  `).join("") || `<p class="faint pad">Nenhum pedido nesse filtro.</p>`;
}
function chartRows(entries, formatValue, tone = "") {
  const max = Math.max(...entries.map(([, value]) => Number(value || 0)), 1);
  return entries.map(([label, value]) => `<div class="chart-row ${tone}"><span>${escapeHtml(label)}</span><div><i style="width:${Math.max(4, Number(value || 0) / max * 100)}%"></i></div><strong>${formatValue(value)}</strong></div>`).join("");
}
function exportDashboardExcel() {
  const completed = getOrders().filter(order => order.status === "entregue");
  const products = getProducts();
  const sales = completed.map(order => ({
    Pedido: String(order.id).slice(-5),
    Cliente: order.customer,
    Canal: CHANNELS[order.channel] || order.channel,
    Tipo: FULFILLMENT[order.fulfillment] || order.fulfillment,
    Local: order.place,
    Pagamento: order.payment,
    Total: Number(order.total || 0),
    Criado: localTime(order.createdAt),
    Entregue: localTime(order.completedAt || order.createdAt),
    Itens: order.items.map(item => `${item.qty}x ${item.name}`).join(" | "),
    Observacao: order.note || ""
  }));
  const items = [];
  completed.forEach(order => order.items.forEach(item => items.push({
    Pedido: String(order.id).slice(-5),
    Produto: item.name,
    Quantidade: Number(item.qty || 1),
    ValorUnitario: Number(item.price || 0),
    TotalItem: Number(item.price || 0) * Number(item.qty || 1),
    Canal: CHANNELS[order.channel] || order.channel,
    Entregue: localTime(order.completedAt || order.createdAt)
  })));
  const stock = products.map(product => ({
    Produto: product.name,
    Categoria: CATEGORIES[product.category] || product.category,
    Estoque: Number(product.stock || 0),
    Minimo: Number(product.minStock || 0),
    Ativo: product.active !== false ? "Sim" : "Nao",
    Preco: Number(product.price || 0)
  }));
  if (window.XLSX) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sales), "Vendas");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(items), "Itens");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stock), "Estoque");
    XLSX.writeFile(workbook, `baixo-k-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Excel exportado.");
    return;
  }
  const html = `<html><head><meta charset="utf-8"></head><body><table>${Object.keys(sales[0] || { Pedido: "" }).map(key => `<th>${key}</th>`).join("")}${sales.map(row => `<tr>${Object.values(row).map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  downloadBlob(html, `baixo-k-dashboard-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
  toast("Exportado em .xls porque a biblioteca XLSX nao carregou.");
}

function buildReceipt(order, type) {
  const kitchen = type === "kitchen";
  const code = order.codeLabel || (order.id === "teste" ? "TESTE" : orderQueueLabel(order));
  const items = order.items.map(item => `
    <div class="item">
      <div><strong>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</strong>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</div>
      ${kitchen ? "" : `<span>R$ ${money(item.price * item.qty)}</span>`}
    </div>
  `).join("");
  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>Baixo K</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 68mm; max-width: 68mm; margin: 0 auto; padding: 2mm 0; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: ${kitchen ? "16px" : "12px"}; font-weight: 500; overflow-wrap: anywhere; }
    h1,h2,p { margin: 0; }
    .brand { text-align: center; padding-bottom: 4px; border-bottom: 1px solid #000; }
    .brand h1 { font-size: ${kitchen ? "22px" : "18px"}; letter-spacing: 0; }
    .brand p { margin-top: 1px; font-size: 9px; }
    .ticket-type { margin: 5px 0; padding: 4px 3px; border: 1px solid #000; text-align: center; font-size: ${kitchen ? "21px" : "15px"}; font-weight: 900; }
    .pickup { margin: 5px 0; padding: 5px 3px; color: #fff; background: #000; text-align: center; font-size: ${kitchen ? "22px" : "18px"}; font-weight: 900; }
    .meta, .totals, .obs { padding: 5px 0; border-top: 1px dashed #000; }
    .meta p { display: grid; grid-template-columns: 20mm minmax(0, 1fr); gap: 3mm; padding: 2px 0; align-items: start; }
    .line { display: grid; grid-template-columns: minmax(0,1fr) 20mm; gap: 3mm; padding: 2px 0; }
    .meta strong { text-align: right; overflow-wrap: anywhere; word-break: break-word; }
    .big-code { display: block; text-align: center; font-size: ${kitchen ? "28px" : "22px"}; font-weight: 900; }
    .customer { margin: 5px 0; padding: 5px 3px; border: 1px solid #000; text-align: center; font-size: ${kitchen ? "20px" : "15px"}; font-weight: 900; overflow-wrap: anywhere; }
    .item { display: grid; grid-template-columns: ${kitchen ? "1fr" : "minmax(0,1fr) 18mm"}; gap: 3mm; padding: ${kitchen ? "8px 0" : "4px 0"}; border-top: 1px solid #000; }
    .item strong { display: block; font-size: ${kitchen ? "19px" : "13px"}; line-height: 1.16; overflow-wrap: anywhere; }
    .item small { display: block; margin-top: 3px; font-size: 12px; font-weight: 800; }
    .item span { ${kitchen ? "display: none;" : ""} text-align: right; font-weight: 800; }
    .obs { border: 1px solid #000; margin-top: 6px; padding: 5px; }
    .obs strong { display: block; margin-bottom: 4px; font-size: ${kitchen ? "20px" : "13px"}; }
    .obs p { font-size: ${kitchen ? "19px" : "13px"}; font-weight: 900; }
    strong, p, div { overflow-wrap: anywhere; }
    .cut { margin-top: 10px; text-align: center; font-size: 12px; }
  </style></head>
  <body>
    <section class="brand"><h1>BAIXO K</h1><p>PIZZA | BURGUES | MASSAS | DRINKS</p></section>
    <div class="ticket-type">${kitchen ? "COZINHA" : "BALCAO"}</div>
    <strong class="big-code">${escapeHtml(code)}</strong>
    ${order.fulfillment === "retirada" ? `<div class="pickup">RETIRADA</div>` : ""}
    <div class="customer">${escapeHtml(order.customer || "CLIENTE")}</div>
    <div class="meta">
      <p><span>Canal</span><strong>${escapeHtml(CHANNELS[order.channel] || order.channel)}</strong></p>
      <p><span>Tipo</span><strong>${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</strong></p>
      <p><span>Horario</span><strong>${localTime(order.createdAt)}</strong></p>
      <p><span>Local</span><strong>${escapeHtml(order.place)}</strong></p>
      ${order.phone ? `<p><span>Telefone</span><strong>${escapeHtml(order.phone)}</strong></p>` : ""}
    </div>
    ${items}
    ${order.note ? `<div class="obs"><strong>OBSERVACAO</strong><p>${escapeHtml(order.note)}</p></div>` : ""}
    ${kitchen ? "" : `<div class="totals">${Number(order.discount || 0) > 0 ? `<div class="line"><span>Subtotal</span><strong>R$ ${money(order.subtotal || order.total)}</strong></div><div class="line"><span>Cupom ${escapeHtml(order.coupon || "")}</span><strong>- R$ ${money(order.discount)}</strong></div>` : ""}<div class="line"><span>Total</span><strong>R$ ${money(order.total)}</strong></div><div class="line"><span>Pagamento</span><strong>${escapeHtml(order.payment)}</strong></div></div>`}
    <p class="cut">------------------------------</p>
  </body></html>`;
}
function sendToPrinter(html) {
  const frame = document.getElementById("print-frame");
  if (!frame) return;
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
}
function printOrder(id, type) {
  const order = getOrders().find(item => item.id === id);
  if (!order) return;
  sendToPrinter(buildReceipt(order, type));
  saveOrders(getOrders().map(item => item.id === id ? { ...item, printed: true, printedAt: item.printedAt || new Date().toISOString() } : item));
}
function printTest(type) {
  sendToPrinter(buildReceipt({ id: "teste", createdAt: new Date().toISOString(), channel: "loja", fulfillment: "retirada", customer: "Cliente teste", place: "Balcao", payment: "Pix", note: "Teste Elgin i8", total: 39.8, items: [{ name: "Burguer Classico", price: 22.9, qty: 1 }, { name: "Drink Limao", price: 16.9, qty: 1 }] }, type));
}

function initScreen() {
  tryEnableScreenSound();
  ["click", "touchstart", "keydown"].forEach(eventName => {
    window.addEventListener(eventName, tryEnableScreenSound, { once: true, passive: true });
  });
  renderScreen();
  setInterval(renderScreen, SCREEN_REFRESH_MS);
  window.addEventListener("storage", renderScreen);
  window.addEventListener("baixoKDataChanged", renderScreen);
  initSync();
}
function tryEnableScreenSound() {
  if (!window.AudioContext && !window.webkitAudioContext) return;
  screenAudioContext = screenAudioContext || new (window.AudioContext || window.webkitAudioContext)();
  screenAudioContext.resume().catch(() => {});
  screenSoundEnabled = true;
}
function playScreenSound() {
  if (!screenSoundEnabled || !screenAudioContext) return;
  const now = screenAudioContext.currentTime;
  [0, .18, .36, .62].forEach((offset, index) => {
    const osc = screenAudioContext.createOscillator();
    const gain = screenAudioContext.createGain();
    osc.type = index === 3 ? "triangle" : "sine";
    osc.frequency.value = [659, 880, 1174, 880][index];
    gain.gain.setValueAtTime(0.001, now + offset);
    gain.gain.exponentialRampToValueAtTime(index === 3 ? 0.09 : 0.18, now + offset + .03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + (index === 3 ? .42 : .16));
    osc.connect(gain);
    gain.connect(screenAudioContext.destination);
    osc.start(now + offset);
    osc.stop(now + offset + (index === 3 ? .46 : .18));
  });
}
function renderScreen() {
  if (!document.querySelector('[data-page="screen"]')) return;
  const now = new Date();
  document.getElementById("screen-clock").textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const orders = getOrders();
  const data = db();
  const active = orders.filter(order => ["preparo", "pronto"].includes(order.status));
  const newest = active.find(order => order.id === data.lastHighlightedOrderId) || active[0];
  const snapshot = JSON.stringify(active.map(order => [order.id, order.status, order.customer]));
  if (snapshot !== screenSnapshot) {
    const hadSnapshot = Boolean(screenSnapshot);
    screenSnapshot = snapshot;
    document.body.classList.add("screen-pulse");
    setTimeout(() => document.body.classList.remove("screen-pulse"), 900);
    if (hadSnapshot && active.length) playScreenSound();
  }
  document.getElementById("screen-highlight").innerHTML = newest ? `
    <span class="eyebrow">Pedido em destaque</span>
    <strong>${orderQueueLabel(newest, orders)} - ${escapeHtml(newest.customer)}</strong>
    <p>${escapeHtml(FULFILLMENT[newest.fulfillment] || newest.fulfillment)} | ${escapeHtml(STATUS[newest.status])}</p>
    <ul>${newest.items.map(item => `<li>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</li>`).join("")}</ul>
  ` : `<span class="eyebrow">Baixo K</span><strong>Sem pedidos abertos</strong><p>Aguardando novos pedidos.</p>`;
  document.getElementById("screen-preparing").innerHTML = screenCards(active.filter(order => order.status === "preparo"));
  document.getElementById("screen-ready").innerHTML = screenCards(active.filter(order => order.status === "pronto"));
}
function screenCards(rows) {
  const orders = getOrders();
  return rows.length ? rows.map(order => `<article class="screen-card ${order.status === "pronto" ? "ready" : ""}"><span class="screen-order-code">${orderQueueLabel(order, orders)}</span><strong>${escapeHtml(order.customer)}</strong><span>${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</span><p>${order.items.map(item => `${item.qty}x ${escapeHtml(item.name)}`).join(" | ")}</p></article>`).join("") : "<p class=\"screen-empty\">Nenhum pedido.</p>";
}

initMenu();
