# SINTONIZADO — versão ZERO

Projeto refeito do zero para GitHub Pages.

## Objetivo
Experiência misteriosa:
1. INICIAR TRANSMISSÃO
2. procurar uma frequência real entre 88–108 FM
3. cruzar estações falsas com instrumentais e falas de rádio
4. encontrar 104.7 FM
5. SINTONIZADO
6. tocar trecho do áudio real enviado pelo usuário
7. encerrar com:
   SINAL 01 RECEBIDO
   A TRANSMISSÃO CONTINUA.
   O PRÓXIMO SINAL AINDA NÃO FOI LIBERADO.

## Arquivos
- index.html
- styles.css
- script.js
- audio-data.js

Não existe pasta `assets`.
Não existe MP3 externo.
O áudio final está embutido em `audio-data.js`.

Isso elimina problemas de caminho no GitHub Pages.

SHA-256 do áudio embutido:
033bb4bd443f4e2855bdd8925c3ffd35421010f79b91149096737d99f33775af

## Publicação no GitHub Pages
Envie os QUATRO arquivos para a raiz do repositório.

Settings → Pages:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)

Depois aguarde o workflow `pages build and deployment`.

## Teste
Abra o site e clique em `INICIAR TRANSMISSÃO`.
O som só é inicializado depois desse toque/clique, respeitando as políticas de áudio dos navegadores.

## Ajustes principais
Em `script.js`, objeto CFG:
- `start: 88.9`
- `secret: 104.7`
- `musicStart: 4.7`
- `musicDuration: 7.4`
