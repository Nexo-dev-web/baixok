/* Estoque: contador por produto.
 *
 * Cada ajuste e uma chamada a API que grava quem mexeu e de quanto para quanto.
 * Antes o painel reescrevia o array inteiro de produtos a cada clique — duas
 * pessoas contando ao mesmo tempo, e a ultima gravacao apagava a contagem da
 * outra sem ninguem perceber. */
import { el, render, $, delegar } from "../../../utils/dom.js";
import { apiProdutos } from "../../../services/api.js";
import { estado, carregar } from "../store.js";
import { toastFalha } from "../../../components/toast.js";

function cartao(produto) {
  const critico = produto.stock <= produto.minStock;

  return el("article.stock-card", { class: critico ? "low" : "", dataset: { id: produto.id } },
    el("strong", {}, produto.name),
    el("span.stock-value", { class: critico ? "danger-text" : "" }, String(produto.stock)),
    el("span.small", {}, `minimo ${produto.minStock}`),
    el("div.counter", {},
      el("button", { type: "button", dataset: { acao: "estoque", id: produto.id, delta: "-1" }, "aria-label": `Tirar uma unidade de ${produto.name}` }, "−"),
      el("input", {
        type: "number", min: "0", value: String(produto.stock),
        dataset: { acao: "estoque-direto", id: produto.id },
        "aria-label": `Estoque de ${produto.name}`
      }),
      el("button", { type: "button", dataset: { acao: "estoque", id: produto.id, delta: "1" }, "aria-label": `Adicionar uma unidade de ${produto.name}` }, "+")
    ),
    !produto.active ? el("span.small.faint", {}, "pausado no cardapio") : null
  );
}

export function desenharEstoque() {
  const alvo = $("#stock-grid");
  if (!alvo) return;

  /* Os criticos primeiro: e a informacao que faz alguem agir. */
  const ordenados = [...estado.produtos].sort((a, b) =>
    (a.stock - a.minStock) - (b.stock - b.minStock));

  render(alvo, ordenados.length
    ? ordenados.map(cartao)
    : el("p.faint.pad", {}, "Nenhum produto cadastrado."));
}

async function ajustar(id, corpo) {
  try {
    await apiProdutos.ajustarEstoque(id, corpo);
    await carregar("produtos");
    desenharEstoque();
  } catch (erro) {
    toastFalha(erro);
    await carregar("produtos");
    desenharEstoque();      // devolve a tela ao valor real
  }
}

export function ligarEstoque() {
  const alvo = $("#stock-grid");
  if (!alvo) return;

  delegar(alvo, "click", "[data-acao='estoque']", (_e, botao) =>
    ajustar(botao.dataset.id, { delta: Number(botao.dataset.delta) }));

  /* Digitar direto define o valor absoluto — util na contagem de inventario,
   * em que ninguem quer clicar "+" quarenta vezes. */
  delegar(alvo, "change", "[data-acao='estoque-direto']", (_e, campo) => {
    const valor = Math.max(0, Math.floor(Number(campo.value) || 0));
    ajustar(campo.dataset.id, { valor });
  });
}
