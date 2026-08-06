/* Validacao de entrada com Zod.
 *
 * Regra da casa: nenhuma rota le req.body, req.query ou req.params direto. O
 * que o handler recebe e o resultado do parse — ja com tipo certo, cortado no
 * tamanho maximo e sem campo extra. Isso substitui o
 * `String(pedido.customer || "").slice(0, 80)` repetido campo a campo dentro do
 * server.js antigo, que era facil de esquecer num campo novo.
 *
 * O objeto validado substitui o original: se o corpo trouxer `total: 0.01`, o
 * schema descarta e o handler nem enxerga o campo. */
import { erroValidacao } from "../lib/errors.js";

const traduzir = erro =>
  erro.issues.map(problema => ({
    campo: problema.path.join(".") || "(corpo)",
    mensagem: problema.message
  }));

function fazer(origem) {
  return schema => (req, _res, next) => {
    const resultado = schema.safeParse(req[origem]);
    if (!resultado.success) {
      const detalhes = traduzir(resultado.error);
      return next(erroValidacao(detalhes[0]?.mensagem || "Dados invalidos.", detalhes));
    }
    /* req.query e somente-leitura no Express 5: guardamos em req.validado. */
    req.validado = { ...(req.validado || {}), [origem]: resultado.data };
    next();
  };
}

export const validarCorpo = fazer("body");
export const validarQuery = fazer("query");
export const validarParams = fazer("params");
