# Arquitetura

Documento de orientacao: onde as coisas ficam e por que ficam onde ficam.

## O ponto de partida

A versao anterior eram 14 arquivos na raiz, sem `package.json`. Um `app.js` de
2.364 linhas carregado igual pelas quatro paginas, um `styles.css` de 822 linhas
carregado igual pelas quatro paginas, e um `server.js` de 700 linhas.

O `server.js` era, de longe, a melhor parte do projeto — tratava path traversal,
usava comparacao em tempo constante, tinha limite por IP, expirava sessao no
servidor e ja recalculava preco. **Boa parte da logica dele foi preservada**, so
que distribuida em camadas. Este documento nao trata aquele codigo como lixo.

## Estrutura

```
backend/src/
├── index.js            sobe o processo: abre banco, migra, escuta
├── app.js              monta o Express (helmet, CSP, estaticos, ordem dos middlewares)
├── config/             env validado por schema, constantes do dominio
├── db/                 conexao, migrations, seed, importador do legado, backup
├── middlewares/        auth, RBAC, CSRF, validacao, rate limit, tratamento de erro
├── routes/             o que existe e quem pode chamar
├── controllers/        traducao HTTP <-> dominio, e so isso
├── services/           regras de negocio
├── repositories/       acesso ao banco e mapeamento tabela <-> API
├── schemas/            Zod, um por area
└── lib/                senha, geo, Mapbox, SSE, ids, log, erros

frontend/src/
├── pages/              uma pasta por tela; admin tem uma pasta por aba
├── components/         toast, impressao termica, QR da mesa
├── services/           http, api, realtime (SSE), pwa
├── styles/             base / components / pages, com uma entrada por pagina
└── utils/              DOM, formatacao, rotulos
```

## As camadas do backend

O caminho de uma requisicao e sempre o mesmo:

```
rota  →  middleware  →  controller  →  service  →  repository  →  SQLite
```

Cada camada tem uma regra que a define:

**Rota** declara o que existe e quem pode chamar. Ler a coluna do `exigirPapel`
de cima a baixo em `routes/painel.routes.js` e a matriz de permissoes inteira do
sistema. Nao ha regra de acesso escondida dentro de service nenhum.

**Middleware** e o que roda antes de qualquer regra: quem esta logado, o papel
serve, o token CSRF confere, o corpo passou no schema. Um handler so comeca a
executar depois que tudo isso passou.

**Controller** traduz HTTP e nada mais. Ele le `req.validado`, chama um service e
devolve JSON. Nenhum controller decide regra de negocio.

**Service** e onde as regras vivem. Services **nao recebem `req`** — recebem
`{ usuario, ip }`. Isso os torna testaveis sem simular o Express e impede que
alguem, la no fundo de uma regra, alcance um header ou o corpo cru.

**Repository** e o unico lugar que fala SQL. Tambem e onde vive o de-para entre
o vocabulario do banco (portugues, `snake_case`) e o contrato da API (os nomes
que o front ja usava: `name`, `minStock`, `createdAt`).

> **Sobre esse de-para:** manter os nomes antigos na API foi escolha
> deliberada. O objetivo era reduzir o risco de regressao ao portar 2.364 linhas
> de manipulacao de DOM. Renomear o contrato inteiro no mesmo passo teria
> misturado duas mudancas grandes numa so. O repositorio isola a traducao, entao
> padronizar os nomes depois e uma alteracao contida.

## Por que node:sqlite e nao better-sqlite3

`better-sqlite3` exige compilacao nativa. A rede onde este sistema e instalado
intercepta TLS, o download do binario pre-compilado falha, e o `node-gyp` nao
completa — `npm ci` simplesmente nao termina.

`node:sqlite` vem no Node, entrega a mesma API sincrona e nao tem nada para
compilar. Mesmo motivo para o hash de senha usar `scrypt` do `node:crypto` em vez
de argon2 ou bcrypt.

O `DatabaseSync` e marcado experimental no Node 24, e os scripts silenciam o
aviso. Se for preciso trocar depois, o unico arquivo afetado e
`db/connection.js`: os repositories usam `prepare/run/get/all`, que e a mesma API
do `better-sqlite3`.

## Por que SQLite e nao um JSON

O `data/baixo-k.json` era um documento unico reescrito inteiro a cada alteracao.
Duas pessoas editando o cardapio ao mesmo tempo: a ultima gravacao apagava a
primeira. O README antigo listava isso como limitacao conhecida.

Com tabelas e transacao, some. E a baixa de estoque vira atomica — que e o que
corrige a corrida descrita em [SEGURANCA.md](SEGURANCA.md).

Os itens de pedido viraram linhas proprias (`pedido_itens`). Antes eram um array
JSON dentro do pedido, e por isso "mais vendidos do mes" obrigava a carregar
todos os pedidos do periodo para dentro do navegador e percorrer na mao.

## Uma entrada por pagina no frontend

O `app.js` de 117 KB era carregado em **todas** as paginas. O cliente que so
queria ver o cardapio baixava junto o painel inteiro — cadastro, dashboard,
impressao, configuracao de entrega — e podia ler tudo aquilo no devtools.

Com quatro entradas no Vite:

| Pagina | JavaScript (gzip) |
|---|---|
| Cardapio do cliente | ~10 KB |
| Painel | ~25 KB |
| Telao | ~5 KB |
| Login | ~1,5 KB |

O codigo do painel nao chega ao navegador de quem esta pedindo uma pizza.

## DOM em vez de innerHTML

O sistema antigo montava tela com template string + `innerHTML`, defendido por um
`escapeHtml()` chamado a mao em cada interpolacao. Bastava esquecer um — e havia
varios pontos sem — para o nome de um produto virar execucao de script.

`utils/dom.js` expoe um helper `el()` que escreve texto por `textContent`, que
nao interpreta marcacao. Esquecer de escapar deixou de ser possivel porque nao ha
mais o que escapar.

Isso tem uma consequencia direta: **a CSP pode proibir `unsafe-inline` em
`script-src`**, o que so foi possivel porque os `onclick=` do HTML sairam junto,
substituidos por delegacao de evento (`delegar()`).

## Eventos: SSE com canal por publico

O sistema antigo tinha um contador de revisao: qualquer escrita mandava todo
mundo recarregar tudo. O telao refazia a consulta inteira porque alguem editou a
descricao de um produto.

Agora o evento diz **qual area mudou**, e o canal depende de **quem esta
ouvindo**:

| Canal | Quem | Recebe |
|---|---|---|
| `publico` | cardapio do cliente | produtos, promocoes, mesas, entrega |
| `operacao` | painel e cozinha (exige sessao) | tudo da operacao |
| `telao` | telao (exige sessao) | so a fila de chamada |

O canal nao vem de parametro da URL. Pedir `?canal=operacao` nao existe: cada
canal e uma rota, e as duas protegidas exigem sessao.

## Onde ficou cada parte do app.js antigo

| Antes (`app.js`) | Agora |
|---|---|
| `db()`, `saveDb()`, `sync`, `initSync` | `services/api.js` + `services/http.js` (nao ha mais banco local) |
| `renderMenu`, `renderFilters`, `signatureProducts` | `pages/menu/catalogo.js` |
| `renderCart`, cupons do cliente | `pages/menu/carrinho.js` + `carrinho-store.js` |
| `montarBuscaEndereco`, `cotarEndereco` | `pages/menu/entrega.js` |
| modo mesa / QR | `pages/menu/mesa.js` |
| `renderOrdersKanban`, `orderCard`, drag | `pages/admin/tabs/pedidos.js` |
| `renderKds` | `pages/admin/tabs/cozinha.js` |
| `renderTablesGrid`, fechamento de conta | `pages/admin/tabs/mesas.js` |
| `saveProductForm`, foto | `pages/admin/tabs/produtos.js` |
| promocoes e cupons | `pages/admin/tabs/promocoes.js` |
| `renderEntrega`, marcar loja | `pages/admin/tabs/entrega.js` |
| `renderStock` | `pages/admin/tabs/estoque.js` |
| `renderDashboard` + graficos | `pages/admin/tabs/dashboard.js` (agregacao no servidor) |
| `buildReceipt`, `sendToPrinter` | `components/impressao.js` |
| venda manual | `pages/admin/venda-manual.js` |
| `renderScreen` | `pages/telao/index.js` |
| — | `pages/admin/tabs/equipe.js` (novo) |

## O que sumiu de proposito

**O modo offline em localStorage.** Era a funcionalidade mais perigosa do
sistema: quando o servidor nao respondia, `initSync()` caia no `catch` e tudo
passava a funcionar local — inclusive o `admin.html`, sem senha nenhuma.

O cardapio do cliente mantem cache de leitura (o service worker) para abrir sem
conexao. O painel, nao: sem servidor ele mostra uma faixa de "sem conexao" e
para. E menos conveniente e e o ponto.
