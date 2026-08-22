
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

const $ = s => document.querySelector(s);
const screens = {
  intro: $("#screenIntro"),
  tuner: $("#screenTuner"),
  locked: $("#screenLocked"),
  end: $("#screenEnd")
};

const startBtn=$("#startBtn"), againBtn=$("#againBtn"), soundBtn=$("#soundBtn");
const soundState=$("#soundState"), dial=$("#dial"), scale=$("#scale");
const freqText=$("#freqText"), status=$("#status"), meterFill=$("#meterFill");
const toast=$("#toast"), canvas=$("#field"), ctx=canvas.getContext("2d");
const viz=$("#musicViz"), vctx=viz.getContext("2d");

let freq=CFG.start, dragging=false, lastX=0, lastT=0, velocity=0, momentumId=0;
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
  dial.setAttribute("aria-valuenow",freq.toFixed(1));

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

function onDown(e){
  if(locked) return;
  dragging=true;
  cancelAnimationFrame(momentumId);
  lastX=e.clientX;
  lastT=performance.now();
  velocity=0;
  dial.setPointerCapture?.(e.pointerId);
}
function onMove(e){
  if(!dragging || locked) return;
  const now=performance.now();
  const dx=e.clientX-lastX;
  const dt=Math.max(8,now-lastT);
  const sensitivity=innerWidth<720?.0105:.0078;
  setFreq(freq-dx*sensitivity);
  velocity=(-dx*sensitivity)/(dt/16.67);
  lastX=e.clientX; lastT=now;
}
function onUp(){
  if(!dragging) return;
  dragging=false;
  momentum();
}
function momentum(){
  if(locked) return;
  velocity*=.93;
  if(Math.abs(velocity)<.0013) return;
  setFreq(freq+velocity);
  momentumId=requestAnimationFrame(momentum);
}

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
  localStorage.setItem("signal-found","1");

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
    setTimeout(()=>show("end"),850);
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
  localStorage.setItem("signal-entered","1");
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
  playToken++;
  if(musicSource){try{musicSource.stop()}catch(e){}}
  locked=false; freq=CFG.start; velocity=0;
  if(audioCtx&&soundOn){
    noiseGain.gain.setTargetAtTime(.07,audioCtx.currentTime,.08);
    humGain.gain.setTargetAtTime(.012,audioCtx.currentTime,.08);
  }
  renderDial();
  show("tuner");
});

dial.addEventListener("pointerdown",onDown);
window.addEventListener("pointermove",onMove);
window.addEventListener("pointerup",onUp);

dial.addEventListener("wheel",e=>{
  if(!screens.tuner.classList.contains("active")||locked)return;
  e.preventDefault();
  setFreq(freq+(e.deltaY+e.deltaX)*.0045);
},{passive:false});

dial.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight"){e.preventDefault();setFreq(freq+.1)}
  if(e.key==="ArrowLeft"){e.preventDefault();setFreq(freq-.1)}
});

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

if(localStorage.getItem("signal-entered")==="1") $("#returning").classList.remove("hidden");
resize();
requestAnimationFrame(drawField);
})();
