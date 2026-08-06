import { defineConfig } from "vite";
import { resolve } from "node:path";

/* Quatro paginas, quatro entradas.
 *
 * O sistema antigo carregava um app.js de 117 KB em TODAS as paginas. O cliente
 * que so queria ver o cardapio baixava junto o painel inteiro — cadastro,
 * dashboard, impressao, configuracao de entrega — e podia ler tudo aquilo no
 * devtools. Com uma entrada por pagina, o bundle do cardapio contem so o
 * cardapio: o codigo do painel nao chega ao navegador do cliente. */
export default defineConfig({
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    /* sourcemap so em dev: em producao entregaria o codigo original legivel. */
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
        telao: resolve(__dirname, "telao.html"),
        entrar: resolve(__dirname, "entrar.html")
      }
    }
  },
  server: {
    port: 5173,
    /* Em dev o front roda aqui e a API no 8000. O proxy faz as chamadas saírem
     * da mesma origem, entao o cookie de sessao funciona igual a producao e nao
     * precisamos afrouxar CORS so para desenvolver. */
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: false
      }
    }
  }
});
