# Migracao da v1 para a v2

Passo a passo da virada. Feito com a loja fechada.

## Antes de comecar

**Copie a pasta `data/` inteira para um lugar seguro.** Pendrive, outra maquina,
qualquer coisa fora deste computador. Nada aqui apaga o `baixo-k.json`, mas a
copia custa um minuto e vale por qualquer outra garantia.

Confira a versao do Node — precisa ser 20.11 ou mais nova:

```bash
node -v
```

## 1. Instalar

```bash
npm ci
```

Nao ha compilacao nativa: o banco usa o SQLite embutido do Node e o hash de senha
usa `scrypt` da biblioteca padrao. Rede que intercepta TLS nao atrapalha.

## 2. Configurar

```bash
cp .env.example .env
```

Abra o `.env`. Para rodar na rede local da loja, os padroes servem. Se houver
proxy com TLS na frente, ligue `TRUST_PROXY=1` **e** `COOKIE_SECURE=1` — as duas
juntas, nunca so a primeira.

Se a loja usa a Mapbox, copie o token do `data/mapbox.txt` antigo para
`MAPBOX_TOKEN` no `.env`.

## 3. Criar o banco e o primeiro acesso

```bash
npm run seed
```

O terminal mostra:

```
=================================================
  ADMINISTRADOR CRIADO
  usuario: admin
  senha:   <sorteada na hora>
=================================================
```

**Anote a senha.** Ela nao e mostrada de novo.

## 4. Importar a base antiga

```bash
npm run import:legado -- ../data/baixo-k.json
```

Saida esperada, com os numeros da sua base:

```
Importacao concluida:
  produtos:  13
  pedidos:   248 (612 itens)
  mesas:     8
  promocoes: 2
  cupons:    3
  faixas:    2
```

Se aparecer uma secao **Ignorados**, leia. Sao registros que nao tinham como
entrar — pedido sem `id`, cupom com valor zero, produto sem nome. O resto entrou.

O importador **nao apaga nada** e pode rodar de novo sem duplicar: o que ja
existe e mantido.

### O que muda nos dados

| Situacao no arquivo antigo | O que acontece |
|---|---|
| Pedido com status `concluido` | vira `entregue` (nomenclatura de duas versoes atras) |
| Item cujo produto foi apagado | o pedido entra; o item guarda o nome, sem vinculo |
| Categoria que nao existe mais | cai em `porcoes` |
| Imagem com `javascript:` ou URL externa | descartada; o produto entra sem foto |
| Faixa de entrega com km zero | descartada |
| Cupom em minusculas | vira maiusculas; os usos sao preservados |
| Todos os pedidos importados | entram com `estoque_baixado = 0` |

Sobre a ultima linha: o sistema antigo nem sempre marcava a baixa de estoque.
Assumir que baixou faria um cancelamento posterior devolver ao estoque unidades
que nunca sairam dele. Na pratica isso so afeta pedidos antigos que alguem
cancele depois da virada — situacao rara e cujo erro seria silencioso.

## 5. Conferir antes de abrir

```bash
npm run build
npm start
```

Abra `http://localhost:8000` e confira, nesta ordem:

- [ ] O cardapio mostra os produtos certos, com os precos certos
- [ ] As promocoes aparecem com o preco riscado
- [ ] `/admin.html` pede login
- [ ] O login com o usuario criado no passo 3 funciona
- [ ] A aba **Pedidos** mostra o historico importado
- [ ] A aba **Mesas** mostra a quantidade certa de mesas
- [ ] **Teste cozinha** e **Teste balcao** imprimem na Elgin i8
- [ ] A aba **Area de entrega** mostra o ponto da loja e as faixas
- [ ] O QR de uma mesa abre o cardapio identificado naquela mesa

## 6. Cadastrar a equipe

Aba **Equipe**. Crie um acesso por pessoa:

- **admin** — dono e gerencia
- **caixa** — quem opera o balcao
- **cozinha** — o tablet da cozinha

Vale um usuario `cozinha` compartilhado no tablet da area de producao — ele so
enxerga a fila e avanca o preparo. Para caixa, prefira um login por pessoa: e o
que faz a auditoria responder alguma coisa.

Configure tambem, na mesma aba:

- **menu_url** — o endereco publicado do cardapio. **E o que vai dentro dos QR
  codes das mesas.** Se mudar depois, os QR impressos param de funcionar.
- **whatsapp_entrega** — so numeros, com DDI e DDD
- **taxa_servico_mesa** — `0.1` para 10%

## 7. Limpar os restos da v1

Depois de confirmar que tudo funciona, apague da pasta `data/`:

```bash
rm data/senha.txt        # a senha unica antiga, em texto puro
rm data/sessoes.json     # tokens antigos, em texto puro
rm data/mapbox.txt       # o token agora vive no .env
```

O `data/baixo-k.json` e a pasta `data/backups/` com os `.json` antigos podem
ficar mais um tempo como seguranca. Depois de uma semana rodando, mova para o
arquivo morto.

**Nao apague `data/baixok.sqlite`.** Esse e o banco novo.

## 8. Reimprimir os QR das mesas

So se o endereco do cardapio mudou. Aba **Mesas** → botao **QR** no card →
**Baixar para imprimir**.

Os QR agora sao gerados no proprio navegador, sem servico externo — funcionam com
a internet caida.

## Se der errado

O sistema antigo continua intacto: nada foi apagado. Para voltar, faca
`git checkout main` e rode `node server.js` como antes. O `data/baixo-k.json`
esta como estava.

Nenhum passo desta migracao escreve no arquivo antigo.

## O que muda no dia a dia

Vale avisar a equipe antes de abrir:

- **Cada pessoa entra com o proprio login**, nao mais com a senha da loja.
- **Quem esta na cozinha ve menos telas.** E de proposito.
- **Sem servidor, o painel para.** Antes ele continuava funcionando sozinho no
  aparelho — e isso era um problema de seguranca, nao um recurso. Se aparecer a
  faixa vermelha de "sem conexao", o problema e a rede ou o servidor, e as
  alteracoes daquele momento **nao** estao sendo salvas.
- **Cupons nao aparecem mais no cardapio.** O cliente precisa saber o codigo.
- **Preco, desconto e taxa vem do servidor.** Se a tela do cliente mostrar um
  valor e o pedido chegar com outro, o valor certo e o do pedido.
