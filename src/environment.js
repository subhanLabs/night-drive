/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/environment.js
 * Renderer, scene, camera, lighting, day/night cycle, HDRI sky,
 * CC0 PBR materials, procedural textures (ground, windows, ad signage),
 * and the shared materials palette.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */
const TAU = Math.PI*2;
function rand(a,b){ return a+Math.random()*(b-a); }
function randInt(a,b){ return Math.floor(rand(a,b+1)); }
function choice(arr){ return arr[(Math.random()*arr.length)|0]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function lerpAngle(a,b,t){
  let diff = ((b-a+Math.PI)%TAU+TAU)%TAU - Math.PI;
  return a + diff*t;
}
function damp(current, target, lambda, dt){
  return lerp(current, target, 1-Math.exp(-lambda*dt));
}

/* ---------------------------------------------------------------------- */
/* City layout constants                                                  */
/* ---------------------------------------------------------------------- */
const GRID = 11;
const BLOCK = 44;
const ROAD = 16;
const CELL = BLOCK+ROAD;
const SPAN = GRID*CELL - ROAD;
const HALF = SPAN/2;
const CENTER_I = Math.floor(GRID/2);
const CENTER_J = Math.floor(GRID/2);

function cellOrigin(i,j){
  // world-space (x,z) top-left corner of block (i,j)'s building area
  return { x: i*CELL - HALF, z: j*CELL - HALF };
}
function cellCenter(i,j){
  const o = cellOrigin(i,j);
  return { x: o.x + BLOCK/2, z: o.z + BLOCK/2 };
}

/* ---------------------------------------------------------------------- */
/* Renderer / Scene / Camera                                              */
/* ---------------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);
scene.fog = new THREE.FogExp2(0x0a0c18, 0.0105);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 900);
camera.position.set(0,8,14);

function onResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

/* Lighting: night scene — cool moon key light + sky/ground bounce + faint ambient */
const hemi = new THREE.HemisphereLight(0x3f5f95, 0x0d0a14, 0.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbcd4ff, 0.75);
moon.position.set(-60, 90, -40);
moon.castShadow = true;
moon.shadow.mapSize.set(1536,1536);
moon.shadow.camera.left = -140; moon.shadow.camera.right = 140;
moon.shadow.camera.top = 140; moon.shadow.camera.bottom = -140;
moon.shadow.camera.near = 10; moon.shadow.camera.far = 260;
moon.shadow.bias = -0.0015;
scene.add(moon);
scene.add(moon.target);
const fillAmb = new THREE.AmbientLight(0x1a1030, 0.35);
scene.add(fillAmb);

/* ---------------------------------------------------------------------- */
/* Day / night cycle — auto-cycles (short day, long night) with a manual   */
/* override key (T) to force day, force night, or return to auto.          */
/* ---------------------------------------------------------------------- */
let timeOfDay = 0.02;           // 0..1, 0 = midnight, 0.5 = noon
let dayNightMode = 'auto';      // 'auto' | 'day' | 'night'
const DAY_CYCLE_SECONDS = 150;  // one full auto lap of the clock

const NIGHT_SKY = new THREE.Color(0x05060c), DAY_SKY = new THREE.Color(0x7db8e8);
const NIGHT_FOG = new THREE.Color(0x0a0c18), DAY_FOG = new THREE.Color(0x9cc4e0);
const NIGHT_HEMI = new THREE.Color(0x3f5f95), DAY_HEMI = new THREE.Color(0xcfeaff);
const NIGHT_GROUND = new THREE.Color(0x0d0a14), DAY_GROUND = new THREE.Color(0x5a5642);
const NIGHT_SUN = new THREE.Color(0xbcd4ff), DAY_SUN = new THREE.Color(0xfff3d6);

function updateDayNight(dt){
  if (dayNightMode === 'auto'){
    timeOfDay = (timeOfDay + dt/DAY_CYCLE_SECONDS) % 1;
  } else if (dayNightMode === 'day'){
    timeOfDay = 0.5;
  } else {
    timeOfDay = 0.02;
  }

  const angle = timeOfDay*Math.PI*2;
  let raw = (Math.cos(angle-Math.PI)+1)/2; // 0 at midnight, 1 at noon
  const dayFactor = Math.pow(clamp(raw,0,1), 2.4); // sharpened so day is the short phase

  scene.background.copy(NIGHT_SKY).lerp(DAY_SKY, dayFactor);
  scene.fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, dayFactor);
  hemi.color.copy(NIGHT_HEMI).lerp(DAY_HEMI, dayFactor);
  hemi.groundColor.copy(NIGHT_GROUND).lerp(DAY_GROUND, dayFactor);
  hemi.intensity = lerp(0.5, 1.15, dayFactor);
  moon.color.copy(NIGHT_SUN).lerp(DAY_SUN, dayFactor);
  moon.intensity = lerp(0.75, 1.35, dayFactor);
  moon.position.set(Math.cos(angle)*120, Math.max(15,Math.sin(angle)*100+20), -40);
  fillAmb.intensity = lerp(0.35, 0.12, dayFactor);
  renderer.toneMappingExposure = lerp(0.85, 1.05, dayFactor);

  const el = document.getElementById('timeLabel');
  if (el) el.textContent = dayFactor>0.5 ? 'DAY' : 'NIGHT';
}

function cycleDayNightMode(){
  dayNightMode = dayNightMode==='auto' ? 'day' : dayNightMode==='day' ? 'night' : 'auto';
  const el = document.getElementById('timeMode');
  if (el) el.textContent = dayNightMode.toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* Real environment: a photo HDRI (Poly Haven, CC0) for sky + reflections  */
/* ---------------------------------------------------------------------- */
// Loaded during init() (preloadHDRI) once media data is available; PBR
// materials (car paint, glass, chrome) reflect this instead of a fake cube.
function preloadHDRI(){
  return new Promise(resolve=>{
    const uri = window.MEDIA_DATA && window.MEDIA_DATA['sky/modern_buildings_night'];
    if (!uri){ resolve(); return; }
    const rgbeLoader = new THREE.RGBELoader();
    rgbeLoader.load(uri, tex=>{
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = tex;
      // keep our own fog + gradient look rather than showing the HDRI as a
      // literal visible sky dome behind the buildings — it's here for
      // lighting/reflections, not as a backdrop.
      resolve();
    }, undefined, ()=>resolve());
  });
}

/* ---------------------------------------------------------------------- */
/* Real photo-scanned CC0 materials (ambientCG, public domain)             */
/* ---------------------------------------------------------------------- */
// Images must be FULLY decoded before we build any THREE.Texture from them —
// cloning a texture whose image hasn't loaded yet permanently freezes the
// clone with image:undefined (clone() only copies current state, it doesn't
// carry over the async load). So we preload everything up front.
const LOADED_IMAGES = {};
function preloadAllTextures(){
  const keys = Object.keys(window.TEXTURE_DATA || {});
  return Promise.all(keys.map(key => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { LOADED_IMAGES[key] = img; resolve(); };
    img.onerror = () => resolve(); // don't block startup on one bad asset
    img.src = window.TEXTURE_DATA[key];
  })));
}

function loadMat(base, {repeat=[4,4], hasMetal=false, hasAO=false}={}){
  function load(name, srgb){
    const key = `${base}/${name}`;
    const img = LOADED_IMAGES[key];
    const t = img ? new THREE.Texture(img) : new THREE.Texture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true; // safe now — image (if any) is already fully loaded
    return t;
  }
  const map = load('color', true);
  const normalMap = load('normal', false);
  const roughnessMap = load('roughness', false);
  const metalnessMap = hasMetal ? load('metalness', false) : null;
  const aoMap = hasAO ? load('ao', false) : null;
  return { map, normalMap, roughnessMap, metalnessMap, aoMap };
}

let REAL_MATS = null; // populated in init(), after preloadAllTextures() resolves

function buildRealMats(){
  REAL_MATS = {
    concrete: loadMat('Concrete034', {repeat:[3,3]}),
    brick:    loadMat('Bricks104',   {repeat:[4,6], hasAO:true}),
    facadeA:  loadMat('Facade001',   {repeat:[2,4], hasMetal:true}),
    facadeB:  loadMat('Facade006',   {repeat:[2,5], hasMetal:true}),
    asphalt:  loadMat('Asphalt033',  {repeat:[SPAN/6, SPAN/6], hasAO:true}),
    chrome:   loadMat('Metal063',    {repeat:[1,1], hasMetal:true}),
  };
}

function makeRealMaterial(setKey, extra={}){
  const s = REAL_MATS[setKey];
  function cloneTex(t){ if(!t) return null; const c=t.clone(); c.needsUpdate=true; return c; }
  const map = cloneTex(s.map), normalMap = cloneTex(s.normalMap),
        roughnessMap = cloneTex(s.roughnessMap), metalnessMap = cloneTex(s.metalnessMap),
        aoMap = cloneTex(s.aoMap);
  const opts = Object.assign({
    map, normalMap, roughnessMap,
    metalness: metalnessMap?1:0.05, metalnessMap: metalnessMap||undefined,
    aoMap: aoMap||undefined, roughness:1
  }, extra);
  return new THREE.MeshStandardMaterial(opts);
}

/* ---------------------------------------------------------------------- */
/* Procedural textures                                                     */
/* ---------------------------------------------------------------------- */
function makeCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

function buildWindowTexture(worldW, worldH){
  // one cell roughly every ~1.8 units so density matches real window spacing
  const cols = clamp(Math.round(worldW/1.8), 5, 22);
  const rows = clamp(Math.round(worldH/2.2), 8, 40);
  const cellPx = 16;
  const c = makeCanvas(cols*cellPx, rows*cellPx);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,c.width,c.height);
  for (let r=0;r<rows;r++){
    for (let col=0; col<cols; col++){
      const roll = Math.random();
      if (roll < 0.72) continue; // most windows dark at night
      const warm = Math.random() < 0.75;
      const bright = rand(0.5,1);
      ctx.fillStyle = warm
        ? `rgba(255,${190+40*bright|0},${110+40*bright|0},${0.7+0.3*bright})`
        : `rgba(150,${200+30*bright|0},255,${0.7+0.3*bright})`;
      const pad = cellPx*0.22;
      ctx.fillRect(col*cellPx+pad, r*cellPx+pad, cellPx-pad*2, cellPx-pad*2.6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function buildSignTexture(label, color){
  const c = makeCanvas(256,96);
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,256,96);
  ctx.font = '700 44px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor = color; ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.fillText(label, 128, 50);
  ctx.shadowBlur = 10;
  ctx.fillText(label, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* ---------------------------------------------------------------------- */
/* Big Tokyo/Times-Square style ad panels — graphic compositions, not just */
/* a word floating on a plane. Several distinct templates for variety.     */
/* ---------------------------------------------------------------------- */
const AD_WORDS = ['NOVA','KURO','RAMEN','ZENITH','CHROME LTD','APEX','LOTUS','GRID','NEON DINER',
  'ARCADE','FUEL CO','PAWN','TATTOO','LOUNGE','SIN QUARTER','GOLDEN CAT','24HR','OPEN LATE','MONO','DRIFT'];
const AD_PALETTE = [
  ['#ff3fb0','#2fe6ff'], ['#ffb23e','#ff3fb0'], ['#2fe6ff','#8b5cff'], ['#5cffb0','#2fe6ff'],
  ['#ff5a5a','#ffb23e'], ['#8b5cff','#ff3fb0'], ['#2fe6ff','#5cffb0'], ['#ffe14d','#ff3fb0']
];

function adBackdrop(ctx,w,h,c1,c2,vertical){
  const grad = vertical ? ctx.createLinearGradient(0,0,0,h) : ctx.createLinearGradient(0,0,w,0);
  grad.addColorStop(0,'#05060a'); grad.addColorStop(0.5,'#0a0d16'); grad.addColorStop(1,'#05060a');
  ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
}

function adTemplateWordmark(ctx,w,h,c1,c2){
  adBackdrop(ctx,w,h,c1,c2,false);
  const word = choice(AD_WORDS);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const fs = Math.min(w/(word.length*0.62), h*0.4);
  ctx.font = `800 ${fs}px Arial`;
  ctx.shadowColor = c1; ctx.shadowBlur = fs*0.35;
  ctx.fillStyle = c1;
  ctx.fillText(word, w/2, h*0.42);
  ctx.shadowBlur = fs*0.15;
  ctx.fillText(word, w/2, h*0.42);
  ctx.strokeStyle = c2; ctx.lineWidth = h*0.025;
  ctx.beginPath(); ctx.moveTo(w*0.12,h*0.66); ctx.lineTo(w*0.88,h*0.66); ctx.stroke();
  ctx.font = `600 ${fs*0.22}px Arial`;
  ctx.fillStyle = c2; ctx.shadowColor = c2; ctx.shadowBlur = fs*0.1;
  ctx.fillText(choice(['EST. 2088','PREMIUM','SINCE NOW','24 HOURS','EXCLUSIVE']), w/2, h*0.8);
}

function adTemplateGrid(ctx,w,h,c1,c2){
  adBackdrop(ctx,w,h,c1,c2,false);
  const cols=3, rows=4;
  for (let r=0;r<rows;r++){
    for (let col=0;col<cols;col++){
      if (Math.random()<0.15) continue;
      const cw=w/cols, ch=h/rows;
      const pad = Math.min(cw,ch)*0.08;
      const cc = choice(AD_PALETTE);
      ctx.fillStyle = choice([cc[0],cc[1]]);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(col*cw+pad, r*ch+pad, cw-pad*2, ch-pad*2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#05060a';
      ctx.font = `700 ${ch*0.32}px Arial`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(choice(['雅','夜','光','龍','花','電','夢','城']), col*cw+cw/2, r*ch+ch/2);
    }
  }
}

function adTemplateLogoMark(ctx,w,h,c1,c2){
  adBackdrop(ctx,w,h,c1,c2,false);
  const cx=w/2, cy=h*0.4, r=Math.min(w,h)*0.28;
  ctx.strokeStyle = c1; ctx.lineWidth = r*0.14;
  ctx.shadowColor = c1; ctx.shadowBlur = r*0.4;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*1.5); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy-r*0.55); ctx.lineTo(cx+r*0.5,cy+r*0.35); ctx.lineTo(cx-r*0.5,cy+r*0.35);
  ctx.closePath();
  ctx.fillStyle = c2; ctx.shadowColor = c2; ctx.shadowBlur = r*0.3;
  ctx.fill();
  ctx.font = `800 ${h*0.13}px Arial`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle = '#fff'; ctx.shadowColor = c1; ctx.shadowBlur = h*0.05;
  ctx.fillText(choice(AD_WORDS), w/2, h*0.78);
}

function adTemplateStripes(ctx,w,h,c1,c2){
  adBackdrop(ctx,w,h,c1,c2,false);
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,w,h); ctx.clip();
  for (let i=-2;i<12;i++){
    ctx.fillStyle = i%2===0?c1:c2;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(i*w/8, 0); ctx.lineTo(i*w/8+w*0.06,0); ctx.lineTo(i*w/8+w*0.06-h*0.3,h); ctx.lineTo(i*w/8-h*0.3,h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha=1;
  ctx.font = `800 ${h*0.22}px Arial`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle = '#05060a';
  ctx.fillText(choice(AD_WORDS), w/2, h*0.5);
}

function adTemplateVerticalKanji(ctx,w,h,c1,c2){
  adBackdrop(ctx,w,h,c1,c2,true);
  const chars = ['夜','市','光','電','花','龍','雅','夢','城','電','光'];
  const n = Math.min(chars.length, Math.floor(h/(w*0.85)));
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for (let i=0;i<n;i++){
    ctx.font = `700 ${w*0.62}px Arial`;
    ctx.fillStyle = i%2===0?c1:c2;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = w*0.2;
    ctx.fillText(chars[i], w/2, (i+0.5)*(h/n));
  }
}

const AD_TEMPLATES = [adTemplateWordmark, adTemplateGrid, adTemplateLogoMark, adTemplateStripes, adTemplateVerticalKanji];

function buildBigAdTexture(preferVertical){
  const vertical = preferVertical!==undefined ? preferVertical : Math.random()<0.35;
  const w = vertical ? 320 : 640, h = vertical ? 768 : 384;
  const c = makeCanvas(w,h);
  const ctx = c.getContext('2d');
  const [c1,c2] = choice(AD_PALETTE);
  const templates = vertical ? [adTemplateVerticalKanji, adTemplateWordmark] : AD_TEMPLATES;
  choice(templates)(ctx,w,h,c1,c2);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function buildGroundTexture(){
  // Overlay texture: transparent everywhere except sidewalks/curbs/lane paint,
  // so the real photo-scanned asphalt material shows through on the roads.
  const px = 6; // px per unit
  const size = Math.ceil(SPAN*px);
  const c = makeCanvas(size,size);
  const ctx = c.getContext('2d');
  // fully transparent background (roads + lots) — real asphalt shows through

  function toPx(u){ return (u+HALF)*px; }

  const sidewalkColor = '#3a3d4c';
  const laneColor = 'rgba(255,206,84,0.8)';
  const curbColor = 'rgba(220,225,240,0.55)';
  const SIDEWALK = ROAD*0.14;

  function roadStripRect(startCoord){
    return [toPx(startCoord), toPx(startCoord+ROAD)];
  }

  for (let i=0;i<GRID-1;i++){
    const o = cellOrigin(i,0);
    const rStart = o.x + BLOCK;
    const [x0,x1] = roadStripRect(rStart);
    ctx.fillStyle = sidewalkColor;
    ctx.fillRect(x0-SIDEWALK*px, 0, (x1-x0)+SIDEWALK*px*2, size);
    ctx.clearRect(x0, 0, x1-x0, size);
    ctx.strokeStyle = laneColor; ctx.lineWidth = Math.max(2, px*0.35);
    ctx.setLineDash([px*3, px*2.4]);
    ctx.beginPath(); ctx.moveTo((x0+x1)/2, 0); ctx.lineTo((x0+x1)/2, size); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = curbColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0,0); ctx.lineTo(x0,size); ctx.moveTo(x1,0); ctx.lineTo(x1,size); ctx.stroke();
  }
  for (let j=0;j<GRID-1;j++){
    const o = cellOrigin(0,j);
    const rStart = o.z + BLOCK;
    const [z0,z1] = roadStripRect(rStart);
    ctx.fillStyle = sidewalkColor;
    ctx.fillRect(0, z0-SIDEWALK*px, size, (z1-z0)+SIDEWALK*px*2);
    ctx.clearRect(0, z0, size, z1-z0);
    ctx.strokeStyle = laneColor; ctx.lineWidth = Math.max(2, px*0.35);
    ctx.setLineDash([px*3, px*2.4]);
    ctx.beginPath(); ctx.moveTo(0,(z0+z1)/2); ctx.lineTo(size,(z0+z1)/2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = curbColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,z0); ctx.lineTo(size,z0); ctx.moveTo(0,z1); ctx.lineTo(size,z1); ctx.stroke();
  }
  // Outer perimeter roads: just clear to transparent (asphalt shows), with a curb line
  ctx.clearRect(0,0,size, toPx(-HALF+ROAD)-toPx(-HALF));
  ctx.clearRect(0, toPx(HALF-ROAD), size, size-toPx(HALF-ROAD));
  ctx.clearRect(0,0, toPx(-HALF+ROAD)-toPx(-HALF), size);
  ctx.clearRect(toPx(HALF-ROAD),0, size-toPx(HALF-ROAD), size);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/* ---------------------------------------------------------------------- */
/* Materials palette                                                       */
/* ---------------------------------------------------------------------- */
const NEON_COLORS = [0x2fe6ff, 0xff3fb0, 0xffb23e, 0x8b5cff, 0x5cffb0];
const SIGN_WORDS = ['NOX','OPEN 24HR','RAMEN','GOLDEN CAT','ARCADE','CHROME','SIN QUARTER','LOTUS','NEON DINER','FUEL','GARAGE','PAWN','TATTOO','LOUNGE','GRID'];

