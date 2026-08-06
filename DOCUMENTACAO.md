# Baixo K — documentacao do sistema

Estado do projeto e registro do que foi construido. Para instrucoes de execucao,
veja o [README](README.md).

Ultima atualizacao: 05/08/2026.

---

## 1. O que o sistema faz

Sistema completo de uma casa de pizza, burguer, massas e drinks: o cliente pede pelo
celular (delivery, retirada ou na mesa via QR code), a cozinha ve a fila, o balcao
imprime, o dono acompanha faturamento e estoque.

Sao tres telas, um servidor e um arquivo de dados.

| Arquivo | Papel | Acesso |
|---|---|---|
| `index.html` | Cardapio, carrinho e comanda de mesa | Aberto |
| `admin.html` | Painel da loja, 7 abas | Senha |
| `telao.html` | Telao de senhas do salao | Senha |
| `entrar.html` | Tela de senha do balcao | Aberto |
| `server.js` | Servidor de sincronia e regras de negocio | — |
| `app.js` | Toda a logica do navegador (1.788 linhas) | — |
| `styles.css` | Design system unico das tres telas | — |

---

## 2. MVP: o escopo original

O MVP entregue antes desta rodada era um site estatico com tres partes:

- **Cardapio** com carrinho, retirada ou entrega, envio do pedido de entrega por WhatsApp.
- **Fila de pedidos** em kanban, com arraste entre etapas.
- **Impressao termica 80mm** para Elgin i8, com via de cozinha e via de balcao.
- **Produtos, estoque e dashboard** com exportacao para planilha.

Tudo guardado no `localStorage` do navegador, publicado como site estatico no GitHub
Pages. Esse escopo continua inteiro — nada foi removido.

---

## 3. O que foi construido nesta rodada

### 3.1 Sistema Interno (importado do Claude Design)

O layout `Baixo K - Sistema Interno.dc.html` foi importado do Claude Design e
implementado sobre a base existente. O design era um prototipo React com dados fixos;
o que foi portado foi o **layout e as funcionalidades**, mantendo a camada de dados
real (impressao, exportacao, PWA, telao).

O painel passou de 5 para **7 abas**, com barra lateral fixa a partir de 1100px:

| Aba | O que faz | Novidade |
|---|---|---|
| Pedidos | Kanban de 4 colunas, arraste nos dois sentidos, chips de canal/tipo/pagamento/tempo | Reformulada |
| Cozinha (KDS) | Tela de tablet em fonte grande, toque avanca o status | **Nova** |
| Mesas (salao) | Comanda por mesa, QR code, parcial, taxa de servico, fechamento | **Nova** |
| Produtos | Tabela com miniatura e formulario fixo lateral | Reformulada |
| Promocoes | Preco promocional, cupons e dicas automaticas | **Nova** |
| Estoque | Cards com ajuste −1 / +1 / +6 | Reformulada |
| Dashboard | Filtros de periodo, status, canal e pagamento; barras; ranking; historico | Reformulada |

O lancamento manual de venda virou modal, disparado de dentro da aba Pedidos.

### 3.2 Comanda de mesa por QR code

Inspirado no fluxo do SaiPOS que voce trouxe como referencia. Cada mesa tem um QR
fixo apontando para `index.html?mesa=N`.

1. Atendente abre a mesa na aba **Mesas**. So entao o QR aceita pedidos.
2. Cliente le o QR e cai no cardapio ja identificado: **"Mesa nº 4"** fixo no topo,
   abas **Inicio** e **Comanda**.
3. Comanda vazia mostra "Voce ainda nao fez nenhum pedido" e o botao "Comecar a pedir".
4. Cada envio vira pedido na fila da cozinha **e** soma na comanda da mesa.
5. A comanda e **continua**: pede, come, pede de novo, tudo na mesma conta com taxa de
   servico de 10%.
6. Atendente fecha a conta, a nota sai no balcao e o QR trava ate a proxima abertura.

No modo mesa o carrinho nao pede endereco, telefone nem pagamento — a conta fecha no
balcao. A barra da mesa substitui a topbar normal, para o cliente sentado no salao
nunca receber o link do painel.

### 3.3 Promocoes e cupons

- **Promocoes**: preco promocional cadastrado no painel aparece no cardapio com o
  valor antigo riscado e selo verde, e e o preco que entra no carrinho.
- **Cupons**: percentual ou valor fixo, com pedido minimo e validade. Codigo aceito em
  qualquer caixa (`cinco` → `CINCO`). O desconto nunca passa do subtotal.
- Se o carrinho encolher abaixo do minimo, o cupom sai do total sozinho e avisa quanto
  falta.
- O desconto propaga para o pedido gravado, o **cupom fiscal do balcao** e a mensagem
  de **WhatsApp** da entrega. A via da cozinha continua sem valores.
- Cupom nao aparece no modo mesa: a comanda soma varias rodadas e a conta fecha no
  balcao, onde o atendente aplica desconto.

### 3.4 Servidor de sincronia

Antes, cada navegador tinha a sua copia isolada no `localStorage` — o celular do
cliente e o tablet da cozinha nao se enxergavam. O `server.js` resolve isso.

- Node **sem nenhuma dependencia**: `node server.js` e pronto.
- Estado compartilhado em `data/baixo-k.json` (esse arquivo e o banco; para backup,
  copie ele).
- Atualizacao ao vivo por **SSE** em `/api/events`: o pedido aparece no tablet sem
  ninguem recarregar.
- **Mescla por chave** em vez de substituir listas: um aparelho com a copia atrasada
  nunca apaga o pedido que outro acabou de criar.

O site **detecta sozinho** em qual modo esta. Sem o servidor, volta ao `localStorage`
e continua funcionando — publicar estatico segue valendo como demonstracao.

Rotas:

| Rota | Metodo | Acesso | Para que |
|---|---|---|---|
| `/api/state` | GET | Aberto (reduzido) | Le o estado; sem sessao, **sem a lista de pedidos** |
| `/api/me` | GET | Aberto | Diz se este aparelho tem sessao de balcao |
| `/api/login` | POST | Aberto | Troca a senha por um cookie de sessao |
| `/api/order` | POST | Aberto | Pedido do cliente, com todas as regras conferidas |
| `/api/patch` | POST | **Senha** | Escrita de estado pelo balcao |
| `/api/events` | GET | Aberto | Fluxo SSE de atualizacao |

### 3.5 Seguranca

O navegador do cliente e tratado como nao confiavel.

- **Painel e telao pedem senha**, verificada no servidor. Cookie `HttpOnly`, sessao de
  30 dias por aparelho. Senha sorteada na primeira execucao (`data/senha.txt`) ou
  definida em `BAIXOK_SENHA`.
- **O preco vem do cadastro, nunca do navegador.** Ao receber um pedido, o servidor
  descarta o preco enviado e refaz tudo: preco do produto, promocao, cupom e total.
- **Estoque, item pausado e mesa fechada** sao conferidos no servidor.
- **A lista de pedidos nao vai para quem nao tem sessao** — ela carrega nome, telefone
  e endereco de todo mundo que pediu no dia, e o cardapio e publico.

### 3.6 Correcoes de infraestrutura

- **Service worker era cache-first.** Ele respondia do cache antes de tentar a rede, com
  nome de cache fixo — por isso edicoes publicadas nao apareciam. Virou **rede
  primeiro, cache como reserva**, mantendo o funcionamento offline. Nao e mais preciso
  subir `CACHE_NAME` a cada alteracao.
- **Cache HTTP do navegador.** O `fetch` do service worker ainda consultava o cache do
  navegador. Passou a usar `cache: "no-store"`, e o servidor manda
  `Cache-Control: no-store`. Hoje um F5 simples mostra qualquer edicao.
- **Link do painel exposto ao cliente da mesa.** Em modo mesa a topbar normal continuava
  visivel, com o link "▦ Painel". A barra da mesa passou a substitui-la.

---

## 4. Como os dados sao guardados

Uma unica estrutura, com cinco colecoes:

```
products[]  id, name, category, price, stock, minStock, active, image, description
orders[]    id, createdAt, status, customer, phone, place, payment, channel,
            fulfillment, items[], subtotal, coupon, discount, total, printed
tables[]    n, status (livre | aberta | conta), openedAt, items[]
promos[]    id, productId, price, until
coupons[]   code, kind (pct | val), amount, min, once, until, uses, active
```

Status de pedido: `novo` → `preparo` → `pronto` → `entregue`, mais `cancelado`.

Com servidor, ela mora em `data/baixo-k.json` e o `localStorage` vira espelho local.
Sem servidor, o `localStorage` e a fonte unica. **O codigo de leitura e escrita e o
mesmo nos dois casos** — nenhuma tela precisou saber em que modo esta.

---

## 5. O que foi testado

Tudo abaixo rodou em navegador de verdade (Chromium via Playwright), nao por leitura
de codigo.

- **7 abas do painel** renderizam, sem erro de console, sem rolagem horizontal em 390px.
- **Fluxo de mesa ponta a ponta**, 8 passos: mesa fechada bloqueia → atendente abre →
  cliente pede → comanda acumula em duas rodadas (R$ 84,80 → R$ 134,70) → pedidos
  chegam no painel → conta fechada trava o QR de novo.
- **Sincronia entre dois aparelhos** (contextos isolados, `localStorage` separado): o
  cliente pediu no celular e o pedido apareceu no tablet **sem recarregar**; o balcao
  fechou a conta e o celular travou sozinho.
- **Regras de cupom**: inexistente, inativo, abaixo do minimo, percentual, valor fixo,
  contador de usos, limpeza apos o envio.
- **Tentativas de burla**, todas barradas:

  | Ataque | Resultado |
  |---|---|
  | `POST /api/patch` sem sessao | 401 |
  | Abrir `admin.html` sem sessao | Cai na tela de senha |
  | Ler `/api/state` sem sessao | Produtos sim, pedidos zero |
  | Forjar pizza de R$ 39,90 por R$ 0,01 | Servidor gravou R$ 39,90 |
  | Pedir 9999 unidades | Recusado por estoque |
  | Pedir em mesa fechada | Recusado |

- **Modo sem servidor** (servidor estatico sem `/api`, simulando GitHub Pages):
  cardapio, carrinho, painel, mesas e telao funcionando, `sync.on: false`, zero erros.
- **Persistencia**: servidor reiniciado, estado intacto.

---

## 6. O que falta

Em ordem de urgencia para a loja operar de verdade.

1. **Publicar.** Nada disso foi commitado nem publicado. O QR aponta para
   `nexo-dev-web.github.io/baixok/`, que ainda tem a versao antiga — **o QR fisico nao
   abre o sistema novo**. Antes de imprimir e colar os codigos, e preciso hospedar o
   `server.js` e ajustar `MENU_URL` no `app.js`.
2. **HTTPS.** Hoje a senha trafega em texto puro. Na rede local da loja tudo bem;
   exposto na internet, precisa de proxy com TLS.
3. **Fotos dos produtos.** Nenhum produto tem imagem cadastrada, e o cardapio mostra
   "Sem foto · cadastre no painel" em todos os cartoes. Como o cliente decide olhando a
   foto, isso pesa mais que qualquer outro ajuste visual.
4. **Publicar estatico nao protege o painel.** No GitHub Pages nao existe servidor para
   exigir senha, entao `admin.html` fica aberto. Estatico so como demonstracao.
5. **Uma senha so, sem usuarios.** Nao ha login por pessoa nem registro de quem fez o
   que.
6. **Cupom "uso unico por cliente" nao e aplicado.** A marca e salva e exibida, mas sem
   cadastro de cliente nao ha como saber quem ja usou.
7. **Edicao simultanea do cardapio.** Pedidos e mesas sao mesclados por chave, entao
   aparelho atrasado nao apaga o que outro criou. Ja produtos, promocoes e cupons sao
   substituidos inteiros: duas pessoas editando ao mesmo tempo, vale a ultima gravacao.
8. **Backup so no mesmo disco.** Ha copia diaria em `data/backups/` (14 dias) e a
   gravacao e atomica, mas tudo vive na mesma maquina. Protege contra arquivo
   corrompido, nao contra o computador queimar.

---

## 7. Alteracoes por arquivo

Medido contra o ultimo commit (`2f8399e`): **2.139 linhas adicionadas, 1.126 removidas**.

| Arquivo | Situacao | O que mudou |
|---|---|---|
| `server.js` | **novo** (289 linhas) | Servidor de sincronia, sessao, regras de pedido |
| `entrar.html` | **novo** (49 linhas) | Tela de senha do balcao |
| `.gitignore` | **novo** | Ignora `data/` |
| `app.js` | +1.159 | Sistema Interno, modo mesa, promocoes, cupons, sincronia |
| `styles.css` | +1.462 | Sidebar, KDS, mesas, tabelas, modais, modo mesa, cupons, login |
| `admin.html` | +439 | Reestruturado para 7 abas com barra lateral |
| `index.html` | +91 | Barra da mesa, abas, comanda, cupom, modal de pagamento |
| `README.md` | +95 | Execucao, senha, dois modos, limitacoes |
| `service-worker.js` | +19 | Rede primeiro, sem cache HTTP |

O `telao.html` nao foi alterado.

---

## 8. Origem do design

O layout veio do projeto **"Mobile app menu design directions"** no Claude Design,
arquivo `Baixo K - Sistema Interno.dc.html`. Continuam la, ainda **nao importados**:

- `Baixo K - Protótipo.dc.html` — app do cliente
- `Baixo K - Telão.dc.html` — telao do salao
- `Baixo K - Variações.dc.html`

O `support.js` que acompanha esses arquivos e o runtime do Claude Design, nao faz
parte deste projeto.
