/* Acesso a tabela `usuarios`.
 *
 * O hash da senha nunca sai daqui em objeto publico: `paraApi` simplesmente nao
 * o inclui, e quem precisa conferir senha usa `buscarPorUsuarioComHash`, que
 * tem nome explicito o bastante para saltar aos olhos numa revisao. */
import { getDb, paraSqlite, deSqlite } from "../db/connection.js";

const paraApi = linha => linha && ({
  id: linha.id,
  usuario: linha.usuario,
  nome: linha.nome,
  papel: linha.papel,
  ativo: deSqlite(linha.ativo),
  criadoEm: linha.criado_em,
  ultimoLogin: linha.ultimo_login
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

  /* Unico caminho que devolve o hash. Usado so pelo servico de autenticacao. */
  buscarPorUsuarioComHash(usuario) {
    return getDb().prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario) || null;
  },

  criar({ usuario, nome, senhaHash, papel, ativo = true }) {
    const info = getDb().prepare(`
      INSERT INTO usuarios (usuario, nome, senha_hash, papel, ativo)
      VALUES (?, ?, ?, ?, ?)
    `).run(usuario, nome, senhaHash, papel, paraSqlite(ativo));
    return this.buscar(Number(info.lastInsertRowid));
  },

  atualizar(id, { nome, papel, ativo }) {
    getDb().prepare(`
      UPDATE usuarios
         SET nome = COALESCE(?, nome),
             papel = COALESCE(?, papel),
             ativo = COALESCE(?, ativo),
             atualizado_em = datetime('now')
       WHERE id = ?
    `).run(nome ?? null, papel ?? null, ativo === undefined ? null : paraSqlite(ativo), id);
    return this.buscar(id);
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
