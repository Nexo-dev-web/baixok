/* Ponto de entrada: abre o banco, aplica migrations, sobe o servidor. */
import { env } from "./config/env.js";
import { abrirBanco, fecharBanco } from "./db/connection.js";
import { migrar } from "./db/migrate.js";
import { criarApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { iniciarPing } from "./lib/events.js";
import { sessoesRepo } from "./repositories/sessoes.repo.js";
import { usuariosRepo } from "./repositories/usuarios.repo.js";
import { limparFalhasVencidas } from "./services/auth.service.js";
import { fazerBackup } from "./db/backup.js";

abrirBanco();
migrar();

const app = criarApp();
const servidor = app.listen(env.PORT, () => {
  logger.info(`Baixo K no ar em http://localhost:${env.PORT}`, {
    ambiente: env.NODE_ENV,
    banco: env.DB_FILE
  });

  /* Instalacao nova sem ninguem cadastrado nao pode ficar em silencio: sem esse
   * aviso, o primeiro login e impossivel e nao ha pista do porque. */
  if (usuariosRepo.contarAdminsAtivos() === 0) {
    logger.warn("Nenhum administrador cadastrado. Rode `npm run seed` para criar o primeiro acesso.");
  }
});

iniciarPing();

/* Faxina de hora em hora: sessao vencida, trava de login expirada e o backup
 * diario do banco. */
const faxina = setInterval(() => {
  const removidas = sessoesRepo.limparVencidas();
  limparFalhasVencidas();
  fazerBackup();
  if (removidas) logger.debug("Sessoes vencidas removidas", { removidas });
}, 60 * 60 * 1000);
faxina.unref();

fazerBackup();

function encerrar(sinal) {
  logger.info(`Encerrando (${sinal})`);
  servidor.close(() => {
    fecharBanco();
    process.exit(0);
  });
  /* Se alguma conexao SSE nao fechar sozinha, nao ficamos presos para sempre. */
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("unhandledRejection", motivo => {
  logger.error("Promise rejeitada sem tratamento", { erro: String(motivo) });
});
