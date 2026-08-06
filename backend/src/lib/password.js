/* Hash de senha com scrypt do proprio Node.
 *
 * Escolha deliberada sobre argon2/bcrypt: os dois exigem compilacao nativa, e a
 * maquina da loja instala pela rede que ja barrou o download de binario
 * pre-compilado. scrypt e KDF com custo de memoria, esta na biblioteca padrao e
 * nao adiciona nada ao `npm ci` — que aqui vale mais do que a margem teorica do
 * argon2id.
 *
 * Formato guardado: scrypt$N$r$p$salt_b64$hash_b64. Os parametros vao junto do
 * hash, entao aumentar o custo depois nao invalida a senha de ninguem. */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const N = 2 ** 15;   // 32768 iteracoes
const r = 8;
const p = 1;
const TAMANHO_CHAVE = 64;
/* 128 * N * r = ~33 MB. O padrao do Node e 32 MB e derrubaria a chamada. */
const MAX_MEM = 160 * N * r;

export async function gerarHashSenha(senha) {
  if (typeof senha !== "string" || senha.length < 10) {
    throw new Error("A senha precisa de pelo menos 10 caracteres.");
  }
  const salt = randomBytes(16);
  const hash = await scryptAsync(senha.normalize("NFKC"), salt, TAMANHO_CHAVE, { N, r, p, maxmem: MAX_MEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(senha, guardado) {
  if (typeof senha !== "string" || typeof guardado !== "string") return false;
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, nTexto, rTexto, pTexto, saltB64, hashB64] = partes;
  const parametros = { N: Number(nTexto), r: Number(rTexto), p: Number(pTexto) };
  if (!Number.isInteger(parametros.N) || !Number.isInteger(parametros.r) || !Number.isInteger(parametros.p)) return false;

  const esperado = Buffer.from(hashB64, "base64");
  try {
    const calculado = await scryptAsync(
      senha.normalize("NFKC"),
      Buffer.from(saltB64, "base64"),
      esperado.length,
      { ...parametros, maxmem: 160 * parametros.N * parametros.r }
    );
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/* Usado quando o usuario nao existe. Sem isso, "usuario inexistente" responde
 * na hora e "senha errada" demora o tempo do scrypt — a diferenca revela quais
 * logins existem. */
export async function gastarTempoDeHash() {
  await scryptAsync("comparacao-descartada", randomBytes(16), TAMANHO_CHAVE, { N, r, p, maxmem: MAX_MEM });
}
