/* Dashboard.
 *
 * Todos os numeros vem agregados do servidor. O painel antigo baixava a lista
 * inteira de pedidos — com nome, telefone e endereco de cada cliente — para
 * somar faturamento no navegador. Alem de pesado, colocava a base de clientes
 * dentro de um tablet que fica no balcao. */
import { el, render, $, delegar } from "../../../utils/dom.js";
import { reais, dinheiro } from "../../../utils/formato.js";
import { CANAIS_ROTULO } from "../../../utils/categorias.js";
import { apiRelatorios } from "../../../services/api.js";
import { toastFalha } from "../../../components/toast.js";

const filtros = { periodo: "hoje", canal: "" };
let ultimoRelatorio = null;

function metrica(rotulo, valor, nota, tom = "") {
  return el("article.metric-card", { class: tom },
    el("span", {}, rotulo),
    el("strong", {}, valor),
    nota ? el("em.metric-nota", {}, nota) : null
  );
}

/* Barras proporcionais em CSS puro. O original ja fazia assim — sem biblioteca
 * de grafico, o que para quatro barras continua sendo a escolha certa. */
function barras(linhas, formatar) {
  if (!linhas.length) return el("p.faint", {}, "Sem dados no periodo.");
  const maior = Math.max(...linhas.map(linha => Number(linha.valor) || 0), 1);

  return el("div.chart-rows", {}, ...linhas.map(linha =>
    el("div.chart-row", {},
      el("span.chart-label", {}, linha.rotulo),
      el("span.chart-bar", {}, el("i", { style: { width: `${Math.max(3, (linha.valor / maior) * 100)}%` } })),
      el("span.chart-value", {}, formatar(linha.valor))
    )
  ));
}

export async function desenharDashboard() {
  try {
    ultimoRelatorio = await apiRelatorios.dashboard({
      periodo: filtros.periodo,
      canal: filtros.canal || undefined
    });
  } catch (erro) {
    toastFalha(erro, "Dashboard");
    return;
  }

  const { resumo, porHora, porCanal, porPagamento, maisVendidos, estoqueBaixo, periodo } = ultimoRelatorio;

  render($("#dashboard-metrics"),
    metrica("Faturamento", reais(resumo.faturamento), periodo.rotulo),
    metrica("Pedidos", String(resumo.pedidos), "cancelados fora da conta"),
    metrica("Ticket medio", reais(resumo.ticketMedio), null),
    metrica("Descontos", reais(resumo.descontos), resumo.taxasEntrega ? `entregas ${reais(resumo.taxasEntrega)}` : null),
    metrica("Estoque critico", String(estoqueBaixo.length), estoqueBaixo.length ? "itens no minimo" : "tudo certo",
      estoqueBaixo.length ? "alert-copper" : "")
  );

  render($("#channel-chart"), barras(
    porCanal.map(linha => ({ rotulo: CANAIS_ROTULO[linha.rotulo] || linha.rotulo || "-", valor: linha.faturamento })),
    reais
  ));

  render($("#payment-chart"), barras(
    porPagamento.map(linha => ({ rotulo: linha.rotulo || "nao informado", valor: linha.faturamento })),
    reais
  ));

  render($("#hour-chart"), barras(
    porHora.map(linha => ({ rotulo: `${linha.hora}h`, valor: linha.pedidos })),
    valor => `${valor} ped.`
  ));

  render($("#best-items"), barras(
    maisVendidos.map(linha => ({ rotulo: linha.rotulo, valor: linha.quantidade })),
    valor => `${valor}x`
  ));

  render($("#stock-alert-chart"), estoqueBaixo.length
    ? barras(
        estoqueBaixo.map(item => ({ rotulo: item.nome, valor: item.estoque })),
        valor => `${valor} un.`
      )
    : el("p.faint", {}, "Nenhum item no minimo."));
}

/* Exportacao em CSV com separador ponto-e-virgula e BOM: e o que o Excel em
 * portugues abre com as colunas certas sem passo de importacao. */
function exportarPlanilha() {
  if (!ultimoRelatorio) return;

  apiRelatorios.exportar({ periodo: filtros.periodo, canal: filtros.canal || undefined })
    .then(({ linhas, periodo }) => {
      const colunas = ["id", "data", "status", "canal", "modalidade", "cliente", "pagamento", "itens", "subtotal", "desconto", "taxaEntrega", "total"];
      const escapar = valor => `"${String(valor ?? "").replace(/"/g, '""')}"`;

      const csv = [
        colunas.join(";"),
        ...linhas.map(linha => colunas.map(coluna => {
          const valor = linha[coluna];
          return typeof valor === "number" ? escapar(dinheiro(valor)) : escapar(valor);
        }).join(";"))
      ].join("\r\n");

      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `baixok-${periodo.rotulo.toLowerCase().replace(/\s+/g, "-")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    })
    .catch(erro => toastFalha(erro, "Exportacao"));
}

export function ligarDashboard() {
  const grupo = $("#period-group");
  delegar(grupo, "click", "[data-period]", (_e, botao) => {
    filtros.periodo = botao.dataset.period;
    for (const outro of grupo.querySelectorAll("[data-period]")) {
      outro.classList.toggle("active", outro === botao);
    }
    desenharDashboard();
  });

  const canal = $("#filter-channel");
  if (canal) {
    render(canal,
      el("option", { value: "" }, "Canal: todos"),
      ...Object.entries(CANAIS_ROTULO).map(([chave, rotulo]) => el("option", { value: chave }, rotulo))
    );
    canal.addEventListener("change", () => {
      filtros.canal = canal.value;
      desenharDashboard();
    });
  }

  $("#export-dashboard")?.addEventListener("click", exportarPlanilha);
}
