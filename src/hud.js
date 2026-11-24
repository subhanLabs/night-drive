/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/hud.js
 * Chase camera follow and the rotating heading-up minimap.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Camera follow                                                           */
/* ---------------------------------------------------------------------- */
const camState = { x:0, y:8, z:14, lookY:1.2 };
function updateCamera(dt){
  const behind = 8.5, height=3.6;
  const tx = player.x - Math.sin(player.velAngle)*behind;
  const tz = player.z - Math.cos(player.velAngle)*behind;
  const ty = height;
  camState.x = damp(camState.x, tx, 5, dt);
  camState.z = damp(camState.z, tz, 5, dt);
  camState.y = damp(camState.y, ty, 5, dt);
  let sx=0,sz=0;
  if (shakeTime>0){ sx=rand(-1,1)*shakeMag; sz=rand(-1,1)*shakeMag; }
  camera.position.set(camState.x+sx, camState.y, camState.z+sz);
  const lookAt = new THREE.Vector3(player.x, 1.1, player.z);
  camera.lookAt(lookAt);
  const targetFov = 62 + clamp(Math.abs(player.speed)/player.def.maxSpeed,0,1)*8 + boostPower*6;
  camera.fov = damp(camera.fov, targetFov, 3, dt);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------------- */
/* Minimap                                                                  */
/* ---------------------------------------------------------------------- */
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
function dampAngle(current, target, lambda, dt){
  return lerpAngle(current, target, 1-Math.exp(-lambda*dt));
}
let minimapHeadingSmooth = 0;
function drawMinimap(dt){
  const W = mmCanvas.width, H = mmCanvas.height;
  mmCtx.clearRect(0,0,W,H);
  mmCtx.fillStyle = 'rgba(8,10,18,0.65)';
  mmCtx.fillRect(0,0,W,H);

  const viewRadius = 80; // world units visible around the player
  const scale = (W*0.5) / viewRadius;
  const cx = W/2, cy = H/2;

  // Heading-up rotating map: the world rotates opposite the player's heading
  // so the player (and the direction they're moving) always points straight
  // up. Smoothed (dampAngle) so quick heading changes — e.g. mid-drift —
  // don't make the map jitter; it eases into the new direction instead.
  minimapHeadingSmooth = dampAngle(minimapHeadingSmooth, player.heading, 6, dt||0.016);

  mmCtx.save();
  mmCtx.beginPath(); mmCtx.arc(cx,cy,W/2-3,0,TAU); mmCtx.clip();
  mmCtx.translate(cx,cy);
  const mapTheta = minimapHeadingSmooth + Math.PI;
  mmCtx.rotate(mapTheta);
  mmCtx.translate(-player.x*scale, -player.z*scale);

  // Buildings drawn solid + outlined on both sides of every road corridor,
  // so the gaps between blocks read clearly as streets instead of the whole
  // map looking like empty static.
  buildingColliders.forEach(b=>{
    const x0=b.minX*scale, z0=b.minZ*scale, x1=b.maxX*scale, z1=b.maxZ*scale;
    mmCtx.fillStyle = 'rgba(70,130,190,0.55)';
    mmCtx.fillRect(x0,z0,x1-x0,z1-z0);
    mmCtx.strokeStyle = 'rgba(160,220,255,0.6)';
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(x0,z0,x1-x0,z1-z0);
  });

  if (typeof trafficCars !== 'undefined'){
    trafficCars.forEach(t=>{
      mmCtx.fillStyle = 'rgba(255,255,255,0.35)';
      mmCtx.beginPath(); mmCtx.arc(t.x*scale, t.z*scale, 2.5, 0, TAU); mmCtx.fill();
    });
  }

  // Race track line — draws the full remaining lap (current position through
  // every upcoming checkpoint) so you can see the shape of the circuit
  // ahead, not just the next dot.
  if (mission && mission.type==='race'){
    mmCtx.strokeStyle = 'rgba(47,230,255,0.65)';
    mmCtx.lineWidth = 2;
    mmCtx.setLineDash([5,4]);
    mmCtx.beginPath();
    mmCtx.moveTo(player.x*scale, player.z*scale);
    for (let i=mission.current;i<mission.checkpoints.length;i++){
      const cp = mission.checkpoints[i];
      mmCtx.lineTo(cp.x*scale, cp.z*scale);
    }
    mmCtx.stroke();
    mmCtx.setLineDash([]);
    // small dots for the checkpoints further ahead than the current target
    for (let i=mission.current+1;i<mission.checkpoints.length;i++){
      const cp = mission.checkpoints[i];
      mmCtx.fillStyle = 'rgba(47,230,255,0.5)';
      mmCtx.beginPath(); mmCtx.arc(cp.x*scale, cp.z*scale, 3,0,TAU); mmCtx.fill();
    }
  }

  // Distinct colours per marker type: amber = pickup, green = dropoff,
  // cyan = race checkpoint, yellow = race-start marker — previously the
  // Distinct colour AND shape per marker type — circle=pickup, filled
  // triangle=dropoff, diamond=VIP, cyan circle=race checkpoint, yellow=race
  // start — so they're distinguishable by silhouette, not just colour.
  function missionMarkerColor(){
    if (mission.type==='race') return '#2fe6ff';
    if (mission.type==='vip') return '#b84dff';
    return mission.stage==='pickup' ? '#ffb23e' : '#7dffb0';
  }
  function drawMissionDot(x,y,color){
    mmCtx.fillStyle = color;
    if (mission.type==='vip'){
      mmCtx.save(); mmCtx.translate(x,y); mmCtx.rotate(Math.PI/4);
      mmCtx.fillRect(-4,-4,8,8);
      mmCtx.restore();
    } else if (mission.stage==='dropoff' && mission.type!=='race'){
      mmCtx.beginPath(); mmCtx.moveTo(x,y-5); mmCtx.lineTo(x+5,y+4); mmCtx.lineTo(x-5,y+4); mmCtx.closePath(); mmCtx.fill();
    } else {
      mmCtx.beginPath(); mmCtx.arc(x,y,5,0,TAU); mmCtx.fill();
    }
  }
  if (mission){
    const target = mission.type==='race' ? mission.checkpoints[mission.current]
      : (mission.stage==='pickup' ? mission.pickup : mission.dropoff);
    if (target) drawMissionDot(target.x*scale, target.z*scale, missionMarkerColor());
  }
  // The race start marker used to be hidden any time another mission (a
  // delivery, a VIP ride) was active — since one of those is almost always
  // running, the race marker effectively never showed. It's independent now:
  // it shows any time you're not currently IN a race, regardless of whether
  // you also have a delivery/VIP job going.
  if ((!mission || mission.type!=='race') && raceMarker && raceCooldown<=0){
    const p = raceMarker.userData.pos;
    const px = p.x*scale, py = p.z*scale;
    mmCtx.fillStyle = '#ffe14a';
    mmCtx.beginPath(); mmCtx.arc(px,py,7,0,TAU); mmCtx.fill();
    mmCtx.save();
    mmCtx.translate(px,py);
    mmCtx.rotate(-mapTheta); // cancel the ambient map rotation so the letter stays upright
    mmCtx.fillStyle = '#1a1400';
    mmCtx.font = 'bold 9px sans-serif';
    mmCtx.textAlign = 'center'; mmCtx.textBaseline = 'middle';
    mmCtx.fillText('R', 0, 0);
    mmCtx.restore();
  }

  cars.forEach(c=>{
    if (c===player) return;
    mmCtx.save();
    mmCtx.translate(c.x*scale, c.z*scale);
    mmCtx.rotate(c.heading);
    mmCtx.fillStyle = 'rgba(255,255,255,0.6)';
    mmCtx.beginPath(); mmCtx.moveTo(0,-5); mmCtx.lineTo(3,4); mmCtx.lineTo(-3,4); mmCtx.closePath(); mmCtx.fill();
    mmCtx.restore();
  });

  // race rivals — shown only during an active race, distinct orange so you
  // can tell at a glance who's ahead of you and who's behind
  if (mission && mission.type==='race' && raceAI.length){
    raceAI.forEach(ai=>{
      mmCtx.save();
      mmCtx.translate(ai.x*scale, ai.z*scale);
      mmCtx.rotate(ai.heading);
      mmCtx.fillStyle = '#ff6b4a';
      mmCtx.shadowColor = '#ff6b4a'; mmCtx.shadowBlur = 4;
      mmCtx.beginPath(); mmCtx.moveTo(0,-6); mmCtx.lineTo(4,5); mmCtx.lineTo(-4,5); mmCtx.closePath(); mmCtx.fill();
      mmCtx.restore();
    });
  }
  mmCtx.restore();

  // Off-map compass arrow — points toward the active target whenever it's
  // outside the visible radius. Computed via the SAME rotation used for the
  // rest of the map (not a separately re-derived formula) so it can't drift
  // out of sync with which way the map is actually facing. maxR is clamped
  // to stay inside the circular border — this pointer no longer draws
  // beyond the map's edge.
  function drawOffMapPointer(target, color, label){
    if (!target) return;
    const rx = (target.x-player.x)*scale, rz = (target.z-player.z)*scale;
    const sx = rx*Math.cos(mapTheta) - rz*Math.sin(mapTheta);
    const sy = rx*Math.sin(mapTheta) + rz*Math.cos(mapTheta);
    const dist = Math.hypot(sx, sy);
    const maxR = W/2 - 16;
    if (dist <= maxR) return; // already visible on the map itself
    const ex = cx + (sx/dist)*maxR, ey = cy + (sy/dist)*maxR;
    const ang = Math.atan2(sx, -sy);
    mmCtx.save();
    mmCtx.translate(ex, ey); mmCtx.rotate(ang);
    mmCtx.fillStyle = color;
    mmCtx.shadowColor = color; mmCtx.shadowBlur = 5;
    mmCtx.beginPath(); mmCtx.moveTo(0,-8); mmCtx.lineTo(6,6); mmCtx.lineTo(-6,6); mmCtx.closePath(); mmCtx.fill();
    mmCtx.restore();
    if (label){
      mmCtx.fillStyle = '#1a1400';
      mmCtx.font = 'bold 8px sans-serif';
      mmCtx.textAlign = 'center'; mmCtx.textBaseline = 'middle';
      mmCtx.fillText(label, ex, ey-1);
    }
    const meters = Math.round(Math.hypot(target.x-player.x, target.z-player.z));
    mmCtx.fillStyle = '#fff'; mmCtx.font = 'bold 9px sans-serif'; mmCtx.textAlign = 'center';
    mmCtx.fillText(meters+'m', ex, ey > cy ? ey+13 : ey-10);
  }
  if (mission){
    const target = mission.type==='race' ? mission.checkpoints[mission.current]
      : (mission.stage==='pickup' ? mission.pickup : mission.dropoff);
    drawOffMapPointer(target, missionMarkerColor());
  }
  if ((!mission || mission.type!=='race') && raceMarker && raceCooldown<=0){
    drawOffMapPointer(raceMarker.userData.pos, '#ffe14a', 'R');
  }

  // player marker: fixed at center, ALWAYS pointing straight up — the map
  // rotates around them instead, which is what actually makes it read as
  // "smooth" (your own facing arrow never has to visibly spin).
  mmCtx.fillStyle = '#ff3fb0';
  mmCtx.save();
  mmCtx.translate(cx,cy);
  mmCtx.shadowColor = '#ff3fb0'; mmCtx.shadowBlur = 6;
  mmCtx.beginPath(); mmCtx.moveTo(0,-7); mmCtx.lineTo(5,6); mmCtx.lineTo(-5,6); mmCtx.closePath(); mmCtx.fill();
  mmCtx.restore();

  // north indicator — placed using the same transform math as everything
  // else, so it can't fall out of sync with the map's actual rotation
  {
    const nx = cx + Math.sin(mapTheta)*(W/2-13);
    const ny = cy - Math.cos(mapTheta)*(W/2-13);
    mmCtx.fillStyle = '#ffb23e';
    mmCtx.font = 'bold 11px sans-serif';
    mmCtx.textAlign='center'; mmCtx.textBaseline='middle';
    mmCtx.fillText('N', nx, ny);
  }

  mmCtx.strokeStyle = 'rgba(120,220,255,0.35)';
  mmCtx.lineWidth = 1.5;
  mmCtx.beginPath(); mmCtx.arc(cx,cy,W/2-3,0,TAU); mmCtx.stroke();
}

