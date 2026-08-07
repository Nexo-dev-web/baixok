import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { validarCorpo } from "../middlewares/validate.js";
import { limiteLogin } from "../middlewares/rateLimit.js";
import { exigirLogin } from "../middlewares/auth.js";
import { loginSchema, trocarSenhaSchema } from "../schemas/auth.schema.js";

export const rotasAuth = Router();

rotasAuth.post("/login", limiteLogin, validarCorpo(loginSchema), authController.login);
rotasAuth.post("/logout", authController.logout);
rotasAuth.get("/eu", authController.eu);
rotasAuth.post("/senha", exigirLogin, validarCorpo(trocarSenhaSchema), authController.trocarSenha);
