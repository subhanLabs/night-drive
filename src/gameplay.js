/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/gameplay.js
 * Keyboard input, delivery/VIP missions, save/load, and the street-race
 * checkpoint circuit.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Input                                                                    */
/* ---------------------------------------------------------------------- */
const keys = {};
let pendingRadioToggle = false;
let pendingRadioOff = false;
let pendingCarSwitch = false;
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if (!keys[k]){ // true edge — fires exactly once per physical press, independent of frame rate
    if (k === 'r') pendingRadioToggle = true;
    if (k === 'm') pendingRadioOff = true;
    if (k === 'e') pendingCarSwitch = true;
    if (k === 't') cycleDayNightMode();
    if (k === 'g') toggleGarage();
  }
  keys[k]=true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

/* ---------------------------------------------------------------------- */
/* Missions                                                                 */
/* ---------------------------------------------------------------------- */
const CLIENTS = ['The Fixer','Nadia at the Lounge','Dock Boss Reyes','Mono from Chrome Row','The Quiet Man'];
let mission = null; // {type, stage, pickup, dropoff, timeLeft, reward, marker}
let cash = 0;
let bestRaceTime = null;

/* ---------------------------------------------------------------------- */
/* Save / load — plain localStorage, no account/server needed              */
/* ---------------------------------------------------------------------- */
const SAVE_KEY = 'nightdrive_save_v1';
function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.cash === 'number') cash = data.cash;
    if (Array.isArray(data.ownedCars) && data.ownedCars.length) ownedCars = data.ownedCars;
    if (typeof data.bestRaceTime === 'number') bestRaceTime = data.bestRaceTime;
  }catch(e){ /* corrupt or blocked storage — just start fresh */ }
}
function saveGame(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({ cash, ownedCars, bestRaceTime }));
  }catch(e){ /* storage full/blocked — silently skip, gameplay still works */ }
}
window.addEventListener('beforeunload', saveGame);
let nextMissionPrompt = false;

function makeMarker(color, shape){
  const g = new THREE.Group();
  let ring;
  if (shape==='diamond'){
    ring = new THREE.Mesh(new THREE.OctahedronGeometry(1.8,0), new THREE.MeshBasicMaterial({color, wireframe:false}));
    ring.position.y = 1.8;
  } else {
    ring = new THREE.Mesh(new THREE.TorusGeometry(2.2,0.12,8,24), new THREE.MeshBasicMaterial({color}));
    ring.rotation.x = Math.PI/2;
    ring.position.y = 0.15;
  }
  g.add(ring);
  g.userData.spin = shape==='diamond';
  const beamGeo = new THREE.CylinderGeometry(0.15,0.15,26,8,1,true);
  const beamMat = new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.28, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false});
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 13;
  g.add(beam);
  scene.add(g);
  return g;
}

function randomRoadPoint(){
  // Pick a point ON an actual road corridor — guaranteed clear of buildings,
  // unlike sampling near a block center (which usually lands inside one).
  if (Math.random() < 0.5){
    const colIdx = randInt(0, GRID-2);
    const o = cellOrigin(colIdx, 0);
    const roadCenterX = o.x + BLOCK + ROAD/2;
    const z = rand(-HALF+ROAD*1.5, HALF-ROAD*1.5);
    return { x: roadCenterX + rand(-3,3), z };
  } else {
    const rowIdx = randInt(0, GRID-2);
    const o = cellOrigin(0, rowIdx);
    const roadCenterZ = o.z + BLOCK + ROAD/2;
    const x = rand(-HALF+ROAD*1.5, HALF-ROAD*1.5);
    return { x, z: roadCenterZ + rand(-3,3) };
  }
}

function startDeliveryMission(){
  const pickup = randomRoadPoint();
  const dropoff = randomRoadPoint();
  const marker = makeMarker(0xffb23e, 'ring');
  marker.position.set(pickup.x,0,pickup.z);
  mission = {
    type:'delivery', stage:'pickup',
    pickup, dropoff, marker,
    timeLeft: 999, reward: randInt(120,260),
    client: choice(CLIENTS)
  };
  updateMissionUI();
}

const VIP_NAMES = ['The Senator','DJ Chrome','Madame Okoye','The Broker','Agent Volkov'];
function startVipMission(){
  const pickup = randomRoadPoint();
  const dropoff = randomRoadPoint();
  const marker = makeMarker(0xb84dff, 'diamond');
  marker.position.set(pickup.x,0,pickup.z);
  mission = {
    type:'vip', stage:'pickup',
    pickup, dropoff, marker, crashed:false,
    timeLeft: 999, reward: randInt(300,500),
    client: choice(VIP_NAMES)
  };
  showToast('VIP PICKUP — drive smooth, no crashes', '#b84dff');
  updateMissionUI();
}

/* ---------------------------------------------------------------------- */
/* Race circuit — a real closed loop that traces the outer city blocks so  */
/* it's a proper "lap around the city" with a corner every couple of      */
/* intersections, instead of random scattered points. Races are only ever */
/* entered by driving over the glowing start marker (see spawnRaceMarker) */
/* — they never interrupt free-roam delivery jobs on their own.           */
/* ---------------------------------------------------------------------- */
function roadIntersection(i,j){
  const x = cellOrigin(clamp(i,0,GRID-2),0).x + BLOCK + ROAD/2;
  const z = cellOrigin(0,clamp(j,0,GRID-2)).z + BLOCK + ROAD/2;
  return { x, z };
}
function generateLoopCheckpoints(){
  const iMin=0, iMax=GRID-2, jMin=0, jMax=GRID-2;
  const perSide = 3; // corners per edge of the loop — higher = longer race, more turns
  const pts = [];
  const seen = new Set();
  function push(i,j){
    const key = i+','+j;
    if (seen.has(key)) return; // grid rounding can repeat a corner — skip dupes
    seen.add(key);
    const p = roadIntersection(i,j);
    pts.push({ x:p.x+rand(-2,2), z:p.z+rand(-2,2) });
  }
  for (let s=0;s<=perSide;s++) push(Math.round(lerp(iMin,iMax,s/perSide)), jMin);
  for (let s=1;s<=perSide;s++) push(iMax, Math.round(lerp(jMin,jMax,s/perSide)));
  for (let s=1;s<=perSide;s++) push(Math.round(lerp(iMax,iMin,s/perSide)), jMax);
  for (let s=1;s<perSide;s++) push(iMin, Math.round(lerp(jMax,jMin,s/perSide)));
  return pts;
}

let raceMarker = null, raceCooldown = 0;
function spawnRaceMarker(){
  const p = roadIntersection(1,1);
  raceMarker = makeMarker(0xffe14a);
  raceMarker.position.set(p.x,0,p.z);
  raceMarker.userData.pos = p;
}
function checkRaceTrigger(dt){
  if (raceCooldown>0) raceCooldown -= dt;
  if (!raceMarker || raceCooldown>0) return;
  if (mission && mission.type==='race') return;
  const p = raceMarker.userData.pos;
  const d = Math.hypot(player.x-p.x, player.z-p.z);
  if (d < 7) startRaceMission();
}

let raceAI = [];
function spawnRaceAI(checkpoints, startPos){
  clearRaceAI();
  const modelKeys = ['sedan-sports','race','hatchback-sports','suv-luxury','race-future','taxi','sedan','police'];
  const rivalCount = 6; // player + 6 rivals = a real 7-car grid
  for (let k=0;k<rivalCount;k++){
    const modelKey = modelKeys[k % modelKeys.length];
    const template = carTemplates[modelKey];
    const model = template ? template.clone(true) : new THREE.Group();
    model.traverse(o=>{
      if (o.isMesh && o.material){
        const old = o.material;
        o.material = new THREE.MeshStandardMaterial({ map: old.map||null, color: old.map?0xffffff:0xffffff, roughness:0.6, metalness:0.1 });
      }
    });
    model.scale.setScalar(MODEL_SCALE[modelKey]||1);
    model.rotation.y = MODEL_ROT_Y[modelKey]||0;
    const wrapper = new THREE.Group();
    wrapper.add(model);
    const gridAngle = (k/rivalCount)*Math.PI*2;
    const sx = startPos.x + Math.cos(gridAngle)*6, sz = startPos.z + Math.sin(gridAngle)*6;
    wrapper.position.set(sx,0,sz);
    scene.add(wrapper);
    raceAI.push({
      // baseSpeed is the AI rivals' own speed knob — independent from your
      // car's maxSpeed/accel above. Raise this range to make races harder,
      // lower it to make them easier.
      x:sx, z:sz, heading:0, mesh:wrapper, modelKey,
      target:0, baseSpeed: rand(20,26), mistakeT: rand(3,6)
    });
  }
}
function updateRaceAI(dt){
  if (!mission || mission.type!=='race' || !raceAI.length) return;
  for (let idx=0; idx<raceAI.length; idx++){
    if (!mission) break; // a rival may have just ended the race this same frame
    const ai = raceAI[idx];
    if (ai.finished) continue;
    ai.mistakeT -= dt;
    // Rivals stumble occasionally so they're beatable, but not comically
    // slow — a real contest, not a parade.
    let spd = ai.baseSpeed;
    if (ai.mistakeT <= 0) spd *= 0.65;
    if (ai.mistakeT <= -rand(0.5,1.2)) ai.mistakeT = rand(4,8);
    const cp = mission.checkpoints[Math.min(ai.target, mission.checkpoints.length-1)];
    const dx = cp.x-ai.x, dz = cp.z-ai.z;
    const wantHeading = Math.atan2(dx,dz);
    ai.heading = lerpAngle(ai.heading, wantHeading, 1-Math.pow(1-0.06,dt*60));
    ai.x += Math.sin(ai.heading)*spd*dt;
    ai.z += Math.cos(ai.heading)*spd*dt;
    if (Math.hypot(dx,dz) < 8){
      ai.target++;
      if (ai.target >= mission.checkpoints.length){
        ai.finished = true;
        loseRaceMission(ai);
        break;
      }
    }
    ai.mesh.position.set(ai.x,0,ai.z);
    ai.mesh.rotation.y = ai.heading - (MODEL_ROT_Y[ai.modelKey]||0);
  }
}
function loseRaceMission(winner){
  const def = CAR_DEFS.find(d=>d.modelKey===winner.modelKey);
  showToast('RACE LOST — '+(def?def.name:'a rival')+' beat you to it', '#ff3fb0');
  clearRaceAI();
  mission.markers.forEach(m=>scene.remove(m));
  if (mission.finishBanner) scene.remove(mission.finishBanner);
  mission = null;
  raceCooldown = 6;
  document.getElementById('missionPanel').classList.add('hidden');
  setTimeout(()=>{ if(!mission) startDeliveryMission(); }, 2500);
}
function clearRaceAI(){
  raceAI.forEach(ai=>scene.remove(ai.mesh));
  raceAI = [];
}

function buildFinishBanner(prevCp, cp){
  const g = new THREE.Group();
  const dir = Math.atan2(cp.x-prevCp.x, cp.z-prevCp.z); // orient across your approach direction
  const poleMat = new THREE.MeshStandardMaterial({color:0x1a1c22, roughness:0.5, metalness:0.4});
  const poleH = 9;
  [-1,1].forEach(side=>{
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,poleH,8), poleMat);
    pole.position.set(side*7.5, poleH/2, 0);
    pole.castShadow = true;
    g.add(pole);
  });
  // checkered banner texture, drawn once
  const c = makeCanvas(256,64);
  const ctx = c.getContext('2d');
  const cell = 16;
  for (let y=0;y<64;y+=cell){
    for (let x=0;x<256;x+=cell){
      const on = (((x/cell)|0)+((y/cell)|0))%2===0;
      ctx.fillStyle = on?'#ffffff':'#111111';
      ctx.fillRect(x,y,cell,cell);
    }
  }
  const bannerTex = new THREE.CanvasTexture(c);
  const bannerMat = new THREE.MeshBasicMaterial({map:bannerTex, side:THREE.DoubleSide});
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(15,2), bannerMat);
  banner.position.set(0, poleH-1, 0);
  g.add(banner);
  // glowing FINISH sign above the banner
  const tc = makeCanvas(256,64);
  const tctx = tc.getContext('2d');
  tctx.font = 'bold 34px sans-serif'; tctx.textAlign='center'; tctx.textBaseline='middle';
  tctx.shadowColor = '#2fe6ff'; tctx.shadowBlur = 20;
  tctx.fillStyle = '#2fe6ff'; tctx.fillText('FINISH', 128, 32);
  tctx.shadowBlur = 8; tctx.fillText('FINISH', 128, 32);
  const textMat = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(tc), transparent:true, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false});
  const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(6,1.5), textMat);
  textPlane.position.set(0, poleH+0.9, 0);
  g.add(textPlane);
  g.position.set(cp.x,0,cp.z);
  g.rotation.y = dir;
  scene.add(g);
  return g;
}

function startRaceMission(){
  const checkpoints = generateLoopCheckpoints();
  const markers = checkpoints.map(cp=>{
    const m = makeMarker(0x2fe6ff);
    m.position.set(cp.x,0,cp.z);
    return m;
  });
  const last = checkpoints[checkpoints.length-1];
  const prev = checkpoints.length>1 ? checkpoints[checkpoints.length-2] : {x:last.x, z:last.z-1};
  const finishBanner = buildFinishBanner(prev, last);
  mission = {
    type:'race', checkpoints, markers, current:0, finishBanner,
    timeLeft: 26*checkpoints.length, client:'Street Race', startedAt: performance.now()
  };
  spawnRaceAI(checkpoints[0], {x:player.x, z:player.z});
  showToast('RACE STARTED — BEAT THE PACK', '#ffe14a');
  updateMissionUI();
}

function startRandomMission(){
  // races are only ever entered via the marker (checkRaceTrigger) — this
  // ambient loop alternates deliveries and VIP rides, so free-roam jobs
  // never get pre-empted by a race starting on its own
  if (Math.random() < 0.35) startVipMission();
  else startDeliveryMission();
}

function advanceRaceCheckpoint(){
  scene.remove(mission.markers[mission.current]);
  mission.current++;
  Audio_.chime();
  if (mission.current >= mission.checkpoints.length){
    const elapsed = (performance.now()-mission.startedAt)/1000;
    const bonus = Math.round(mission.timeLeft*8);
    const total = 150+bonus;
    cash += total;
    if (bestRaceTime===null || elapsed<bestRaceTime) bestRaceTime = elapsed;
    showToast('+$'+total+' — RACE WON', '#7dffb0');
    clearRaceAI();
    if (mission.finishBanner) scene.remove(mission.finishBanner);
    mission = null;
    raceCooldown = 6;
    document.getElementById('missionPanel').classList.add('hidden');
    saveGame();
    setTimeout(()=>{ if(!mission) startDeliveryMission(); }, 2500);
  } else {
    showToast('CHECKPOINT '+mission.current+'/'+mission.checkpoints.length, '#2fe6ff');
    updateMissionUI();
  }
}

function failRaceMission(){
  showToast('RACE FAILED — TIME UP', '#ff3fb0');
  mission.markers.slice(mission.current).forEach(m=>scene.remove(m));
  if (mission.finishBanner) scene.remove(mission.finishBanner);
  clearRaceAI();
  mission = null;
  raceCooldown = 6;
  document.getElementById('missionPanel').classList.add('hidden');
  setTimeout(()=>{ if(!mission) startDeliveryMission(); }, 2500);
}

function advanceDeliveryToDropoff(){
  mission.stage='dropoff';
  mission.marker.position.set(mission.dropoff.x,0,mission.dropoff.z);
  const dropoffColor = mission.type==='vip' ? 0xb84dff : 0x2fe6ff;
  mission.marker.children[0].material.color.set(dropoffColor);
  mission.timeLeft = mission.type==='vip' ? 40 : 55;
  showToast(mission.type==='vip' ? 'VIP ABOARD — get them there safely' : 'PACKAGE LOADED', mission.type==='vip'?'#b84dff':'#ffb23e');
  Audio_.chime();
  updateMissionUI();
}

function completeMission(){
  let reward = mission.reward;
  let note = '';
  if (mission.type==='vip' && mission.crashed){
    reward = Math.round(reward*0.5);
    note = ' (shaken up — half fare)';
  }
  cash += reward;
  showToast('+$'+reward+' — JOB DONE'+note, '#7dffb0');
  Audio_.chime();
  scene.remove(mission.marker);
  mission = null;
  document.getElementById('missionPanel').classList.add('hidden');
  saveGame();
  setTimeout(()=>{ if(!mission) startRandomMission(); }, 2500);
}

function failMission(){
  showToast('JOB FAILED', '#ff3fb0');
  scene.remove(mission.marker);
  mission = null;
  document.getElementById('missionPanel').classList.add('hidden');
  setTimeout(()=>{ if(!mission) startRandomMission(); }, 2500);
}

function updateMissionUI(){
  const panel = document.getElementById('missionPanel');
  if (!mission){ panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  if (mission.type === 'race'){
    document.getElementById('missionTitle').textContent = 'STREET RACE';
    document.getElementById('missionDesc').textContent = 'Checkpoint '+(mission.current+1)+'/'+mission.checkpoints.length+' — follow the cyan ring.';
    document.getElementById('missionTimer').textContent = Math.ceil(mission.timeLeft)+'s';
    return;
  }
  document.getElementById('missionTitle').textContent = (mission.type==='vip'?'VIP RIDE — ':'JOB — ')+mission.client;
  document.getElementById('missionDesc').textContent = mission.type==='vip'
    ? (mission.stage==='pickup' ? 'Pick up the VIP. Follow the purple beacon.' : 'Get them there without crashing. Follow the purple beacon.')
    : (mission.stage==='pickup' ? 'Pick up the package. Follow the amber beacon.' : 'Deliver it before time runs out. Follow the cyan beacon.');
  document.getElementById('missionTimer').textContent = mission.stage==='dropoff' ? Math.ceil(mission.timeLeft)+'s' : '';
}

function showToast(text,color){
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.color = color||'#fff';
  el.style.opacity = '1';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>{ el.style.opacity='0'; }, 1600);
}

