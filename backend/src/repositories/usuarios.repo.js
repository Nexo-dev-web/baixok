/* Acesso a tabela `usuarios`.
 *
 * O hash da senha nunca sai daqui em objeto publico: `paraApi` simplesmente nao
 * o inclui, e quem precisa conferir senha usa `buscarPorUsuarioComHash`, que
 * tem nome explicito o bastante para saltar aos olhos numa revisao. */
import { getDb, paraSqlite, deSqlite } from "../db/connection.js";

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
  ativo: deSqlite(linha.ativo),
  criadoEm: linha.criado_em,
  ultimoLogin: linha.ultimo_login,
  abasVer: paraLista(linha.abas_ver),
  abasEditar: paraLista(linha.abas_editar)
});

export const usuariosRepo = {
  listar() {
    return getDb().prepare("SELECT * FROM usuarios ORDER BY nome").all().map(paraApi);
  },

  buscar(id) {
    return paraApi(getDb().prepare("SELECT * FROM usuarios WHERE id = ?").get(id));
  },

  buscarPorUsuario(usuario) {
    return paraApi(getDb().prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario));
  },

  buscarPorAuthId(authId) {
    return paraApi(getDb().prepare("SELECT * FROM usuarios WHERE auth_id = ?").get(authId));
  },

  /* Unico caminho que devolve o hash. Usado so pelo servico de autenticacao. */
  buscarPorUsuarioComHash(usuario) {
    return getDb().prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario) || null;
  },

  criar({ usuario, nome, senhaHash, papel, ativo = true, abasVer = [], abasEditar = [], authId = null }) {
    const info = getDb().prepare(`
      INSERT INTO usuarios (usuario, nome, senha_hash, papel, ativo, abas_ver, abas_editar, auth_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario,
      nome,
      senhaHash,
      papel,
      paraSqlite(ativo),
      JSON.stringify(paraLista(abasVer)),
      JSON.stringify(paraLista(abasEditar)),
      authId
    );
    return this.buscar(Number(info.lastInsertRowid));
  },

  atualizar(id, { nome, papel, ativo, abasVer, abasEditar, authId }) {
    getDb().prepare(`
      UPDATE usuarios
         SET nome = COALESCE(?, nome),
             papel = COALESCE(?, papel),
             ativo = COALESCE(?, ativo),
             abas_ver = COALESCE(?, abas_ver),
             abas_editar = COALESCE(?, abas_editar),
             auth_id = COALESCE(?, auth_id),
             atualizado_em = datetime('now')
       WHERE id = ?
    `).run(
      nome ?? null,
      papel ?? null,
      ativo === undefined ? null : paraSqlite(ativo),
      abasVer === undefined ? null : JSON.stringify(paraLista(abasVer)),
      abasEditar === undefined ? null : JSON.stringify(paraLista(abasEditar)),
      authId ?? null,
      id
    );
    return this.buscar(id);
  },

  atualizarAuthId(id, authId) {
    return this.atualizar(id, { authId });
  },

  trocarSenha(id, senhaHash) {
    getDb().prepare("UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?").run(senhaHash, id);
  },

  registrarLogin(id) {
    getDb().prepare("UPDATE usuarios SET ultimo_login = datetime('now') WHERE id = ?").run(id);
  },

  remover(id) {
    return getDb().prepare("DELETE FROM usuarios WHERE id = ?").run(id).changes > 0;
  },

  /* Impede que o ultimo administrador ativo seja rebaixado ou desligado e
   * deixe o sistema sem ninguem capaz de gerenciar usuarios. */
  contarAdminsAtivos() {
    return getDb().prepare("SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'admin' AND ativo = 1").get().total;
  }
};
