/* Formatacao de valores para a tela. */

const MOEDA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/* Os Intl.* sao criados uma vez, fora da funcao: construir um formatador a
 * cada chamada e caro, e o painel formata centenas de valores por redesenho. */
export const dinheiro = valor => MOEDA.format(Number(valor || 0));
export const reais = valor => `R$ ${dinheiro(valor)}`;

/* O banco grava 'AAAA-MM-DD HH:MM:SS' em UTC. O Safari nao aceita esse formato
 * com espaco no construtor de Date e devolve Invalid Date — dai o replace. */
const paraData = valor => {
  if (!valor) return null;
  const data = new Date(typeof valor === "string" && valor.includes(" ") ? `${valor.replace(" ", "T")}Z` : valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

export const hora = valor => {
  const data = paraData(valor);
  return data ? HORA.format(data) : "--:--";
};

export const dataHora = valor => {
  const data = paraData(valor);
  return data ? DATA_HORA.format(data) : "";
};

export function minutosDesde(valor) {
  const data = paraData(valor);
  if (!data) return 0;
  return Math.max(0, Math.floor((Date.now() - data.getTime()) / 60000));
}

export function esperaLegivel(minutos) {
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

export const percentual = fracao => `${Math.round(Number(fracao || 0) * 100)}%`;

/* Aceita "39,90" e "39.90": o teclado numerico do celular manda virgula. */
export const paraNumero = valor => {
  const numero = Number(String(valor ?? "").replace(",", ".").trim());
  return Number.isFinite(numero) ? numero : 0;
};
