-- Libera o papel de entregador para usuarios existentes.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('admin', 'caixa', 'cozinha', 'entregador'));
