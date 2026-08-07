/* Protecao contra CSRF.
 *
 * O sistema antigo dependia so de SameSite=Lax. Lax barra o POST vindo de outro
 * site, mas nao cobre tudo: navegador antigo sem suporte a SameSite trata o
 * cookie como None, e um subdominio comprometido continua sendo "mesmo site".
 * Aqui a sessao carrega um token proprio que precisa ser devolvido no cabecalho
 * — coisa que uma pagina de outra origem nao consegue ler nem adivinhar.
 *
 * Duplo controle: o cookie CSRF e legivel pelo JavaScript da propria pagina (e
 * precisa ser), mas o que vale e a comparacao com o hash guardado na sessao no
 * servidor. Roubar o cookie sem ter a sessao nao serve de nada. */
import { timingSafeEqual } from "node:crypto";
import { hashToken } from "../repositories/sessoes.repo.js";
import { ErroApp } from "../lib/errors.js";

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

function iguais(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function exigirCsrf(req, _res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  /* Rota publica sem sessao (o pedido do cliente) nao tem o que proteger: nao
   * ha credencial ambiente para um site terceiro reaproveitar. */
  if (!req.sessao) return next();

  const enviado = req.get("X-CSRF-Token") || req.body?._csrf;
  if (!enviado) {
    return next(new ErroApp("Requisicao sem token de seguranca. Recarregue a pagina.", 403, "csrf_ausente"));
  }
  if (!iguais(hashToken(enviado), req.sessao.csrfHash)) {
    return next(new ErroApp("Token de seguranca invalido. Recarregue a pagina.", 403, "csrf_invalido"));
  }
  next();
}
