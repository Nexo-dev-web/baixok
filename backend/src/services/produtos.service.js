/* Regras de cadastro de produto e estoque. */
import { produtosRepo } from "../repositories/produtos.repo.js";
import { promocoesRepo } from "../repositories/promocoes.repo.js";
import { auditoriaRepo } from "../repositories/auditoria.repo.js";
import { naoEncontrado, ErroApp } from "../lib/errors.js";
import { publicar, CANAL } from "../lib/events.js";
import { uid } from "../lib/ids.js";

const SELO_POR_CATEGORIA = {
  pizzas: "Pizza", burgues: "Burguer", massas: "Massa", drinks: "Drink", porcoes: "Porcao"
};

export const produtosService = {
  listar: () => produtosRepo.listar(),
  emFalta: () => produtosRepo.emFalta(),

  /* Cardapio publico: produtos a venda ja com o preco promocional aplicado.
   * O cliente nunca ve estoque_min nem a quantidade exata em estoque — sao
   * dados de operacao. */
  cardapioPublico() {
    const promocoes = new Map(promocoesRepo.listarPublico().map(promo => [promo.productId, promo.price]));
    return produtosRepo.listarPublico().map(produto => ({
      ...produto,
      precoOriginal: promocoes.has(produto.id) ? produto.price : null,
      price: promocoes.get(produto.id) ?? produto.price,
      emPromocao: promocoes.has(produto.id)
    }));
  },

  buscar(id) {
    const produto = produtosRepo.buscar(id);
    if (!produto) throw naoEncontrado("Produto nao encontrado.");
    return produto;
  },

  criar(dados, { usuario, ip }) {
    const produto = produtosRepo.criar({
      ...dados,
      id: uid("prod"),
      badge: SELO_POR_CATEGORIA[dados.category] || "Item"
    });
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "produto_criado",
      entidade: "produto", entidadeId: produto.id, detalhes: { nome: produto.name, preco: produto.price }, ip
    });
    publicar("produtos", [CANAL.PUBLICO, CANAL.OPERACAO]);
    return produto;
  },

  atualizar(id, dados, { usuario, ip }) {
    const anterior = this.buscar(id);
    const produto = produtosRepo.atualizar(id, {
      ...dados,
      badge: SELO_POR_CATEGORIA[dados.category] || "Item"
    });

    /* A auditoria guarda o que mudou, nao o objeto inteiro: um relatorio de
     * "quem baixou o preco da pizza?" fica legivel. */
    const mudancas = Object.fromEntries(
      Object.entries(dados)
        .filter(([chave, valor]) => anterior[chave] !== valor && chave !== "image")
        .map(([chave, valor]) => [chave, { de: anterior[chave], para: valor }])
    );
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "produto_alterado",
      entidade: "produto", entidadeId: id, detalhes: mudancas, ip
    });
    publicar("produtos", [CANAL.PUBLICO, CANAL.OPERACAO]);
    return produto;
  },

  remover(id, { usuario, ip }) {
    const produto = this.buscar(id);
    /* Nao apagamos produto que ja apareceu em pedido: a exclusao levaria junto o
     * historico de vendas. O caminho para tirar do cardapio e desativar. */
    if (!produtosRepo.remover(id)) throw naoEncontrado("Produto nao encontrado.");
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "produto_removido",
      entidade: "produto", entidadeId: id, detalhes: { nome: produto.name }, ip
    });
    publicar("produtos", [CANAL.PUBLICO, CANAL.OPERACAO]);
  },

  alternarAtivo(id, { usuario, ip }) {
    this.buscar(id);
    const produto = produtosRepo.alternarAtivo(id);
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario,
      acao: produto.active ? "produto_ativado" : "produto_pausado",
      entidade: "produto", entidadeId: id, ip
    });
    publicar("produtos", [CANAL.PUBLICO, CANAL.OPERACAO]);
    return produto;
  },

  ajustarEstoque(id, { delta, valor }, { usuario, ip }) {
    const anterior = this.buscar(id);
    const produto = valor !== undefined
      ? produtosRepo.definirEstoque(id, valor)
      : produtosRepo.ajustarEstoque(id, delta);

    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "estoque_ajustado",
      entidade: "produto", entidadeId: id,
      detalhes: { de: anterior.stock, para: produto.stock, nome: produto.name }, ip
    });
    publicar("produtos", [CANAL.PUBLICO, CANAL.OPERACAO]);
    return produto;
  }
};

export const promocoesService = {
  listar: () => promocoesRepo.listar(),

  salvar(dados, { usuario, ip }) {
    const produto = produtosRepo.buscar(dados.productId);
    if (!produto) throw naoEncontrado("Produto nao encontrado.");

    /* Regra que o schema nao consegue expressar: depende do preco cadastrado.
     * O painel antigo checava isso so na tela, entao uma chamada direta a API
     * criava "promocao" mais cara que o preco cheio. */
    if (dados.price >= produto.price) {
      throw new ErroApp(
        `O preco promocional precisa ser menor que R$ ${produto.price.toFixed(2)}.`,
        422,
        "promocao_invalida"
      );
    }

    const promocao = promocoesRepo.salvar({ ...dados, id: uid("promo") });
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "promocao_salva",
      entidade: "promocao", entidadeId: promocao.id,
      detalhes: { produto: produto.name, de: produto.price, para: dados.price }, ip
    });
    publicar("promocoes", [CANAL.PUBLICO, CANAL.OPERACAO]);
    return promocao;
  },

  remover(id, { usuario, ip }) {
    if (!promocoesRepo.remover(id)) throw naoEncontrado("Promocao nao encontrada.");
    auditoriaRepo.registrar({
      usuarioId: usuario.id, usuario: usuario.usuario, acao: "promocao_encerrada",
      entidade: "promocao", entidadeId: id, ip
    });
    publicar("promocoes", [CANAL.PUBLICO, CANAL.OPERACAO]);
  }
};
