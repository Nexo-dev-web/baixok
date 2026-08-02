const DB_KEY = "baixoKSystem.v1";
const CART_KEY = "baixoKCart.v1";
const ACTIVE_LOGO = "images/baixok-logo-simples.jpg";
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
  { id: "pizza-calabresa", name: "Pizza Calabresa", category: "pizzas", price: 39.9, stock: 18, minStock: 4, active: true, image: CATEGORY_IMAGES.pizzas, badge: "Pizza", description: "Mussarela, calabresa, cebola e oregano." },
  { id: "pizza-frango", name: "Pizza Frango Catupiry", category: "pizzas", price: 44.9, stock: 14, minStock: 4, active: true, image: CATEGORY_IMAGES.pizzas, badge: "Pizza", description: "Frango temperado, catupiry e mussarela." },
  { id: "pizza-baixo-k", name: "Pizza Baixo K", category: "pizzas", price: 49.9, stock: 10, minStock: 3, active: true, image: CATEGORY_IMAGES.pizzas, badge: "Mais pedida", description: "Massa da casa, mix de queijos, bacon e finalizacao especial." },
  { id: "burguer-classico", name: "Burguer Classico", category: "burgues", price: 22.9, stock: 30, minStock: 6, active: true, image: CATEGORY_IMAGES.burgues, badge: "Burguer", description: "Pao brioche, carne, queijo, salada e molho da casa." },
  { id: "burguer-bacon", name: "Burguer Bacon", category: "burgues", price: 27.9, stock: 24, minStock: 6, active: true, image: CATEGORY_IMAGES.burgues, badge: "Bacon", description: "Carne, cheddar, bacon crocante e cebola caramelizada." },
  { id: "burguer-duplo", name: "Burguer Duplo K", category: "burgues", price: 34.9, stock: 16, minStock: 4, active: true, image: CATEGORY_IMAGES.burgues, badge: "Duplo", description: "Duas carnes, queijo duplo, bacon e molho especial." },
  { id: "massa-bolonhesa", name: "Massa Bolonhesa", category: "massas", price: 31.9, stock: 12, minStock: 3, active: true, image: CATEGORY_IMAGES.massas, badge: "Massa", description: "Massa ao molho bolonhesa com parmesao." },
  { id: "massa-alfredo", name: "Massa Alfredo", category: "massas", price: 33.9, stock: 12, minStock: 3, active: true, image: CATEGORY_IMAGES.massas, badge: "Cremosa", description: "Molho branco cremoso, frango e toque de ervas." },
  { id: "batata-k", name: "Batata Baixo K", category: "porcoes", price: 24.9, stock: 20, minStock: 5, active: true, image: CATEGORY_IMAGES.burgues, badge: "Porcao", description: "Batata frita com cheddar, bacon e molho da casa." },
  { id: "refri-lata", name: "Refrigerante Lata", category: "drinks", price: 7.9, stock: 48, minStock: 12, active: true, image: CATEGORY_IMAGES.drinks, badge: "Gelado", description: "Lata 350ml gelada." },
  { id: "refri-2l", name: "Refrigerante 2L", category: "drinks", price: 14.9, stock: 18, minStock: 6, active: true, image: CATEGORY_IMAGES.drinks, badge: "2 litros", description: "Garrafa 2L gelada." },
  { id: "drink-limao", name: "Drink Limao", category: "drinks", price: 16.9, stock: 22, minStock: 5, active: true, image: CATEGORY_IMAGES.drinks, badge: "Drink", description: "Drink refrescante de limao para acompanhar o pedido." },
  { id: "drink-maracuja", name: "Drink Maracuja", category: "drinks", price: 18.9, stock: 18, minStock: 5, active: true, image: CATEGORY_IMAGES.drinks, badge: "Assinatura", description: "Maracuja, gelo e finalizacao da casa." }
];

let currentCategory = "todos";
let fulfillmentMode = "retirada";
let manualCart = [];
let screenSnapshot = "";

const money = value => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[char]));
const db = () => {
  const stored = JSON.parse(localStorage.getItem(DB_KEY) || "null");
  if (stored?.products?.length) {
    stored.orders = (stored.orders || []).map(order => order.status === "concluido" ? { ...order, status: "entregue", stockDeducted: true } : order);
    return stored;
  }
  const initial = { products: DEFAULT_PRODUCTS, orders: [], lastHighlightedOrderId: null };
  localStorage.setItem(DB_KEY, JSON.stringify(initial));
  return initial;
};
const saveDb = data => {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("baixoKDataChanged"));
};
const getProducts = () => db().products;
const getOrders = () => db().orders;
const saveProducts = products => {
  const data = db();
  data.products = products;
  saveDb(data);
};
const productImage = product => {
  if (!product?.image || product.image === ACTIVE_LOGO) return CATEGORY_IMAGES[product.category] || ACTIVE_LOGO;
  return product.image;
};
const updateProductPhotoPreview = value => {
  const preview = document.getElementById("product-photo-preview");
  const category = document.getElementById("product-category")?.value || "pizzas";
  if (preview) preview.src = value || CATEGORY_IMAGES[category] || ACTIVE_LOGO;
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

function toast(message) {
  const target = document.getElementById("toast");
  if (!target) return;
  target.textContent = message;
  target.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => target.classList.remove("show"), 2600);
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
  renderFilters();
  renderSignatureProducts();
  renderMenu();
  renderCart();
  setFulfillment("retirada");
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
      <img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}">
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
  target.innerHTML = list.length ? list.map(product => `
    <article class="product">
      <span class="badge">${escapeHtml(product.badge || CATEGORIES[product.category] || "Item")}</span>
      <img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}">
      <div class="product-body">
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.description)}</p>
        <div class="stock-chip">${Number(product.stock || 0)} disponiveis</div>
        <div class="price-row">
          <span>R$ ${money(product.price)}</span>
          <button class="primary" onclick="addToCart('${product.id}')">Adicionar</button>
        </div>
      </div>
    </article>
  `).join("") : "<p>Nenhum item disponivel nesse filtro.</p>";
}
function setFulfillment(mode) {
  fulfillmentMode = mode;
  document.getElementById("mode-retirada")?.classList.toggle("active", mode === "retirada");
  document.getElementById("mode-entrega")?.classList.toggle("active", mode === "entrega");
  const banner = document.getElementById("pickup-banner");
  const label = document.getElementById("place-label");
  const place = document.getElementById("customer-place");
  if (banner) banner.textContent = mode === "retirada" ? "RETIRADA NO BALCAO" : "ENTREGA";
  if (label) label.firstChild.textContent = mode === "retirada" ? "Retirada" : "Endereco de entrega";
  if (place) place.placeholder = mode === "retirada" ? "Ex: Retirada no balcao" : "Endereco completo";
}
function addToCart(id) {
  const product = getProducts().find(item => item.id === id);
  if (!product || Number(product.stock || 0) <= 0) return toast("Item sem estoque.");
  const rows = cart();
  const existing = rows.find(item => item.id === id);
  const nextQty = (existing?.qty || 0) + 1;
  if (nextQty > Number(product.stock || 0)) return toast("Quantidade maior que o estoque.");
  if (existing) existing.qty = nextQty;
  else rows.push({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
  saveCart(rows);
  renderCart();
  toast("Item adicionado ao pedido.");
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
function cartTotal() {
  return cart().reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
}
function renderCart() {
  const target = document.getElementById("cart-items");
  if (!target) return;
  const rows = cart();
  target.innerHTML = rows.length ? rows.map(item => `
    <div class="cart-row">
      <div class="price-row">
        <strong>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</strong>
        <span>R$ ${money(item.price * item.qty)}</span>
      </div>
      <div class="qty-actions">
        <button onclick="changeQty('${item.id}', -1)">-</button>
        <button onclick="changeQty('${item.id}', 1)">+</button>
      </div>
    </div>
  `).join("") : "<p>Nenhum item no pedido.</p>";
  document.getElementById("cart-total").textContent = money(cartTotal());
  document.getElementById("mobile-total").textContent = money(cartTotal());
  document.getElementById("cart-count").textContent = rows.reduce((sum, item) => sum + item.qty, 0);
}
function clearCart() {
  saveCart([]);
  renderCart();
}
function createOrder(order) {
  const data = db();
  data.orders.unshift({ ...order, id: uid("ped"), createdAt: new Date().toISOString(), status: "novo", printed: false });
  data.lastHighlightedOrderId = data.orders[0].id;
  saveDb(data);
  return data.orders[0];
}
function sendOrder() {
  const rows = cart();
  if (!rows.length) return alert("Adicione pelo menos um item.");
  const customer = document.getElementById("customer-name").value.trim();
  const phone = document.getElementById("customer-phone").value.trim();
  const placeValue = document.getElementById("customer-place").value.trim();
  const payment = document.getElementById("payment-method").value;
  const note = document.getElementById("order-note").value.trim();
  const place = fulfillmentMode === "retirada" ? (placeValue || "Retirada no balcao") : placeValue;
  if (!customer || !place || !payment) return alert("Preencha cliente, local e pagamento.");
  createOrder({ customer, phone, place, payment, note, channel: "cardapio", fulfillment: fulfillmentMode, items: rows, total: cartTotal() });
  clearCart();
  ["customer-name", "customer-phone", "customer-place", "order-note"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("payment-method").value = "";
  toast("Pedido enviado para a cozinha.");
}

function initAdmin() {
  showAdminTab("orders");
  renderAdmin();
  renderManualProducts();
  renderManualCart();
  setInterval(renderAdmin, 6000);
  window.addEventListener("storage", renderAdmin);
  window.addEventListener("baixoKDataChanged", renderAdmin);
}
function showAdminTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(section => section.classList.add("hidden"));
  document.getElementById(`tab-${tab}`)?.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  renderAdmin();
}
function renderAdmin() {
  renderOrdersKanban();
  renderProductsAdmin();
  renderStock();
  renderDashboard();
  renderTodayMini();
  renderManualProducts();
}
function statusActions(order) {
  if (order.status === "novo") return `<button class="primary" onclick="moveOrder('${order.id}', 'preparo')">Iniciar preparo</button>`;
  if (order.status === "preparo") return `<button class="primary" onclick="moveOrder('${order.id}', 'pronto')">Pronto para retirada</button>`;
  if (order.status === "pronto") return `<button class="primary" onclick="completeOrder('${order.id}')">Entregue</button>`;
  return "";
}
function orderCard(order) {
  const pickup = order.fulfillment === "retirada";
  return `
    <article class="order-card status-${order.status}" draggable="true" ondragstart="dragOrder(event, '${order.id}')">
      <div class="order-top">
        <strong>#${String(order.id).slice(-5)} - ${escapeHtml(order.customer)}</strong>
        <strong>R$ ${money(order.total)}</strong>
      </div>
      <div class="order-flags">
        <span class="flag ${pickup ? "pickup" : ""}">${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</span>
        <span class="flag">${escapeHtml(CHANNELS[order.channel] || order.channel)}</span>
        <span class="flag">${escapeHtml(STATUS[order.status])}</span>
      </div>
      <p>${escapeHtml(order.place)}${order.phone ? ` | ${escapeHtml(order.phone)}` : ""}</p>
      <ul class="order-items">${order.items.map(item => `<li>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</li>`).join("")}</ul>
      ${order.note ? `<p><strong>Obs:</strong> ${escapeHtml(order.note)}</p>` : ""}
      <div class="order-actions">
        <button class="secondary" onclick="printOrder('${order.id}', 'kitchen')">Imprimir cozinha</button>
        <button class="secondary" onclick="printOrder('${order.id}', 'counter')">Imprimir balcao</button>
        ${statusActions(order)}
        <button class="danger" onclick="cancelOrder('${order.id}')">Cancelar</button>
      </div>
    </article>
  `;
}
function renderOrdersKanban() {
  const target = document.getElementById("orders-kanban");
  if (!target) return;
  const orders = getOrders().filter(order => order.status !== "cancelado");
  const groups = ["novo", "preparo", "pronto", "entregue"];
  target.innerHTML = groups.map(status => {
    const rows = orders.filter(order => order.status === status);
    return `<div class="kanban-column status-zone-${status}" ondragover="allowOrderDrop(event)" ondrop="dropOrder(event, '${status}')"><h2>${STATUS[status]} <span>${rows.length}</span></h2>${rows.length ? rows.map(orderCard).join("") : "<p>Nenhum pedido aqui.</p>"}</div>`;
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
function cancelOrder(id) {
  if (!confirm("Cancelar este pedido?")) return;
  saveOrders(getOrders().map(order => order.id === id ? { ...order, status: "cancelado", updatedAt: new Date().toISOString() } : order));
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
function renderTodayMini() {
  const target = document.getElementById("today-mini");
  if (!target) return;
  const today = new Date().toISOString().slice(0, 10);
  const completed = getOrders().filter(order => order.status === "entregue" && String(order.completedAt || "").slice(0, 10) === today);
  const active = getOrders().filter(order => ["novo", "preparo", "pronto"].includes(order.status));
  target.innerHTML = `
    <div class="metric"><strong>${active.length}</strong><span>Pedidos abertos</span></div>
    <div class="metric"><strong>R$ ${money(completed.reduce((sum, order) => sum + order.total, 0))}</strong><span>Faturamento hoje</span></div>
    <div class="metric"><strong>${getProducts().filter(product => Number(product.stock || 0) <= Number(product.minStock || 0)).length}</strong><span>Itens em alerta</span></div>
  `;
}

function renderManualProducts() {
  const target = document.getElementById("manual-products");
  if (!target) return;
  const search = (document.getElementById("manual-search")?.value || "").toLowerCase();
  const products = activeProducts().filter(product => `${product.name} ${product.category}`.toLowerCase().includes(search));
  target.innerHTML = products.map(product => `
    <button class="manual-product" onclick="addManualItem('${product.id}')">
      <img src="${escapeHtml(productImage(product))}" alt="">
      <span>
        <strong>${escapeHtml(product.name)}</strong>
        <em>R$ ${money(product.price)} | ${product.stock} em estoque</em>
      </span>
    </button>
  `).join("");
}
function addManualItem(id) {
  const product = getProducts().find(item => item.id === id);
  if (!product) return;
  const row = manualCart.find(item => item.id === id);
  if (row) row.qty += 1;
  else manualCart.push({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
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
  target.innerHTML = manualCart.length ? manualCart.map(item => `
    <div class="cart-row">
      <div class="price-row"><strong>${item.qty}x ${escapeHtml(item.name)}</strong><span>R$ ${money(item.qty * item.price)}</span></div>
      <div class="qty-actions"><button onclick="changeManualQty('${item.id}', -1)">-</button><button onclick="changeManualQty('${item.id}', 1)">+</button></div>
    </div>
  `).join("") : "<p>Nenhum produto selecionado.</p>";
  document.getElementById("manual-total").textContent = money(manualCart.reduce((sum, item) => sum + item.price * item.qty, 0));
}
function clearManualCart() {
  manualCart = [];
  renderManualCart();
}
function saveManualSale() {
  if (!manualCart.length) return alert("Adicione produtos na venda.");
  const channel = document.getElementById("manual-channel").value;
  const fulfillment = document.getElementById("manual-fulfillment").value;
  const customer = document.getElementById("manual-customer").value.trim() || CHANNELS[channel];
  const place = document.getElementById("manual-place").value.trim() || (fulfillment === "retirada" ? "Retirada no balcao" : "Venda externa");
  const payment = document.getElementById("manual-payment").value;
  const note = document.getElementById("manual-note").value.trim();
  const order = createOrder({ channel, fulfillment, customer, place, payment, note, phone: "", items: manualCart, total: manualCart.reduce((sum, item) => sum + item.price * item.qty, 0) });
  if (channel !== "loja") moveOrder(order.id, "pronto");
  clearManualCart();
  ["manual-customer", "manual-place", "manual-note"].forEach(id => document.getElementById(id).value = "");
  toast("Venda registrada na fila.");
}

function saveProductForm(event) {
  event.preventDefault();
  const id = document.getElementById("product-id").value || uid("prod");
  const products = getProducts();
  const current = products.find(product => product.id === id);
  const product = {
    id,
    name: document.getElementById("product-name").value.trim(),
    category: document.getElementById("product-category").value,
    price: Number(document.getElementById("product-price").value || 0),
    stock: Number(document.getElementById("product-stock").value || 0),
    minStock: Number(current?.minStock ?? 4),
    active: document.getElementById("product-active").checked,
    image: document.getElementById("product-image").value.trim() || CATEGORY_IMAGES[document.getElementById("product-category").value] || ACTIVE_LOGO,
    badge: CATEGORIES[document.getElementById("product-category").value] || "Item",
    description: document.getElementById("product-description").value.trim()
  };
  saveProducts(current ? products.map(item => item.id === id ? product : item) : [product, ...products]);
  resetProductForm();
  renderAdmin();
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
      const max = 1100;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
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
  document.getElementById("product-image").value = product.image || ACTIVE_LOGO;
  document.getElementById("product-description").value = product.description;
  document.getElementById("product-active").checked = product.active !== false;
  updateProductPhotoPreview(productImage(product));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetProductForm() {
  ["product-id", "product-name", "product-price", "product-stock", "product-image", "product-description"].forEach(id => document.getElementById(id).value = "");
  const file = document.getElementById("product-photo-file");
  if (file) file.value = "";
  document.getElementById("product-category").value = "pizzas";
  document.getElementById("product-active").checked = true;
  updateProductPhotoPreview(CATEGORY_IMAGES.pizzas);
}
function toggleProduct(id) {
  saveProducts(getProducts().map(product => product.id === id ? { ...product, active: product.active === false } : product));
}
function renderProductsAdmin() {
  const target = document.getElementById("product-admin-list");
  if (!target) return;
  target.innerHTML = getProducts().map(product => `
    <article class="product-admin ${product.active === false ? "paused" : ""}">
      <img src="${escapeHtml(productImage(product))}" alt="">
      <div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(CATEGORIES[product.category])} | R$ ${money(product.price)} | Estoque ${product.stock}</span><p>${escapeHtml(product.description)}</p></div>
      <div class="order-actions"><button class="secondary" onclick="editProduct('${product.id}')">Editar</button><button class="secondary" onclick="toggleProduct('${product.id}')">${product.active === false ? "Ativar" : "Pausar"}</button></div>
    </article>
  `).join("");
}
function adjustStock(id, delta) {
  saveProducts(getProducts().map(product => product.id === id ? { ...product, stock: Math.max(0, Number(product.stock || 0) + delta) } : product));
}
function renderStock() {
  const target = document.getElementById("stock-grid");
  if (!target) return;
  target.innerHTML = getProducts().map(product => {
    const low = Number(product.stock || 0) <= Number(product.minStock || 0);
    return `<article class="stock-card ${low ? "low" : ""}"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(CATEGORIES[product.category])}</span><div class="stock-number">${product.stock}</div><div class="qty-actions"><button onclick="adjustStock('${product.id}', -1)">-</button><button onclick="adjustStock('${product.id}', 1)">+</button><button onclick="adjustStock('${product.id}', 6)">+6</button></div></article>`;
  }).join("");
}

function renderDashboard() {
  const metrics = document.getElementById("dashboard-metrics");
  if (!metrics) return;
  const completed = getOrders().filter(order => order.status === "entregue");
  const total = completed.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const avg = completed.length ? total / completed.length : 0;
  metrics.innerHTML = `
    <div class="metric"><strong>R$ ${money(total)}</strong><span>Faturamento entregue</span></div>
    <div class="metric"><strong>${completed.length}</strong><span>Pedidos entregues</span></div>
    <div class="metric"><strong>R$ ${money(avg)}</strong><span>Ticket medio</span></div>
    <div class="metric"><strong>${getProducts().reduce((sum, product) => sum + Number(product.stock || 0), 0)}</strong><span>Itens em estoque</span></div>
  `;
  renderChannelChart(completed);
  renderBestItems(completed);
  renderCompletedSales(completed);
}
function renderChannelChart(rows) {
  const target = document.getElementById("channel-chart");
  if (!target) return;
  const grouped = {};
  rows.forEach(order => grouped[order.channel] = (grouped[order.channel] || 0) + Number(order.total || 0));
  const max = Math.max(...Object.values(grouped), 1);
  target.innerHTML = Object.entries(CHANNELS).map(([key, label]) => {
    const value = grouped[key] || 0;
    return `<div class="chart-row"><span>${label}</span><div><i style="width:${Math.max(4, value / max * 100)}%"></i></div><strong>R$ ${money(value)}</strong></div>`;
  }).join("");
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
  target.innerHTML = Object.entries(grouped).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8).map(([name, info], index) => `<div class="ranking"><strong>${index + 1}</strong><span>${escapeHtml(name)}</span><em>${info.qty} un. | R$ ${money(info.revenue)}</em></div>`).join("") || "<p>Sem pedidos entregues.</p>";
}
function renderCompletedSales(rows) {
  const target = document.getElementById("completed-sales");
  if (!target) return;
  target.innerHTML = rows.slice(0, 10).map(order => `<div class="sale-line"><strong>${escapeHtml(order.customer)}</strong><span>${escapeHtml(CHANNELS[order.channel] || order.channel)} | ${localTime(order.completedAt || order.createdAt)}</span><em>R$ ${money(order.total)}</em></div>`).join("") || "<p>Sem pedidos entregues.</p>";
}

function buildReceipt(order, type) {
  const kitchen = type === "kitchen";
  const items = order.items.map(item => `
    <div class="item">
      <div><strong>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</strong></div>
      ${kitchen ? "" : `<span>R$ ${money(item.price * item.qty)}</span>`}
    </div>
  `).join("");
  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>Baixo K</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { width: 74mm; margin: 0; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: ${kitchen ? "18px" : "13px"}; font-weight: 500; }
    h1,h2,p { margin: 0; }
    .brand { text-align: center; padding-bottom: 6px; border-bottom: 2px solid #000; }
    .brand h1 { font-size: ${kitchen ? "28px" : "20px"}; letter-spacing: 0; }
    .brand p { margin-top: 2px; font-size: 11px; }
    .ticket-type { margin: 7px 0; padding: 6px 4px; border: 2px solid #000; text-align: center; font-size: ${kitchen ? "24px" : "16px"}; font-weight: 900; }
    .pickup { margin: 7px 0; padding: 7px 4px; color: #fff; background: #000; text-align: center; font-size: 24px; font-weight: 900; }
    .meta, .totals, .obs { padding: 7px 0; border-top: 1px dashed #000; }
    .meta p, .line { display: flex; justify-content: space-between; gap: 7px; padding: 2px 0; }
    .big-code { display: block; text-align: center; font-size: ${kitchen ? "34px" : "24px"}; font-weight: 900; }
    .item { display: grid; grid-template-columns: minmax(0,1fr) ${kitchen ? "0" : "62px"}; gap: 6px; padding: ${kitchen ? "8px 0" : "5px 0"}; border-top: 1px solid #ddd; }
    .item strong { font-size: ${kitchen ? "21px" : "14px"}; }
    .item span { text-align: right; font-weight: 800; }
    .obs strong { display: block; margin-bottom: 4px; font-size: ${kitchen ? "18px" : "13px"}; }
    strong, p, div { overflow-wrap: anywhere; }
    .cut { margin-top: 10px; text-align: center; font-size: 12px; }
  </style></head>
  <body>
    <section class="brand"><h1>BAIXO K</h1><p>PIZZA | BURGUES | MASSAS | DRINKS</p></section>
    <div class="ticket-type">${kitchen ? "COZINHA" : "BALCAO"}</div>
    <strong class="big-code">#${String(order.id).slice(-5)}</strong>
    ${order.fulfillment === "retirada" ? `<div class="pickup">RETIRADA</div>` : ""}
    <div class="meta">
      <p><span>Canal</span><strong>${escapeHtml(CHANNELS[order.channel] || order.channel)}</strong></p>
      <p><span>Horario</span><strong>${localTime(order.createdAt)}</strong></p>
      ${kitchen ? "" : `<p><span>Cliente</span><strong>${escapeHtml(order.customer)}</strong></p><p><span>Local</span><strong>${escapeHtml(order.place)}</strong></p>`}
    </div>
    ${items}
    ${order.note ? `<div class="obs"><strong>OBSERVACAO</strong><p>${escapeHtml(order.note)}</p></div>` : ""}
    ${kitchen ? "" : `<div class="totals"><div class="line"><span>Total</span><strong>R$ ${money(order.total)}</strong></div><div class="line"><span>Pagamento</span><strong>${escapeHtml(order.payment)}</strong></div></div>`}
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
  renderScreen();
  setInterval(renderScreen, SCREEN_REFRESH_MS);
  window.addEventListener("storage", renderScreen);
  window.addEventListener("baixoKDataChanged", renderScreen);
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
    screenSnapshot = snapshot;
    document.body.classList.add("screen-pulse");
    setTimeout(() => document.body.classList.remove("screen-pulse"), 900);
  }
  document.getElementById("screen-highlight").innerHTML = newest ? `
    <span class="eyebrow">Pedido em destaque</span>
    <strong>#${String(newest.id).slice(-5)} - ${escapeHtml(newest.customer)}</strong>
    <p>${escapeHtml(FULFILLMENT[newest.fulfillment] || newest.fulfillment)} | ${escapeHtml(STATUS[newest.status])}</p>
    <ul>${newest.items.map(item => `<li>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</li>`).join("")}</ul>
  ` : `<span class="eyebrow">Baixo K</span><strong>Sem pedidos abertos</strong><p>Aguardando novos pedidos.</p>`;
  document.getElementById("screen-preparing").innerHTML = screenCards(active.filter(order => order.status === "preparo"));
  document.getElementById("screen-ready").innerHTML = screenCards(active.filter(order => order.status === "pronto"));
}
function screenCards(rows) {
  return rows.length ? rows.map(order => `<article class="screen-card ${order.status === "pronto" ? "ready" : ""}"><strong>${escapeHtml(order.customer)}</strong><span>#${String(order.id).slice(-5)} | ${escapeHtml(FULFILLMENT[order.fulfillment] || order.fulfillment)}</span><p>${order.items.map(item => `${item.qty}x ${escapeHtml(item.name)}`).join(" | ")}</p></article>`).join("") : "<p class=\"screen-empty\">Nenhum pedido.</p>";
}

initMenu();
