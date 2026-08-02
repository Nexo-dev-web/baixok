# Baixo Cais - MVP

MVP estatico para cardapio, fila de pedidos e impressao termica 80mm.

## Arquivos

- `index.html`: cardapio e carrinho do cliente.
- `admin.html`: painel de pedidos e botoes de impressao.
- `app.js`: dados do cardapio, carrinho, fila e recibos.
- `styles.css`: visual responsivo.

## Impressora Elgin i8

O MVP imprime pelo dialogo do navegador. Para usar a Elgin i8:

1. Instale o driver da Elgin i8 no Windows.
2. Configure papel 80mm.
3. Abra `admin.html`.
4. Clique em `Teste cozinha` ou `Teste balcao`.
5. Selecione a Elgin i8 no dialogo de impressao.

Impressao silenciosa direta, sem dialogo, precisa de um agente local instalado no computador da loja.
