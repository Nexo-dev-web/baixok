-- Vincula cada usuario local ao usuario do Supabase Auth. -- versao Postgres.
--
-- Isso permite usar o Supabase como fonte de autenticacao e manter o banco
-- local so para perfil, papeis, permissões e auditoria.
--
-- Fica TEXT, como no ../003_auth_id_usuario.sql, para o app continuar tratando
-- o id como string. Estando tudo dentro do Supabase, da para apertar depois
-- para UUID REFERENCES auth.users(id) ON DELETE SET NULL — ai o banco recusa
-- vinculo para usuario que nao existe no Auth, o que hoje ninguem confere.

ALTER TABLE usuarios ADD COLUMN auth_id TEXT;

-- Indice unico com coluna anulavel: no Postgres, como no SQLite, varios NULL
-- convivem — usuario sem conta no Auth nao conflita com outro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_id ON usuarios(auth_id);
