/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/audio.js
 * Engine sound, tire squeal, and the in-game radio (real NCS tracks).
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Audio: engine + radio stations + sfx (all procedural, no external files)*/
/* ---------------------------------------------------------------------- */
// AudioContext is created immediately (creation is unrestricted; only
// starting playback needs a user gesture) so we can decode real audio
// during preload, well before the player clicks "Start".
const sharedActx = new (window.AudioContext||window.webkitAudioContext)();

function dataURItoArrayBufferAudio(dataURI){
  const base64 = dataURI.slice(dataURI.indexOf(',')+1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const audioBuffers = {}; // key -> decoded AudioBuffer
async function preloadAudio(){
  const keys = ['music/recall','music/fearless2','music/heroes','music/invincible','music/unstoppable',
    'music/legends','music/adventure','music/fly','music/alive','music/fire','music/warrior',
    'music/diamond','music/dreams','music/wildfire','music/vibe','music/energy',
    'sfx/engine_loop','sfx/tire_squeal'];
  await Promise.all(keys.map(async key=>{
    const uri = window.MEDIA_DATA && window.MEDIA_DATA[key];
    if (!uri) return;
    try{
      const buf = dataURItoArrayBufferAudio(uri);
      const decoded = await sharedActx.decodeAudioData(buf);
      audioBuffers[key] = decoded;
    }catch(e){ console.error('audio decode failed', key, e); }
  }));
}

const Audio_ = (function(){
  const actx = sharedActx;
  let master, sfxGain, musicGain, engineGain, driftGain;
  let engineSrc = null, driftSrc = null;
  let muted=false;
  let stationIndex = -1; // -1 = off
  let musicSrc = null;

  const stations = [
    { name:'RECALL',       key:'music/recall',       credit:'Gabriawll (NCS Release)' },
    { name:'FEARLESS PT.2',key:'music/fearless2',     credit:'TULE + Chris Linton (NCS Release)' },
    { name:'HEROES',       key:'music/heroes',        credit:'RetroVision (NCS Release)' },
    { name:'INVINCIBLE',   key:'music/invincible',    credit:'DEAF KEV (NCS Release)' },
    { name:'UNSTOPPABLE',  key:'music/unstoppable',   credit:'JOXION + Thorne + iFeature (NCS Release)' },
    { name:'LEGENDS',      key:'music/legends',       credit:'Star Party (NCS Release)' },
    { name:'ADVENTURE',    key:'music/adventure',     credit:'JJD (NCS Release)' },
    { name:'FLY',          key:'music/fly',           credit:'Fransis Derelle + Parker Polhill (NCS Release)' },
    { name:'ALIVE',        key:'music/alive',         credit:'Itro + Kontinuum (NCS Release)' },
    { name:'FIRE',         key:'music/fire',          credit:'Brook Xiao + Rachel Horter (NCS Release)' },
    { name:'WARRIOR',      key:'music/warrior',       credit:'Marin Hoxha + Maestro Chives + Chris Linton (NCS Release)' },
    { name:'DIAMOND',      key:'music/diamond',       credit:'NIVIRO (NCS Release)' },
    { name:'DREAMS',       key:'music/dreams',        credit:'Lost Sky (NCS Release)' },
    { name:'WILDFIRE',     key:'music/wildfire',      credit:'Jim Yosef + Sara Skinner (NCS Release)' },
    { name:'VIBE',         key:'music/vibe',          credit:"Ash O'Connor (NCS Release)" },
    { name:'ENERGY',       key:'music/energy',        credit:'Elektronomia (NCS Release)' },
  ];

  function init(){
    if (master) { if (actx.state === 'suspended') actx.resume(); return; }
    master = actx.createGain(); master.gain.value=0.9; master.connect(actx.destination);
    sfxGain = actx.createGain(); sfxGain.gain.value=0.85; sfxGain.connect(master);
    musicGain = actx.createGain(); musicGain.gain.value=0.0; musicGain.connect(master);
    engineGain = actx.createGain(); engineGain.gain.value=0.0; engineGain.connect(master);
    driftGain = actx.createGain(); driftGain.gain.value=0.0; driftGain.connect(master);
    if (actx.state === 'suspended') actx.resume();

    // looping real engine recording; pitch (playbackRate) tracks speed like RPM
    if (audioBuffers['sfx/engine_loop']){
      engineSrc = actx.createBufferSource();
      engineSrc.buffer = audioBuffers['sfx/engine_loop'];
      engineSrc.loop = true;
      engineSrc.playbackRate.value = 0.8;
      engineSrc.connect(engineGain);
      engineSrc.start();
    }
    // looping real tire-squeal recording, gain riding on drift state
    if (audioBuffers['sfx/tire_squeal']){
      driftSrc = actx.createBufferSource();
      driftSrc.buffer = audioBuffers['sfx/tire_squeal'];
      driftSrc.loop = true;
      driftSrc.connect(driftGain);
      driftSrc.start();
    }
  }

  function setMuted(m){ muted=m; if(master) master.gain.setTargetAtTime(m?0:0.9, actx.currentTime, 0.05); }

  function setEngine(throttle, speedFrac){
    if (!engineGain) return;
    const t = actx.currentTime;
    engineGain.gain.setTargetAtTime(0.18+throttle*0.35, t, 0.06);
    if (engineSrc) engineSrc.playbackRate.setTargetAtTime(0.75 + speedFrac*1.15 + throttle*0.1, t, 0.08);
  }

  function setDrift(active){
    if (!driftGain) return;
    driftGain.gain.setTargetAtTime(active?0.5:0.0, actx.currentTime, active?0.05:0.25);
  }

  function blip(f0,f1,dur,type,gain){
    if (!sfxGain) return;
    const t=actx.currentTime;
    const o=actx.createOscillator(); o.type=type||'sine';
    const g=actx.createGain(); g.gain.value=0.0001;
    o.connect(g); g.connect(sfxGain);
    o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.exponentialRampToValueAtTime(gain||0.3,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }
  function crash(){
    if (!sfxGain) return;
    const t=actx.currentTime;
    const bufSize = actx.sampleRate*0.35;
    const buf = actx.createBuffer(1,bufSize,actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) d[i]=(Math.random()*2-1)*(1-i/bufSize);
    const src = actx.createBufferSource(); src.buffer=buf;
    const filt = actx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=1000;
    const g = actx.createGain(); g.gain.value=0.55;
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(t);
    blip(150,40,0.3,'sawtooth',0.4);
  }
  function boostSound(){ blip(220,900,0.5,'sawtooth',0.32); }
  function chime(){ blip(700,1100,0.18,'triangle',0.22); }
  function honk(){ blip(320,300,0.35,'square',0.25); }

  function stopMusic(){
    if (musicSrc){ try{ musicSrc.stop(); }catch(e){} musicSrc=null; }
    if (musicGain) musicGain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.15);
  }
  function playStation(idx){
    stopMusic();
    stationIndex = idx;
    if (idx < 0) return;
    const buf = audioBuffers[stations[idx].key];
    if (!buf) return;
    musicGain.gain.setTargetAtTime(0.55, actx.currentTime, 0.3);
    musicSrc = actx.createBufferSource();
    musicSrc.buffer = buf;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start();
  }
  function nextStation(){
    let idx = stationIndex+1;
    if (idx >= stations.length) idx = -1;
    playStation(idx);
    return idx<0 ? 'RADIO OFF' : stations[idx].name;
  }
  function radioOff(){
    playStation(-1);
    return 'RADIO OFF';
  }

  return { init, setMuted, setEngine, setDrift, crash, boostSound, chime, honk, nextStation, radioOff,
           get stationName(){ return stationIndex<0?'RADIO OFF':stations[stationIndex].name; } };
})();

