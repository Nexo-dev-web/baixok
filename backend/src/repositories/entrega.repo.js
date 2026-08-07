/* Acesso a `entrega_config` e `entrega_faixas`. */
import { todos, um, alteradas, emTransacao } from "../db/postgres.js";

export const entregaRepo = {
  async config() {
    const linha = await um("SELECT * FROM entrega_config WHERE id = 1");
    return {
      endereco: linha?.endereco || "",
      lng: linha?.lng ?? null,
      lat: linha?.lat ?? null,
      zones: await this.faixas()
    };
  },

  /* O que o cardapio do cliente pode saber: se ha entrega configurada e qual a
   * maior distancia atendida. A coordenada exata da loja e as faixas com taxa e
   * pedido minimo ficam no painel — o calculo acontece no servidor. */
  async configPublica() {
    const linha = await um("SELECT * FROM entrega_config WHERE id = 1");
    const faixas = await this.faixas();
    return {
      configurado: linha?.lng != null && faixas.length > 0,
      alcanceKm: faixas.length ? Math.max(...faixas.map(faixa => faixa.km)) : 0
    };
  },

  async faixas() {
    return await todos("SELECT id, km, taxa AS fee, minimo AS min FROM entrega_faixas ORDER BY km");
  },

  async salvarConfig({ endereco, lng, lat }) {
    await alteradas(`
      UPDATE entrega_config
         SET endereco = ?, lng = ?, lat = ?, atualizado_em = now()
       WHERE id = 1
    `, [String(endereco || "").slice(0, 200), lng, lat]);
    return this.config();
  },

  /* Faixas trocam em bloco: a tela edita a lista inteira e salva de uma vez.
   * Dentro de transacao para nao existir instante com a area de entrega vazia,
   * o que faria um pedido em curso ser recusado por engano.
   *
   * A transacao passou a ser garantida aqui, e nao mais confiada a quem chama:
   * emTransacao reaproveita a de fora quando ja existe uma, entao envolver o
   * bloco nao custa nada e fecha a janela em qualquer caminho de chamada. */
  async substituirFaixas(faixas) {
    return emTransacao(async () => {
      await alteradas("DELETE FROM entrega_faixas");

      const ordenadas = [...faixas].sort((a, b) => a.km - b.km);
      if (ordenadas.length) {
        const valores = [];
        const marcadores = ordenadas.map(faixa => {
          valores.push(faixa.km, faixa.fee, faixa.min);
          return "(?, ?, ?)";
        }).join(", ");

        await alteradas(`INSERT INTO entrega_faixas (km, taxa, minimo) VALUES ${marcadores}`, valores);
      }
      return this.faixas();
    });
  }
};
