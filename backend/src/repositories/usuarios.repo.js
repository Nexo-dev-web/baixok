/* Acesso a tabela `usuarios`.
 *
 * O hash da senha nunca sai daqui em objeto publico: `paraApi` simplesmente nao
 * o inclui, e quem precisa conferir senha usa `buscarPorUsuarioComHash`, que
 * tem nome explicito o bastante para saltar aos olhos numa revisao. */
import { todos, um, alteradas, paraBanco, doBanco } from "../db/postgres.js";

const paraLista = valor => {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor.filter(Boolean);
  if (typeof valor === "string") {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return valor.split(",").map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const paraApi = linha => linha && ({
  id: linha.id,
  usuario: linha.usuario,
  nome: linha.nome,
  papel: linha.papel,
  ativo: doBanco(linha.ativo),
  criadoEm: linha.criado_em,
  ultimoLogin: linha.ultimo_login,
  abasVer: paraLista(linha.abas_ver),
  abasEditar: paraLista(linha.abas_editar)
});

export const usuariosRepo = {
  async listar() {
    return (await todos("SELECT * FROM usuarios ORDER BY nome")).map(paraApi);
  },

  async buscar(id) {
    return paraApi(await um("SELECT * FROM usuarios WHERE id = ?", [id]));
  },

  /* `usuario` e citext no Postgres, entao a comparacao continua ignorando
   * maiusculas como o COLLATE NOCASE do SQLite fazia. */
  async buscarPorUsuario(usuario) {
    return paraApi(await um("SELECT * FROM usuarios WHERE usuario = ?", [usuario]));
  },

  async buscarPorAuthId(authId) {
    return paraApi(await um("SELECT * FROM usuarios WHERE auth_id = ?", [authId]));
  },

  /* Unico caminho que devolve o hash. Usado so pelo servico de autenticacao. */
  async buscarPorUsuarioComHash(usuario) {
    return await um("SELECT * FROM usuarios WHERE usuario = ?", [usuario]);
  },

  /* RETURNING no lugar do lastInsertRowid: o Postgres nao tem rowid, e a coluna
   * id agora e IDENTITY. */
  async criar({ usuario, nome, senhaHash, papel, ativo = true, abasVer = [], abasEditar = [], authId = null }) {
    return paraApi(await um(`
      INSERT INTO usuarios (usuario, nome, senha_hash, papel, ativo, abas_ver, abas_editar, auth_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      usuario,
      nome,
      senhaHash,
      papel,
      paraBanco(ativo),
      JSON.stringify(paraLista(abasVer)),
      JSON.stringify(paraLista(abasEditar)),
      authId
    ]));
  },

  /* Os `::tipo` nos COALESCE nao sao enfeite: quando o parametro chega NULL, o
   * Postgres nao consegue deduzir o tipo sozinho e recusa a consulta com
   * "could not determine data type". O SQLite aceitava sem reclamar. */
  async atualizar(id, { nome, papel, ativo, abasVer, abasEditar, authId }) {
    return paraApi(await um(`
      UPDATE usuarios
         SET nome = COALESCE(?::text, nome),
             papel = COALESCE(?::text, papel),
             ativo = COALESCE(?::integer, ativo),
             abas_ver = COALESCE(?::text, abas_ver),
             abas_editar = COALESCE(?::text, abas_editar),
             auth_id = COALESCE(?::text, auth_id),
             atualizado_em = now()
       WHERE id = ?
      RETURNING *
    `, [
      nome ?? null,
      papel ?? null,
      ativo === undefined ? null : paraBanco(ativo),
      abasVer === undefined ? null : JSON.stringify(paraLista(abasVer)),
      abasEditar === undefined ? null : JSON.stringify(paraLista(abasEditar)),
      authId ?? null,
      id
    ]));
  },

  async atualizarAuthId(id, authId) {
    return this.atualizar(id, { authId });
  },

  async trocarSenha(id, senhaHash) {
    await alteradas("UPDATE usuarios SET senha_hash = ?, atualizado_em = now() WHERE id = ?", [senhaHash, id]);
  },

  async registrarLogin(id) {
    await alteradas("UPDATE usuarios SET ultimo_login = now() WHERE id = ?", [id]);
  },

  async remover(id) {
    return (await alteradas("DELETE FROM usuarios WHERE id = ?", [id])) > 0;
  },

  /* Impede que o ultimo administrador ativo seja rebaixado ou desligado e
   * deixe o sistema sem ninguem capaz de gerenciar usuarios. */
  async contarAdminsAtivos() {
    const linha = await um("SELECT COUNT(*)::int AS total FROM usuarios WHERE papel = 'admin' AND ativo = 1");
    return linha.total;
  }
};
