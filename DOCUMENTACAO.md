# Baixo K — documentacao do sistema

Estado do projeto e registro do que foi construido. Para instrucoes de execucao,
veja o [README](README.md).

Ultima atualizacao: 06/08/2026.

---

## 1. O que o sistema faz

Sistema completo de uma casa de pizza, burguer, massas e drinks: o cliente pede pelo
celular (delivery, retirada ou na mesa via QR code), a cozinha ve a fila, o balcao
imprime, o dono acompanha faturamento e estoque.

Sao tres telas, um servidor e um arquivo de dados.

| Arquivo | Papel | Acesso |
|---|---|---|
| `index.html` | Cardapio, carrinho e comanda de mesa | Aberto |
| `admin.html` | Painel da loja, 8 abas | Senha |
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

O painel passou de 5 para **8 abas**, com barra lateral fixa a partir de 1100px:

| Aba | O que faz | Novidade |
|---|---|---|
| Pedidos | Kanban de 4 colunas, arraste nos dois sentidos, chips de canal/tipo/pagamento/tempo | Reformulada |
| Cozinha (KDS) | Tela de tablet em fonte grande, toque avanca o status | **Nova** |
| Mesas (salao) | Comanda por mesa, QR code, parcial, taxa de servico, fechamento | **Nova** |
| Produtos | Tabela com miniatura e formulario fixo lateral | Reformulada |
| Promocoes | Preco promocional, cupons e dicas automaticas | **Nova** |
| Area de entrega | Ponto da loja e faixas de raio via Mapbox | **Nova** |
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
| `/api/entrega/buscar` | GET | Aberto | Busca endereco na Mapbox pelo servidor |
| `/api/entrega/taxa` | GET | Aberto | Distancia e taxa de um endereco |
| `/api/entrega/mapa` | GET | Aberto | Imagem do mapa da loja |
| `/api/entrega/status` | GET | Aberto | Se ha token, o token publico e o ponto da loja |

### 3.5 Area de entrega com Mapbox

Ate entao nao havia nada de area de entrega: o cliente digitava o endereco em texto
livre e quem lia o WhatsApp decidia se valia a pena.

Agora o painel tem a aba **Area de entrega**: marca-se o ponto da loja pela busca de
endereco e criam-se faixas de raio, cada uma com taxa e pedido minimo. No carrinho, o
cliente busca o endereco, escolhe entre as sugestoes e ve na hora a distancia, a taxa
e o total — ou o aviso de que esta fora da area.

Decisoes tomadas:

- **Distancia em linha reta**, que e o que "raio" significa. Nao consome a API de
  rotas, entao o custo cai para so a geocodificacao.
- **Nenhuma coordenada de cliente e gravada.** O plano gratuito da Mapbox e o de
  geocodificacao *temporaria*, que proibe armazenamento permanente. Guardamos o
  endereco em texto, a distancia e o valor — nunca latitude e longitude de quem pediu.
- **A taxa e recalculada no servidor** no momento do pedido, geocodificando o endereco
  de novo. Coordenada mandada pelo navegador nao entra na conta: seria so trocar por
  uma perto da loja para pagar frete de graca.
- **Sem token, tudo continua funcionando** como antes: endereco livre, sem taxa.

#### A caixa de busca

A busca e o widget oficial da Mapbox, o `mapbox-gl-geocoder`, com os parametros que
importam para endereco brasileiro:

| Parametro | Valor | Por que |
|---|---|---|
| `countries` | `br` | corta o resto do mundo |
| `language` | `pt-BR` | resultado em portugues |
| `types` | `address,postcode,poi` | aceita rua com numero, CEP e ponto de referencia |
| `proximity` | ponto da loja | ordena o que esta perto primeiro |
| `bbox` | caixa em volta da loja | "Rua Sacadura Cabral" existe em varias cidades |

O `bbox` sai da maior faixa cadastrada vezes 1,6, entao acompanha sozinho quem
aumenta a area de entrega. No painel ele nao e aplicado: quem procura o endereco da
loja pode estar corrigindo um ponto errado.

O widget roda no navegador e por isso precisa do token la. Token publico (`pk.`)
existe para esse uso e a Mapbox o trata como exposto — quem protege ele e a restricao
de dominio na conta. Token secreto (`sk.`) o servidor nunca entrega.

Ha tres caminhos reserva, todos testados: token secreto, CDN da Mapbox bloqueada na
rede da loja, e ausencia de token. Nos dois primeiros o campo comum reaparece e a
busca volta a passar pelo `server.js`; no terceiro o endereco e livre, sem taxa.

### 3.6 Seguranca

O navegador do cliente e tratado como nao confiavel.

- **Painel e telao pedem senha**, verificada no servidor. Cookie `HttpOnly`, sessao de
  30 dias por aparelho. Senha sorteada na primeira execucao (`data/senha.txt`) ou
  definida em `BAIXOK_SENHA`.
- **O preco vem do cadastro, nunca do navegador.** Ao receber um pedido, o servidor
  descarta o preco enviado e refaz tudo: preco do produto, promocao, cupom e total.
- **Estoque, item pausado e mesa fechada** sao conferidos no servidor.
- **A lista de pedidos nao vai para quem nao tem sessao** — ela carrega nome, telefone
  e endereco de todo mundo que pediu no dia, e o cardapio e publico.

### 3.7 Correcoes de infraestrutura

- **Service worker era cache-first.** Ele respondia do cache antes de tentar a rede, com
  nome de cache fixo — por isso edicoes publicadas nao apareciam. Virou **rede
  primeiro, cache como reserva**, mantendo o funcionamento offline. Nao e mais preciso
  subir `CACHE_NAME` a cada alteracao.
- **Cache HTTP do navegador.** O `fetch` do service worker ainda consultava o cache do
  navegador. Passou a usar `cache: "no-store"`, e o servidor manda
  `Cache-Control: no-store`. Hoje um F5 simples mostra qualquer edicao.
- **Link do painel exposto ao cliente da mesa.** Em modo mesa a topbar normal continuava
  visivel, com o link "▦ Painel". A barra da mesa passou a substitui-la.

### 3.8 Auditoria: o que estava quebrado

Revisao linha a linha do sistema inteiro. Cada item abaixo foi reproduzido antes de
ser corrigido, e verificado depois.

#### Falhas de seguranca

| O que | Como era explorado | Gravidade |
|---|---|---|
| **Senha do balcao na web** | `GET /data/senha.txt` devolvia `200 OK` com a senha em texto puro | Critica |
| **Banco de clientes na web** | `GET /data/baixo-k.json` devolvia nome, telefone e endereco de todos os pedidos | Critica |
| **Senha do painel contornavel** | `/Admin.html`, `//admin.html` e `/%61dmin.html` serviam o painel sem sessao: o Set comparava o texto cru da URL, e o Windows abre o arquivo com qualquer caixa | Critica |
| **Codigo-fonte na web** | `/server.js` e `/package.json` eram servidos | Media |
| **Forca bruta na senha** | 6 digitos, sem limite de tentativas: 900 mil combinacoes varridas em horas | Alta |
| **Sessao sem prazo** | `Max-Age` do cookie so vale no navegador; quem rouba o cookie ignora. No servidor a sessao nunca expirava | Alta |
| **Saida da pasta do site** | `file.startsWith(ROOT)` sem separador: uma pasta vizinha `Baixo Cais Antigo` passava no teste | Media |
| **Cota da Mapbox aberta** | `/api/entrega/buscar` sem limite virava geocodificador gratuito para qualquer um, gastando as 100 mil buscas do mes da loja | Media |
| **SSE sem teto** | conexoes ilimitadas em `/api/events` derrubavam o servidor de uma maquina so | Media |

O caminho pedido agora e resolvido **antes** de qualquer decisao: decodifica, normaliza
`..`, `.` e barras repetidas, confere que nao saiu da pasta, e so entao pergunta se
aquele arquivo pede senha. Alem disso a pasta `data/`, os dotfiles e tudo que nao tenha
extensao do proprio site ficam fora por regra, nao por lista de excecoes.

#### Bugs que custavam dinheiro ou dados

- **Estoque nunca reservado.** So baixava quando alguem clicava "entregue" no painel.
  Ate la a conferencia comparava com um estoque que nao descia: com 18 pizzas
  cadastradas, 18 clientes pediam 18 cada um e **todos os pedidos eram aceitos**. A casa
  vendia o que nao tinha e so descobria na hora de montar. Agora baixa no aceite, e
  recusar devolve.
- **Apagar o cardapio zerava tudo.** `db()` testava `stored?.products?.length`: cardapio
  vazio caia no ramo do banco novo e recriava do zero, levando junto pedidos, mesas,
  promocoes e cupons — com os produtos de exemplo voltando sozinhos.
- **Apagar o ponto da loja gravava `0, 0`.** `Number(null)` vale 0 e 0 e finito, entao a
  validacao aceitava. A loja ia parar no golfo da Guine e nenhum endereco do Rio caia
  em faixa nenhuma.
- **Faixa de raio removida pelo indice errado.** A tela desenhava ordenado por km e
  gravava pelo indice da lista crua: baixar o km de uma faixa fazia o "Remover"
  seguinte apagar outra.
- **Preco velho no carrinho.** O carrinho guardava o preco do momento da inclusao. Preco
  alterado ou promocao encerrada enquanto o cliente decidia: a tela mostrava um valor e
  o servidor cobrava outro, sem explicacao. Agora o carrinho e reconciliado com o
  cardapio a cada desenho e o cliente e avisado do que mudou.
- **Mesa aberta nao desbloqueava a tela do cliente.** O caso comum do salao: o cliente
  le o QR antes de o atendente abrir a mesa. Quando o atendente abria, so o texto da
  barra mudava — a tela de bloqueio continuava ate ele recarregar, que e exatamente o
  que a sincronia existe para evitar.
- **Arquivo com BOM derrubava o banco.** Quem abrisse `baixo-k.json` no Bloco de Notas e
  salvasse por engano fazia o `JSON.parse` falhar, e o servidor voltava para o backup da
  vespera sem que ninguem notasse.
- **Widget de endereco nao limpava.** Depois de enviar um pedido, o widget continuava
  mostrando o endereco anterior enquanto o campo real ja estava vazio: o proximo envio
  reclamava de endereco em branco com o endereco na tela.

#### Desempenho

`db()` reparseava o JSON inteiro do `localStorage` a cada chamada, e um desenho de tela
faz dezenas — `getProducts`, `getOrders`, `getTables`, `getPromos` e `getCoupons` sao
todos `db()` por dentro, e listas que numeram pedidos chamam `getOrders` **uma vez por
linha**. Com o movimento de um dia guardado, o painel travava a cada atualizacao de 6
segundos. Agora o resultado fica em cache, invalidado na escrita e quando outra aba
grava.

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
- **Widget da Mapbox no carrinho**: monta, some o campo antigo, busca, lista, escolha,
  taxa no total (R$ 119,70 + R$ 5,00), botao de limpar zera a cotacao, voltar para
  retirada nao deixa taxa presa.
- **Widget no painel**: escolher no widget move o ponto da loja, e o redesenho de 6 em
  6 segundos do painel nao apaga mais o que se esta digitando.
- **Parametros que chegam na Mapbox**, conferidos na requisicao real:
  `country=br`, `language=pt-BR`, `types=address,postcode,poi`, `proximity` na loja,
  `bbox` de 19 km em volta (12 km da maior faixa x 1,6), `limit=5`.
- **Os tres caminhos reserva**: token secreto, CDN bloqueada e sem token. Nos dois
  primeiros a busca pelo servidor cotou os mesmos R$ 5,00; no terceiro o pedido
  continuou possivel com endereco livre.
- **Coordenada forjada**: `/api/entrega/taxa` com lat/lng colada na loja devolveu
  R$ 5,00 para um endereco a 21,5 km — e o pedido com o mesmo endereco foi recusado
  com *"endereco fora da area de entrega (21.5 km da loja)"*. A previa engana a tela,
  nao a cobranca.

### Auditoria (rodada 3.8)

- **22 sondas de seguranca**, todas reproduzidas antes da correcao e refeitas depois:
  8 arquivos privados, 10 grafias de `/admin.html` e `/telao.html`, 4 tentativas de sair
  da pasta. Mais forca bruta na senha, escrita sem sessao e o cardapio publico
  continuando de pe.
- **Ponto da loja sem Mapbox**: coordenada colada, coordenada invertida corrigida,
  coordenada fora do Brasil recusada, GPS do aparelho, e faixas criadas e removidas com
  o token desligado.
- **Estoque**: 17 → 14 no aceite, pedido de 9999 unidades recusado, recusa devolvendo
  para 17. Pelo caminho da mesa tambem: 15 → 13.
- **Mesa ponta a ponta em dois aparelhos isolados**: mesa fechada bloqueia, atendente
  abre e a tela do cliente **destrava sozinha**, pedido entra na comanda e na fila,
  balcao ve sem recarregar, conta fechada trava o QR de novo.
- **BI**: faturamento de R$ 218,50 contando pedido nao entregue, R$ 14,00 identificados
  como frete, ticket medio de R$ 51,13 sem frete, 2 pedidos em aberto sinalizados,
  pedido das 23h50 dentro do dia operacional e o de 3 dias atras fora, produto renomeado
  sem partir o ranking.
- **Regressao**: 8 abas em 1440px e 390px, sem rolagem lateral, sem erro de console.

---

## 6. O que falta

Em ordem de urgencia para a loja operar de verdade.

0. **A Mapbox de verdade nunca respondeu.** Toda a area de entrega foi verificada
   contra uma simulacao local que fala os dois dialetos da API (v6 no servidor, v5 no
   widget), com enderecos e coordenadas reais do Rio. O formato foi escrito contra a
   documentacao e conferido campo a campo, mas so um token real prova. Falta a conta
   em `account.mapbox.com` — ela fica no nome do dono da loja.

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
