/* Registro do service worker e do convite de instalacao.
 *
 * Fica so no cardapio do cliente. O painel nao registra service worker de
 * proposito: cachear tela de operacao gera confusao — o atendente ve uma versao
 * antiga e nao entende por que o pedido nao aparece. */

let convite = null;

export function registrarPwa() {
  if (!("serviceWorker" in navigator)) return;
  /* file:// nao aceita service worker e o registro so gera erro no console. */
  if (location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      /* Sem service worker o site funciona igual, so nao abre offline. */
    });
  });

  window.addEventListener("beforeinstallprompt", evento => {
    evento.preventDefault();
    convite = evento;
    document.getElementById("install-app")?.classList.remove("hidden");
  });
}

export async function instalarApp() {
  if (!convite) return false;
  convite.prompt();
  const { outcome } = await convite.userChoice;
  convite = null;
  document.getElementById("install-app")?.classList.add("hidden");
  return outcome === "accepted";
}
