/* Lancamento manual: balcao, iFood, WhatsApp ou pedido na mesa.
 *
 * O carrinho e montado com id e quantidade. O preco mostrado aqui e o do
 * cardapio carregado; quem precifica de verdade e o servidor, igual ao pedido
 * do cliente. Nao ha campo de preco livre de proposito: teria virado o caminho
 * mais facil para lancar venda com valor errado sem deixar rastro. */
import { el, render, $, delegar, mostrar, ligarModal } from "../../utils/dom.js";
import { reais } from "../../utils/formato.js";
import { CANAIS_ROTULO } from "../../utils/categorias.js";
import { apiPedidos } from "../../services/api.js";
import { estado, carregar, precoEfetivo } from "./store.js";
import { toast, toastFalha } from "../../components/toast.js";

const PAGAMENTOS = ["Dinheiro", "Pix", "Cartao", "Online"];

const rascunho = { itens: [], canal: "loja", pagamento: "Dinheiro", mesa: null };
let aoConcluir = null;

const subtotal = () => rascunho.itens.reduce((soma, item) => soma + item.price * item.qty, 0);

function normalizarTroco(valor) {
  const numero = Number(String(valor ?? "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function definirErro(mensagem) {
  const alvo = $("#manual-error");
  alvo.textContent = mensagem || "";
  mostrar(alvo, Boolean(mensagem));
}

function desenharChips() {
  /* Na mesa o canal e sempre "loja": nao faz sentido lancar um pedido de mesa
   * como iFood. */
  const canais = $("#manual-channels");
  mostrar(canais, rascunho.mesa === null);
  if (rascunho.mesa === null) {
    render(canais, ...Object.entries(CANAIS_ROTULO)
      .filter(([chave]) => chave !== "cardapio")
      .map(([chave, rotulo]) =>
        el("button.chip", {
          type: "button",
          class: rascunho.canal === chave ? "active" : "",
          dataset: { acao: "canal", canal: chave }
        }, rotulo)
      ));
  }

  render($("#manual-payments"), ...PAGAMENTOS.map(rotulo =>
    el("button.chip", {
      type: "button",
      class: rascunho.pagamento === rotulo ? "active" : "",
      dataset: { acao: "pagamento", pagamento: rotulo }
    }, rotulo)
  ));

  const mostraTroco = rascunho.pagamento === "Dinheiro" && rascunho.mesa === null;
  mostrar($("#manual-change-field"), mostraTroco);
  if (!mostraTroco && $("#manual-change-for")) $("#manual-change-for").value = "";
}

function desenharProdutos() {
  const termo = ($("#manual-search")?.value || "").trim().toLowerCase();
  const lista = estado.produtos
    .filter(produto => produto.active && produto.stock > 0)
    .filter(produto => !termo || produto.name.toLowerCase().includes(termo))
    .slice(0, 40);

  render($("#manual-products"), ...(lista.length
    ? lista.map(produto =>
        el("button.manual-product", { type: "button", dataset: { acao: "add-item", id: produto.id } },
          el("strong", {}, produto.name),
          el("span", {}, reais(precoEfetivo(produto))),
          el("small", {}, `${produto.stock} em estoque`)
        ))
    : [el("p.faint", {}, "Nenhum produto encontrado.")]));
}

function desenharCarrinho() {
  render($("#manual-cart"), ...(rascunho.itens.length
    ? [
        ...rascunho.itens.map(item =>
          el("div.manual-line", {},
            el("span", {}, `${item.qty}x ${item.name}`),
            el("span", {}, reais(item.price * item.qty)),
            el("div.qty-actions", {},
              el("button", { type: "button", dataset: { acao: "qtd", id: item.id, delta: "-1" } }, "-"),
              el("button", { type: "button", dataset: { acao: "qtd", id: item.id, delta: "1" } }, "+")
            )
          )),
        el("div.manual-total", {}, el("span", {}, "Total"), el("strong", {}, reais(subtotal())))
      ]
    : [el("p.faint", {}, "Nenhum item adicionado.")]));

  const dica = $("#manual-hint");
  if (dica) {
    dica.textContent = rascunho.mesa
      ? `Este pedido entra na comanda da mesa ${rascunho.mesa}.`
      : "A venda entra na fila e soma no faturamento do dashboard.";
  }
}

function redesenhar() {
  desenharChips();
  desenharProdutos();
  desenharCarrinho();
}

export function abrirVendaManual(mesa = null, callback = null) {
  rascunho.itens = [];
  rascunho.mesa = mesa;
  rascunho.canal = mesa === null ? "loja" : "loja";
  rascunho.pagamento = "Dinheiro";
  aoConcluir = callback;

  $("#manual-title").textContent = mesa ? `Lancar pedido na mesa ${mesa}` : "Lancar pedido manual";
  $("#manual-customer").value = "";
  if ($("#manual-change-for")) $("#manual-change-for").value = "";
  $("#manual-search").value = "";
  definirErro("");
  redesenhar();
  mostrar($("#manual-modal"), true);
  $("#manual-search").focus();
}

export function fecharVendaManual() {
  mostrar($("#manual-modal"), false);
}

async function registrar() {
  if (!rascunho.itens.length) return definirErro("Adicione pelo menos um produto.");
  definirErro("");

  const nome = $("#manual-customer").value.trim();
  const trocoPara = normalizarTroco($("#manual-change-for")?.value);
  if (rascunho.pagamento === "Dinheiro" && rascunho.mesa === null && !trocoPara) {
    return definirErro("Informe troco para quanto.");
  }
  const corpo = {
    items: rascunho.itens.map(item => ({ id: item.id, qty: item.qty })),
    customer: nome || (rascunho.mesa ? `Mesa ${rascunho.mesa}` : CANAIS_ROTULO[rascunho.canal]),
    phone: "",
    place: rascunho.mesa ? `Mesa ${rascunho.mesa} - salao` : rascunho.canal === "loja" ? "Retirada no balcao" : "Venda externa",
    note: "",
    payment: rascunho.pagamento,
    trocoPara: rascunho.pagamento === "Dinheiro" && rascunho.mesa === null ? trocoPara : null,
    channel: rascunho.canal,
    fulfillment: rascunho.mesa ? "mesa" : "retirada",
    tableNumber: rascunho.mesa
  };

  try {
    const controle = new AbortController();
    const tempo = setTimeout(() => controle.abort(new Error("timeout")), 20000);
    try {
      await apiPedidos.criarManual(corpo, { sinal: controle.signal });
    } finally {
      clearTimeout(tempo);
    }
    await carregar("pedidos", "produtos", "mesas");
    fecharVendaManual();
    toast(rascunho.mesa ? `Pedido lancado na mesa ${rascunho.mesa}.` : "Venda registrada na fila.");
    aoConcluir?.();
  } catch (erro) {
    definirErro(erro.message);
  }
}

export function ligarVendaManual() {
  const modal = $("#manual-modal");
  if (!modal) return;

  ligarModal(modal, fecharVendaManual);
  $("#manual-close")?.addEventListener("click", fecharVendaManual);
  $("#manual-save")?.addEventListener("click", registrar);
  $("#manual-search")?.addEventListener("input", desenharProdutos);
  $("#open-manual-sale")?.addEventListener("click", () => abrirVendaManual(null));

  delegar(modal, "click", "[data-acao='canal']", (_e, botao) => {
    rascunho.canal = botao.dataset.canal;
    desenharChips();
  });
  delegar(modal, "click", "[data-acao='pagamento']", (_e, botao) => {
    rascunho.pagamento = botao.dataset.pagamento;
    desenharChips();
  });

  $("#manual-change-for")?.addEventListener("input", () => {
    if (rascunho.pagamento === "Dinheiro") definirErro("");
  });

  delegar(modal, "click", "[data-acao='add-item']", (_e, botao) => {
    const produto = estado.produtos.find(item => item.id === botao.dataset.id);
    if (!produto) return;
    const existente = rascunho.itens.find(item => item.id === produto.id);
    if (existente) {
      if (existente.qty >= produto.stock) return definirErro(`${produto.name}: restam ${produto.stock} em estoque.`);
      existente.qty += 1;
    } else {
      rascunho.itens.push({ id: produto.id, name: produto.name, price: precoEfetivo(produto), qty: 1 });
    }
    definirErro("");
    desenharCarrinho();
  });

  delegar(modal, "click", "[data-acao='qtd']", (_e, botao) => {
    const item = rascunho.itens.find(linha => linha.id === botao.dataset.id);
    if (!item) return;
    item.qty += Number(botao.dataset.delta);
    if (item.qty <= 0) rascunho.itens = rascunho.itens.filter(linha => linha.id !== item.id);
    desenharCarrinho();
  });
}
