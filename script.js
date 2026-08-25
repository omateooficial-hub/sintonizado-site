
(() => {
"use strict";

const CFG = {
  min: 88,
  max: 108,
  start: 88.9,
  secret: 104.7,
  snap: 0.16,
  magnet: 0.62,
  musicStart: 4.7,
  musicDuration: 7.4,
  fadeIn: 0.12,
  fadeOut: 0.8,
  stations: [
    {f:91.3, kind:"music1", msg:"♪ ESTAÇÃO DISTANTE"},
    {f:94.6, kind:"host1",  msg:"VOZ NO AR"},
    {f:98.4, kind:"music2", msg:"♪ SINAL MUSICAL"},
    {f:101.7,kind:"host2",  msg:"TRANSMISSÃO PARCIAL"},
    {f:103.5,kind:"near",   msg:"QUASE."}
  ]
};


function safeStoreGet(key){
  try{return window.localStorage ? window.safeStoreGet(key) : null}
  catch(e){return null}
}
function safeStoreSet(key,value){
  try{
    if(window.localStorage)window.safeStoreSet(key,value);
  }catch(e){}
}

const $ = s => document.querySelector(s);
const screens = {
  intro: $("#screenIntro"),
  tuner: $("#screenTuner"),
  locked: $("#screenLocked"),
  end: $("#screenEnd"),
  phase2Intro: $("#screenPhase2Intro"),
  phase2Hold: $("#screenPhase2Hold"),
  phase2Received: $("#screenPhase2Received"),
  phase2End: $("#screenPhase2End"),
  phase3Intro: $("#screenPhase3Intro"),
  phase3Align: $("#screenPhase3Align"),
  phase3Received: $("#screenPhase3Received"),
  phase3End: $("#screenPhase3End"),
  phase4Intro: $("#screenPhase4Intro"),
  phase4Reveal: $("#screenPhase4Reveal"),
  phase4Title: $("#screenPhase4Title"),
  phase4End: $("#screenPhase4End"),
  phase5Intro: $("#screenPhase5Intro"),
  phase5Scan: $("#screenPhase5Scan"),
  phase5Complete: $("#screenPhase5Complete"),
  phase5End: $("#screenPhase5End"),
  phase6Story: $("#screenPhase6Story")
};

const startBtn=$("#startBtn"), againBtn=$("#againBtn"), soundBtn=$("#soundBtn");
const soundState=$("#soundState"), dial=$("#dial"), scale=$("#scale");
const freqText=$("#freqText"), status=$("#status"), meterFill=$("#meterFill");
const freqSlider=$("#freqSlider");
const toast=$("#toast"), canvas=$("#field"), ctx=canvas.getContext("2d");
const viz=$("#musicViz"), vctx=viz.getContext("2d");

let freq=CFG.start, dragging=false, lastX=0, lastT=0, velocity=0, momentumId=0;
let dragKind=null;
let locked=false, soundOn=true, stationGate=0, lastStation="";
let audioCtx=null, master=null, noiseGain=null, noiseFilter=null, humGain=null;
let analyser=null, musicGain=null, musicBuffer=null, musicSource=null, playToken=0;
let pointer={x:.5,y:.5,v:0,lx:.5,ly:.5,t:performance.now()};

function show(name){
  Object.values(screens).forEach(s=>s.classList.remove("active"));
  screens[name].classList.add("active");
}

function flash(text){
  toast.textContent=text;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function pxPerMHz(){ return innerWidth < 720 ? 88 : 118; }

function buildScale(){
  scale.innerHTML="";
  const px=pxPerMHz();
  for(let f=CFG.min; f<=CFG.max+.001; f+=.2){
    const rf=Math.round(f*10)/10;
    const tick=document.createElement("i");
    const major=Math.abs(rf-Math.round(rf))<.001;
    tick.className="tick"+(major?" major":"");
    tick.style.left=((rf-CFG.min)*px)+"px";
    scale.appendChild(tick);

    if(major && Math.round(rf)%2===0){
      const label=document.createElement("span");
      label.className="label";
      label.style.left=((rf-CFG.min)*px)+"px";
      label.innerHTML=`${Math.round(rf)}<small>FM</small>`;
      scale.appendChild(label);
    }
  }
  renderDial();
}

function renderDial(){
  const px=pxPerMHz();
  scale.style.transform=`translate3d(${-(freq-CFG.min)*px}px,-50%,0)`;
  freqText.textContent=freq.toFixed(1);
  if(freqSlider && document.activeElement!==freqSlider){
    freqSlider.value=freq.toFixed(1);
  }

  const dist=Math.abs(freq-CFG.secret);
  const closeness=Math.max(0,Math.min(1,1-dist/5.5));
  meterFill.style.width=(closeness*100).toFixed(1)+"%";

  if(dist<.7) status.textContent="SINAL PRÓXIMO";
  else if(dist<2.2) status.textContent="INTERFERÊNCIA DIMINUINDO";
  else status.textContent="INTERFERÊNCIA";

  if(audioCtx && soundOn){
    noiseGain.gain.setTargetAtTime(.012+(1-closeness)*.082,audioCtx.currentTime,.05);
    noiseFilter.frequency.setTargetAtTime(700+closeness*2600,audioCtx.currentTime,.06);
    humGain.gain.setTargetAtTime(.009+closeness*.012,audioCtx.currentTime,.08);
  }

  maybeStation();

  if(!locked && dist<=CFG.snap) lockFrequency();
}

function setFreq(v){
  if(locked) return;
  v=Math.max(CFG.min,Math.min(CFG.max,v));
  const d=Math.abs(v-CFG.secret);
  if(d<CFG.magnet){
    const p=(CFG.magnet-d)/CFG.magnet;
    v += (CFG.secret-v)*p*.10;
  }
  freq=v;
  renderDial();
}

function beginMouseDrag(e){
  if(locked || !screens.tuner.classList.contains("active"))return;
  if(e.button!==0)return;
  dragging=true;
  dragKind="mouse";
  lastX=e.clientX;
  velocity=0;
  dial.classList.add("dragging");
  document.documentElement.classList.add("tuner-dragging");
  e.preventDefault();
}

function moveMouseDrag(e){
  if(!dragging || dragKind!=="mouse" || locked)return;
  if((e.buttons & 1)===0){
    endDrag();
    return;
  }
  const dx=e.clientX-lastX;
  if(Math.abs(dx)>.05){
    const sensitivity=innerWidth<720?.034:.023;
    setFreq(freq-dx*sensitivity);
    lastX=e.clientX;
  }
  e.preventDefault();
}

function beginTouchDrag(e){
  if(locked || !screens.tuner.classList.contains("active"))return;
  const t=e.touches&&e.touches[0];
  if(!t)return;
  dragging=true;
  dragKind="touch";
  lastX=t.clientX;
  velocity=0;
  dial.classList.add("dragging");
  e.preventDefault();
}

function moveTouchDrag(e){
  if(!dragging || dragKind!=="touch" || locked)return;
  const t=e.touches&&e.touches[0];
  if(!t)return;
  const dx=t.clientX-lastX;
  const sensitivity=.034;
  setFreq(freq-dx*sensitivity);
  lastX=t.clientX;
  e.preventDefault();
}

function endDrag(){
  if(!dragging)return;
  dragging=false;
  dragKind=null;
  velocity=0;
  cancelAnimationFrame(momentumId);
  dial.classList.remove("dragging");
  document.documentElement.classList.remove("tuner-dragging");
}

// Kept for compatibility with older calls. There is intentionally no inertia.
function onDown(e){beginMouseDrag(e)}
function onMove(e){moveMouseDrag(e)}
function onUp(){endDrag()}
function momentum(){velocity=0}

async function initAudio(){
  if(audioCtx) {
    if(audioCtx.state==="suspended") await audioCtx.resume();
    return;
  }

  audioCtx=new (window.AudioContext||window.webkitAudioContext)();

  master=audioCtx.createGain();
  master.gain.value=.78;
  master.connect(audioCtx.destination);

  // low cinematic hum
  const hum=audioCtx.createOscillator();
  hum.type="sine"; hum.frequency.value=47;
  humGain=audioCtx.createGain(); humGain.gain.value=.012;
  const humFilter=audioCtx.createBiquadFilter();
  humFilter.type="lowpass"; humFilter.frequency.value=115;
  hum.connect(humFilter).connect(humGain).connect(master);
  hum.start();

  // procedural radio static
  const length=audioCtx.sampleRate*2;
  const b=audioCtx.createBuffer(1,length,audioCtx.sampleRate);
  const d=b.getChannelData(0);
  for(let i=0;i<length;i++) d[i]=Math.random()*2-1;
  const noise=audioCtx.createBufferSource();
  noise.buffer=b; noise.loop=true;
  noiseFilter=audioCtx.createBiquadFilter();
  noiseFilter.type="bandpass"; noiseFilter.frequency.value=900; noiseFilter.Q.value=.65;
  noiseGain=audioCtx.createGain(); noiseGain.gain.value=.065;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start();

  analyser=audioCtx.createAnalyser();
  analyser.fftSize=256;
  musicGain=audioCtx.createGain();
  musicGain.gain.value=1;
  musicGain.connect(analyser);
  analyser.connect(audioCtx.destination);

  // Decode the embedded final music. No file path or network request.
  try{
    if(!window.FINAL_AUDIO_BASE64) throw new Error("FINAL_AUDIO_BASE64 ausente");
    const raw=atob(window.FINAL_AUDIO_BASE64);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    musicBuffer=await audioCtx.decodeAudioData(bytes.buffer.slice(0));
    console.log("Áudio final pronto:",musicBuffer.duration.toFixed(2),"s");
  }catch(err){
    console.error(err);
    flash("ERRO AO PREPARAR O ÁUDIO");
  }

  // Safari/iOS unlock pulse
  const unlock=audioCtx.createBuffer(1,1,audioCtx.sampleRate);
  const src=audioCtx.createBufferSource();
  src.buffer=unlock; src.connect(audioCtx.destination); src.start(0);
}

function subHit(){
  if(!audioCtx||!soundOn)return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type="sine"; o.frequency.setValueAtTime(72,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(40,audioCtx.currentTime+.55);
  g.gain.setValueAtTime(.0001,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.055,audioCtx.currentTime+.018);
  g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.6);
  o.connect(g).connect(master); o.start(); o.stop(audioCtx.currentTime+.62);
}

function chord(notes, variant=1){
  if(!audioCtx||!soundOn)return;
  const now=audioCtx.currentTime;
  notes.forEach((f,i)=>{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain(), bp=audioCtx.createBiquadFilter();
    o.type=i===0?"sine":"triangle"; o.frequency.value=f;
    bp.type="bandpass"; bp.frequency.value=variant===1?720:1050; bp.Q.value=.6;
    g.gain.setValueAtTime(.0001,now);
    g.gain.exponentialRampToValueAtTime(i===0?.025:.013,now+.04);
    g.gain.exponentialRampToValueAtTime(.0001,now+1.35);
    o.connect(bp).connect(g).connect(master); o.start(now); o.stop(now+1.4);
  });
}

function instrumental(kind){
  if(kind==="music1"){
    chord([196,246.94,293.66],1);
    setTimeout(()=>chord([174.61,220,261.63],1),420);
    setTimeout(()=>chord([220,277.18,329.63],1),820);
  }else{
    chord([130.81,164.81,196],2);
    setTimeout(()=>chord([146.83,174.61,220],2),430);
    setTimeout(()=>chord([123.47,155.56,185],2),860);
  }
}

function radioHost(text){
  // Optional browser voice. If unavailable, the visual clue + radio texture still works.
  if(!soundOn || !("speechSynthesis" in window))return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang="pt-BR"; u.rate=.80; u.pitch=.68; u.volume=.25;
    const voices=speechSynthesis.getVoices();
    const voice=voices.find(v=>/pt-BR/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
    if(voice) u.voice=voice;
    speechSynthesis.speak(u);
  }catch(e){}
}

function maybeStation(){
  if(!audioCtx||!soundOn||locked)return;
  const now=performance.now();
  if(now<stationGate)return;

  for(const s of CFG.stations){
    if(Math.abs(freq-s.f)<.075 && lastStation!==String(s.f)){
      lastStation=String(s.f);
      stationGate=now+1900;
      flash(s.msg);
      if(s.kind==="music1"||s.kind==="music2") instrumental(s.kind);
      if(s.kind==="host1"){
        radioHost("Boa noite... permaneça na sintonia.");
        instrumental("music2");
      }
      if(s.kind==="host2"){
        radioHost("A transmissão ainda não está completa.");
        instrumental("music1");
      }
      if(s.kind==="near") subHit();
      setTimeout(()=>{lastStation=""},1400);
      break;
    }
  }
}

async function lockFrequency(){
  if(locked)return;
  locked=true;
  cancelAnimationFrame(momentumId);
  freq=CFG.secret;
  renderDial();
  safeStoreSet("signal-found","1");
  safeStoreSet("signal-01-found","1");
  unlockCampaignPhase(2);

  try{speechSynthesis.cancel()}catch(e){}
  if(navigator.vibrate) navigator.vibrate(28);

  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.07);
    humGain.gain.setTargetAtTime(.003,audioCtx.currentTime,.12);
  }

  await delay(380);
  subHit();
  show("locked");
  await delay(720);
  playFinalMusic();
}

function playFinalMusic(){
  if(!audioCtx||!musicBuffer){
    flash("TOQUE PARA OUVIR O SINAL");
    const retry=async()=>{
      document.removeEventListener("pointerdown",retry);
      await initAudio();
      playFinalMusic();
    };
    document.addEventListener("pointerdown",retry,{once:true});
    return;
  }

  playToken++;
  const token=playToken;
  if(musicSource){try{musicSource.stop()}catch(e){}}

  musicSource=audioCtx.createBufferSource();
  musicSource.buffer=musicBuffer;
  musicSource.connect(musicGain);

  const now=audioCtx.currentTime;
  const offset=Math.max(0,Math.min(CFG.musicStart,musicBuffer.duration-.2));
  const duration=Math.min(CFG.musicDuration,musicBuffer.duration-offset);
  const fadeOut=Math.min(CFG.fadeOut,duration*.3);

  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(.0001,now);
  musicGain.gain.exponentialRampToValueAtTime(1,now+Math.max(.03,CFG.fadeIn));
  musicGain.gain.setValueAtTime(1,Math.max(now+.04,now+duration-fadeOut));
  musicGain.gain.exponentialRampToValueAtTime(.0001,now+duration);

  musicSource.start(now,offset,duration);
  drawViz(token);

  musicSource.onended=()=>{
    if(token!==playToken)return;
    setTimeout(()=>{show("end");scheduleCampaignAdvance(2,2800)},850);
  };
}

function drawViz(token){
  const rect=viz.getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2);
  viz.width=Math.max(1,Math.floor(rect.width*dpr));
  viz.height=Math.max(1,Math.floor(rect.height*dpr));
  vctx.setTransform(dpr,0,0,dpr,0,0);
  const bins=new Uint8Array(analyser.frequencyBinCount);

  function frame(){
    if(token!==playToken)return;
    analyser.getByteFrequencyData(bins);
    const w=rect.width,h=rect.height,mid=h/2;
    vctx.clearRect(0,0,w,h);
    vctx.beginPath();
    const count=72;
    for(let i=0;i<count;i++){
      const x=i/(count-1)*w;
      const idx=Math.floor(i/count*bins.length*.7);
      const a=bins[idx]/255;
      const y=mid+Math.sin(i*.52+performance.now()*.002)*(3+a*h*.19);
      i?vctx.lineTo(x,y):vctx.moveTo(x,y);
    }
    vctx.strokeStyle="rgba(240,166,95,.65)";
    vctx.lineWidth=1;
    vctx.stroke();
    requestAnimationFrame(frame);
  }
  frame();
}

function delay(ms){return new Promise(r=>setTimeout(r,ms))}

startBtn.addEventListener("click",async()=>{
  await initAudio();
  soundOn=true; soundState.textContent="ON";
  master.gain.setTargetAtTime(.78,audioCtx.currentTime,.05);
  safeStoreSet("signal-entered","1");
  show("tuner");
  subHit();
  setTimeout(()=>flash("PROCURE."),400);
});

soundBtn.addEventListener("click",async()=>{
  await initAudio();
  soundOn=!soundOn;
  soundState.textContent=soundOn?"ON":"OFF";
  master.gain.setTargetAtTime(soundOn?.78:0,audioCtx.currentTime,.05);
});

againBtn.addEventListener("click",async()=>{
  cancelCampaignAdvance();
  playToken++;
  if(musicSource){try{musicSource.stop()}catch(e){}}
  locked=false; freq=CFG.start; velocity=0;
  if(freqSlider)freqSlider.value=CFG.start;
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.07,audioCtx.currentTime,.08);
    humGain.gain.setTargetAtTime(.012,audioCtx.currentTime,.08);
  }
  renderDial();
  show("tuner");
});

// Native browser slider: click + hold + drag is handled by the browser itself.
if(freqSlider){
  freqSlider.addEventListener("input",e=>{
    if(locked)return;
    setFreq(parseFloat(e.currentTarget.value));
  });

  freqSlider.addEventListener("change",e=>{
    if(locked)return;
    setFreq(parseFloat(e.currentTarget.value));
  });

  // Keep wheel support while pointer is over the tuner.
  freqSlider.addEventListener("wheel",e=>{
    if(!screens.tuner.classList.contains("active") || locked)return;
    e.preventDefault();
    const direction=Math.sign(e.deltaY || e.deltaX);
    setFreq(freq + direction*.2);
    freqSlider.value=freq.toFixed(1);
  },{passive:false});

  // Prevent browser image/text dragging from stealing the gesture.
  freqSlider.addEventListener("dragstart",e=>e.preventDefault());
}

window.addEventListener("pointermove",e=>{
  const now=performance.now(),x=e.clientX/innerWidth,y=e.clientY/innerHeight;
  const dt=Math.max(8,now-pointer.t);
  const d=Math.hypot(x-pointer.lx,y-pointer.ly);
  pointer.v=Math.min(1,d/(dt/1000)*.025);
  pointer.x=x;pointer.y=y;pointer.lx=x;pointer.ly=y;pointer.t=now;
  document.documentElement.style.setProperty("--mx",e.clientX+"px");
  document.documentElement.style.setProperty("--my",e.clientY+"px");
},{passive:true});

function resize(){
  const dpr=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.floor(innerWidth*dpr);
  canvas.height=Math.floor(innerHeight*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  buildScale();
}
window.addEventListener("resize",resize);

function drawField(t){
  const w=innerWidth,h=innerHeight;
  ctx.clearRect(0,0,w,h);
  const lines=innerWidth<720?17:26;
  for(let i=0;i<lines;i++){
    const y=(i+1)*h/(lines+1);
    const dy=Math.abs(pointer.y*h-y);
    const influence=Math.max(0,1-dy/(h*.32));
    const amp=1.4+pointer.v*7+influence*3.5;
    ctx.beginPath();
    for(let x=-12;x<w+12;x+=12){
      const xn=x/w;
      const near=Math.max(0,1-Math.abs(xn-pointer.x)/.22);
      const yy=y+Math.sin(x*.014+t*.00034+i*.43)*amp+near*influence*Math.sin(x*.034+t*.0011)*7;
      x===-12?ctx.moveTo(x,yy):ctx.lineTo(x,yy);
    }
    ctx.strokeStyle=`rgba(232,216,189,${.017+influence*.024})`;
    ctx.lineWidth=1;
    ctx.stroke();
  }
  pointer.v*=.91;
  requestAnimationFrame(drawField);
}


/* =========================
   PHASE 2 — RESPOSTA
   Test mode only for now.
   Open the site with ?phase=2 to preview.
   No date automation yet.
   ========================= */
const P2 = {
  holdMs: 3200,
  audioStart: 0,
  // "teu amor.mp3" has ~15.3s. Play almost the whole transmission.
  audioDuration: 14.4,
  fadeIn: .20,
  fadeOut: 1.05
};

const phase2BeginBtn=$("#phase2BeginBtn");
const holdZone=$("#holdZone");
const holdProgress=$("#holdProgress");
const holdStatus=$("#holdStatus");
const blurPortrait=$("#blurPortrait");
const phase2FullImage=$(".phase2-full-image");
const phase2AgainBtn=$("#phase2AgainBtn");
const phase2Viz=$("#phase2Viz");
const p2ctx=phase2Viz.getContext("2d");

let phase2Buffer=null;
let phase2Source=null;
let phase2Gain=null;
let phase2Analyser=null;
let p2HoldStart=0;
let p2Holding=false;
let p2HoldFrame=0;
let p2PlayToken=0;

function initPhase2Visual(){
  if(window.PHASE2_IMAGE_DATA){
    blurPortrait.style.backgroundImage=`url("${window.PHASE2_IMAGE_DATA}")`;
    if(phase2FullImage) phase2FullImage.style.backgroundImage=`url("${window.PHASE2_IMAGE_DATA}")`;
  }
}

async function decodePhase2Audio(){
  if(phase2Buffer) return true;
  if(!audioCtx) await initAudio();
  try{
    const raw=atob(window.PHASE2_AUDIO_BASE64 || "");
    if(!raw) throw new Error("PHASE2_AUDIO_BASE64 ausente");
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    phase2Buffer=await audioCtx.decodeAudioData(bytes.buffer.slice(0));

    phase2Analyser=audioCtx.createAnalyser();
    phase2Analyser.fftSize=256;
    phase2Gain=audioCtx.createGain();
    phase2Gain.gain.value=1;
    phase2Gain.connect(phase2Analyser);
    phase2Analyser.connect(audioCtx.destination);
    return true;
  }catch(err){
    console.error("Phase 2 audio decode:",err);
    flash("ERRO NO SINAL 02");
    return false;
  }
}

function phase2CinematicBed(level=.016){
  if(!audioCtx||!soundOn)return;
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type="sine";
  osc.frequency.value=53;
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(level,now+.1);
  gain.gain.exponentialRampToValueAtTime(.0001,now+2.4);
  osc.connect(gain).connect(master);
  osc.start(now); osc.stop(now+2.5);
}

function startHold(e){
  e.preventDefault();
  if(p2Holding)return;
  p2Holding=true;
  p2HoldStart=performance.now();
  holdStatus.textContent="O SINAL ESTÁ SE APROXIMANDO...";
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.040,audioCtx.currentTime,.05);
    humGain.gain.setTargetAtTime(.020,audioCtx.currentTime,.08);
  }
  phase2CinematicBed(.028);
  p2HoldFrame=requestAnimationFrame(updateHold);
}

function stopHold(){
  if(!p2Holding)return;
  p2Holding=false;
  cancelAnimationFrame(p2HoldFrame);
  holdStatus.textContent="A PRESENÇA SE AFASTOU — SEGURE NOVAMENTE";
  holdProgress.style.setProperty("--hold","0deg");
  blurPortrait.style.filter="blur(44px) saturate(.82) contrast(1.08) brightness(.47)";
  blurPortrait.style.opacity=".58";
  blurPortrait.style.transform="scale(1.18)";
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.065,audioCtx.currentTime,.08);
  }
}

function updateHold(){
  if(!p2Holding)return;
  const elapsed=performance.now()-p2HoldStart;
  const p=Math.min(1,elapsed/P2.holdMs);
  holdProgress.style.setProperty("--hold",`${p*360}deg`);

  // Never becomes sharp. The image is perceived as presence, not reveal.
  const blur=44-(p*25);  // 44px -> 19px
  const opacity=.58+(p*.18);
  const scale=1.18-(p*.075);
  const sat=.82+(p*.14);
  const bright=.47+(p*.10);
  blurPortrait.style.filter=`blur(${blur}px) saturate(${sat}) contrast(1.08) brightness(${bright})`;
  blurPortrait.style.opacity=String(opacity);
  blurPortrait.style.transform=`scale(${scale})`;

  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.045*(1-p)+.003,audioCtx.currentTime,.04);
    noiseFilter.frequency.setTargetAtTime(900+p*2200,audioCtx.currentTime,.04);
  }

  if(p>=1){
    p2Holding=false;
    holdStatus.textContent="PRESENÇA DETECTADA";
    if(navigator.vibrate) navigator.vibrate([24,40,24]);
    receivePhase2();
    return;
  }
  p2HoldFrame=requestAnimationFrame(updateHold);
}

async function receivePhase2(){
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.08);
    humGain.gain.setTargetAtTime(.003,audioCtx.currentTime,.1);
  }
  await delay(420);
  phase2CinematicBed(.035);
  flash("PRESENÇA DETECTADA");
  await delay(550);
  show("phase2Received");
  await delay(450);
  playPhase2Audio();
}

async function playPhase2Audio(){
  const ok=await decodePhase2Audio();
  if(!ok)return;
  if(audioCtx.state==="suspended") await audioCtx.resume();

  p2PlayToken++;
  const token=p2PlayToken;

  if(phase2Source){
    try{phase2Source.stop()}catch(e){}
  }

  phase2Source=audioCtx.createBufferSource();
  phase2Source.buffer=phase2Buffer;
  phase2Source.connect(phase2Gain);

  const now=audioCtx.currentTime;
  const offset=Math.max(0,Math.min(P2.audioStart,Math.max(0,phase2Buffer.duration-.2)));
  const dur=Math.min(P2.audioDuration,phase2Buffer.duration-offset);
  const fadeOut=Math.min(P2.fadeOut,dur*.3);

  phase2Gain.gain.cancelScheduledValues(now);
  phase2Gain.gain.setValueAtTime(.0001,now);
  phase2Gain.gain.exponentialRampToValueAtTime(1,now+Math.max(.03,P2.fadeIn));
  phase2Gain.gain.setValueAtTime(1,Math.max(now+.05,now+dur-fadeOut));
  phase2Gain.gain.exponentialRampToValueAtTime(.0001,now+dur);

  phase2Source.start(now,offset,dur);
  drawPhase2Viz(token);

  phase2Source.onended=()=>{
    if(token!==p2PlayToken)return;
    safeStoreSet("signal-02-found","1");
    unlockCampaignPhase(3);
    setTimeout(()=>{show("phase2End");scheduleCampaignAdvance(3,2800)},850);
  };
}

function drawPhase2Viz(token){
  const rect=phase2Viz.getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2);
  phase2Viz.width=Math.max(1,Math.floor(rect.width*dpr));
  phase2Viz.height=Math.max(1,Math.floor(rect.height*dpr));
  p2ctx.setTransform(dpr,0,0,dpr,0,0);
  const bins=new Uint8Array(phase2Analyser.frequencyBinCount);

  function frame(){
    if(token!==p2PlayToken)return;
    phase2Analyser.getByteFrequencyData(bins);
    const w=rect.width,h=rect.height,mid=h/2;
    p2ctx.clearRect(0,0,w,h);
    p2ctx.beginPath();
    const count=76;
    for(let i=0;i<count;i++){
      const x=i/(count-1)*w;
      const idx=Math.floor(i/count*bins.length*.74);
      const a=bins[idx]/255;
      const y=mid+Math.sin(i*.47+performance.now()*.0023)*(2+a*h*.2);
      i?p2ctx.lineTo(x,y):p2ctx.moveTo(x,y);
    }
    p2ctx.strokeStyle="rgba(240,166,95,.68)";
    p2ctx.lineWidth=1;
    p2ctx.stroke();
    requestAnimationFrame(frame);
  }
  frame();
}

function openPhase2(){
  initPhase2Visual();
  $("#phase2Return").textContent =
    safeStoreGet("signal-found")==="1" ? "VOCÊ VOLTOU." : "NOVA TRANSMISSÃO DETECTADA.";
  show("phase2Intro");
}

phase2BeginBtn.addEventListener("click",async()=>{
  await initAudio();
  await decodePhase2Audio();
  soundOn=true;
  soundState.textContent="ON";
  master.gain.setTargetAtTime(.78,audioCtx.currentTime,.05);
  noiseGain.gain.setTargetAtTime(.06,audioCtx.currentTime,.08);
  phase2CinematicBed(.022);
  show("phase2Hold");
});

holdZone.addEventListener("pointerdown",startHold);
window.addEventListener("pointerup",stopHold);
window.addEventListener("pointercancel",stopHold);

phase2AgainBtn.addEventListener("click",()=>{
  cancelCampaignAdvance();
  p2PlayToken++;
  if(phase2Source){try{phase2Source.stop()}catch(e){}}
  holdProgress.style.setProperty("--hold","0deg");
  holdStatus.textContent="O SINAL ESTÁ RESPONDENDO";
  initPhase2Visual();
  show("phase2Hold");
});


/* =========================
   PHASE 3 — ALINHAMENTO
   Preview/manual only. No date automation.
   ========================= */
const P3 = {
  targetDesktopX: .62,
  targetDesktopY: .43,
  targetMobileX: .55,
  targetMobileY: .49,
  lockScore: .965,
  lockMs: 560,
  audioStart: 39.5,
  audioDuration: 14.0,
  fadeIn: .15,
  fadeOut: 1.0,
  previewStart: 39.5,
  previewEnd: 44.5
};

const transmissionLabel=$("#transmissionLabel");
const phase3BeginBtn=$("#phase3BeginBtn");
const phase3AgainBtn=$("#phase3AgainBtn");
const fragmentStage=$("#fragmentStage");
const p3Fragments=[...document.querySelectorAll(".p3-frag")];
const alignTarget=$("#alignTarget");
const alignFill=$("#alignFill");
const alignState=$("#alignState");
const phase3Hero=$("#phase3Hero");
const freqHint=$("#freqHint");
const p3LightPulse=$("#p3LightPulse");

let p3Buffer=null;
let p3Gain=null;
let p3Analyser=null;
let p3Source=null;
let p3PreviewSource=null;
let p3PreviewGain=null;
let p3PreviewFilter=null;
let p3PreviewPanner=null;
let p3AlignLocked=false;
let p3LockStart=0;
let p3Score=0;
let p3Token=0;

function initPhase3Visual(){
  if(!window.PHASE3_IMAGE_DATA)return;
  p3Fragments.forEach(el=>el.style.backgroundImage=`url("${window.PHASE3_IMAGE_DATA}")`);
  if(phase3Hero) phase3Hero.style.backgroundImage=`url("${window.PHASE3_IMAGE_DATA}")`;
}

async function decodePhase3Audio(){
  if(p3Buffer)return true;
  if(!audioCtx)await initAudio();
  try{
    const raw=atob(window.PHASE3_AUDIO_BASE64||"");
    if(!raw)throw new Error("PHASE3_AUDIO_BASE64 ausente");
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    p3Buffer=await audioCtx.decodeAudioData(bytes.buffer.slice(0));

    p3Analyser=audioCtx.createAnalyser();
    p3Analyser.fftSize=256;
    p3Gain=audioCtx.createGain();
    p3Gain.gain.value=1;
    p3Gain.connect(p3Analyser);
    p3Analyser.connect(audioCtx.destination);
    return true;
  }catch(err){
    console.error("Phase 3 audio decode:",err);
    flash("ERRO NA TRANSMISSÃO 03");
    return false;
  }
}

function openPhase3(){
  document.body.classList.add("phase3-mode");
  initPhase3Visual();
  if(transmissionLabel)transmissionLabel.textContent="TRANSMISSÃO // 003";
  $("#phase3Return").textContent =
    safeStoreGet("signal-02-found")==="1" ? "VOCÊ VOLTOU." : "NOVO PADRÃO DETECTADO.";
  show("phase3Intro");
}

function p3Target(){
  const mobile=innerWidth<720;
  return {
    x:mobile?P3.targetMobileX:P3.targetDesktopX,
    y:mobile?P3.targetMobileY:P3.targetDesktopY
  };
}

function p3SetScore(x,y){
  if(p3AlignLocked)return;
  const target=p3Target();
  const dx=x-target.x,dy=y-target.y;
  const dist=Math.hypot(dx,dy);
  // generous but still discoverable
  const maxDist=.58;
  let score=1-Math.min(1,dist/maxDist);
  score=Math.pow(score,1.18);
  p3Score=score;

  const mis=1-score;
  const swayX=(x-.5)*18*mis;
  const swayY=(y-.5)*13*mis;

  p3Fragments.forEach((el,i)=>{
    const baseX=parseFloat(el.dataset.x||0);
    const baseY=parseFloat(el.dataset.y||0);
    const depth=.72+(i%3)*.19;
    const tx=baseX*mis+swayX*depth;
    const ty=baseY*mis+swayY*depth;
    const blur=Math.max(.25,7.5*mis);
    const opacity=.70+score*.28;
    el.style.transform=`translate3d(${tx}px,${ty}px,0) scale(${1.02+mis*.035})`;
    el.style.filter=`blur(${blur}px) saturate(${.72+score*.25}) contrast(1.08) brightness(${.68+score*.16})`;
    el.style.opacity=String(opacity);
  });

  alignFill.style.width=`${Math.round(score*100)}%`;

  if(score>.88){
    alignState.textContent="PARTES COINCIDINDO";
    alignTarget.classList.add("near");
  }else{
    alignState.textContent="PARTES INSTÁVEIS";
    alignTarget.classList.remove("near");
    p3LockStart=0;
  }

  if(p3PreviewFilter&&audioCtx){
    p3PreviewFilter.frequency.setTargetAtTime(520+score*3600,audioCtx.currentTime,.04);
    p3PreviewFilter.Q.setTargetAtTime(2.8-score*2.0,audioCtx.currentTime,.05);
    p3PreviewGain.gain.setTargetAtTime(.015+score*.055,audioCtx.currentTime,.06);
    if(p3PreviewPanner){
      p3PreviewPanner.pan.setTargetAtTime((x-.5)*(1-score)*1.5,audioCtx.currentTime,.05);
    }
  }

  if(score>=P3.lockScore){
    if(!p3LockStart)p3LockStart=performance.now();
    if(performance.now()-p3LockStart>=P3.lockMs){
      completePhase3Alignment();
    }
  }else{
    p3LockStart=0;
  }
}

function p3PointerMove(e){
  if(!screens.phase3Align.classList.contains("active")||p3AlignLocked)return;
  p3SetScore(e.clientX/innerWidth,e.clientY/innerHeight);
}

function p3TouchMove(e){
  if(!screens.phase3Align.classList.contains("active")||p3AlignLocked)return;
  const t=e.touches?.[0];
  if(!t)return;
  p3SetScore(t.clientX/innerWidth,t.clientY/innerHeight);
}

async function startPhase3Preview(){
  const ok=await decodePhase3Audio();
  if(!ok||!audioCtx)return;
  stopPhase3Preview();

  p3PreviewSource=audioCtx.createBufferSource();
  p3PreviewSource.buffer=p3Buffer;
  p3PreviewSource.loop=true;
  p3PreviewSource.loopStart=Math.min(P3.previewStart,p3Buffer.duration-.5);
  p3PreviewSource.loopEnd=Math.min(P3.previewEnd,p3Buffer.duration);

  p3PreviewFilter=audioCtx.createBiquadFilter();
  p3PreviewFilter.type="bandpass";
  p3PreviewFilter.frequency.value=520;
  p3PreviewFilter.Q.value=2.8;

  p3PreviewGain=audioCtx.createGain();
  p3PreviewGain.gain.value=.015;

  if(audioCtx.createStereoPanner){
    p3PreviewPanner=audioCtx.createStereoPanner();
    p3PreviewSource.connect(p3PreviewFilter).connect(p3PreviewPanner).connect(p3PreviewGain).connect(audioCtx.destination);
  }else{
    p3PreviewPanner=null;
    p3PreviewSource.connect(p3PreviewFilter).connect(p3PreviewGain).connect(audioCtx.destination);
  }

  p3PreviewSource.start(0,P3.previewStart);
}

function stopPhase3Preview(){
  if(p3PreviewSource){
    try{p3PreviewSource.stop()}catch(e){}
    try{p3PreviewSource.disconnect()}catch(e){}
  }
  p3PreviewSource=null;
}

async function completePhase3Alignment(){
  if(p3AlignLocked)return;
  p3AlignLocked=true;
  p3Score=1;
  stopPhase3Preview();

  p3Fragments.forEach(el=>{
    el.style.transform="translate3d(0,0,0) scale(1)";
    el.style.filter="blur(0px) saturate(.97) contrast(1.06) brightness(.84)";
    el.style.opacity="1";
  });
  alignFill.style.width="100%";
  alignState.textContent="ALINHADO";
  alignTarget.classList.add("near");

  if(navigator.vibrate)navigator.vibrate([22,35,22]);
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.06);
    humGain.gain.setTargetAtTime(.002,audioCtx.currentTime,.08);
  }

  subHit();
  await delay(620);
  show("phase3Received");
  if(p3LightPulse)p3LightPulse.classList.add("playing");
  await delay(520);
  playPhase3Audio();
}

async function playPhase3Audio(){
  const ok=await decodePhase3Audio();
  if(!ok)return;
  if(audioCtx.state==="suspended")await audioCtx.resume();

  p3Token++;
  const token=p3Token;
  if(p3Source){try{p3Source.stop()}catch(e){}}

  p3Source=audioCtx.createBufferSource();
  p3Source.buffer=p3Buffer;
  p3Source.connect(p3Gain);

  const now=audioCtx.currentTime;
  const offset=Math.max(0,Math.min(P3.audioStart,p3Buffer.duration-.2));
  const dur=Math.min(P3.audioDuration,p3Buffer.duration-offset);
  const fadeOut=Math.min(P3.fadeOut,dur*.3);

  p3Gain.gain.cancelScheduledValues(now);
  p3Gain.gain.setValueAtTime(.0001,now);
  p3Gain.gain.exponentialRampToValueAtTime(1,now+Math.max(.03,P3.fadeIn));
  p3Gain.gain.setValueAtTime(1,Math.max(now+.05,now+dur-fadeOut));
  p3Gain.gain.exponentialRampToValueAtTime(.0001,now+dur);

  p3Source.start(now,offset,dur);

  // Two incomplete clues. Never show the full title in this phase.
  setTimeout(()=>p3Hint("F R E Q",token),4100);
  setTimeout(()=>p3Hint("___UÊNCIA",token),9300);

  p3Source.onended=()=>{
    if(token!==p3Token)return;
    if(p3LightPulse)p3LightPulse.classList.remove("playing");
    safeStoreSet("signal-03-found","1");
    unlockCampaignPhase(4);
    setTimeout(()=>{show("phase3End");scheduleCampaignAdvance(4,2800)},850);
  };
}

function p3Hint(text,token){
  if(token!==p3Token||!freqHint)return;
  freqHint.textContent=text;
  freqHint.classList.remove("show");
  void freqHint.offsetWidth;
  freqHint.classList.add("show");
}

function resetPhase3Alignment(){
  p3AlignLocked=false;
  p3LockStart=0;
  p3Score=0;
  alignFill.style.width="0%";
  alignState.textContent="PARTES INSTÁVEIS";
  alignTarget.classList.remove("near");
  p3Fragments.forEach((el)=>{
    const baseX=parseFloat(el.dataset.x||0);
    const baseY=parseFloat(el.dataset.y||0);
    el.style.transform=`translate3d(${baseX}px,${baseY}px,0) scale(1.055)`;
    el.style.filter="blur(7.5px) saturate(.72) contrast(1.08) brightness(.68)";
    el.style.opacity=".72";
  });
}

phase3BeginBtn.addEventListener("click",async()=>{
  await initAudio();
  await decodePhase3Audio();
  soundOn=true;
  soundState.textContent="ON";
  master.gain.setTargetAtTime(.45,audioCtx.currentTime,.05);
  noiseGain.gain.setTargetAtTime(.004,audioCtx.currentTime,.08);
  humGain.gain.setTargetAtTime(.005,audioCtx.currentTime,.08);

  resetPhase3Alignment();
  show("phase3Align");
  await startPhase3Preview();
});

phase3AgainBtn.addEventListener("click",async()=>{
  p3Token++;
  if(p3Source){try{p3Source.stop()}catch(e){}}
  if(p3LightPulse)p3LightPulse.classList.remove("playing");
  resetPhase3Alignment();
  show("phase3Align");
  await startPhase3Preview();
});

window.addEventListener("pointermove",p3PointerMove,{passive:true});
window.addEventListener("touchmove",p3TouchMove,{passive:true});



/* =========================
   PHASE 4 — REVELAÇÃO
   Preview/manual only. No date automation.
   ========================= */
const P4 = {
  audioStart: 0.00,
  audioDuration: 18.00,
  fadeIn: .18,
  fadeOut: 1.25,
  revealThreshold: .985
};

const phase4BeginBtn=$("#phase4BeginBtn");
const phase4AgainBtn=$("#phase4AgainBtn");
const phase4Cover=$("#phase4Cover");
const phase4TitleCover=$("#phase4TitleCover");
const phase4EndBg=$(".phase4-end-bg");
const phase4IntroBg=$(".phase4-intro-bg");
const phase4Reveal=$("#screenPhase4Reveal");
const phase4Progress=$("#phase4Progress");
const phase4GuideText=$("#phase4GuideText");
const p4PartA=$("#p4PartA");
const p4PartB=$("#p4PartB");
const p4Scan=$(".phase4-scan");
const phase4AudioPulse=$("#phase4AudioPulse");

let p4Buffer=null;
let p4Gain=null;
let p4Analyser=null;
let p4Source=null;
let p4Token=0;
let p4Triggered=false;
let p4ScrollRAF=0;
let p4DecodePromise=null;
let p4AudioReady=false;

function initPhase4Visual(){
  if(!window.PHASE4_IMAGE_DATA)return;
  const bg=`url("${window.PHASE4_IMAGE_DATA}")`;
  [phase4Cover,phase4TitleCover,phase4EndBg,phase4IntroBg].forEach(el=>{
    if(el)el.style.backgroundImage=bg;
  });
}

async function decodePhase4Audio(){
  if(p4Buffer) return true;
  if(p4DecodePromise) return p4DecodePromise;

  p4DecodePromise=(async()=>{
    try{
      if(!audioCtx) await initAudio();
      const raw=atob(window.PHASE4_AUDIO_BASE64||"");
      if(!raw) throw new Error("PHASE4_AUDIO_BASE64 ausente");

      // Yield once before the heavier conversion so the UI can paint first.
      await new Promise(requestAnimationFrame);

      const bytes=new Uint8Array(raw.length);
      const chunk=65536;
      for(let start=0;start<raw.length;start+=chunk){
        const end=Math.min(raw.length,start+chunk);
        for(let i=start;i<end;i++) bytes[i]=raw.charCodeAt(i);
        if(start && start%(chunk*8)===0){
          await new Promise(r=>setTimeout(r,0));
        }
      }

      p4Buffer=await audioCtx.decodeAudioData(bytes.buffer.slice(0));

      p4Analyser=audioCtx.createAnalyser();
      p4Analyser.fftSize=256;
      p4Gain=audioCtx.createGain();
      p4Gain.gain.value=1;
      p4Gain.connect(p4Analyser);
      p4Analyser.connect(audioCtx.destination);

      p4AudioReady=true;
      return true;
    }catch(err){
      console.error("Phase 4 audio decode:",err);
      p4AudioReady=false;
      p4DecodePromise=null;
      flash("ÁUDIO AINDA NÃO ESTÁ PRONTO");
      return false;
    }
  })();

  return p4DecodePromise;
}

function openPhase4(){
  document.body.classList.remove("phase3-mode");
  document.body.classList.add("phase4-mode");
  initPhase4Visual();
  if(transmissionLabel)transmissionLabel.textContent="TRANSMISSÃO // 004";
  $("#phase4Return").textContent =
    safeStoreGet("signal-03-found")==="1"
      ? "VOCÊ CONSEGUIU CHEGAR ATÉ AQUI."
      : "A REVELAÇÃO FOI LIBERADA.";
  show("phase4Intro");
}

function resetPhase4Reveal(){
  p4Triggered=false;
  phase4Reveal.scrollTop=0;
  phase4Progress.style.width="0%";
  phase4GuideText.textContent="CONTINUE.";
  p4PartA.style.transform="translateX(-14vw)";
  p4PartB.style.transform="translateX(14vw)";
  p4PartA.style.opacity=".48";
  p4PartB.style.opacity=".48";
  p4PartA.style.filter="blur(6px)";
  p4PartB.style.filter="blur(6px)";
  if(phase4Cover){
    phase4Cover.style.filter="grayscale(.52) hue-rotate(155deg) saturate(.48) blur(26px) brightness(.24)";
    phase4Cover.style.transform="scale(1.10)";
    phase4Cover.style.opacity=".34";
  }
  if(p4Scan){
    p4Scan.style.opacity="0";
    p4Scan.style.transform="translateY(0)";
  }
}

function phase4ScrollProgress(){
  const max=Math.max(1,phase4Reveal.scrollHeight-phase4Reveal.clientHeight);
  return Math.max(0,Math.min(1,phase4Reveal.scrollTop/max));
}

function renderPhase4Scroll(){
  cancelAnimationFrame(p4ScrollRAF);
  p4ScrollRAF=requestAnimationFrame(()=>{
    if(!screens.phase4Reveal.classList.contains("active"))return;
    const p=phase4ScrollProgress();
    const ease=p*p*(3-2*p);

    phase4Progress.style.width=`${(p*100).toFixed(1)}%`;

    if(p<.24)phase4GuideText.textContent="O SINAL ESTÁ SE ABRINDO.";
    else if(p<.55)phase4GuideText.textContent="CONTINUE.";
    else if(p<.82)phase4GuideText.textContent="VOCÊ JÁ CONSEGUE VER.";
    else phase4GuideText.textContent="NÃO PARE.";

    const blur=26*(1-ease);
    const bright=.24+ease*.50;
    const scale=1.10-ease*.09;
    const opacity=.34+ease*.66;

    // Stay visually cold through most of the journey.
    // Original amber artwork begins returning only near the end.
    const warmReveal=Math.max(0,(ease-.78)/.22);
    const gray=.52*(1-warmReveal);
    const hue=155*(1-warmReveal);
    const sat=.48 + warmReveal*.44;

    phase4Cover.style.filter=`grayscale(${gray}) hue-rotate(${hue}deg) saturate(${sat}) blur(${blur}px) brightness(${bright})`;
    phase4Cover.style.transform=`scale(${scale})`;
    phase4Cover.style.opacity=String(opacity);

    const gap=(1-ease)*14;
    p4PartA.style.transform=`translateX(${-gap}vw)`;
    p4PartB.style.transform=`translateX(${gap}vw)`;
    p4PartA.style.opacity=String(.48+ease*.48);
    p4PartB.style.opacity=String(.48+ease*.48);
    p4PartA.style.filter=`blur(${6*(1-ease)}px)`;
    p4PartB.style.filter=`blur(${6*(1-ease)}px)`;

    if(p4Scan){
      p4Scan.style.opacity=String(Math.min(.86,p*1.2));
      p4Scan.style.transform=`translateY(${p*48}vh)`;
    }

    if(p>=P4.revealThreshold && !p4Triggered){
      p4Triggered=true;
      completePhase4Reveal();
    }
  });
}

async function completePhase4Reveal(){
  if(navigator.vibrate)navigator.vibrate([22,38,34]);
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.06);
    humGain.gain.setTargetAtTime(.001,audioCtx.currentTime,.08);
  }

  subHit();
  await delay(520);
  show("phase4Title");
  if(phase4AudioPulse)phase4AudioPulse.classList.add("playing");
  await delay(680);
  // Audio may still be decoding; visual reveal never waits for it.
  playPhase4Audio();
}

async function playPhase4Audio(){
  if(!p4AudioReady){
    flash("PREPARANDO TRANSMISSÃO...");
  }
  const ok=await decodePhase4Audio();
  if(!ok){
    setTimeout(()=>{show("phase4End");scheduleCampaignAdvance(5,3000)},1500);
    return;
  }
  if(audioCtx.state==="suspended")await audioCtx.resume();

  p4Token++;
  const token=p4Token;
  if(p4Source){try{p4Source.stop()}catch(e){}}

  p4Source=audioCtx.createBufferSource();
  p4Source.buffer=p4Buffer;
  p4Source.connect(p4Gain);

  const now=audioCtx.currentTime;
  const offset=Math.max(0,Math.min(P4.audioStart,p4Buffer.duration-.2));
  const dur=Math.min(P4.audioDuration,p4Buffer.duration-offset);
  const fadeOut=Math.min(P4.fadeOut,dur*.3);

  p4Gain.gain.cancelScheduledValues(now);
  p4Gain.gain.setValueAtTime(.0001,now);
  p4Gain.gain.exponentialRampToValueAtTime(1,now+Math.max(.03,P4.fadeIn));
  p4Gain.gain.setValueAtTime(1,Math.max(now+.05,now+dur-fadeOut));
  p4Gain.gain.exponentialRampToValueAtTime(.0001,now+dur);

  p4Source.start(now,offset,dur);

  p4Source.onended=()=>{
    if(token!==p4Token)return;
    if(phase4AudioPulse)phase4AudioPulse.classList.remove("playing");
    safeStoreSet("signal-04-found","1");
    unlockCampaignPhase(5);
    setTimeout(()=>{show("phase4End");scheduleCampaignAdvance(5,3000)},900);
  };
}

phase4BeginBtn.addEventListener("click",async()=>{
  // Respond visually FIRST. Never make the user wait for MP3 decoding.
  document.body.classList.add("phase4-mode");
  resetPhase4Reveal();
  show("phase4Reveal");
  setTimeout(renderPhase4Scroll,40);

  // Audio engine unlocks after the screen has already changed.
  try{
    await initAudio();
    soundOn=true;
    soundState.textContent="ON";
    master.gain.setTargetAtTime(.35,audioCtx.currentTime,.06);
    noiseGain.gain.setTargetAtTime(.002,audioCtx.currentTime,.08);
    humGain.gain.setTargetAtTime(.003,audioCtx.currentTime,.08);

    // Do NOT await. Decode silently in the background.
    decodePhase4Audio();
  }catch(err){
    console.error("Phase 4 audio initialization:",err);
  }
});

phase4Reveal.addEventListener("scroll",renderPhase4Scroll,{passive:true});

phase4AgainBtn.addEventListener("click",()=>{
  cancelCampaignAdvance();
  p4Token++;
  if(p4Source){try{p4Source.stop()}catch(e){}}
  if(phase4AudioPulse)phase4AudioPulse.classList.remove("playing");
  resetPhase4Reveal();
  show("phase4Reveal");
  setTimeout(renderPhase4Scroll,60);
});



/* =========================
   PHASE 5 — DECODIFICAÇÃO V3 STABLE
   Fixed stations, simple DOM, HTMLAudio soundtrack.
   ========================= */
const P5 = {
  releaseDate:"11.09.2026",
  stations:[
    {x:.02,freq:"89.7"},
    {x:.157,freq:"92.3"},
    {x:.294,freq:"94.8"},
    {x:.431,freq:"97.4"},
    {x:.569,freq:"100.1"},
    {x:.706,freq:"102.7"},
    {x:.843,freq:"105.3"},
    {x:.98,freq:"107.9"}
  ],
  hitRadius:.055
};

const phase5BeginBtn=$("#phase5BeginBtn");
const phase5AgainBtn=$("#phase5AgainBtn");
const phase5PresaveBtn=$("#phase5PresaveBtn");
const phase5PresaveStatus=$("#phase5PresaveStatus");
const phase5Scanner=$("#phase5Scanner");
const p5Zone=$("#p5StationZone");
const phase5NodeEls=[...document.querySelectorAll("#phase5Nodes button")];
const phase5FoundCount=$("#phase5FoundCount");
const phase5CounterFill=$("#phase5CounterFill");
const p5DateDay=$("#p5DateDay");
const p5DateMonth=$("#p5DateMonth");
const p5DateYear=$("#p5DateYear");
const p5Soundtrack=$("#phase5Soundtrack");
const p5CompleteCover=$(".phase5-complete-cover");
const p5Ghosts=[...document.querySelectorAll(".phase5-cover-ghost")];

let p5Found=new Set();
let p5Done=false;

function initPhase5Visual(){
  if(window.PHASE4_IMAGE_DATA){
    const bg=`url("${window.PHASE4_IMAGE_DATA}")`;
    p5Ghosts.forEach(el=>el.style.backgroundImage=bg);
    if(p5CompleteCover)p5CompleteCover.style.backgroundImage=bg;
  }

  if(p5Soundtrack && window.PHASE5_SINTONIA_BASE64 && !p5Soundtrack.src){
    p5Soundtrack.src="data:audio/mpeg;base64,"+window.PHASE5_SINTONIA_BASE64;
    p5Soundtrack.loop=true;
    p5Soundtrack.volume=.58;
  }
}

function p5StartAudio(){
  if(!p5Soundtrack)return;
  try{
    p5Soundtrack.currentTime=0;
    const promise=p5Soundtrack.play();
    if(promise&&promise.catch)promise.catch(err=>console.warn("P5 audio:",err));
  }catch(err){
    console.warn("P5 audio:",err);
  }
}

function p5StopAudio(){
  if(!p5Soundtrack)return;
  try{
    const start=p5Soundtrack.volume;
    let step=0;
    const timer=setInterval(()=>{
      step++;
      p5Soundtrack.volume=Math.max(0,start*(1-step/6));
      if(step>=6){
        clearInterval(timer);
        try{p5Soundtrack.pause()}catch(e){}
        p5Soundtrack.volume=.58;
      }
    },55);
  }catch(e){}
}

function p5Reset(){
  p5Done=false;
  p5Found.clear();
  phase5NodeEls.forEach(el=>el.classList.remove("near","found"));
  phase5FoundCount.textContent="0";
  phase5CounterFill.style.width="0%";
  p5DateDay.textContent="__";
  p5DateMonth.textContent="__";
  p5DateYear.textContent="____";
  [p5DateDay,p5DateMonth,p5DateYear].forEach(el=>el.classList.remove("decoded"));
  phase5Scanner.style.left="0%";
}

function p5UpdateDate(){
  const n=p5Found.size;
  phase5FoundCount.textContent=String(n);
  phase5CounterFill.style.width=`${n/8*100}%`;

  if(n>=3){
    p5DateDay.textContent="11";
    p5DateDay.classList.add("decoded");
  }
  if(n>=5){
    p5DateMonth.textContent="09";
    p5DateMonth.classList.add("decoded");
  }
  if(n>=7){
    p5DateYear.textContent="2026";
    p5DateYear.classList.add("decoded");
  }

  if(n===8 && !p5Done){
    p5Done=true;
    setTimeout(p5Complete,650);
  }
}

function p5Hit(index){
  if(index<0||index>=8||p5Found.has(index))return;

  p5Found.add(index);
  const el=phase5NodeEls[index];
  if(el){
    el.classList.remove("near");
    el.classList.add("found");
  }

  phase5Scanner.style.left=`${P5.stations[index].x*100}%`;
  flash(`FREQUÊNCIA ${P5.stations[index].freq} // SINAL ${String(index+1).padStart(2,"0")}`);

  if(navigator.vibrate){
    try{navigator.vibrate(15)}catch(e){}
  }

  p5UpdateDate();
}

function p5MoveFromClientX(clientX){
  if(!screens.phase5Scan.classList.contains("active")||!p5Zone||p5Done)return;

  const rect=p5Zone.getBoundingClientRect();
  if(!rect.width)return;

  let x=(clientX-rect.left)/rect.width;
  x=Math.max(0,Math.min(1,x));

  let nearest=0;
  let dist=Infinity;
  P5.stations.forEach((s,i)=>{
    const d=Math.abs(x-s.x);
    if(d<dist){dist=d;nearest=i}
  });

  phase5NodeEls.forEach((el,i)=>{
    if(!p5Found.has(i))el.classList.toggle("near",i===nearest&&dist<.085);
  });

  // Magnetic movement
  let scannerX=x;
  if(dist<.085){
    const strength=1-dist/.085;
    scannerX=x+(P5.stations[nearest].x-x)*strength*.75;
  }

  phase5Scanner.style.left=`${scannerX*100}%`;

  if(dist<P5.hitRadius){
    p5Hit(nearest);
  }
}

function p5Complete(){
  p5StopAudio();
  safeStoreSet("signal-05-found","1");
  unlockCampaignPhase(6);
  if(navigator.vibrate){
    try{navigator.vibrate([25,30,25,30,45])}catch(e){}
  }
  show("phase5Complete");
  scheduleCampaignAdvance(6,1800);
}

document.addEventListener("visibilitychange",()=>{
  if(!document.hidden && p5Done && screens.phase5Complete?.classList.contains("active")){
    scheduleCampaignAdvance(6,700);
  }
});

function openPhase5(){
  document.body.classList.remove("phase3-mode","phase4-mode");
  document.body.classList.add("phase5-mode");
  initPhase5Visual();
  if(transmissionLabel)transmissionLabel.textContent="TRANSMISSÃO // 005";
  const ret=$("#phase5Return");
  if(ret){
    ret.textContent=safeStoreGet("signal-04-found")==="1"
      ?"VOCÊ JÁ CONHECE O SINAL."
      :"A DECODIFICAÇÃO FOI LIBERADA.";
  }
  show("phase5Intro");
}

phase5BeginBtn.addEventListener("click",()=>{
  initPhase5Visual();
  p5Reset();
  show("phase5Scan");
  p5StartAudio();
});

phase5NodeEls.forEach((el,i)=>{
  const hit=(e)=>{
    e.preventDefault();
    e.stopPropagation();
    p5Hit(i);
  };
  el.addEventListener("pointerup",hit);
  el.addEventListener("touchend",hit,{passive:false});
});

if(p5Zone){
  p5Zone.style.touchAction="none";

  p5Zone.addEventListener("pointermove",(e)=>{
    if(e.pointerType==="touch" && !e.isPrimary)return;
    p5MoveFromClientX(e.clientX);
  },{passive:true});

  p5Zone.addEventListener("pointerdown",(e)=>{
    p5MoveFromClientX(e.clientX);
  },{passive:true});

  p5Zone.addEventListener("touchstart",(e)=>{
    const t=e.touches&&e.touches[0];
    if(t){
      e.preventDefault();
      p5MoveFromClientX(t.clientX);
    }
  },{passive:false});

  p5Zone.addEventListener("touchmove",(e)=>{
    const t=e.touches&&e.touches[0];
    if(t){
      e.preventDefault();
      p5MoveFromClientX(t.clientX);
    }
  },{passive:false});
}

phase5PresaveBtn.addEventListener("click",()=>{
  const url=(window.CAMPAIGN_CONFIG&&window.CAMPAIGN_CONFIG.presaveUrl)||"";
  if(url){
    phase5PresaveStatus.textContent="PRÉ-SAVE ABERTO EM UMA NOVA ABA.";
    window.open(url,"_blank","noopener,noreferrer");
  }else{
    phase5PresaveStatus.textContent="O LINK PARA RECEBER O SINAL AINDA NÃO FOI LIBERADO.";
  }
});

phase5AgainBtn.addEventListener("click",()=>{
  cancelCampaignAdvance();
  p5Reset();
  show("phase5Scan");
  p5StartAudio();
});



/* =========================
   PHASE 6 V5 — TRANSMISSÃO ABERTA
   ========================= */
const p6x=$("#screenPhase6Story");
const p6xNav=[...document.querySelectorAll("[data-p6x]")];
const p6xSections=[...document.querySelectorAll("[data-p6x-section]")];
const p6xTracks=[...document.querySelectorAll(".p6x-track")];
const p6xProgress=$("#p6xNavProgress");
const p6xSound=$("#p6xSound");
let p6xAudio=null,p6xAudioOn=false,p6xReady=false,p6xRAF=0;

function p6xApplyEmbeddedAssets(){
  if(!p6x)return;

  if(window.PHASE6_COVER){
    p6x.querySelectorAll('img[src*="assets6/cover.jpg"]').forEach(img=>{
      img.src=window.PHASE6_COVER;
    });

    const opening=p6x.querySelector(".p6x-opening-cover");
    if(opening)opening.style.backgroundImage=`url("${window.PHASE6_COVER}")`;

    p6x.querySelectorAll(".p6x-slices i").forEach(el=>{
      el.style.backgroundImage=`url("${window.PHASE6_COVER}")`;
    });
  }

  if(window.PHASE6_TRACKLIST){
    p6x.querySelectorAll('img[src*="assets6/tracklist.jpg"]').forEach(img=>{
      img.src=window.PHASE6_TRACKLIST;
    });
  }

  if(window.PHASE6_PHOTO_BW){
    const el=p6x.querySelector(".p6x-photo-bw");
    if(el)el.style.backgroundImage=`url("${window.PHASE6_PHOTO_BW}")`;
  }

  if(window.PHASE6_PHOTO_CYAN){
    const el=p6x.querySelector(".p6x-cyan-photo");
    if(el)el.style.backgroundImage=`url("${window.PHASE6_PHOTO_CYAN}")`;
  }

  if(window.PHASE6_PHOTO_PRAYER){
    const el=p6x.querySelector(".p6x-prayer-photo");
    if(el)el.style.backgroundImage=`url("${window.PHASE6_PHOTO_PRAYER}")`;
  }
}


function p6xInit(){
  p6xApplyEmbeddedAssets();
  if(p6xReady)return;
  p6xReady=true;

  const revObs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add("in")});
  },{threshold:.12,rootMargin:"0px 0px -6% 0px"});
  p6x.querySelectorAll(".p6x-reveal").forEach(el=>revObs.observe(el));

  const secObs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting)return;
      const key=e.target.dataset.p6xSection;
      p6xNav.forEach(a=>a.classList.toggle("active",a.dataset.p6x===key));
    });
  },{threshold:.38});
  p6xSections.forEach(el=>secObs.observe(el));

  p6x.querySelectorAll('a[href^="#p6x-"]').forEach(a=>{
    a.addEventListener("click",e=>{
      const t=document.querySelector(a.getAttribute("href"));
      if(!t)return;
      e.preventDefault();
      t.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });

  // Phase 6: the cover reacts naturally to mouse movement across the whole right-side stage.
  p6x.querySelectorAll("[data-p6x-tilt]").forEach(card=>{
    const host=card.closest(".p6x-track-stage") || card.parentElement || card;
    const reset=()=>card.style.transform="perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)";
    reset();

    host.addEventListener("pointermove",e=>{
      if(e.pointerType && e.pointerType!=="mouse")return;
      const r=host.getBoundingClientRect();
      const x=Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width)));
      const y=Math.max(0,Math.min(1,(e.clientY-r.top)/Math.max(1,r.height)));
      const rx=(.5-y)*9;
      const ry=(x-.5)*12;
      card.style.transform=`perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.018)`;
    },{passive:true});

    host.addEventListener("pointerleave",reset,{passive:true});
  });

  const s02=$("#p6xStage02");
  if(s02){
    s02.addEventListener("pointermove",e=>{
      const r=s02.getBoundingClientRect();
      s02.style.setProperty("--ox",((e.clientX-r.left)/r.width*100)+"%");
      s02.style.setProperty("--oy",((e.clientY-r.top)/r.height*100)+"%");
    },{passive:true});
  }

  const s05=$("#p6xStage05");
  if(s05){
    s05.addEventListener("pointermove",e=>{
      s05.querySelectorAll("span").forEach(w=>{
        const r=w.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
        const dx=cx-e.clientX,dy=cy-e.clientY,d=Math.max(1,Math.hypot(dx,dy));
        const f=Math.max(0,1-d/170)*40;
        w.style.transform=`translate(${dx/d*f}px,${dy/d*f}px)`;
        w.style.color=`rgba(230,238,243,${.28+Math.max(0,1-d/170)*.56})`;
      });
    },{passive:true});
  }

  const s06=$("#p6xStage06");
  if(s06){
    const ripple=(x,y)=>{
      const r=s06.getBoundingClientRect(),el=document.createElement("i");
      el.className="p6x-ripple";el.style.left=(x-r.left)+"px";el.style.top=(y-r.top)+"px";
      s06.appendChild(el);setTimeout(()=>el.remove(),1000);
      if(navigator.vibrate){try{navigator.vibrate(10)}catch(e){}}
    };
    s06.addEventListener("pointerdown",e=>ripple(e.clientX,e.clientY));
    s06.addEventListener("pointermove",e=>{if(e.buttons)ripple(e.clientX,e.clientY)},{passive:true});
  }

  if(p6xSound){
    p6xSound.addEventListener("click",async()=>{
      if(!p6xAudio){
        p6xAudio=new Audio(window.PHASE6_AUDIO||"./assets6/sintonia.wav");
        p6xAudio.loop=true;p6xAudio.preload="auto";p6xAudio.volume=.18;
      }
      if(!p6xAudioOn){
        try{await p6xAudio.play();p6xAudioOn=true;p6xSound.querySelector("b").textContent="ON"}catch(err){console.warn(err)}
      }else{
        p6xAudio.pause();p6xAudioOn=false;p6xSound.querySelector("b").textContent="OFF";
      }
    });
  }
}

function p6xTrackProgress(el){
  const r=el.getBoundingClientRect();
  const total=el.offsetHeight-innerHeight;
  if(total<=0)return 0;
  return Math.max(0,Math.min(1,-r.top/total));
}

function p6xRender(){
  if(!document.body.classList.contains("p6x-mode"))return;
  const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  const op=Math.max(0,Math.min(1,scrollY/max));
  if(p6xProgress)p6xProgress.style.height=(op*100)+"%";

  const opening=document.querySelector(".p6x-opening-cover");
  if(opening){
    const hp=Math.min(1,scrollY/innerHeight);
    opening.style.transform=`scale(${1.45-hp*.34})`;
    opening.style.filter=`blur(${12-hp*10}px) brightness(${.58+hp*.12}) saturate(${.82+hp*.12})`;
  }

  p6xTracks.forEach(el=>el.style.setProperty("--p",p6xTrackProgress(el).toFixed(4)));
}
function p6xSchedule(){cancelAnimationFrame(p6xRAF);p6xRAF=requestAnimationFrame(p6xRender)}
window.addEventListener("scroll",p6xSchedule,{passive:true});
window.addEventListener("resize",p6xSchedule,{passive:true});

function openPhase6Story(){
  document.body.classList.remove("phase3-mode","phase4-mode","phase5-mode");
  document.body.classList.add("p6x-mode");
  if(transmissionLabel)transmissionLabel.textContent="FREQUÊNCIA // TRANSMISSÃO ABERTA";
  show("phase6Story");
  p6xInit();
  window.scrollTo(0,0);
  setTimeout(()=>{
    p6xRender();
    p6x.querySelectorAll(".p6x-opening .p6x-reveal").forEach((el,i)=>setTimeout(()=>el.classList.add("in"),120+i*120));
  },60);
}



/* =========================
   CAMPAIGN SEQUENTIAL FLOW
   01 → 02 → 03 → 04 → 05 → 06
   ========================= */
const phase1NextBtn=$("#phase1NextBtn");
const phase2NextBtn=$("#phase2NextBtn");
const phase3NextBtn=$("#phase3NextBtn");
const phase4NextBtn=$("#phase4NextBtn");
const phase5NextBtn=$("#phase5NextBtn");
const phase5EndNextBtn=$("#phase5EndNextBtn");

function unlockCampaignPhase(n){
  const current=parseInt(safeStoreGet("campaign-unlocked-phase")||"1",10);
  if(n>current)safeStoreSet("campaign-unlocked-phase",String(n));
}

function stopCampaignMedia(){
  // Invalidate callbacks and stop only sources that actually exist in this build.
  playToken++;
  p2PlayToken++;
  p3Token++;
  p4Token++;
  try{musicSource&&musicSource.stop()}catch(e){}
  try{phase2Source&&phase2Source.stop()}catch(e){}
  try{p3PreviewSource&&p3PreviewSource.stop()}catch(e){}
  try{p3Source&&p3Source.stop()}catch(e){}
  try{p4Source&&p4Source.stop()}catch(e){}
  try{if(p5Soundtrack){p5Soundtrack.pause();p5Soundtrack.currentTime=0}}catch(e){}
}


let campaignAdvanceTimer=0;
function scheduleCampaignAdvance(nextPhase,delay=2600){
  clearTimeout(campaignAdvanceTimer);
  campaignAdvanceTimer=setTimeout(()=>goCampaignPhase(nextPhase),delay);
}
function cancelCampaignAdvance(){clearTimeout(campaignAdvanceTimer)}

function goCampaignPhase(n){
  stopCampaignMedia();
  window.scrollTo(0,0);

  if(n===2){
    unlockCampaignPhase(2);
    openPhase2();
  }else if(n===3){
    unlockCampaignPhase(3);
    openPhase3();
  }else if(n===4){
    unlockCampaignPhase(4);
    openPhase4();
  }else if(n===5){
    unlockCampaignPhase(5);
    openPhase5();
  }else if(n===6){
    unlockCampaignPhase(6);
    openPhase6Story();
  }
}

phase1NextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(2)});
phase2NextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(3)});
phase3NextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(4)});
phase4NextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(5)});
phase5NextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(6)});
phase5EndNextBtn?.addEventListener("click",()=>{cancelCampaignAdvance();goCampaignPhase(6)});

/* COMPLETE SITE TEST MODE — ?test=1 */
const testParams=new URLSearchParams(location.search);
const isTestMode=testParams.get("test")==="1";
const phaseTestClose=$("#phaseTestClose");
const phaseTestButtons=[...document.querySelectorAll("[data-test-phase]")];

if(isTestMode){
  document.body.classList.add("test-mode");
  const current=testParams.get("phase")||String(window.CAMPAIGN_CONFIG?.activePhase||1);
  phaseTestButtons.forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.testPhase===current);
    btn.addEventListener("click",()=>{
      const url=new URL(location.href);
      url.searchParams.set("test","1");
      url.searchParams.set("phase",btn.dataset.testPhase);
      location.href=url.toString();
    });
  });
  phaseTestClose?.addEventListener("click",()=>document.body.classList.remove("test-mode"));
}

// MANUAL PHASE PREVIEW — no date automation yet.
// URL override: ?phase=1 ... ?phase=6
const urlPhase = new URLSearchParams(location.search).get("phase");
const configuredPhase = String(window.CAMPAIGN_CONFIG?.activePhase || 1);
const activePhase = urlPhase || configuredPhase;

document.body.classList.remove("phase3-mode","phase4-mode","phase5-mode","p6x-mode");

if(activePhase==="6"){
  setTimeout(openPhase6Story,0);
}else if(activePhase==="5"){
  setTimeout(openPhase5,0);
}else if(activePhase==="4"){
  setTimeout(openPhase4,0);
}else if(activePhase==="3"){
  setTimeout(openPhase3,0);
}else if(activePhase==="2"){
  if(transmissionLabel)transmissionLabel.textContent="TRANSMISSÃO // 002";
  setTimeout(openPhase2,0);
}else{
  if(transmissionLabel)transmissionLabel.textContent="TRANSMISSÃO // 001";
  show("intro");
}

if(safeStoreGet("signal-entered")==="1") $("#returning").classList.remove("hidden");
resize();
requestAnimationFrame(drawField);
})();
