# Baixo K

Sistema da casa: cardapio digital, comanda de mesa por QR code, fila de pedidos,
painel de cozinha, estoque, promocoes, telao do salao e impressao termica 80mm.

```
baixok/
├── backend/     API, regras de negocio e banco
├── frontend/    quatro paginas, compiladas pelo Vite
└── docs/        arquitetura, seguranca e guia de migracao
```

## Como rodar

Precisa de **Node 20.11 ou mais novo**. Na primeira vez:

```bash
npm ci                # instala backend e frontend
npm run seed          # cria o primeiro administrador e o cardapio de exemplo
npm run build         # compila o frontend
npm start             # sobe em http://localhost:8000
```

O `seed` mostra no terminal o usuario e a senha do primeiro acesso. **Anote e
troque no primeiro login.**

Para desenvolver, com recarga automatica nas duas pontas:

```bash
npm run dev           # API em :8000, frontend em :5173
```

### As quatro telas

| Caminho | O que e | Acesso |
|---|---|---|
| `/index.html` | Cardapio, carrinho e comanda de mesa | aberto |
| `/admin.html` | Painel da loja | login |
| `/telao.html` | Telao de senhas do salao | login |
| `/entrar.html` | Tela de login | aberto |

### Configuracao

Copie `.env.example` para `.env`. Toda variavel e validada na subida: escrita
errada derruba o processo com a mensagem do que corrigir, em vez de cair no
padrao em silencio.

## Quem pode o que

Cada pessoa entra com o proprio login. Sao tres papeis:

| | admin | caixa | cozinha |
|---|:---:|:---:|:---:|
| Ver e avancar a fila | ✓ | ✓ | ✓ |
| Cancelar pedido (devolve estoque) | ✓ | ✓ | |
| Lancar pedido manual | ✓ | ✓ | |
| Mesas: abrir, fechar conta, liberar | ✓ | ✓ | |
| Ajustar estoque | ✓ | ✓ | |
| Cadastro e preco de produto | ✓ | | |
| Promocoes e cupons | ✓ | | |
| Area de entrega | ✓ | | |
| Dashboard e faturamento | ✓ | | |
| Gerenciar equipe e ver auditoria | ✓ | | |

A tabela acima e aplicada em `backend/src/routes/painel.routes.js`. Esconder o
botao no painel e conveniencia; quem barra e a rota.

Toda acao que mexe em dinheiro, estoque ou cadastro fica registrada na
auditoria, com quem fez, quando e o que mudou.

## Migrando da versao 1

A versao anterior guardava tudo em `data/baixo-k.json`. Para trazer o historico:

```bash
npm run import:legado -- ../data/baixo-k.json
```

O passo a passo completo — inclusive o que apagar depois — esta em
[docs/MIGRACAO.md](docs/MIGRACAO.md).

## Backup

O banco e o Postgres do projeto no Supabase, e o backup e de la: painel do
Supabase -> **Database** -> **Backups**. O processo do backend nao copia mais
nada sozinho — a rotina diaria com `VACUUM INTO` saiu junto com o arquivo
`data/baixok.sqlite`.

Confira no painel qual a retencao do seu plano. Se o historico de vendas precisa
durar mais do que isso, exporte um `pg_dump` de tempos em tempos para fora do
Supabase.

## Comanda de mesa por QR code

Cada mesa tem um QR fixo apontando para `.../index.html?mesa=N`:

1. O atendente abre a mesa na aba **Mesas**. So entao o QR aceita pedidos.
2. O cliente le o QR e cai no cardapio ja identificado naquela mesa.
3. Cada pedido enviado vai para a fila da cozinha e soma na comanda.
4. O atendente fecha a conta, a nota sai no balcao e o QR trava.

O QR e gerado no proprio navegador, sem servico externo. Ele aponta para o
endereco em **menu_url** (aba Equipe → ajustes); sem isso configurado, usa o
endereco de onde o painel esta aberto.

## Area de entrega

Marcar o ponto da loja **nao exige a Mapbox**. Ha tres caminhos, e os dois
primeiros funcionam sem conta em lugar nenhum:

- **GPS do aparelho** — exige `https` ou `localhost`; em `http://192.168.x.x` o
  navegador recusa sem perguntar.
- **Colar a coordenada** — no Google Maps, botao direito no ponto e a primeira
  opcao do menu copia `-22.8975, -43.1875`. Se vier trocada, o sistema corrige.
- **Buscar pelo endereco** — so com a Mapbox configurada.

A distancia e medida **em linha reta** a partir da loja, que e o que "raio de
entrega" significa. O cliente paga a taxa da primeira faixa que alcanca; alem da
ultima, o pedido e recusado. Cada faixa tem seu proprio pedido minimo.

**A taxa mostrada no carrinho e previa.** Ao registrar o pedido o servidor
geocodifica o endereco de novo e refaz a conta. Trocar a coordenada no navegador
so engana a propria tela.

**Nao guardamos coordenada de cliente.** O plano gratuito da Mapbox e o de
geocodificacao temporaria, que proibe armazenamento permanente. Gravamos so o
endereco em texto, a distancia e o valor.

## Impressora Elgin i8

A impressao sai pelo dialogo do navegador:

1. Instale o driver da Elgin i8 no Windows e configure papel 80mm.
2. Abra o painel e use **Teste cozinha** ou **Teste balcao**.
3. Selecione a Elgin i8 no dialogo.

Impressao silenciosa, sem dialogo, precisa de um agente local instalado na
maquina da loja.

Aprovar um pedido imprime as duas vias: cozinha monta, balcao entrega. A via da
cozinha nao leva o telefone do cliente — ela circula pela area de producao.

## Estoque

O estoque baixa **no aceite do pedido**, nao na entrega. E o que faz o cardapio
dizer a verdade: reservado o item, ele some da vitrine quando acaba. Recusar um
pedido devolve os itens, uma vez so.

## Testes

```bash
npm test
```

40 testes cobrindo as regras que sustentam a seguranca: preco refeito no
servidor, corrida de estoque, isolamento por papel, CSRF, o que a rota publica
pode devolver, e a importacao da base antiga.

## Limitacoes conhecidas

- **Sem HTTPS por conta propria.** Na rede local da loja tudo bem. Exposto na
  internet, coloque atras de um proxy com TLS e ligue `TRUST_PROXY=1` e
  `COOKIE_SECURE=1`. Ligar `TRUST_PROXY` **sem** proxy na frente e pior que nao
  ligar: quem chama direto forja `X-Forwarded-For` e escapa dos limites por IP.
- **Cupom de uso unico usa o telefone como chave.** Sem cadastro de cliente, e o
  que existe. Segura o uso repetido acidental; nao segura quem troca de numero
  de proposito.
- **Publicar so o `frontend/dist` num host estatico nao funciona mais** — e isso
  e intencional. O painel depende da API para qualquer coisa; sem backend, ele
  mostra "sem conexao" em vez de destravar sozinho, que era o comportamento da
  versao anterior.
- **As imagens em `frontend/public/images/` estao pesadas** (2 a 3 MB cada). Vale
  reprocessar para WebP em algum momento: o logo sozinho pesa mais que todo o
  JavaScript do cardapio.

## Documentacao

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — como o codigo esta organizado e por que
- [docs/SEGURANCA.md](docs/SEGURANCA.md) — o que foi corrigido e o modelo de ameaca
- [docs/MIGRACAO.md](docs/MIGRACAO.md) — passo a passo da virada da v1 para a v2
- [docs/HISTORICO-v1.md](docs/HISTORICO-v1.md) — documentacao da arquitetura anterior
