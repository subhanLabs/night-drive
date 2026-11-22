/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/traffic.js
 * Simple AI traffic cars and wandering pedestrians.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Traffic — simple AI cars looping along road corridors                   */
/* ---------------------------------------------------------------------- */
let trafficCars = [];
const TRAFFIC_PALETTE = [0xff3fb0, 0x2fe6ff, 0xffe14a, 0x8b5cff, 0x7dffb0, 0xff8a3d, 0xffffff, 0xff5a5a];
function createTraffic(){
  const modelKeys = ['sedan-sports','race','hatchback-sports','suv-luxury','race-future','taxi','sedan','police'];
  for (let i=0;i<16;i++){
    const modelKey = choice(modelKeys);
    const tint = choice(TRAFFIC_PALETTE);
    const template = carTemplates[modelKey];
    const model = template ? template.clone(true) : new THREE.Group();
    model.traverse(o=>{
      if (o.isMesh && o.material){
        const old = o.material;
        const isWheel = /wheel/i.test(o.name);
        o.material = new THREE.MeshStandardMaterial({
          map: old.map||null, color: isWheel?0x2a2c33:tint, roughness:isWheel?0.75:0.55, metalness:isWheel?0.2:0.1
        });
      }
    });
    model.scale.setScalar(MODEL_SCALE[modelKey]||1);
    model.rotation.y = MODEL_ROT_Y[modelKey]||0;
    const wrapper = new THREE.Group();
    wrapper.add(model);
    scene.add(wrapper);

    const vertical = Math.random()<0.5;
    let x,z,heading,axis,dir;
    const speed = rand(6,11);
    if (vertical){
      const colIdx = randInt(0,GRID-2);
      const o = cellOrigin(colIdx,0);
      x = o.x+BLOCK+ROAD/2 + (Math.random()<0.5?-3:3);
      z = rand(-HALF+ROAD, HALF-ROAD);
      dir = Math.random()<0.5?1:-1;
      heading = dir>0?0:Math.PI;
      axis = 'z';
    } else {
      const rowIdx = randInt(0,GRID-2);
      const o = cellOrigin(0,rowIdx);
      z = o.z+BLOCK+ROAD/2 + (Math.random()<0.5?-3:3);
      x = rand(-HALF+ROAD, HALF-ROAD);
      dir = Math.random()<0.5?1:-1;
      heading = dir>0?Math.PI/2:-Math.PI/2;
      axis = 'x';
    }
    wrapper.position.set(x,0,z);
    // cancel out the model's own baked-in facing offset (same correction
    // used for the player's car) so the visual front matches heading exactly
    wrapper.rotation.y = heading - (MODEL_ROT_Y[modelKey]||0);
    trafficCars.push({x,z,axis,dir,speed,mesh:wrapper});
  }
}

function updateTraffic(dt){
  trafficCars.forEach(t=>{
    if (t.axis==='z'){
      t.z += t.dir*t.speed*dt;
      if (t.z>HALF-ROAD) t.z = -HALF+ROAD;
      if (t.z<-HALF+ROAD) t.z = HALF-ROAD;
    } else {
      t.x += t.dir*t.speed*dt;
      if (t.x>HALF-ROAD) t.x = -HALF+ROAD;
      if (t.x<-HALF+ROAD) t.x = HALF-ROAD;
    }
    t.mesh.position.set(t.x,0,t.z);
    // gentle push-away so the player bumps off traffic rather than clipping through
    const d = Math.hypot(player.x-t.x, player.z-t.z);
    if (d < 2.6 && d>0.01){
      const nx=(player.x-t.x)/d, nz=(player.z-t.z)/d;
      player.x += nx*(2.6-d); player.z += nz*(2.6-d);
      player.speed *= 0.75;
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Pedestrians — simple animated walking figures (stylized, not photoreal; */
/* a real photoreal rigged-human pipeline is out of scope for a browser    */
/* page, see notes) wandering the plazas and sidewalks.                    */
/* ---------------------------------------------------------------------- */
let pedestrians = [];
function createPedestrians(){
  const skinTones = [0xd8a878,0xc48a5f,0x8f5f3f,0xe8c8a0];
  const shirtColors = [0x1f6fb2,0xb23a3a,0x2f8f5f,0xb2932f,0x6a3fb2,0xdddddd,0xff8fb0,0x2fb2a8];
  for (let i=0;i<26;i++){
    const g = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({color:choice(shirtColors), roughness:0.85});
    const pantsMat = new THREE.MeshStandardMaterial({color:0x22232b, roughness:0.85});
    const skinMat = new THREE.MeshStandardMaterial({color:choice(skinTones), roughness:0.9});

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.28,0.75,8), shirtMat);
    torso.position.y = 1.05;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2,8,8), skinMat);
    head.position.y = 1.58;
    g.add(head);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.6,6), shirtMat);
    armL.position.set(-0.32,1.05,0); armL.rotation.z = 0.12;
    g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.32; armR.rotation.z = -0.12; g.add(armR);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.09,0.62,6), pantsMat);
    legL.position.set(-0.12,0.32,0);
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.12; g.add(legR);
    g.traverse(o=>{ if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });

    const i2 = randInt(0,GRID-1), j2 = randInt(0,GRID-1);
    const c = cellCenter(i2,j2);
    const x = c.x + rand(-BLOCK*0.5,BLOCK*0.5);
    const z = c.z + rand(-BLOCK*0.5,BLOCK*0.5);
    g.position.set(x,0,z);
    scene.add(g);
    pedestrians.push({
      mesh:g, legL, legR, armL, armR, x, z,
      heading:0, speed:rand(0.9,1.7), walkT:rand(0,10),
      targetX:x, targetZ:z, timer:rand(0.5,2)
    });
  }
}

function updatePedestrians(dt){
  pedestrians.forEach(p=>{
    p.timer -= dt;
    const distToTarget = Math.hypot(p.targetX-p.x, p.targetZ-p.z);
    if (p.timer<=0 || distToTarget<0.6){
      p.targetX = p.x + rand(-16,16);
      p.targetZ = p.z + rand(-16,16);
      p.timer = rand(4,9);
    }
    const dx=p.targetX-p.x, dz=p.targetZ-p.z;
    const dist=Math.hypot(dx,dz);
    let moving = false;
    if (dist>0.15){
      const nx=dx/dist, nz=dz/dist;
      p.x += nx*p.speed*dt;
      p.z += nz*p.speed*dt;
      p.heading = Math.atan2(nx,nz);
      moving = true;
    }
    if (moving){
      p.walkT += dt*7;
      const swing = Math.sin(p.walkT)*0.5;
      p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
      p.armL.rotation.x = -swing*0.8; p.armR.rotation.x = swing*0.8;
    }
    p.mesh.position.set(p.x,0,p.z);
    p.mesh.rotation.y = p.heading;

    const d = Math.hypot(player.x-p.x, player.z-p.z);
    if (d < 1.6 && d>0.01){
      const nx=(p.x-player.x)/d, nz=(p.z-player.z)/d;
      p.x += nx*0.4; p.z += nz*0.4;
    }
  });
}

let activeIndex = 0;
let player = null;

function setActiveCar(idx){
  cars.forEach(c=>c.active=false);
  activeIndex = idx;
  player = cars[idx];
  player.active = true;
}

