/* KDS - tela da cozinha.
 *
 * Fonte grande, legivel a distancia, um toque avanca o preparo. Deliberadamente
 * sem telefone, endereco e valores: e a tela que fica pendurada na area de
 * producao, e nada disso serve para montar o prato. */
import { el, render, $, delegar } from "../../../utils/dom.js";
import { minutosDesde, esperaLegivel } from "../../../utils/formato.js";
import { MODALIDADES_ROTULO } from "../../../utils/categorias.js";
import { apiPedidos } from "../../../services/api.js";
import { estado, carregar } from "../store.js";
import { toastFalha } from "../../../components/toast.js";

const MINUTOS_ATRASO = 15;
const senha = pedido => String(pedido.id).slice(-3).toUpperCase();

function cartao(pedido) {
  const espera = minutosDesde(pedido.createdAt);
  const proximo = pedido.status === "novo" ? "preparo" : "pronto";

  return el("article.kds-card", {
    class: `status-${pedido.status} ${espera >= MINUTOS_ATRASO ? "late" : ""}`,
    dataset: { acao: "avancar", id: pedido.id, status: proximo },
    role: "button",
    tabIndex: 0,
    "aria-label": `Pedido ${senha(pedido)}, avancar para ${proximo}`
  },
    el("div.kds-head", {},
      el("strong", {}, `#${senha(pedido)}`),
      el("span", {}, esperaLegivel(espera))
    ),
    el("strong.kds-customer", {}, pedido.customer),
    el("span.kds-type", {}, MODALIDADES_ROTULO[pedido.fulfillment] || pedido.fulfillment),
    el("ul.kds-items", {}, pedido.items.map(item => el("li", {}, `${item.qty}x ${item.name}`))),
    pedido.note ? el("p.kds-note", {}, el("strong", {}, "Obs: "), pedido.note) : null,
    el("span.kds-cta", {}, pedido.status === "novo" ? "Toque para iniciar" : "Toque quando ficar pronto")
  );
}

export function desenharCozinha() {
  const alvo = $("#kds-board");
  if (!alvo) return;

  const emFila = estado.pedidos
    .filter(pedido => ["novo", "preparo"].includes(pedido.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  render(alvo, emFila.length
    ? emFila.map(cartao)
    : el("p.faint.pad", {}, "Nenhum pedido na cozinha agora."));
}

async function avancar(id, status) {
  try {
    await apiPedidos.mudarStatus(id, status);
    await carregar("pedidos");
    desenharCozinha();
  } catch (erro) {
    toastFalha(erro);
  }
}

export function ligarCozinha() {
  const alvo = $("#kds-board");
  if (!alvo) return;

  delegar(alvo, "click", "[data-acao='avancar']", (_e, cartaoNode) =>
    avancar(cartaoNode.dataset.id, cartaoNode.dataset.status));

  /* Teclado tambem avanca: o tablet da cozinha as vezes tem teclado acoplado, e
   * o cartao virou um controle com role=button. */
  delegar(alvo, "keydown", "[data-acao='avancar']", (evento, cartaoNode) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    avancar(cartaoNode.dataset.id, cartaoNode.dataset.status);
  });
}
