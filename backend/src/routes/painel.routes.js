/* Rotas do painel.
 *
 * Cada linha declara quem pode chamar. Ler a coluna do exigirPapel de cima a
 * baixo e a matriz de permissoes do sistema — nao ha regra de acesso escondida
 * dentro de service nenhum.
 *
 *   admin   - dono e gerencia: cadastro, precos, cupons, entrega, usuarios
 *   caixa   - operacao do dia: fila, mesas, lancamento manual, estoque
 *   cozinha - so o que a cozinha precisa: ver a fila e avancar o preparo
 */
import { Router } from "express";
import {
  pedidosController, produtosController, promocoesController, cuponsController,
  mesasController, entregaController, relatoriosController, usuariosController, ajustesController
} from "../controllers/painel.controller.js";
import { exigirLogin, exigirPapel } from "../middlewares/auth.js";
import { validarCorpo, validarQuery, validarParams } from "../middlewares/validate.js";
import { paramsId, paramsNumero } from "../schemas/comum.schema.js";
import {
  criarPedidoManualSchema, mudarStatusSchema, cancelarPedidoSchema,
  listarPedidosSchema, relatorioSchema
} from "../schemas/pedido.schema.js";
import { produtoSchema, ajusteEstoqueSchema, promocaoSchema, cupomSchema } from "../schemas/catalogo.schema.js";
import { configEntregaSchema } from "../schemas/entrega.schema.js";
import { criarUsuarioSchema, atualizarUsuarioSchema, redefinirSenhaSchema } from "../schemas/auth.schema.js";
import { ajustesSchema, auditoriaQuerySchema } from "../schemas/ajustes.schema.js";

export const rotasPainel = Router();

// Nenhuma rota abaixo responde sem sessao valida.
rotasPainel.use(exigirLogin);

const ADMIN = exigirPapel("admin");
const OPERACAO = exigirPapel("admin", "caixa");
const TODOS = exigirPapel("admin", "caixa", "cozinha");

// ------------------------------------------------------------------ pedidos ---
rotasPainel.get("/pedidos", TODOS, validarQuery(listarPedidosSchema), pedidosController.listar);
rotasPainel.get("/pedidos/abertos", TODOS, pedidosController.abertos);
rotasPainel.get("/pedidos/:id", TODOS, validarParams(paramsId), pedidosController.buscar);

/* A cozinha muda status (novo -> preparo -> pronto), que e o trabalho dela. */
rotasPainel.patch("/pedidos/:id/status", TODOS, validarParams(paramsId), validarCorpo(mudarStatusSchema), pedidosController.mudarStatus);
rotasPainel.post("/pedidos/:id/impresso", TODOS, validarParams(paramsId), pedidosController.marcarImpresso);

/* Cancelar mexe em dinheiro e devolve estoque: fica fora do alcance da cozinha. */
rotasPainel.post("/pedidos/:id/cancelar", OPERACAO, validarParams(paramsId), validarCorpo(cancelarPedidoSchema), pedidosController.cancelar);
rotasPainel.post("/pedidos", OPERACAO, validarCorpo(criarPedidoManualSchema), pedidosController.criarManual);

// ----------------------------------------------------------------- produtos ---
/* A cozinha ve o cardapio para conferir ficha e estoque, mas nao edita. */
rotasPainel.get("/produtos", TODOS, produtosController.listar);
rotasPainel.get("/produtos/em-falta", TODOS, produtosController.emFalta);

/* Preco e cadastro sao do admin. Um caixa nao muda o preco da pizza. */
rotasPainel.post("/produtos", ADMIN, validarCorpo(produtoSchema), produtosController.criar);
rotasPainel.put("/produtos/:id", ADMIN, validarParams(paramsId), validarCorpo(produtoSchema), produtosController.atualizar);
rotasPainel.delete("/produtos/:id", ADMIN, validarParams(paramsId), produtosController.remover);
rotasPainel.post("/produtos/:id/alternar", ADMIN, validarParams(paramsId), produtosController.alternarAtivo);

/* Estoque e operacao do dia: contar o que chegou e o que estragou e trabalho do
 * caixa, e nao muda preco nem cadastro. */
rotasPainel.patch("/produtos/:id/estoque", OPERACAO, validarParams(paramsId), validarCorpo(ajusteEstoqueSchema), produtosController.ajustarEstoque);

// -------------------------------------------------------- promocoes e cupons ---
rotasPainel.get("/promocoes", TODOS, promocoesController.listar);
rotasPainel.post("/promocoes", ADMIN, validarCorpo(promocaoSchema), promocoesController.salvar);
rotasPainel.delete("/promocoes/:id", ADMIN, validarParams(paramsId), promocoesController.remover);

/* Cupom e desconto: so admin ve a lista e so admin cria. */
rotasPainel.get("/cupons", ADMIN, cuponsController.listar);
rotasPainel.post("/cupons", ADMIN, validarCorpo(cupomSchema), cuponsController.criar);
rotasPainel.post("/cupons/:id/alternar", ADMIN, validarParams(paramsId), cuponsController.alternarAtivo);
rotasPainel.delete("/cupons/:id", ADMIN, validarParams(paramsId), cuponsController.remover);

// ------------------------------------------------------------------- mesas ---
rotasPainel.get("/mesas", TODOS, mesasController.listar);
rotasPainel.post("/mesas", OPERACAO, mesasController.adicionar);
rotasPainel.delete("/mesas/:n", OPERACAO, validarParams(paramsNumero), mesasController.remover);
rotasPainel.post("/mesas/:n/abrir", OPERACAO, validarParams(paramsNumero), mesasController.abrir);
rotasPainel.post("/mesas/:n/fechar", OPERACAO, validarParams(paramsNumero), mesasController.fecharConta);
rotasPainel.post("/mesas/:n/liberar", OPERACAO, validarParams(paramsNumero), mesasController.liberar);

// ----------------------------------------------------------------- entrega ---
rotasPainel.get("/entrega", OPERACAO, entregaController.config);
rotasPainel.put("/entrega", ADMIN, validarCorpo(configEntregaSchema), entregaController.salvar);
rotasPainel.get("/entrega/mapa", OPERACAO, entregaController.mapa);

// -------------------------------------------------------------- relatorios ---
/* Faturamento e do dono. Nao e informacao para quem esta no caixa nem na
 * cozinha. */
rotasPainel.get("/relatorios/dashboard", ADMIN, validarQuery(relatorioSchema), relatoriosController.dashboard);
rotasPainel.get("/relatorios/exportar", ADMIN, validarQuery(relatorioSchema), relatoriosController.exportacao);

// ---------------------------------------------------------------- usuarios ---
rotasPainel.get("/usuarios", ADMIN, usuariosController.listar);
rotasPainel.post("/usuarios", ADMIN, validarCorpo(criarUsuarioSchema), usuariosController.criar);
rotasPainel.patch("/usuarios/:id", ADMIN, validarParams(paramsId), validarCorpo(atualizarUsuarioSchema), usuariosController.atualizar);
rotasPainel.post("/usuarios/:id/senha", ADMIN, validarParams(paramsId), validarCorpo(redefinirSenhaSchema), usuariosController.redefinirSenha);
rotasPainel.delete("/usuarios/:id", ADMIN, validarParams(paramsId), usuariosController.remover);
rotasPainel.get("/auditoria", ADMIN, validarQuery(auditoriaQuerySchema), usuariosController.auditoria);

// ----------------------------------------------------------------- ajustes ---
rotasPainel.get("/ajustes", TODOS, ajustesController.ler);
rotasPainel.put("/ajustes", ADMIN, validarCorpo(ajustesSchema), ajustesController.gravar);
