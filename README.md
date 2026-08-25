# SINTONIZADO — FASE 6 V5 / TRANSMISSÃO ABERTA

Esta versão abandona a direção de portfólio institucional e volta ao conceito central das Fases 1–5.

## Fase 6
A interação principal é apenas o scroll.

00 — conceito do álbum
Tracklist — mapa da narrativa
01 — OUVIR
02 — SENTIR
03 — FIRMAR
04 — SILENCIAR
05 — PENSAR
06 — TOCAR
07 — DECIDIR
08 — PERMANECER
FIM — resumo de FREQUÊNCIA como um todo

A navegação lateral 00–08–FIM permite voltar a qualquer capítulo para ler novamente.

## Visual
- preto/marrom/âmbar + páginas off-white;
- capa e tracklist com `object-fit: contain`, sem cortes;
- fotos do artista aparecem apenas como interferências narrativas;
- mouse/toque adicionam interações secundárias, mas nunca são obrigatórios;
- scroll controla as transformações de cada faixa.

## Áudio
`Sintonia(1).wav` está em `assets6/sintonia.wav`.
O navegador exige uma ação do usuário para iniciar áudio, por isso existe botão SOM.

## Pré-save
https://sndo.ffm.to/bp91y9b

Ainda sem automação por data.


## V6 — ajuste solicitado
- cards laterais das faixas substituídos por versões da capa oficial com o título de cada faixa.
- removidas as artes/interações individuais que cobriam alguns títulos.


## SITE COMPLETO PARA TESTE — FASES 1 A 6

Abra `index.html` normalmente para começar pela Fase 1.

Para o modo de teste, abra:
`index.html?test=1`

O seletor 01–06 aparece no canto e permite alternar rapidamente entre todas as fases.

Também é possível abrir diretamente:
`?phase=1` até `?phase=6`.

A automação por data continua DESATIVADA.


## Mouse Fix
- Fase 1 agora sintoniza apenas movendo o mouse horizontalmente, sem precisar clicar.
- Arrastar, roda do mouse e setas continuam funcionando.
- Capas 3D da Fase 6 reagem ao mouse em toda a área lateral da faixa.


## BUILD SEQUENCIAL

Fluxo real agora:
Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6.

Cada fase libera a próxima somente após a missão ser concluída.
Os botões de replay continuam disponíveis, mas são secundários.

### Mouse da Fase 1
- clicar;
- manter o botão pressionado;
- arrastar horizontalmente;
- soltar = parar imediatamente;
- sem movimento automático e sem inércia;
- roda do mouse e setas continuam disponíveis.

A automação por datas continua desligada.


## CORREÇÃO FINAL DE FLUXO

Foi corrigido um erro real no JavaScript que interrompia a mudança entre fases.

Fluxo validado:
1 → 2 → 3 → 4 → 5 → 6

Ao concluir cada missão:
- aparece a tela de conclusão;
- a próxima fase abre automaticamente após alguns segundos;
- o botão CONTINUAR permite avançar imediatamente.

Sintonizador da Fase 1:
- clique com o botão esquerdo;
- mantenha pressionado;
- arraste horizontalmente;
- solte para parar imediatamente;
- sem pointer capture e sem inércia;
- sensibilidade ajustada para chegar de 88 a 108 FM sem precisar arrastar várias vezes.


## NATIVE MOUSE FIX

O sintonizador da Fase 1 agora usa um `<input type="range">` nativo e invisível
sobre a escala visual.

Isso significa que o próprio navegador controla:
- clicar;
- segurar;
- arrastar;
- soltar.

O JavaScript antigo de drag não é mais responsável pelo mouse.
A roda do mouse continua disponível.
O fluxo sequencial Fase 1 → 6 foi preservado.


## CORREÇÃO REAL DO MOUSE

A causa encontrada não era o drag em si.

Elementos invisíveis de outras fases, principalmente da Fase 5,
continuavam com `pointer-events:auto` e ficavam sobre a Fase 1.
Eles interceptavam o clique antes de chegar ao sintonizador.

Correção:
- toda `.screen` inativa agora fica `visibility:hidden`;
- todos os filhos de fases inativas recebem `pointer-events:none !important`;
- somente a fase ativa pode receber mouse/toque;
- o sintonizador continua usando o range nativo do navegador;
- localStorage foi protegido para uso por `file://`.

Fluxo sequencial 1 → 6 permanece ativo.


## CONTADOR DE VISITANTES
- todas as fases são lançadas juntas;
- sem automação por data;
- contador de visitantes únicos;
- deduplicação em janela de 24h;
- identificador: omateo.frequencia.2026;
- o site continua funcionando se o serviço de contador ficar indisponível.


## GOOGLE ANALYTICS / GITHUB PAGES READY

Foram adicionados:
- `analytics-config.js`
- `analytics.js`
- `.nojekyll`
- `robots.txt`
- `DEPLOY_GITHUB_PAGES.md`

Para ativar o Analytics, substitua `G-XXXXXXXXXX` em `analytics-config.js`.
