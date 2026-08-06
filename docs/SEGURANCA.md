# Seguranca

O que foi corrigido, o que continua valendo e o que ainda e limitacao.

## Modelo de ameaca

Quem pode atacar este sistema, na ordem em que importa:

1. **O navegador do cliente.** E aberto para a internet e nao ha como confiar em
   nada que venha dele. Preco, desconto, taxa, quantidade: tudo refeito no
   servidor.
2. **Quem esta na rede da loja.** Wifi de restaurante costuma ser compartilhado
   com o cliente. Alcancar o painel pela rede nao pode dar acesso.
3. **Alguem de dentro sem intencao ruim.** Erro operacional em tela sem confirmacao,
   clique duplo, ajuste no produto errado. Auditoria e transacao existem para isso.
4. **Quem consegue ler o disco.** Backup em pendrive, pasta copiada por e-mail.

## O que estava errado

### 1. O modo offline era um bypass de autenticacao

Era o problema mais grave. `initSync()` tentava falar com o servidor; falhando,
caia no `catch` e o sistema inteiro passava a operar sobre o `localStorage` —
**incluindo o `admin.html`**, que nesse modo funcionava sem senha nenhuma.

Bastava derrubar a rede, ou abrir os arquivos direto, ou acessar a versao
publicada em host estatico, para ter o painel completo. O `MENU_URL` no codigo
apontava para um GitHub Pages.

**Agora:** o painel exige a API para tudo. Sem servidor, mostra "sem conexao" e
para. O cardapio do cliente mantem cache de leitura para abrir offline, mas
enviar pedido exige servidor.

### 2. Todo o codigo do painel ia para o cliente

`index.html` carregava o mesmo `app.js` de 117 KB que o painel. Regras de preco,
logica de cupom, taxa de servico, configuracao de entrega, dashboard — tudo
legivel no devtools de qualquer visitante.

**Agora:** uma entrada de build por pagina. O bundle do cardapio nao contem o
codigo do painel.

### 3. `/api/state` vazava regra de negocio para anonimos

A funcao `estadoPara(balcao)` removia apenas `orders`. Continuava devolvendo:

- **todos os cupons** — codigo, valor, minimo, e tambem os inativos, ou seja, a
  campanha da semana que vem antes de ir ao ar;
- todas as promocoes;
- estoque e estoque minimo de cada produto;
- as faixas de entrega com taxa e pedido minimo;
- os itens consumidos por **todas** as mesas do salao.

**Agora:** `/api/publico/cardapio` devolve produtos a venda, ja com o preco
promocional aplicado, sem estoque. Nao existe rota publica que liste cupons — o
cliente valida um codigo por vez em `/api/publico/cupons/validar`, e a resposta e
so o efeito no carrinho dele. A comanda de mesa devolve uma mesa, a pedida.

### 4. Corrida de estoque

Em `registrarPedido` havia um `await geocodificar()` **entre** conferir o estoque
e baixa-lo. Dois pedidos simultaneos passavam pela mesma verificacao e a casa
vendia o que nao tinha.

**Agora:** toda chamada de rede acontece antes; a conferencia e a baixa ficam numa
transacao sincrona, e o proprio `UPDATE` traz `WHERE estoque >= ?`. Se outro
pedido levou a ultima unidade, `changes` volta 0, a transacao inteira e desfeita
e nada fica pela metade.

Coberto pelo teste *"pedidos simultaneos nao vendem alem do estoque"*: dez
pedidos disparados juntos contra estoque de cinco, e exatamente cinco passam.

### 5. Autorizacao binaria e senha unica

Havia uma senha de 6 digitos, guardada em texto puro em `data/senha.txt`,
compartilhada por todo mundo. A sessao era um booleano. Passado o portao, quem
estava na cozinha podia apagar o cardapio inteiro. E "quem cancelou o pedido de
sabado?" era pergunta sem resposta possivel.

**Agora:** login por pessoa, senha com hash `scrypt`, tres papeis com permissao
declarada rota a rota, e auditoria de tudo que mexe em dinheiro, estoque ou
cadastro.

### 6. `/api/patch` aceitava qualquer coisa

Uma sessao de balcao podia substituir integralmente produtos, promocoes e cupons,
sem validacao de esquema — so `delivery` era checado. Um `price: -5` entrava.

**Agora:** cada recurso tem rota propria com schema Zod `.strict()`. Campo
desconhecido derruba a requisicao em vez de ser aceito calado.

### 7. Tokens de sessao em texto puro

`data/sessoes.json` guardava os tokens como estavam. Quem lesse o arquivo — um
backup, a pasta copiada — entrava como balcao sem saber a senha.

**Agora:** guardamos SHA-256 do token. O arquivo do banco deixou de valer sessao.

### 8. Sem defesa contra XSS

Tela montada com `innerHTML` e `escapeHtml()` chamado a mao, com pontos onde nao
era chamado. O campo de imagem do produto aceitava qualquer string e ia direto
para `<img src>` — um `javascript:` ali executava no cardapio de todo cliente.

**Agora:** construcao por DOM (`textContent`), schema de imagem que so aceita
caminho do proprio site ou data URL de imagem, e CSP **sem `unsafe-inline` em
`script-src`** — possivel porque os `onclick=` do HTML sairam.

### 9. Outros

- **Sem CSRF token.** So `SameSite=Lax`, que nao cobre navegador antigo nem
  subdominio comprometido. Agora ha token vinculado a sessao, conferido por hash.
- **Erros vazavam detalhe interno.** `{ erro: error.message }` para qualquer
  falha devolvia caminho de arquivo ao navegador. Agora so `ErroApp` chega ao
  cliente; o resto vira 500 generico e o detalhe fica no log.
- **Cupom contava uso sem ser usado.** `cupom.uses += 1` rodava ao encontrar o
  cupom, mesmo que o pedido fosse recusado depois. Agora o uso e registrado junto
  do pedido, dentro da transacao.
- **Cancelamento podia inflar estoque.** Clique duplo devolvia duas vezes. Agora
  `estoque_baixado` e checado dentro da transacao.
- **Service worker cacheava a API.** Ele guardava toda resposta GET de mesma
  origem, e `/api/state` era GET: o navegador do cliente ficava com uma copia do
  estado da loja no cache do disco. Agora `/api/` nunca entra no cache.
- **QR code por servico de terceiro.** `api.qrserver.com` recebia o endereco do
  cardapio a cada abertura, e o QR nao funcionava sem internet. Agora e gerado
  no proprio navegador.
- **Telefone na via da cozinha.** A nota que fica pendurada no passe carregava o
  telefone do cliente. Saiu; continua na via do balcao.
- **Redirecionamento aberto no login.** O `?de=` era usado sem validacao. Agora
  passa por lista branca de caminhos internos.

## O que ja estava certo e foi preservado

Vale registrar, porque uma refatoracao tem tanta chance de quebrar isso quanto de
melhorar:

- **Preco refeito no servidor.** O `server.js` ja fazia, e continua. O que o
  cliente manda diz apenas *o que* foi pedido.
- **Path traversal tratado** resolvendo o caminho antes de decidir se a pagina
  exige senha, o que impedia `/Admin.html` e `//admin.html` de escapar. Agora
  isso e o `express.static` mais a checagem de sessao.
- **Comparacao de senha em tempo constante.**
- **Limite de tentativas por IP**, com a ressalva sobre `X-Forwarded-For`.
- **Sessao expirando no servidor**, nao so pelo `Max-Age` do cookie.
- **Escrita atomica e backup diario** — agora com `VACUUM INTO`.
- **Estoque baixando no aceite**, nao na entrega.
- **Lista de pedidos nunca indo para quem nao tem sessao.**

## Defesas ativas hoje

| Camada | O que faz |
|---|---|
| CSP | `script-src` sem `unsafe-inline`; `object-src 'none'` |
| Cookies | sessao `HttpOnly` + `SameSite=Lax`; `Secure` com `COOKIE_SECURE=1` |
| CSRF | token por sessao, conferido por hash em tempo constante |
| Senha | `scrypt` (N=32768, r=8), minimo 10 caracteres |
| Login | 10 tentativas/15min por IP **e** trava de 8 falhas por conta |
| Autorizacao | `exigirPapel` por rota; nenhuma regra de acesso fora do arquivo de rotas |
| Validacao | Zod `.strict()` em todo corpo, query e parametro |
| Transacao | `BEGIN IMMEDIATE` em pedido, cancelamento e liberacao de mesa |
| Auditoria | quem, quando, o que mudou |
| Erro | so `ErroApp` chega ao cliente |
| Log | campos sensiveis substituidos por `[oculto]` |

Timing de login: usuario inexistente tambem gasta o tempo do hash, para a
diferenca de resposta nao revelar quais logins existem.

## O que continua sendo limitacao

- **Sem TLS proprio.** Na rede da loja tudo bem. Exposto na internet, exige proxy
  com TLS. Ligar `TRUST_PROXY=1` **sem** proxy na frente e pior que nao ligar:
  quem chama direto escreve o que quiser em `X-Forwarded-For` e escapa de todos
  os limites por IP.
- **Cupom de uso unico usa telefone como chave.** Sem cadastro de cliente, e o que
  existe. Segura repeticao acidental; nao segura quem troca de numero.
- **Sem 2FA.** Para uma casa desse porte, o custo operacional supera o ganho.
- **Auditoria cresce sem limite.** Uma politica de retencao vai ser necessaria
  eventualmente; hoje nao e problema.
- **Rate limit em memoria.** Reiniciar o processo zera as contagens. Com uma
  instancia so, aceitavel.
- **`data/` fica no mesmo disco.** O backup diario protege contra corrupcao e
  contra apagar sem querer, nao contra o computador queimar.

## Ao mexer neste sistema

1. **Rota nova em `publico.routes.js` merece a pergunta:** isto pode ser lido por
   qualquer pessoa da internet? A lista e curta de proposito.
2. **Nunca aceite preco, total ou desconto vindo do cliente.** Se um schema
   ganhar um campo desses, o buraco volta.
3. **Toda escrita passa por schema `.strict()`.**
4. **Regra de acesso mora na rota**, nunca dentro de um service.
5. **Nada de `innerHTML`.** Use `el()` de `utils/dom.js`.
6. **Acao que mexe em dinheiro, estoque ou cadastro registra auditoria.**
7. **Rode `npm test`.** Os testes sao de regressao: cada um corresponde a um
   problema real que existiu aqui.
