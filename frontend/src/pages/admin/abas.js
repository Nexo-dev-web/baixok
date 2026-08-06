/* Definicao das abas do painel.
 *
 * O campo `papeis` decide o que cada pessoa enxerga. E defesa em profundidade,
 * nao a defesa em si: esconder o botao evita erro e confusao, mas quem chamar a
 * API direto continua barrado pelo `exigirPapel` da rota. As duas listas
 * precisam concordar — backend/src/routes/painel.routes.js e a que vale. */

export const ABAS = Object.freeze({
  pedidos: {
    titulo: "Fila de pedidos",
    subtitulo: "Tudo que entra pelo cardapio, WhatsApp ou lancamento manual.",
    icone: "☰",
    rotulo: "Pedidos",
    papeis: ["admin", "caixa", "cozinha"]
  },
  cozinha: {
    titulo: "Cozinha (KDS)",
    subtitulo: "Tela do tablet da cozinha: toque para avancar o preparo.",
    icone: "▦",
    rotulo: "Cozinha (KDS)",
    papeis: ["admin", "caixa", "cozinha"]
  },
  mesas: {
    titulo: "Mesas do salao",
    subtitulo: "Comanda por mesa com QR code, parcial e fechamento de conta.",
    icone: "▢",
    rotulo: "Mesas (salao)",
    papeis: ["admin", "caixa"]
  },
  produtos: {
    titulo: "Produtos",
    subtitulo: "Cardapio que o cliente ve. Pausar tira do ar sem apagar o cadastro.",
    icone: "◱",
    rotulo: "Produtos",
    papeis: ["admin"]
  },
  promos: {
    titulo: "Promocoes e cupons",
    subtitulo: "Preco promocional e cupons de desconto.",
    icone: "✦",
    rotulo: "Promocoes",
    papeis: ["admin"]
  },
  entrega: {
    titulo: "Area de entrega",
    subtitulo: "Ponto da loja e faixas de raio com taxa e pedido minimo.",
    icone: "◈",
    rotulo: "Area de entrega",
    papeis: ["admin"]
  },
  estoque: {
    titulo: "Estoque",
    subtitulo: "Contador por produto. Item zerado sai do cardapio sozinho.",
    icone: "▤",
    rotulo: "Estoque",
    papeis: ["admin", "caixa"]
  },
  dashboard: {
    titulo: "Dashboard",
    subtitulo: "Faturamento, movimento por hora e mais vendidos.",
    icone: "◔",
    rotulo: "Dashboard",
    papeis: ["admin"]
  },
  equipe: {
    titulo: "Equipe e auditoria",
    subtitulo: "Quem tem acesso, com qual papel, e o registro do que foi feito.",
    icone: "◍",
    rotulo: "Equipe",
    papeis: ["admin"]
  }
});

export const abasDoPapel = papel =>
  Object.entries(ABAS).filter(([, aba]) => aba.papeis.includes(papel));

/* Primeira aba que o papel alcanca. A cozinha entra direto no KDS, que e a
 * tela onde ela trabalha. */
export function abaInicial(papel) {
  if (papel === "cozinha") return "cozinha";
  return abasDoPapel(papel)[0]?.[0] || "pedidos";
}

export const podeVer = (aba, papel) => Boolean(ABAS[aba]?.papeis.includes(papel));
