/* Log estruturado sem dependencia externa.
 *
 * O suficiente para investigar um incidente: nivel, instante, mensagem e
 * contexto em JSON. Nunca registra senha, token de sessao nem corpo de pedido
 * com dado pessoal — quem chama e responsavel por passar so o necessario. */
import { env } from "../config/env.js";

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const minimo = NIVEIS[env.LOG_LEVEL] ?? NIVEIS.info;

/* Rede de seguranca contra o descuido de logar o objeto inteiro. */
const CAMPOS_SENSIVEIS = new Set([
  "senha", "password", "password_hash", "passwordHash", "token", "token_hash",
  "csrf", "csrfToken", "cookie", "authorization", "access_token", "MAPBOX_TOKEN"
]);

function limpar(valor, profundidade = 0) {
  if (profundidade > 4 || valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.slice(0, 20).map(item => limpar(item, profundidade + 1));
  return Object.fromEntries(
    Object.entries(valor).map(([chave, item]) =>
      CAMPOS_SENSIVEIS.has(chave) ? [chave, "[oculto]"] : [chave, limpar(item, profundidade + 1)]
    )
  );
}

function emitir(nivel, mensagem, contexto) {
  if (NIVEIS[nivel] < minimo) return;
  const linha = { nivel, hora: new Date().toISOString(), mensagem, ...limpar(contexto || {}) };
  const saida = nivel === "error" || nivel === "warn" ? console.error : console.log;
  saida(env.ehProducao ? JSON.stringify(linha) : `[${nivel}] ${mensagem}`, env.ehProducao ? "" : (contexto ? limpar(contexto) : ""));
}

export const logger = {
  debug: (mensagem, contexto) => emitir("debug", mensagem, contexto),
  info: (mensagem, contexto) => emitir("info", mensagem, contexto),
  warn: (mensagem, contexto) => emitir("warn", mensagem, contexto),
  error: (mensagem, contexto) => emitir("error", mensagem, contexto)
};
