/* Ajustes da casa em chave/valor.
 *
 * Guarda o que estava cravado como constante no app.js e por isso so mudava com
 * deploy: o endereco publicado do cardapio (MENU_URL, usado nos QR codes das
 * mesas), o WhatsApp da entrega e a taxa de servico do salao. */
import { getDb } from "../db/connection.js";

const PADROES = {
  menu_url: "",
  whatsapp_entrega: "",
  taxa_servico_mesa: "0.1",
  nome_loja: "Baixo K",
  endereco_loja: ""
};

export const ajustesRepo = {
  todos() {
    const linhas = getDb().prepare("SELECT chave, valor FROM ajustes").all();
    const guardado = Object.fromEntries(linhas.map(linha => [linha.chave, linha.valor]));
    return { ...PADROES, ...guardado };
  },

  ler(chave) {
    return this.todos()[chave];
  },

  lerNumero(chave) {
    const numero = Number(this.ler(chave));
    return Number.isFinite(numero) ? numero : Number(PADROES[chave]);
  },

  gravar(chave, valor) {
    getDb().prepare(`
      INSERT INTO ajustes (chave, valor) VALUES (?, ?)
      ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor
    `).run(chave, String(valor));
  },

  gravarVarios(mapa) {
    for (const [chave, valor] of Object.entries(mapa)) {
      if (chave in PADROES) this.gravar(chave, valor);
    }
    return this.todos();
  }
};
