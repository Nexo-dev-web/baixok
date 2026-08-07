/* Tela de login.
 *
 * Substitui a senha unica da loja por usuario e senha por pessoa. O destino
 * pos-login vem da query `?de=`, e por isso e validado aqui: aceitar qualquer
 * valor abriria um redirecionamento aberto — um link
 * `/entrar.html?de=https://site-falso` levaria o atendente para fora depois de
 * digitar a senha, com a aparencia de ter sido o proprio sistema. */
import "../../styles/entrar.css";
import { $, mostrar } from "../../utils/dom.js";
import { apiAuth } from "../../services/api.js";

const DESTINOS_PERMITIDOS = new Set(["/admin.html", "/telao.html", "/index.html"]);

function destino() {
  const pedido = new URLSearchParams(location.search).get("de") || "";
  /* So caminho interno da lista branca. Nada de URL absoluta, nada de "//". */
  return DESTINOS_PERMITIDOS.has(pedido) ? pedido : "/admin.html";
}

function mostrarErro(mensagem) {
  const alvo = $("#entrar-erro");
  alvo.textContent = mensagem;
  mostrar(alvo, Boolean(mensagem));
}

$("#form-entrar").addEventListener("submit", async evento => {
  evento.preventDefault();
  mostrarErro("");

  const botao = $("#botao-entrar");
  const usuario = $("#usuario").value.trim();
  const senha = $("#senha").value;

  botao.disabled = true;
  botao.textContent = "Entrando...";
  try {
    await apiAuth.entrar(usuario, senha);
    location.replace(destino());
  } catch (erro) {
    /* A mensagem vem do servidor e e deliberadamente igual para usuario
     * inexistente e senha errada. */
    mostrarErro(erro.codigo === "offline"
      ? "Servidor fora do ar. Verifique se o sistema esta rodando."
      : erro.message);
    $("#senha").value = "";
    $("#senha").focus();
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});
