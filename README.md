# Baixo K

Sistema do Baixo K: cardapio digital, comanda de mesa por QR code, fila de pedidos,
painel de cozinha, estoque, promocoes e impressao termica 80mm.

## Como rodar

```
node server.js
```

Abre em `http://localhost:8000`. O servidor nao tem dependencia nenhuma: precisa so
do Node instalado.

- `index.html` - cardapio e carrinho do cliente (aberto)
- `admin.html` - painel: pedidos, cozinha (KDS), mesas, produtos, promocoes, estoque, dashboard (pede senha)
- `telao.html` - telao de senhas do salao (pede senha)
- `entrar.html` - tela de senha do balcao

## Senha do balcao

Na primeira execucao o servidor sorteia uma senha, guarda em `data/senha.txt` e mostra
no terminal. Para definir a sua:

```
BAIXOK_SENHA=suasenha node server.js
```

O login vale por 30 dias por aparelho, entao o tablet da cozinha e o telao pedem a
senha uma vez so. O cardapio do cliente nunca pede nada.

## Os dois modos

O site funciona de duas formas, e ele descobre sozinho em qual esta:

**Com o `server.js` no ar** - o estado fica no servidor e todos os aparelhos veem a
mesma coisa. O celular do cliente manda pedido e ele aparece na hora no tablet da
cozinha, sem ninguem recarregar nada. E o modo necessario para o salao funcionar.

**Sem o servidor** (abrindo os arquivos direto ou publicando no GitHub Pages) - cada
navegador guarda a sua propria copia no `localStorage`. Serve para demonstrar o
sistema num aparelho so, mas os aparelhos nao se enxergam.

O estado compartilhado fica em `data/baixo-k.json`, criado na primeira execucao. Esse
arquivo e o banco de dados. Na primeira vez que subir, o servidor comeca vazio e
importa o que ja existia no navegador que abrir primeiro.

### Backup

A gravacao e atomica: o servidor escreve num arquivo temporario e renomeia, entao uma
queda de energia no meio da escrita nao deixa o arquivo pela metade.

Alem disso, uma copia por dia vai para `data/backups/`, mantendo os ultimos 14 dias.
Se o arquivo principal aparecer ilegivel na hora de subir, o servidor avisa no
terminal, restaura do backup mais recente e reescreve o principal na hora.

Esse backup vive no mesmo disco: protege contra arquivo corrompido, **nao** contra o
computador queimar. Para isso, copie a pasta `data/` para outro lugar de tempos em
tempos.

## Comanda de mesa por QR code

Cada mesa tem um QR code fixo que aponta para `.../index.html?mesa=N`. O fluxo:

1. Atendente abre a mesa na aba **Mesas**. So entao o QR aceita pedidos.
2. Cliente le o QR e cai no cardapio ja identificado naquela mesa.
3. Cada pedido enviado vai para a fila da cozinha e soma na comanda da mesa.
4. Atendente fecha a conta, a nota sai no balcao e o QR trava ate a proxima abertura.

O QR e gerado na aba Mesas, botao **QR** no card. Ele aponta para o endereco publicado
em `MENU_URL` (em `app.js`) - se publicar em outro endereco, ajuste essa constante
antes de imprimir os codigos.

## Area de entrega (Mapbox)

Opcional. Sem configurar, a entrega continua funcionando com endereco digitado
livremente e sem taxa automatica — foi assim que o sistema sempre funcionou.

1. Crie a conta em `account.mapbox.com` e gere um token.
2. Guarde em `data/mapbox.txt` ou na variavel `MAPBOX_TOKEN`.
3. Reinicie o servidor e abra a aba **Area de entrega** no painel.
4. Busque o endereco da loja e crie as faixas de raio.

O token fica **so no servidor**. A busca de endereco e o mapa passam pelo
`server.js`, entao ele nunca aparece no navegador do cliente nem no codigo-fonte da
pagina.

A distancia e medida **em linha reta** a partir da loja, que e o que "raio de entrega"
significa. O cliente paga a taxa da primeira faixa que alcanca; endereco alem da
ultima faixa e recusado. Cada faixa tem seu proprio pedido minimo.

Custo: o plano gratuito da Mapbox cobre 100 mil buscas de endereco por mes. Uma casa
desse porte nao chega perto disso.

**Nao guardamos coordenada de cliente.** O plano gratuito e o de geocodificacao
temporaria, que proibe armazenamento permanente dos resultados. O sistema calcula a
taxa na hora e grava so o endereco em texto, a distancia e o valor.

## Impressora Elgin i8

A impressao sai pelo dialogo do navegador. Para usar a Elgin i8:

1. Instale o driver da Elgin i8 no Windows.
2. Configure papel 80mm.
3. Abra `admin.html`.
4. Clique em `Teste cozinha` ou `Teste balcao`.
5. Selecione a Elgin i8 no dialogo de impressao.

Impressao silenciosa direta, sem dialogo, precisa de um agente local instalado no
computador da loja.

## O que o servidor nao aceita do cliente

O navegador do cliente e tratado como nao confiavel. Ao receber um pedido, o servidor
refaz tudo pelo proprio cadastro: preco do produto, preco promocional, desconto de
cupom e total. Tambem recusa item pausado, quantidade acima do estoque e pedido em
mesa que nao esteja aberta. O que o cliente manda so diz *o que* foi pedido.

A lista de pedidos nunca vai para quem nao tem sessao: ela carrega nome, telefone e
endereco de todo mundo que pediu no dia.

## Limitacoes conhecidas

- **Publicar em host estatico nao protege o painel.** A senha e verificada no
  servidor. Se voce subir esses arquivos no GitHub Pages, `admin.html` fica aberto a
  qualquer um, porque la nao ha servidor para exigir nada. Publique estatico so como
  demonstracao; para a loja usar, rode o `server.js`.
- **Uma senha so, sem usuarios.** Nao ha login por pessoa nem registro de quem fez o
  que.
- **Sem HTTPS.** Rodando na rede local da loja tudo bem. Exposto na internet, coloque
  atras de um proxy com TLS.
- **Cupom "uso unico por cliente" nao e aplicado.** O sistema guarda e mostra a marca,
  mas sem cadastro de cliente nao ha como saber quem ja usou.
- **Escrita simultanea.** O servidor mescla pedidos e mesas por chave, entao um
  aparelho atrasado nao apaga o que outro criou. Ja produtos, promocoes e cupons sao
  substituidos inteiros: se duas pessoas editarem o cardapio ao mesmo tempo, vale a
  ultima gravacao.
