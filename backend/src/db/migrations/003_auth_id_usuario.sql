-- Vincula cada usuario local ao usuario do Supabase Auth.
--
-- Isso permite usar o Supabase como fonte de autenticacao e manter o banco
-- local so para perfil, papeis, permissões e auditoria.

ALTER TABLE usuarios ADD COLUMN auth_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_id ON usuarios(auth_id);
