/* Acesso a `entrega_config` e `entrega_faixas`. */
import { getDb } from "../db/connection.js";

export const entregaRepo = {
  config() {
    const linha = getDb().prepare("SELECT * FROM entrega_config WHERE id = 1").get();
    return {
      endereco: linha?.endereco || "",
      lng: linha?.lng ?? null,
      lat: linha?.lat ?? null,
      zones: this.faixas()
    };
  },

  /* O que o cardapio do cliente pode saber: se ha entrega configurada e qual a
   * maior distancia atendida. A coordenada exata da loja e as faixas com taxa e
   * pedido minimo ficam no painel — o calculo acontece no servidor. */
  configPublica() {
    const linha = getDb().prepare("SELECT * FROM entrega_config WHERE id = 1").get();
    const faixas = this.faixas();
    return {
      configurado: linha?.lng != null && faixas.length > 0,
      alcanceKm: faixas.length ? Math.max(...faixas.map(faixa => faixa.km)) : 0
    };
  },

  faixas() {
    return getDb().prepare("SELECT id, km, taxa AS fee, minimo AS min FROM entrega_faixas ORDER BY km").all();
  },

  salvarConfig({ endereco, lng, lat }) {
    getDb().prepare(`
      UPDATE entrega_config
         SET endereco = ?, lng = ?, lat = ?, atualizado_em = datetime('now')
       WHERE id = 1
    `).run(String(endereco || "").slice(0, 200), lng, lat);
    return this.config();
  },

  /* Faixas trocam em bloco: a tela edita a lista inteira e salva de uma vez.
   * Dentro de transacao para nao existir instante com a area de entrega vazia,
   * o que faria um pedido em curso ser recusado por engano. */
  substituirFaixas(faixas) {
    const db = getDb();
    db.prepare("DELETE FROM entrega_faixas").run();
    const inserir = db.prepare("INSERT INTO entrega_faixas (km, taxa, minimo) VALUES (?, ?, ?)");
    for (const faixa of [...faixas].sort((a, b) => a.km - b.km)) {
      inserir.run(faixa.km, faixa.fee, faixa.min);
    }
    return this.faixas();
  }
};
