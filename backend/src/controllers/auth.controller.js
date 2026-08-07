import { env } from "../config/env.js";
import { authService } from "../services/auth.service.js";
import { contexto, ipDe } from "./contexto.js";

/* O cookie de sessao e HttpOnly: o JavaScript da pagina nao le. Um XSS no
 * painel deixa de virar roubo de sessao.
 * O cookie de CSRF e legivel de proposito — a pagina precisa dele para devolver
 * no cabecalho. Sozinho ele nao vale nada: o servidor compara com o hash
 * guardado na sessao. */
function cookiesDaSessao(res, { token, csrfToken }) {
  const comum = {
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: env.SESSION_TTL_MS,
    path: "/"
  };
  res.cookie(env.SESSION_COOKIE_NAME, token, { ...comum, httpOnly: true });
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, { ...comum, httpOnly: false });
}

function limparCookies(res) {
  const comum = { sameSite: "lax", secure: env.COOKIE_SECURE, path: "/" };
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...comum, httpOnly: true });
  res.clearCookie(env.CSRF_COOKIE_NAME, { ...comum, httpOnly: false });
}

export const authController = {
  async login(req, res) {
    const resultado = await authService.login({
      ...req.validado.body,
      ip: ipDe(req),
      agente: req.get("user-agent") || ""
    });
    cookiesDaSessao(res, resultado);
    res.json({ usuario: resultado.usuario });
  },

  async logout(req, res) {
    await authService.logout({ token: req.tokenSessao, usuarioAtual: req.usuario, ip: ipDe(req) });
    limparCookies(res);
    res.json({ ok: true });
  },

  /* Quem sou eu. Responde 200 mesmo deslogado: o cardapio publico chama isto
   * para decidir se mostra o atalho do painel. */
  eu(req, res) {
    res.json({
      autenticado: Boolean(req.usuario),
      usuario: req.usuario || null
    });
  },

  async trocarSenha(req, res) {
    const resultado = await authService.trocarPropriaSenha({
      ...req.validado.body,
      usuarioAtual: req.usuario,
      token: req.tokenSessao,
      ...contexto(req)
    });
    cookiesDaSessao(res, resultado);
    res.json({ ok: true });
  }
};
