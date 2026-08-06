/* Controllers do painel. Todos exigem sessao; o papel e checado na rota. */
import { pedidosService } from "../services/pedidos.service.js";
import { produtosService, promocoesService } from "../services/produtos.service.js";
import { mesasService } from "../services/mesas.service.js";
import { cuponsService } from "../services/cupons.service.js";
import { entregaService } from "../services/entrega.service.js";
import { relatoriosService } from "../services/relatorios.service.js";
import { usuariosService } from "../services/usuarios.service.js";
import { ajustesRepo } from "../repositories/ajustes.repo.js";
import { mapaEstatico } from "../lib/mapbox.js";
import { contexto } from "./contexto.js";

export const pedidosController = {
  listar(req, res) {
    res.json({ pedidos: pedidosService.listar(req.validado.query) });
  },
  abertos(_req, res) {
    res.json({ pedidos: pedidosService.listarAbertos(), resumo: pedidosService.resumoDoDia() });
  },
  buscar(req, res) {
    res.json({ pedido: pedidosService.buscar(req.validado.params.id) });
  },
  criarManual(req, res) {
    res.status(201).json({ pedido: pedidosService.criarManual(req.validado.body, contexto(req)) });
  },
  mudarStatus(req, res) {
    const { id } = req.validado.params;
    res.json({ pedido: pedidosService.mudarStatus(id, req.validado.body.status, contexto(req)) });
  },
  cancelar(req, res) {
    const { id } = req.validado.params;
    res.json({ pedido: pedidosService.cancelar(id, req.validado.body.motivo, contexto(req)) });
  },
  marcarImpresso(req, res) {
    pedidosService.marcarImpresso(req.validado.params.id);
    res.json({ ok: true });
  }
};

export const produtosController = {
  listar(_req, res) {
    res.json({ produtos: produtosService.listar() });
  },
  criar(req, res) {
    res.status(201).json({ produto: produtosService.criar(req.validado.body, contexto(req)) });
  },
  atualizar(req, res) {
    res.json({ produto: produtosService.atualizar(req.validado.params.id, req.validado.body, contexto(req)) });
  },
  remover(req, res) {
    produtosService.remover(req.validado.params.id, contexto(req));
    res.json({ ok: true });
  },
  alternarAtivo(req, res) {
    res.json({ produto: produtosService.alternarAtivo(req.validado.params.id, contexto(req)) });
  },
  ajustarEstoque(req, res) {
    res.json({ produto: produtosService.ajustarEstoque(req.validado.params.id, req.validado.body, contexto(req)) });
  },
  emFalta(_req, res) {
    res.json({ produtos: produtosService.emFalta() });
  }
};

export const promocoesController = {
  listar(_req, res) {
    res.json({ promocoes: promocoesService.listar() });
  },
  salvar(req, res) {
    res.status(201).json({ promocao: promocoesService.salvar(req.validado.body, contexto(req)) });
  },
  remover(req, res) {
    promocoesService.remover(req.validado.params.id, contexto(req));
    res.json({ ok: true });
  }
};

export const cuponsController = {
  listar(_req, res) {
    res.json({ cupons: cuponsService.listar() });
  },
  criar(req, res) {
    res.status(201).json({ cupom: cuponsService.criar(req.validado.body, contexto(req)) });
  },
  alternarAtivo(req, res) {
    res.json({ cupom: cuponsService.alternarAtivo(req.validado.params.id, contexto(req)) });
  },
  remover(req, res) {
    cuponsService.remover(req.validado.params.id, contexto(req));
    res.json({ ok: true });
  }
};

export const mesasController = {
  listar(_req, res) {
    res.json({ mesas: mesasService.listar() });
  },
  adicionar(req, res) {
    res.status(201).json({ mesa: mesasService.adicionar(contexto(req)) });
  },
  remover(req, res) {
    mesasService.remover(req.validado.params.n, contexto(req));
    res.json({ ok: true });
  },
  abrir(req, res) {
    res.json({ mesa: mesasService.abrir(req.validado.params.n, contexto(req)) });
  },
  fecharConta(req, res) {
    res.json({ conta: mesasService.fecharConta(req.validado.params.n, contexto(req)) });
  },
  liberar(req, res) {
    res.json({ mesa: mesasService.liberar(req.validado.params.n, contexto(req)) });
  }
};

export const entregaController = {
  config(_req, res) {
    res.json({ entrega: entregaService.config() });
  },
  salvar(req, res) {
    res.json({ entrega: entregaService.salvarConfig(req.validado.body, contexto(req)) });
  },
  /* O mapa passa pelo servidor para o token nao aparecer na URL da imagem. */
  async mapa(_req, res) {
    const loja = entregaService.config();
    if (loja.lng == null) return res.status(404).json({ erro: "Marque o ponto da loja primeiro." });
    const imagem = await mapaEstatico({
      lng: loja.lng, lat: loja.lat, raios: loja.zones.map(zona => Number(zona.km)).filter(Boolean)
    });
    res.set("Content-Type", "image/png").set("Cache-Control", "private, max-age=300").send(imagem);
  }
};

export const relatoriosController = {
  dashboard(req, res) {
    res.json(relatoriosService.dashboard(req.validado.query));
  },
  exportacao(req, res) {
    res.json(relatoriosService.exportacao(req.validado.query));
  }
};

export const usuariosController = {
  listar(_req, res) {
    res.json({ usuarios: usuariosService.listar() });
  },
  async criar(req, res) {
    res.status(201).json({ usuario: await usuariosService.criar(req.validado.body, contexto(req)) });
  },
  atualizar(req, res) {
    res.json({ usuario: usuariosService.atualizar(Number(req.validado.params.id), req.validado.body, contexto(req)) });
  },
  async redefinirSenha(req, res) {
    await usuariosService.redefinirSenha(Number(req.validado.params.id), req.validado.body.senha, contexto(req));
    res.json({ ok: true });
  },
  remover(req, res) {
    usuariosService.remover(Number(req.validado.params.id), contexto(req));
    res.json({ ok: true });
  },
  auditoria(req, res) {
    res.json({ registros: usuariosService.auditoria(req.validado.query) });
  }
};

export const ajustesController = {
  ler(_req, res) {
    res.json({ ajustes: ajustesRepo.todos() });
  },
  gravar(req, res) {
    res.json({ ajustes: ajustesRepo.gravarVarios(req.validado.body) });
  }
};
