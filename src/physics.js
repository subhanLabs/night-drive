/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/physics.js
 * Player-car physics: acceleration, steering, drift, and collisions.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Physics                                                                  */
/* ---------------------------------------------------------------------- */
// `boost` (0-100) is the fuel gauge, filled by drifting. `boostPower` is a
// smoothed 0-1 value driven off holding Space — it ramps in/out instead of
// snapping to full power the instant you press the key, which is what was
// causing the jarring camera/speed pop ("breaks into four") on activation.
let boost = 0, boostPower = 0, boostWasActive = false;
let shakeTime=0, shakeMag=0;
let promptText = '';

function circleRectPush(cx,cz,r, rect){
  const nx = clamp(cx, rect.minX, rect.maxX);
  const nz = clamp(cz, rect.minZ, rect.maxZ);
  const dx = cx-nx, dz = cz-nz;
  const distSq = dx*dx+dz*dz;
  if (distSq < r*r && distSq>1e-6){
    const dist = Math.sqrt(distSq);
    const push = (r-dist);
    return { x: (dx/dist)*push, z: (dz/dist)*push };
  }
  if (distSq<=1e-6){
    return { x:0, z:r };
  }
  return null;
}

function updatePhysics(dt){
  const worldEdge = HALF-3;
  cars.forEach(car=>{
    if (car.active && !garageOpen){
      const steer = ((keys['d']||keys['arrowright'])?1:0) - ((keys['a']||keys['arrowleft'])?1:0);
      const up = keys['w']||keys['arrowup'];
      const down = keys['s']||keys['arrowdown'];
      const handbrake = keys['shift'];
      const wantBoost = keys[' '];

      // Smooth steering input itself (not just the resulting motion) so turns
      // ease in/out at any speed instead of snapping. Faster damping (was 9)
      // so the response feels immediate instead of lagging behind the key press.
      if (car.steerSmooth === undefined) car.steerSmooth = 0;
      car.steerSmooth = damp(car.steerSmooth, steer, 16, dt);

      const speedFrac = clamp(Math.abs(car.speed)/car.def.maxSpeed, 0, 1);
      const lowSpeedRamp = clamp(speedFrac/0.18, 0, 1);          // avoid twitchy turning near a dead stop
      const highSpeedTaper = 1 - 0.35*clamp((speedFrac-0.65)/0.35, 0, 1); // real cars turn less sharply at speed
      // computed here (not after) so the drift boost below can use it
      const drifting = handbrake && Math.abs(steer)>0 && speedFrac>0.3;
      // Normal steering is gentler now (was 1.6) — a light tap was turning
      // too far. While drifting, the car's heading itself swings notably
      // faster (not just the slide) so the nose actually comes around away
      // from a wall/building instead of the car sliding on toward it.
      const driftTurnBoost = drifting ? 1.55 : 1.0;
      const turnRate = (1.35+car.def.handling*0.5) * driftTurnBoost * lowSpeedRamp * highSpeedTaper * (car.speed<0?-1:1);
      car.heading -= car.steerSmooth*turnRate*dt;

      let throttle = 0;
      if (up) throttle = 1; else if (down) throttle = -1;
      const accel = car.def.accel;
      if (throttle!==0){
        car.speed += throttle*accel*dt;
      } else {
        car.speed -= Math.sign(car.speed)*8*dt;
        if (Math.abs(car.speed)<0.3) car.speed=0;
      }
      const maxFwd = car.def.maxSpeed * (1 + 0.45*boostPower);
      car.speed = clamp(car.speed, -car.def.maxSpeed*0.4, maxFwd);

      Audio_.setDrift(drifting);
      if (drifting){
        boost = Math.min(100, boost+dt*36);
      }
      // tire smoke from the rear wheels while actively drifting — position
      // computed from the physics heading directly (forward/right vectors),
      // not the mesh's own local space, since the model has its own internal
      // rotation offset that doesn't match "forward" in world terms
      if (car===player){
        if (car.smokeTimer===undefined) car.smokeTimer = 0;
        car.smokeTimer -= dt;
        if (drifting && car.smokeTimer<=0){
          car.smokeTimer = 0.05;
          const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
          const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
          const vx = Math.sin(car.velAngle)*car.speed, vz = Math.cos(car.velAngle)*car.speed;
          [-0.55, 0.55].forEach(side=>{
            const px = car.x - fx*1.0 + rx*side;
            const pz = car.z - fz*1.0 + rz*side;
            spawnSmoke(px, 0.25, pz, -vx, -vz);
          });
        }
      }
      // Hold Space to spend NOS continuously (not a one-shot burst) — drains
      // while held and available, refilled by drifting. boostPower eases in
      // and out smoothly so there's no sudden speed/camera jolt either way.
      const boostActive = wantBoost && boost > 0 && car===player;
      if (boostActive){
        boost = Math.max(0, boost - dt*16);
        if (!boostWasActive){ Audio_.boostSound(); showToast('NOS!', '#ff3fb0'); }
      }
      if (car===player) boostWasActive = boostActive;
      boostPower = damp(boostPower, boostActive?1:0, 8, dt);

      const grip = drifting ? 0.032 : 0.22;
      car.velAngle = lerpAngle(car.velAngle, car.heading, 1-Math.pow(1-grip, dt*60));

      const vx = Math.sin(car.velAngle)*car.speed;
      const vz = Math.cos(car.velAngle)*car.speed;
      let nx = car.x+vx*dt, nz = car.z+vz*dt;

      // collisions with buildings — apply a real speed penalty only once per
      // impact (cooldown-based) so grazing/sliding along a wall doesn't
      // repeatedly slam the brakes and feel "jammed" every single frame
      if (car.hitCooldown === undefined) car.hitCooldown = 0;
      car.hitCooldown = Math.max(0, car.hitCooldown - dt);
      for (let k=0;k<buildingColliders.length;k++){
        const push = circleRectPush(nx,nz,1.3,buildingColliders[k]);
        if (push){
          nx += push.x*1.02; nz += push.z*1.02;
          if (car.hitCooldown<=0){
            if (Math.abs(car.speed) > 6){
              Audio_.crash(); shakeTime=0.3; shakeMag=0.25;
              if (car===player && mission && mission.type==='vip' && !mission.crashed){
                mission.crashed = true;
                showToast('VIP SHAKEN — bonus lost', '#ff3fb0');
              }
            }
            car.speed *= 0.55;
            car.hitCooldown = 0.5;
          } else {
            car.speed *= 0.94; // gentle continued drag while still touching, not a full stop
          }
        }
      }
      nx = clamp(nx,-worldEdge,worldEdge);
      nz = clamp(nz,-worldEdge,worldEdge);
      car.x=nx; car.z=nz;

      Audio_.setEngine(up?0.8:0.35, speedFrac);

      // mission progress
      if (mission){
        if (mission.type === 'race'){
          const target = mission.checkpoints[mission.current];
          const d = Math.hypot(car.x-target.x, car.z-target.z);
          if (d < 6) advanceRaceCheckpoint();
          if (mission){ // could have just completed and gone null above
            mission.timeLeft -= dt;
            if (mission.timeLeft<=0) failRaceMission();
            else updateMissionUI();
          }
        } else {
          const target = mission.stage==='pickup' ? mission.pickup : mission.dropoff;
          const d = Math.hypot(car.x-target.x, car.z-target.z);
          if (d < 5){
            if (mission.stage==='pickup') advanceDeliveryToDropoff();
            else completeMission();
          }
          if (mission && mission.stage==='dropoff'){
            mission.timeLeft -= dt;
            if (mission.timeLeft<=0) failMission();
            else updateMissionUI();
          }
        }
      }

      // car switching prompt — a bigger radius so you don't have to nudge
      // exactly onto the other car, and switching leaves both cars exactly
      // where they physically are (no teleporting either one)
      promptText = '';
      let alreadySwitchedThisFrame = false;
      cars.forEach((other,idx)=>{
        if (other===car || alreadySwitchedThisFrame) return;
        const d = Math.hypot(car.x-other.x, car.z-other.z);
        if (d < 8 && Math.abs(car.speed)<3){
          promptText = 'Press <kbd>E</kbd> to switch to '+other.def.name;
          if (pendingCarSwitch){
            setActiveCar(idx);
            car.speed = 0;
            alreadySwitchedThisFrame = true;
          }
        }
      });
      pendingCarSwitch = false; // consume the press each frame regardless — stale presses shouldn't queue up

      if (shakeTime>0) shakeTime -= dt;
    } else {
      car.speed = 0;
    }
    const skid = lerpAngle(0, car.heading-car.velAngle, 1)*0.5;
    const tiltZ = clamp(skid, -0.12, 0.12);
    car.mesh.rotation.z = tiltZ;
    // The tilt rotates around the car's ground-level origin, so the "low"
    // side of any roll would otherwise dip visibly below the road surface.
    // A small compensating lift (proportional to how much we're tilted)
    // keeps the lowest point of the car at/above ground instead of clipping
    // through it — this was the "car sinks into the road on drift" bug.
    car.mesh.position.set(car.x, Math.abs(Math.sin(tiltZ))*1.0, car.z);
    car.mesh.rotation.y = car.heading - Math.PI/2;
    const wheelSpin = car.speed*dt*1.4;
    car.mesh.userData.wheels.forEach(w=> w.rotation.x -= wheelSpin);
  });

  // radio toggle
  if (pendingRadioToggle){
    const name = Audio_.nextStation();
    document.getElementById('radioName').textContent = name;
    pendingRadioToggle = false;
  }
  if (pendingRadioOff){
    document.getElementById('radioName').textContent = Audio_.radioOff();
    pendingRadioOff = false;
  }

  document.getElementById('cashVal').textContent = '$'+cash;
  document.getElementById('speedVal').textContent = Math.round(Math.abs(player.speed)*7.2);
  document.getElementById('boostFill').style.width = boost+'%';
  document.getElementById('boostWrap').classList.toggle('boostReady', boost>0);
  const promptEl = document.getElementById('promptPanel');
  if (promptText){ promptEl.innerHTML = promptText; promptEl.classList.add('show'); }
  else { promptEl.classList.remove('show'); }
}

