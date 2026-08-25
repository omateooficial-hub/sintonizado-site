# Publicação — GitHub Pages + Google Analytics

## 1. Google Analytics
Crie uma propriedade GA4 e copie o Measurement ID no formato:

G-XXXXXXXXXX

Abra `analytics-config.js` e substitua:

G-XXXXXXXXXX

pelo seu código real.

O site já envia:
- page_view
- phase_1_complete
- phase_2_complete
- phase_3_complete
- phase_4_complete
- phase_5_complete
- presave_click

## 2. GitHub Pages
Envie todos os arquivos desta pasta para a raiz do repositório do site.

Em GitHub:
Settings → Pages → Deploy from a branch → main / root

Depois aguarde a publicação.

## 3. Teste
Abra o site publicado e depois:
Google Analytics → Reports → Realtime

Sua própria visita deve aparecer em alguns segundos/minutos.

## Importante
Não remova `.nojekyll`.
