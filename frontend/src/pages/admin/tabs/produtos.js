/* Cadastro de produtos.
 *
 * A foto continua podendo vir do computador, mas agora e redimensionada antes
 * de subir. O painel antigo gravava o arquivo original em base64 dentro do
 * banco: uma foto de celular de 4 MB virava ~5,5 MB de texto, e o cardapio de
 * todo cliente passava a carregar isso. */
import { el, render, $, delegar } from "../../../utils/dom.js";
import { reais, paraNumero } from "../../../utils/formato.js";
import { CATEGORIAS_ROTULO } from "../../../utils/categorias.js";
import { apiProdutos } from "../../../services/api.js";
import { estado, carregar, promocaoDoProduto } from "../store.js";
import { toast, toastFalha } from "../../../components/toast.js";

const PRESETS = [
  { label: "Pizza", src: "/images/produto-pizza.png" },
  { label: "Burguer", src: "/images/produto-burguer.png" },
  { label: "Massa", src: "/images/produto-massa.png" },
  { label: "Drink", src: "/images/produto-drinks.png" }
];

const LADO_MAXIMO = 900;
const QUALIDADE = 0.82;

/* Redimensiona e recomprime no proprio navegador antes de enviar. */
function prepararFoto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith("image/")) return reject(new Error("Escolha um arquivo de imagem."));
    if (arquivo.size > 12 * 1024 * 1024) return reject(new Error("Imagem muito grande. Use ate 12 MB."));

    const url = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(imagem.width * escala);
      canvas.height = Math.round(imagem.height * escala);
      canvas.getContext("2d").drawImage(imagem, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", QUALIDADE);
      /* O schema do servidor recusa acima de 500 KB. Avisamos aqui para o
       * atendente nao descobrir isso so ao salvar. */
      if (dataUrl.length > 500_000) return reject(new Error("Imagem ainda muito pesada. Tente uma foto menor."));
      resolve(dataUrl);
    };
    imagem.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel ler a imagem."));
    };
    imagem.src = url;
  });
}

function atualizarPreview(valor) {
  const preview = $("#product-photo-preview");
  const vazio = $(".photo-empty");
  if (preview) {
    preview.src = valor || "";
    preview.classList.toggle("hidden", !valor);
  }
  if (vazio) vazio.classList.toggle("hidden", Boolean(valor));
}

function linha(produto) {
  const promocao = promocaoDoProduto(produto.id);
  const semEstoque = produto.stock <= 0;

  return el("div.product-row", { dataset: { id: produto.id } },
    el("span.row-thumb", {}, produto.image
      ? el("img", { src: produto.image, alt: "", loading: "lazy" })
      : el("div.no-photo", {}, "—")),
    el("span", {}, el("strong", {}, produto.name), el("small", {}, produto.description || "")),
    el("span", {}, CATEGORIAS_ROTULO[produto.category] || produto.category),
    el("span", {},
      promocao ? el("s", {}, reais(produto.price)) : null,
      promocao ? " " : null,
      reais(promocao ? promocao.price : produto.price)
    ),
    el("span", { class: produto.stock <= produto.minStock ? "danger-text" : "" }, String(produto.stock)),
    el("span", {}, produto.active ? (semEstoque ? "Esgotado" : "Ativo") : "Pausado"),
    el("span.row-actions.right", {},
      el("button.ghost.small", { type: "button", dataset: { acao: "editar", id: produto.id } }, "Editar"),
      el("button.ghost.small", { type: "button", dataset: { acao: "alternar", id: produto.id } },
        produto.active ? "Pausar" : "Ativar"),
      el("button.danger.small", { type: "button", dataset: { acao: "remover", id: produto.id } }, "Excluir")
    )
  );
}

export function desenharProdutos() {
  const alvo = $("#product-admin-list");
  if (!alvo) return;

  render(alvo, estado.produtos.length
    ? estado.produtos.map(linha)
    : el("p.faint.pad", {}, "Nenhum produto cadastrado."));

  const presets = $("#photo-presets");
  if (presets && !presets.childElementCount) {
    render(presets, ...PRESETS.map(preset =>
      el("img", {
        src: preset.src, alt: preset.label, title: preset.label,
        dataset: { acao: "preset", src: preset.src }
      })
    ));
  }
}

function limparFormulario() {
  $("#product-id").value = "";
  $("#product-name").value = "";
  $("#product-description").value = "";
  $("#product-price").value = "";
  $("#product-stock").value = "";
  $("#product-category").value = "pizzas";
  $("#product-image").value = "";
  $("#product-active").checked = true;
  $("#product-form-title").textContent = "Novo produto";
  $("#product-save-label").textContent = "Cadastrar produto";
  atualizarPreview("");
}

function editar(id) {
  const produto = estado.produtos.find(item => item.id === id);
  if (!produto) return;

  $("#product-id").value = produto.id;
  $("#product-name").value = produto.name;
  $("#product-description").value = produto.description || "";
  $("#product-price").value = String(produto.price);
  $("#product-stock").value = String(produto.stock);
  $("#product-category").value = produto.category;
  $("#product-image").value = produto.image || "";
  $("#product-active").checked = produto.active;
  $("#product-form-title").textContent = `Editando: ${produto.name}`;
  $("#product-save-label").textContent = "Salvar alteracoes";
  atualizarPreview(produto.image || "");
  $("#product-name").focus();
}

async function salvar(evento) {
  evento.preventDefault();
  const id = $("#product-id").value;

  const corpo = {
    name: $("#product-name").value.trim(),
    description: $("#product-description").value.trim(),
    category: $("#product-category").value,
    price: paraNumero($("#product-price").value),
    stock: Math.max(0, Math.floor(paraNumero($("#product-stock").value))),
    /* minStock nao esta no formulario; preservamos o cadastrado ao editar. */
    minStock: estado.produtos.find(item => item.id === id)?.minStock ?? 4,
    active: $("#product-active").checked,
    image: $("#product-image").value.trim()
  };

  try {
    if (id) await apiProdutos.atualizar(id, corpo);
    else await apiProdutos.criar(corpo);
    await carregar("produtos");
    desenharProdutos();
    limparFormulario();
    toast("Produto salvo.");
  } catch (erro) {
    toastFalha(erro);
  }
}

export function ligarProdutos() {
  const lista = $("#product-admin-list");
  const presets = $("#photo-presets");

  delegar(lista, "click", "[data-acao='editar']", (_e, botao) => editar(botao.dataset.id));

  delegar(lista, "click", "[data-acao='alternar']", async (_e, botao) => {
    try {
      await apiProdutos.alternarAtivo(botao.dataset.id);
      await carregar("produtos");
      desenharProdutos();
    } catch (erro) { toastFalha(erro); }
  });

  delegar(lista, "click", "[data-acao='remover']", async (_e, botao) => {
    const produto = estado.produtos.find(item => item.id === botao.dataset.id);
    if (!confirm(`Excluir "${produto?.name}"? Para so tirar do cardapio, use Pausar.`)) return;
    try {
      await apiProdutos.remover(botao.dataset.id);
      await carregar("produtos");
      desenharProdutos();
      toast("Produto excluido.");
    } catch (erro) { toastFalha(erro); }
  });

  delegar(presets, "click", "[data-acao='preset']", (_e, imagem) => {
    $("#product-image").value = imagem.dataset.src;
    atualizarPreview(imagem.dataset.src);
  });

  $("#form-produto")?.addEventListener("submit", salvar);
  $("#product-reset")?.addEventListener("click", limparFormulario);
  $("#product-photo-button")?.addEventListener("click", () => $("#product-photo-file").click());

  $("#product-photo-file")?.addEventListener("change", async evento => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      const dataUrl = await prepararFoto(arquivo);
      $("#product-image").value = dataUrl;
      atualizarPreview(dataUrl);
    } catch (erro) {
      toastFalha(erro);
    } finally {
      evento.target.value = "";   // permite reenviar o mesmo arquivo
    }
  });
}
