# SINTONIZADO — microsite interativo

Site estático pronto para publicação.

## Arquivos
- `index.html`
- `styles.css`
- `script.js`
- `assets/audio/sintonize.mp3`

## Experiência atual
1. "MOVA-SE DEVAGAR."
2. "INICIAR SINTONIA"
3. Dial FM 88–108
4. Frequência secreta: **104.7 FM**
5. Ao encontrar: **SINTONIZADO**
6. Toca um trecho de `sintonize.mp3`
7. **TRANSMISSÃO ENCERRADA.**

## Trecho de áudio
No início de `script.js`, altere:

```js
musicStartTime: 4.7,
musicDuration: 7.4,
```

O arquivo enviado tem aproximadamente 16,4 s. O trecho escolhido começa em 4,7 s para entrar numa parte com mais energia e termina antes da cauda silenciosa do arquivo.

## Alterar a frequência
No `CONFIG` de `script.js`:

```js
secretFrequency: 104.7,
initialFrequency: 89.1,
```

A frequência correta começa longe do ponto inicial para que o usuário realmente precise procurar.

## Publicar
Pode ser hospedado como site estático em Netlify, Vercel, GitHub Pages, Cloudflare Pages ou no host que você já usa.

Não é necessário build para esta versão: publique a pasta inteira mantendo a estrutura dos arquivos.


## Correção de áudio — v2
O trecho final agora é carregado e decodificado pela **Web Audio API** no primeiro toque do usuário.
Isso evita o bloqueio de autoplay que podia impedir `sintonize.mp3` de tocar quando a frequência era encontrada alguns segundos depois.

Fluxo:
- toque em `INICIAR SINTONIA` desbloqueia o AudioContext;
- `sintonize.mp3` é pré-carregado;
- ao encontrar 104.7 FM, o ruído para;
- surge `SINTONIZADO`;
- o trecho de 4,7 s até aproximadamente 12,1 s toca via AudioBuffer;
- depois aparece `TRANSMISSÃO ENCERRADA.`

IMPORTANTE: teste através de um servidor/site publicado (http/https). Alguns navegadores restringem `fetch()` quando o `index.html` é aberto diretamente por `file://`.


## v3 — estações falsas + final em capítulos
Durante a busca existem quatro sinais intermediários:
- 90.6 FM: pequeno instrumental original lo-fi
- 94.4 FM: voz de radialista via voz do navegador
- 98.2 FM: segundo fragmento instrumental
- 101.6 FM: segunda transmissão falada

Esses sinais são falsos e servem para fazer a procura parecer um rádio real. A única recompensa musical principal continua sendo `sintonize.mp3` em 104.7 FM.

Novo encerramento:
PRIMEIRO SINAL RECEBIDO
A TRANSMISSÃO CONTINUA.
VOLTE PARA A PRÓXIMA PARTE.
