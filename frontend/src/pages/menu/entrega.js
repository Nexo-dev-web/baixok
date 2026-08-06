/* Endereco de entrega e previa da taxa.
 *
 * Dois caminhos, na ordem de preferencia:
 *   1. Widget oficial da Mapbox, quando ha token publico e a CDN carregou.
 *   2. Busca pelo proprio servidor, que funciona sempre — inclusive com token
 *      secreto, que nunca chega ao navegador.
 *
 * A taxa mostrada aqui e previa. Ao registrar o pedido o servidor geocodifica o
 * endereco de novo e refaz a conta: forjar coordenada no navegador so engana a
 * propria tela. */
import { el, render, $, mostrar } from "../../utils/dom.js";
import { reais } from "../../utils/formato.js";
import { apiPublica } from "../../services/api.js";

let statusCache = null;
let widget = null;
let timerBusca = null;
let requisicaoEmVoo = null;

export let cotacao = null;
export const limparCotacao = () => {
  cotacao = null;
  mostrar($("#entrega-aviso"), false);
  render($("#endereco-sugestoes"));
};

async function status() {
  if (statusCache) return statusCache;
  try {
    statusCache = await apiPublica.statusEntrega();
  } catch {
    statusCache = { configurado: false, token: "" };
  }
  return statusCache;
}

function mostrarAviso(mensagem, tom = "info") {
  const alvo = $("#entrega-aviso");
  if (!alvo) return;
  alvo.textContent = mensagem;
  alvo.className = `entrega-aviso ${tom}`;
  mostrar(alvo, Boolean(mensagem));
}

function descreverCotacao(resultado) {
  if (!resultado?.configurado) return "";
  if (!resultado.dentro) return `Esse endereco esta a ${resultado.km} km da loja, fora da area de entrega.`;
  const minimo = resultado.minimo ? ` · pedido minimo ${reais(resultado.minimo)}` : "";
  return `Entrega ${resultado.zona} · taxa ${reais(resultado.taxa)}${minimo}`;
}

async function cotar(params, aoAtualizar) {
  try {
    const resultado = await apiPublica.cotarEntrega(params);
    cotacao = resultado;
    mostrarAviso(descreverCotacao(resultado), resultado.dentro ? "ok" : "erro");
    aoAtualizar?.();
  } catch (erro) {
    cotacao = null;
    mostrarAviso(erro.message || "Nao foi possivel calcular a taxa agora.", "erro");
    aoAtualizar?.();
  }
}

/* Busca pelo servidor, com espera para nao disparar uma consulta por tecla
 * digitada — a Mapbox cobra por consulta e o teto por IP e por hora. */
export function buscarEndereco(termo, aoAtualizar) {
  clearTimeout(timerBusca);
  requisicaoEmVoo?.abort();

  const alvo = $("#endereco-sugestoes");
  if (!alvo) return;

  if (termo.trim().length < 3) {
    render(alvo);
    limparCotacao();
    return;
  }

  timerBusca = setTimeout(async () => {
    const controle = new AbortController();
    requisicaoEmVoo = controle;
    try {
      const { resultados } = await apiPublica.buscarEndereco(termo.trim(), { sinal: controle.signal });
      render(alvo, ...resultados.map(item =>
        el("button.sugestao", {
          type: "button",
          dataset: { acao: "escolher-endereco", lng: String(item.lng), lat: String(item.lat), texto: `${item.nome}${item.detalhe ? `, ${item.detalhe}` : ""}` }
        },
          el("strong", {}, item.nome),
          el("span", {}, item.detalhe || "")
        )
      ));
    } catch (erro) {
      if (erro.name !== "AbortError") render(alvo);
    } finally {
      requisicaoEmVoo = null;
    }
  }, 350);
}

export async function escolherEndereco({ texto, lng, lat }, aoAtualizar) {
  const campo = $("#customer-place");
  if (campo) campo.value = texto;
  render($("#endereco-sugestoes"));
  await cotar({ q: texto, lng, lat }, aoAtualizar);
}

/* Monta o widget da Mapbox se der. Nao dando, a busca pelo servidor continua
 * valendo e o cliente nem percebe a diferenca. */
export async function montarWidget(aoAtualizar) {
  const container = $("#endereco-widget");
  if (!container || widget) return;

  const { configurado, token } = await status();
  if (!configurado || !token || !window.MapboxGeocoder) return;

  try {
    widget = new window.MapboxGeocoder({
      accessToken: token,
      countries: "br",
      language: "pt-BR",
      types: "address,street,place,neighborhood",
      placeholder: "Rua e numero",
      marker: false,
      mapboxgl: null
    });
    widget.addTo("#endereco-widget");

    widget.on("result", async evento => {
      const [lng, lat] = evento.result.center || [];
      const texto = evento.result.place_name || "";
      const campo = $("#customer-place");
      if (campo) campo.value = texto;
      await cotar({ q: texto, lng, lat }, aoAtualizar);
    });
    widget.on("clear", () => {
      limparCotacao();
      aoAtualizar?.();
    });

    /* Com o widget montado, o campo de texto simples vira redundante. */
    mostrar($("#customer-place"), false);
  } catch {
    widget = null;   // CDN bloqueada ou API mudou: segue pelo servidor
  }
}

export function limparWidget() {
  try { widget?.clear(); } catch { /* widget ja descartado */ }
  const campo = $("#customer-place");
  if (campo) campo.value = "";
  limparCotacao();
}
