
const CONFIG = {
  minFreq: 88,
  maxFreq: 108,
  initialFrequency: 89.1,
  secretFrequency: 104.7,
  snapDistance: 0.18,
  magnetDistance: 0.62,
  musicFile: "./assets/audio/sintonize.mp3",
  musicStartTime: 4.7,
  musicDuration: 7.4,
  musicFadeIn: 0.18,
  musicFadeOut: 0.85,
  falseStations: [
    { frequency: 90.6, type: "instrumental", label: "ESTAÇÃO 90.6" },
    { frequency: 94.4, type: "voice", label: "TRANSMISSÃO LOCAL" },
    { frequency: 98.2, type: "instrumental2", label: "ESTAÇÃO 98.2" },
    { frequency: 101.6, type: "voice2", label: "SINAL PARCIAL" },
  ],
};

const $ = s => document.querySelector(s);
const scenes = {
  intro: $("#intro"),
  tuner: $("#tuner"),
  locked: $("#locked"),
  ended: $("#ended")
};
const enterBtn = $("#enterBtn");
const replayBtn = $("#replayBtn");
const soundToggle = $("#soundToggle");
const soundState = $("#soundState");
const dialArea = $("#dialArea");
const scale = $("#scale");
const freqValue = $("#freqValue");
const statusText = $("#statusText");
const proximityFill = $("#proximityFill");
const music = $("#music"); // fallback only
const signalCanvas = $("#signalCanvas");
const sig = signalCanvas.getContext("2d");
const audioCanvas = $("#audioCanvas");
const av = audioCanvas.getContext("2d");
const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let currentFrequency = CONFIG.initialFrequency;
let displayFrequency = currentFrequency;
let velocity = 0;
let dragging = false;
let lastX = 0;
let lastTime = 0;
let rafMomentum = 0;
let locked = false;
let soundEnabled = false;
let audioCtx = null, master = null, noiseGain = null, humGain = null, noiseFilter = null;
let analyser = null;
let musicBuffer = null;
let musicBufferSource = null;
let musicGain = null;
let pointer = {x:.5,y:.5,v:0,lastX:.5,lastY:.5,t:performance.now()};
let lastFlashKey = "";
let runId = 0;
let stationCooldown = 0;
let activeStationNodes = [];
let speechBusy = false;

const specialMessages = [
  {f:91.2,t:"RUÍDO"},
  {f:95.6,t:"OUÇA."},
  {f:99.8,t:"CONTINUE."},
  {f:102.7,t:"QUASE."},
  {f:103.8,t:"O SINAL ESTÁ AQUI."},
];

function scene(name){
  Object.values(scenes).forEach(s=>s.classList.remove("scene--active"));
  scenes[name].classList.add("scene--active");
}

function initScale(){
  scale.innerHTML = "";
  const pxPerMHz = getPxPerMHz();
  for(let f=CONFIG.minFreq; f<=CONFIG.maxFreq+0.001; f+=0.2){
    const rounded = Math.round(f*10)/10;
    const tick = document.createElement("span");
    const major = Math.abs(rounded - Math.round(rounded)) < 0.01;
    tick.className = "tick"+(major?" major":"");
    tick.style.left = ((rounded-CONFIG.minFreq)*pxPerMHz)+"px";
    scale.appendChild(tick);
    if(major && Math.round(rounded)%2===0){
      const label = document.createElement("span");
      label.className = "tick-label";
      label.style.left = ((rounded-CONFIG.minFreq)*pxPerMHz)+"px";
      label.innerHTML = `${Math.round(rounded)}<small>FM</small>`;
      scale.appendChild(label);
    }
  }
  updateScale(true);
}

function getPxPerMHz(){
  return innerWidth < 720 ? 88 : 118;
}

function updateScale(immediate=false){
  const pxPerMHz = getPxPerMHz();
  const x = -(displayFrequency-CONFIG.minFreq)*pxPerMHz;
  scale.style.transition = immediate ? "none" : "";
  scale.style.transform = `translate3d(${x}px,-50%,0)`;
  freqValue.textContent = displayFrequency.toFixed(1);
  dialArea.setAttribute("aria-valuenow", displayFrequency.toFixed(1));

  const dist = Math.abs(displayFrequency-CONFIG.secretFrequency);
  const closeness = Math.max(0, Math.min(1, 1-dist/5.2));
  proximityFill.style.width = `${Math.round(closeness*100)}%`;
  document.documentElement.style.setProperty("--noise", String(.03 + (1-closeness)*.08));

  if(dist < .7) statusText.textContent = "SINAL PRÓXIMO";
  else if(dist < 2.2) statusText.textContent = "INTERFERÊNCIA DIMINUINDO";
  else statusText.textContent = "INTERFERÊNCIA";

  if(audioCtx && soundEnabled){
    const targetNoise = .012 + (1-closeness)*.105;
    noiseGain.gain.setTargetAtTime(targetNoise, audioCtx.currentTime, .06);
    noiseFilter.frequency.setTargetAtTime(700 + closeness*2600, audioCtx.currentTime, .08);
    humGain.gain.setTargetAtTime(.012 + closeness*.014, audioCtx.currentTime, .08);
  }

  maybeTriggerFalseStation();

  specialMessages.forEach(m=>{
    if(Math.abs(displayFrequency-m.f)<.07 && lastFlashKey !== m.t){
      lastFlashKey = m.t; flash(m.t);
      setTimeout(()=>{ if(lastFlashKey===m.t) lastFlashKey=""; }, 1400);
    }
  });

  if(!locked && dist <= CONFIG.snapDistance) lockSignal();
}


function stopStationNodes(){
  activeStationNodes.forEach(n=>{
    try{n.stop?.()}catch(e){}
    try{n.disconnect?.()}catch(e){}
  });
  activeStationNodes=[];
}

function makeTone(freq, start, dur, gainValue=.02, type="sine"){
  const o=audioCtx.createOscillator();
  const g=audioCtx.createGain();
  const f=audioCtx.createBiquadFilter();
  o.type=type;
  o.frequency.value=freq;
  f.type="bandpass";
  f.frequency.value=Math.max(220,Math.min(1800,freq*2.2));
  f.Q.value=.8;
  g.gain.setValueAtTime(.0001,start);
  g.gain.exponentialRampToValueAtTime(gainValue,start+.04);
  g.gain.setValueAtTime(gainValue,Math.max(start+.05,start+dur-.18));
  g.gain.exponentialRampToValueAtTime(.0001,start+dur);
  o.connect(f).connect(g).connect(master);
  o.start(start);
  o.stop(start+dur+.03);
  activeStationNodes.push(o,g,f);
}

function playInstrumentalStation(variant=1){
  if(!audioCtx || !soundEnabled) return;
  stopStationNodes();
  const now=audioCtx.currentTime;
  // Short original lo-fi "station" fragments; intentionally not copyrighted melodies.
  const progression = variant===1
    ? [[196,246.94,293.66],[174.61,220,261.63],[220,277.18,329.63]]
    : [[130.81,164.81,196],[146.83,174.61,220],[123.47,155.56,185]];
  progression.forEach((chord,ci)=>{
    chord.forEach((f,ni)=>{
      makeTone(f,now+ci*.46, .62, ni===0?.018:.012, ni===2?"triangle":"sine");
    });
  });

  // little AM/radio carrier texture
  const carrier=audioCtx.createOscillator();
  const cg=audioCtx.createGain();
  carrier.type="square";
  carrier.frequency.value=variant===1?1220:860;
  cg.gain.setValueAtTime(.0001,now);
  cg.gain.exponentialRampToValueAtTime(.005,now+.02);
  cg.gain.exponentialRampToValueAtTime(.0001,now+1.4);
  carrier.connect(cg).connect(master);
  carrier.start(now);
  carrier.stop(now+1.45);
  activeStationNodes.push(carrier,cg);
}

function speakRadio(text){
  if(!soundEnabled || speechBusy || !("speechSynthesis" in window)) return;
  speechBusy=true;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang="pt-BR";
    u.rate=.82;
    u.pitch=.72;
    u.volume=.28;
    const voices=speechSynthesis.getVoices();
    const br=voices.find(v=>/pt-BR/i.test(v.lang)) || voices.find(v=>/^pt/i.test(v.lang));
    if(br) u.voice=br;
    u.onend=()=>{speechBusy=false};
    u.onerror=()=>{speechBusy=false};
    speechSynthesis.speak(u);

    // radio static under the voice
    if(audioCtx){
      const now=audioCtx.currentTime;
      const g=audioCtx.createGain();
      const b=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);
      const d=b.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1);
      const s=audioCtx.createBufferSource(); s.buffer=b;
      const f=audioCtx.createBiquadFilter(); f.type="bandpass"; f.frequency.value=1450; f.Q.value=.65;
      g.gain.setValueAtTime(.013,now);
      g.gain.exponentialRampToValueAtTime(.0001,now+1.8);
      s.connect(f).connect(g).connect(master);
      s.start(now); s.stop(now+1.85);
      activeStationNodes.push(s,f,g);
    }
  }catch(e){speechBusy=false}
}

function maybeTriggerFalseStation(){
  if(!audioCtx || !soundEnabled || locked) return;
  const now=performance.now();
  if(now<stationCooldown) return;

  for(const st of CONFIG.falseStations){
    if(Math.abs(displayFrequency-st.frequency)<.085){
      stationCooldown=now+2200;
      if(st.type==="instrumental"){
        flash("♪ SINAL MUSICAL");
        playInstrumentalStation(1);
      }else if(st.type==="instrumental2"){
        flash("♪ TRANSMISSÃO DISTANTE");
        playInstrumentalStation(2);
      }else if(st.type==="voice"){
        flash("VOZ DISTANTE");
        speakRadio("Boa noite... você está ouvindo a programação da noite.");
      }else if(st.type==="voice2"){
        flash("TRANSMISSÃO PARCIAL");
        speakRadio("Permaneça na sintonia... o sinal ainda não está completo.");
      }
      break;
    }
  }
}

function setFrequency(v){
  if(locked) return;
  v = Math.max(CONFIG.minFreq, Math.min(CONFIG.maxFreq, v));
  const dist = Math.abs(v-CONFIG.secretFrequency);
  if(dist < CONFIG.magnetDistance){
    const pull = (CONFIG.magnetDistance-dist)/CONFIG.magnetDistance;
    v = v + (CONFIG.secretFrequency-v) * pull*.11;
  }
  displayFrequency = v;
  currentFrequency = v;
  updateScale();
}

function pointerDown(e){
  if(locked) return;
  dragging = true;
  cancelAnimationFrame(rafMomentum);
  lastX = e.clientX;
  lastTime = performance.now();
  velocity = 0;
  dialArea.setPointerCapture?.(e.pointerId);
}

function pointerMoveDial(e){
  if(!dragging || locked) return;
  const now = performance.now();
  const dx = e.clientX-lastX;
  const dt = Math.max(8,now-lastTime);
  const sensitivity = innerWidth<720 ? .0105 : .0078;
  setFrequency(currentFrequency - dx*sensitivity);
  velocity = (-dx*sensitivity)/(dt/16.67);
  lastX=e.clientX; lastTime=now;
}

function pointerUp(){
  if(!dragging) return;
  dragging=false;
  momentum();
}

function momentum(){
  if(locked) return;
  velocity *= .94;
  if(Math.abs(velocity)<.0015) return;
  setFrequency(currentFrequency + velocity);
  rafMomentum=requestAnimationFrame(momentum);
}

dialArea.addEventListener("pointerdown",pointerDown);
window.addEventListener("pointermove",pointerMoveDial);
window.addEventListener("pointerup",pointerUp);
dialArea.addEventListener("wheel",e=>{
  if(!scenes.tuner.classList.contains("scene--active") || locked) return;
  e.preventDefault();
  setFrequency(currentFrequency + e.deltaY*.0045 + e.deltaX*.0045);
},{passive:false});
dialArea.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight"){e.preventDefault();setFrequency(currentFrequency+.1)}
  if(e.key==="ArrowLeft"){e.preventDefault();setFrequency(currentFrequency-.1)}
});

function flash(text){
  const el=document.createElement("div");
  el.className="flash-message";
  el.textContent=text;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add("show"));
  setTimeout(()=>el.remove(),900);
}

async function initAudio(){
  if(audioCtx) return;
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  master = audioCtx.createGain();
  master.gain.value=.7;
  master.connect(audioCtx.destination);

  // Cinematic low hum
  const hum = audioCtx.createOscillator();
  hum.type="sine"; hum.frequency.value=47;
  humGain=audioCtx.createGain(); humGain.gain.value=.014;
  const humFilter=audioCtx.createBiquadFilter();
  humFilter.type="lowpass"; humFilter.frequency.value=110;
  hum.connect(humFilter).connect(humGain).connect(master);
  hum.start();

  // Procedural radio noise
  const bufferSize=audioCtx.sampleRate*2;
  const buffer=audioCtx.createBuffer(1,bufferSize,audioCtx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1);
  const noise=audioCtx.createBufferSource();
  noise.buffer=buffer; noise.loop=true;
  noiseFilter=audioCtx.createBiquadFilter();
  noiseFilter.type="bandpass"; noiseFilter.frequency.value=900; noiseFilter.Q.value=.7;
  noiseGain=audioCtx.createGain(); noiseGain.gain.value=.07;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start();

  // Music analyser + dedicated music gain.
  // The MP3 is decoded into an AudioBuffer after the user's first gesture.
  // This avoids mobile/browser autoplay blocks when the signal is found later.
  analyser=audioCtx.createAnalyser();
  analyser.fftSize=256;
  musicGain=audioCtx.createGain();
  musicGain.gain.value=1;
  musicGain.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    const response = await fetch(CONFIG.musicFile, {cache:"force-cache"});
    if (!response.ok) throw new Error(`Falha ao carregar ${CONFIG.musicFile}: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    musicBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    console.log("sintonize.mp3 carregado:", musicBuffer.duration.toFixed(2), "s");
  } catch (err) {
    console.error("Não foi possível decodificar sintonize.mp3 via Web Audio:", err);
  }
}

function cinematicPing(){
  if(!audioCtx || !soundEnabled) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain(), f=audioCtx.createBiquadFilter();
  o.type="sine"; o.frequency.setValueAtTime(68,audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(42,audioCtx.currentTime+.65);
  f.type="lowpass"; f.frequency.value=130;
  g.gain.setValueAtTime(.0001,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.055,audioCtx.currentTime+.02);
  g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.7);
  o.connect(f).connect(g).connect(master); o.start(); o.stop(audioCtx.currentTime+.72);
}

async function toggleSound(force){
  if(!audioCtx) await initAudio();
  soundEnabled = typeof force==="boolean" ? force : !soundEnabled;
  soundState.textContent = soundEnabled ? "ON":"OFF";
  if(audioCtx.state==="suspended") await audioCtx.resume();
  master.gain.setTargetAtTime(soundEnabled?.72:0,audioCtx.currentTime,.08);
}

soundToggle.addEventListener("click",()=>toggleSound());

enterBtn.addEventListener("click",async()=>{
  await initAudio();
  await toggleSound(true);
  localStorage.setItem("signal_started","1");
  scene("tuner");
  cinematicPing();
  setTimeout(()=>flash("PROCURE."),450);
  setTimeout(()=>{ if(soundEnabled) playInstrumentalStation(2); },1200);
});

async function lockSignal(){
  if(locked) return;
  locked=true;
  stopStationNodes();
  try{speechSynthesis.cancel()}catch(e){}
  speechBusy=false;
  cancelAnimationFrame(rafMomentum);
  displayFrequency=CONFIG.secretFrequency;
  currentFrequency=CONFIG.secretFrequency;
  updateScale();
  localStorage.setItem("signal_found","1");
  localStorage.setItem("signal_visits",String((+localStorage.getItem("signal_visits")||0)+1));

  if(navigator.vibrate) navigator.vibrate(30);
  if(audioCtx && soundEnabled){
    noiseGain.gain.cancelScheduledValues(audioCtx.currentTime);
    noiseGain.gain.setTargetAtTime(.0001,audioCtx.currentTime,.09);
    humGain.gain.setTargetAtTime(.004,audioCtx.currentTime,.18);
  }

  await new Promise(r=>setTimeout(r,460));
  cinematicPing();
  scene("locked");
  $("#lockedFreq").textContent=`${CONFIG.secretFrequency.toFixed(1)} FM`;

  await new Promise(r=>setTimeout(r,950));
  if(soundEnabled) playMusicReward();
  else {
    await new Promise(r=>setTimeout(r,(CONFIG.musicDuration+1.5)*1000));
    finishTransmission();
  }
}

async function playMusicReward(){
  const token=++runId;

  // Preferred route: Web Audio buffer, reliable after AudioContext is unlocked
  if(audioCtx && musicBuffer){
    try{
      if(audioCtx.state==="suspended") await audioCtx.resume();

      if(musicBufferSource){
        try{ musicBufferSource.stop(); }catch(e){}
        try{ musicBufferSource.disconnect(); }catch(e){}
      }

      musicBufferSource=audioCtx.createBufferSource();
      musicBufferSource.buffer=musicBuffer;
      musicBufferSource.connect(musicGain);

      const now=audioCtx.currentTime;
      const start=Math.max(0, Math.min(CONFIG.musicStartTime, Math.max(0,musicBuffer.duration-.1)));
      const available=Math.max(.1,musicBuffer.duration-start);
      const duration=Math.min(CONFIG.musicDuration, available);
      const fadeIn=Math.min(CONFIG.musicFadeIn, duration*.25);
      const fadeOut=Math.min(CONFIG.musicFadeOut, duration*.35);

      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(.0001,now);
      musicGain.gain.exponentialRampToValueAtTime(1,now+Math.max(.03,fadeIn));
      musicGain.gain.setValueAtTime(1,Math.max(now+fadeIn,now+duration-fadeOut));
      musicGain.gain.exponentialRampToValueAtTime(.0001,now+duration);

      musicBufferSource.start(now,start,duration);
      drawAudioReactive(token);

      musicBufferSource.onended=()=>{
        if(token!==runId) return;
        setTimeout(finishTransmission,900);
      };
      return;
    }catch(err){
      console.error("Falha no Web Audio reward:",err);
    }
  }

  // Fallback for unusual browsers / local file restrictions
  try{
    music.pause();
    music.currentTime=CONFIG.musicStartTime;
    music.volume=1;
    await music.play();

    const durationMs=CONFIG.musicDuration*1000;
    const fadeOutMs=CONFIG.musicFadeOut*1000;
    const started=performance.now();

    const fallbackLoop=(t)=>{
      if(token!==runId || music.paused) return;
      const elapsed=t-started;
      if(elapsed>durationMs-fadeOutMs){
        music.volume=Math.max(0,(durationMs-elapsed)/fadeOutMs);
      }
      if(elapsed<durationMs){
        requestAnimationFrame(fallbackLoop);
      }else{
        music.pause();
        music.volume=1;
        setTimeout(finishTransmission,900);
      }
    };
    requestAnimationFrame(fallbackLoop);
  }catch(err){
    console.error("Playback do sintonize.mp3 bloqueado:",err);
    flash("TOQUE PARA OUVIR");
    const unlock=async()=>{
      document.removeEventListener("pointerdown",unlock);
      try{
        if(audioCtx?.state==="suspended") await audioCtx.resume();
        playMusicReward();
      }catch(e){ console.error(e); }
    };
    document.addEventListener("pointerdown",unlock,{once:true});
  }
}

function finishTransmission(){
  scene("ended");
  setTimeout(()=>flash("A PRÓXIMA PARTE AINDA NÃO COMEÇOU."),1200);
}

replayBtn.addEventListener("click",async()=>{
  runId++;
  music.pause();
  if(musicBufferSource){
    try{musicBufferSource.stop();}catch(e){}
    try{musicBufferSource.disconnect();}catch(e){}
    musicBufferSource=null;
  }
  locked=false;
  currentFrequency=CONFIG.initialFrequency;
  displayFrequency=currentFrequency;
  updateScale(true);
  scene("tuner");
  if(audioCtx && soundEnabled){
    noiseGain.gain.setTargetAtTime(.08,audioCtx.currentTime,.1);
    humGain.gain.setTargetAtTime(.014,audioCtx.currentTime,.1);
  }
});

function drawAudioReactive(token){
  const dpr=Math.min(devicePixelRatio||1,2);
  const rect=audioCanvas.getBoundingClientRect();
  audioCanvas.width=Math.floor(rect.width*dpr);
  audioCanvas.height=Math.floor(rect.height*dpr);
  av.setTransform(dpr,0,0,dpr,0,0);
  const bins=new Uint8Array(analyser.frequencyBinCount);
  function frame(){
    if(token!==runId) return;
    analyser.getByteFrequencyData(bins);
    const w=rect.width,h=rect.height,mid=h/2;
    av.clearRect(0,0,w,h);
    av.strokeStyle="rgba(241,164,91,.62)";
    av.lineWidth=1;
    av.beginPath();
    const count=72;
    for(let i=0;i<count;i++){
      const x=(i/(count-1))*w;
      const idx=Math.floor((i/count)*bins.length*.72);
      const amp=(bins[idx]/255)*h*.34;
      const y=mid + Math.sin(i*.58+performance.now()*.002)*amp*.22;
      if(i===0) av.moveTo(x,y); else av.lineTo(x,y);
    }
    av.stroke();
    requestAnimationFrame(frame);
  }
  frame();
}

// Ambient canvas signal field
function resizeSignal(){
  const dpr=Math.min(devicePixelRatio||1,1.5);
  signalCanvas.width=Math.floor(innerWidth*dpr);
  signalCanvas.height=Math.floor(innerHeight*dpr);
  sig.setTransform(dpr,0,0,dpr,0,0);
  initScale();
}
function drawSignal(t){
  const w=innerWidth,h=innerHeight;
  sig.clearRect(0,0,w,h);
  const lines=innerWidth<720?18:26;
  const speedFactor=Math.min(pointer.v,1);
  for(let i=0;i<lines;i++){
    const y=(i+1)*h/(lines+1);
    const dy=(pointer.y*h-y);
    const dist=Math.max(25,Math.abs(dy));
    const influence=Math.max(0,1-dist/(h*.33));
    const amp=1.5+speedFactor*8+influence*4;
    sig.beginPath();
    for(let x=-10;x<=w+10;x+=12){
      const pxNorm=x/w;
      const nearX=Math.max(0,1-Math.abs(pxNorm-pointer.x)/.22);
      const wave=Math.sin(x*.015+t*.00038+i*.42)*amp;
      const local=nearX*influence*Math.sin(x*.035+t*.0012)*9*(.3+speedFactor);
      const yy=y+wave+local;
      if(x===-10)sig.moveTo(x,yy); else sig.lineTo(x,yy);
    }
    sig.strokeStyle=`rgba(234,217,189,${.018 + influence*.024})`;
    sig.lineWidth=1;
    sig.stroke();
  }
  const gx=pointer.x*w,gy=pointer.y*h;
  const g=sig.createRadialGradient(gx,gy,0,gx,gy,Math.min(w,h)*.34);
  g.addColorStop(0,`rgba(217,116,44,${.025+speedFactor*.018})`);
  g.addColorStop(1,"rgba(217,116,44,0)");
  sig.fillStyle=g;sig.fillRect(0,0,w,h);
  pointer.v*=.91;
  requestAnimationFrame(drawSignal);
}
window.addEventListener("pointermove",e=>{
  const now=performance.now(), nx=e.clientX/innerWidth, ny=e.clientY/innerHeight;
  const dt=Math.max(8,now-pointer.t);
  const d=Math.hypot(nx-pointer.lastX,ny-pointer.lastY);
  pointer.v=Math.min(1,d/(dt/1000)*.028);
  pointer.x=nx;pointer.y=ny;pointer.lastX=nx;pointer.lastY=ny;pointer.t=now;
  document.documentElement.style.setProperty("--mx",`${e.clientX}px`);
  document.documentElement.style.setProperty("--my",`${e.clientY}px`);
},{passive:true});

window.addEventListener("touchmove",e=>{
  const p=e.touches[0]; if(!p)return;
  document.documentElement.style.setProperty("--mx",`${p.clientX}px`);
  document.documentElement.style.setProperty("--my",`${p.clientY}px`);
},{passive:true});

window.addEventListener("resize",resizeSignal);

if(localStorage.getItem("signal_started")==="1") $("#returning").classList.remove("hidden");
resizeSignal();
requestAnimationFrame(drawSignal);
