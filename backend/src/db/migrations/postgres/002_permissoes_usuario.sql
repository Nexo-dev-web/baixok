-- Permissoes por aba para usuarios. -- versao Postgres (Supabase).
--
-- Mantemos o papel para a autorizacao ampla da API e adicionamos as listas de
-- abas que cada usuario pode ver ou editar no painel.
--
-- Identico ao ../002_permissoes_usuario.sql: nada aqui e dialeto SQLite. As
-- listas seguem TEXT com JSON dentro, como no outro banco, porque o app faz o
-- JSON.parse na leitura; trocar para JSONB exigiria mexer no repositorio.

ALTER TABLE usuarios ADD COLUMN abas_ver TEXT NOT NULL DEFAULT '[]';
ALTER TABLE usuarios ADD COLUMN abas_editar TEXT NOT NULL DEFAULT '[]';

UPDATE usuarios
   SET abas_ver = CASE
                    WHEN papel = 'admin' THEN '["pedidos","mesas","produtos","promos","entrega","estoque","dashboard","plano","usuarios"]'
                    WHEN papel = 'caixa' THEN '["pedidos","mesas","estoque"]'
                    WHEN papel = 'cozinha' THEN '["pedidos"]'
                    ELSE '["pedidos"]'
                  END,
       abas_editar = CASE
                      WHEN papel = 'admin' THEN '["pedidos","mesas","produtos","promos","entrega","estoque","dashboard","plano","usuarios"]'
                      WHEN papel = 'caixa' THEN '["pedidos","mesas"]'
                      WHEN papel = 'cozinha' THEN '["pedidos"]'
                      ELSE '[]'
                    END;

CREATE INDEX IF NOT EXISTS idx_usuarios_abas_ver ON usuarios(abas_ver);
