-- Troco do pedido. -- versao Postgres (Supabase).
--
-- REAL no Postgres e float de 4 bytes, metade do REAL do SQLite. DOUBLE
-- PRECISION para bater com as outras colunas de dinheiro do 001.

ALTER TABLE pedidos ADD COLUMN troco_para DOUBLE PRECISION;
