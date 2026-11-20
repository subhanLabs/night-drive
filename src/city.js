/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/city.js
 * Procedural city generation: ground/ocean, buildings, neon hotel,
 * drift-smoke particle pool, and the hand-built landmark district.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Build the city                                                          */
/* ---------------------------------------------------------------------- */
const buildingColliders = []; // {minX,maxX,minZ,maxZ}
const cityGroup = new THREE.Group();
scene.add(cityGroup);

function buildGround(){
  // base layer: real photo-scanned asphalt, tiled across the whole district
  const asphaltMat = makeRealMaterial('asphalt', {roughness:1.0, envMapIntensity:0.25});
  const baseGeo = new THREE.PlaneGeometry(SPAN, SPAN);
  const baseMesh = new THREE.Mesh(baseGeo, asphaltMat);
  baseMesh.rotation.x = -Math.PI/2;
  baseMesh.receiveShadow = true;
  cityGroup.add(baseMesh);

  // overlay: crisp sidewalks / curbs / lane paint (transparent over the road itself)
  const tex = buildGroundTexture();
  const overlayGeo = new THREE.PlaneGeometry(SPAN, SPAN);
  const overlayMat = new THREE.MeshStandardMaterial({map:tex, roughness:0.95, metalness:0.02, envMapIntensity:0.25, transparent:true});
  const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
  overlayMesh.rotation.x = -Math.PI/2;
  overlayMesh.position.y = 0.015;
  overlayMesh.receiveShadow = true;
  cityGroup.add(overlayMesh);
}

function buildOcean(){
  // ocean surrounding the district, so the city doesn't just fade into a
  // black void at the edges
  const oceanMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c3a52, roughness:0.12, metalness:0.05, envMapIntensity:1.4
  });
  const oceanSize = SPAN*6;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(oceanSize, oceanSize), oceanMat);
  ocean.rotation.x = -Math.PI/2;
  ocean.position.y = -0.7;
  cityGroup.add(ocean);

  // low sea-wall ring right at the city edge — a real, solid boundary
  // instead of an invisible clamp
  const wallMat = new THREE.MeshStandardMaterial({color:0x2a2c36, roughness:0.75});
  const wallThickness = 1.4, wallHeight = 1.0;
  const half = HALF + wallThickness/2;
  const sides = [
    {w: SPAN+wallThickness*2, d: wallThickness, x:0, z:-half},
    {w: SPAN+wallThickness*2, d: wallThickness, x:0, z: half},
    {w: wallThickness, d: SPAN+wallThickness*2, x:-half, z:0},
    {w: wallThickness, d: SPAN+wallThickness*2, x: half, z:0},
  ];
  sides.forEach(s=>{
    const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, wallHeight, s.d), wallMat);
    wall.position.set(s.x, wallHeight/2-0.2, s.z);
    wall.castShadow = true; wall.receiveShadow = true;
    cityGroup.add(wall);
    buildingColliders.push({minX:s.x-s.w/2, maxX:s.x+s.w/2, minZ:s.z-s.d/2, maxZ:s.z+s.d/2});
  });
}

function addPalm(x,z){
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({color:0x3a2b22, roughness:0.9});
  const trunkH = rand(5,7.5);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.32,trunkH,6), trunkMat);
  trunk.position.y = trunkH/2;
  trunk.rotation.z = rand(-0.06,0.06);
  trunk.castShadow = true;
  g.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({color:0x0e3d2c, roughness:0.7, emissive:0x031a12, emissiveIntensity:0.4});
  for (let i=0;i<6;i++){
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.35, rand(2.6,3.6), 5), frondMat);
    frond.position.y = trunkH;
    frond.rotation.z = Math.PI/2.3;
    frond.rotation.y = (i/6)*TAU;
    frond.position.x += Math.cos((i/6)*TAU)*0.9;
    frond.position.z += Math.sin((i/6)*TAU)*0.9;
    frond.castShadow = true;
    g.add(frond);
  }
  g.position.set(x,0,z);
  cityGroup.add(g);
}

function addStreetLamp(x,z){
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({color:0x22242e, roughness:0.5, metalness:0.6});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,5.4,6), poleMat);
  pole.position.y = 2.7;
  pole.castShadow = true;
  g.add(pole);
  const glowColor = Math.random()<0.5 ? 0x2fe6ff : 0xff8f4d;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8), new THREE.MeshBasicMaterial({color:glowColor}));
  bulb.position.y = 5.5;
  g.add(bulb);
  // glow sprite (cheap fake bloom)
  const spriteMat = new THREE.SpriteMaterial({map:glowSpriteTex, color:glowColor, transparent:true, opacity:0.55, depthWrite:false, blending:THREE.AdditiveBlending});
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3.2,3.2,1);
  sprite.position.y = 5.5;
  g.add(sprite);
  g.position.set(x,0,z);
  cityGroup.add(g);
}

let glowSpriteTex;
(function makeGlowSprite(){
  const c = makeCanvas(64,64);
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32,32,0,32,32,32);
  grad.addColorStop(0,'rgba(255,255,255,1)');
  grad.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = grad; ctx.fillRect(0,0,64,64);
  glowSpriteTex = new THREE.CanvasTexture(c);
})();

/* ---------------------------------------------------------------------- */
/* Drift smoke — a small pooled particle system spawned from the rear      */
/* wheels while actively drifting. Pooled (not created/destroyed per       */
/* puff) so it doesn't add garbage-collection pressure during a long drift.*/
/* ---------------------------------------------------------------------- */
const SMOKE_POOL_SIZE = 36;
const smokePool = [];
function initSmokePool(){
  for (let i=0;i<SMOKE_POOL_SIZE;i++){
    const mat = new THREE.SpriteMaterial({map:glowSpriteTex, color:0x8f8f8f, transparent:true, opacity:0, depthWrite:false});
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.scale.set(0.1,0.1,1);
    scene.add(sprite);
    smokePool.push({sprite, age:0, maxAge:0, active:false, vx:0, vy:0, vz:0});
  }
}
let smokeCursor = 0;
function spawnSmoke(x,y,z,vx,vz){
  const p = smokePool[smokeCursor];
  smokeCursor = (smokeCursor+1) % smokePool.length;
  p.active = true;
  p.age = 0;
  p.maxAge = rand(0.7,1.1);
  p.sprite.position.set(x+rand(-0.15,0.15), y, z+rand(-0.15,0.15));
  p.vx = vx*0.15 + rand(-0.3,0.3);
  p.vz = vz*0.15 + rand(-0.3,0.3);
  p.vy = rand(0.5,0.9);
  p.sprite.visible = true;
  p.sprite.material.opacity = 0;
  p.sprite.scale.set(0.5,0.5,1);
}
function updateSmoke(dt){
  smokePool.forEach(p=>{
    if (!p.active) return;
    p.age += dt;
    const t = p.age/p.maxAge;
    if (t >= 1){ p.active=false; p.sprite.visible=false; return; }
    p.sprite.position.x += p.vx*dt;
    p.sprite.position.z += p.vz*dt;
    p.sprite.position.y += p.vy*dt;
    p.vy *= 0.96; // rise slows as it dissipates, like real smoke
    const scale = 0.5 + t*2.2;
    p.sprite.scale.set(scale,scale,1);
    p.sprite.material.opacity = (t<0.15 ? t/0.15 : 1-((t-0.15)/0.85)) * 0.4;
  });
}

const BUILDING_KINDS = ['concrete','concrete','brick','facadeA','facadeB'];

function addBuilding(cx, cz, w, d, forceKind){
  const h = rand(14, 58);
  const kind = forceKind || choice(BUILDING_KINDS);
  const isGlass = kind==='facadeA' || kind==='facadeB';

  const matOpts = { roughness: isGlass?0.4:0.88, envMapIntensity: isGlass?0.6:0.3 };
  if (!isGlass){
    // concrete/brick get our procedural lit-window overlay since the photo
    // texture itself has no windows
    const winTex = buildWindowTexture(Math.max(w,d), h);
    matOpts.emissive = 0xffffff;
    matOpts.emissiveMap = winTex;
    matOpts.emissiveIntensity = 1.0;
  } else {
    // glass towers: the facade photo already reads as glass panels; add a
    // soft uniform emissive tint so it still glows a little at night
    matOpts.emissive = 0x30405a;
    matOpts.emissiveIntensity = 0.35;
  }
  const mat = makeRealMaterial(kind, matOpts);
  // re-tile the repeat to roughly match this building's real-world size —
  // glass gets a much coarser tile so window panes read as real office
  // windows instead of a busy tiny grid
  const divisor = isGlass ? 18 : 9;
  mat.map.repeat.set(Math.max(1,w/divisor), Math.max(1,h/divisor));
  if (mat.normalMap) mat.normalMap.repeat.set(Math.max(1,w/divisor), Math.max(1,h/divisor));
  if (mat.roughnessMap) mat.roughnessMap.repeat.set(Math.max(1,w/divisor), Math.max(1,h/divisor));
  if (mat.metalnessMap) mat.metalnessMap.repeat.set(Math.max(1,w/divisor), Math.max(1,h/divisor));

  const geo = new THREE.BoxGeometry(w,h,d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, h/2, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  cityGroup.add(mesh);

  // setback tier on taller towers so they don't all read as a single plain
  // box — a real skyscraper silhouette trick
  let topY = h, topW = w, topD = d;
  if (h > 30 && Math.random() < 0.5){
    topW = w*rand(0.55,0.75); topD = d*rand(0.55,0.75);
    const setbackH = rand(8,h*0.35);
    const setbackMesh = new THREE.Mesh(new THREE.BoxGeometry(topW, setbackH, topD), mat);
    setbackMesh.position.set(cx, h+setbackH/2, cz);
    setbackMesh.castShadow = true; setbackMesh.receiveShadow = true;
    cityGroup.add(setbackMesh);
    topY = h + setbackH;
  }

  // neon trim on the actual roofline
  const trimColor = choice(NEON_COLORS);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(topW+0.2,0.35,topD+0.2), new THREE.MeshBasicMaterial({color:trimColor}));
  trim.position.set(cx, topY+0.2, cz);
  cityGroup.add(trim);

  // occasional sign on a facing side
  if (Math.random() < 0.6){
    const label = choice(SIGN_WORDS);
    const color = '#'+new THREE.Color(choice(NEON_COLORS)).getHexString();
    const signTex = buildSignTexture(label, color);
    const signMat = new THREE.MeshBasicMaterial({map:signTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
    const signW = clamp(w*0.7, 4, 9);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW*0.35), signMat);
    const side = choice([0,1,2,3]);
    const yPos = rand(h*0.3, h*0.75);
    if (side===0){ sign.position.set(cx, yPos, cz+d/2+0.05); }
    else if (side===1){ sign.position.set(cx, yPos, cz-d/2-0.05); sign.rotation.y = Math.PI; }
    else if (side===2){ sign.position.set(cx+w/2+0.05, yPos, cz); sign.rotation.y = -Math.PI/2; }
    else { sign.position.set(cx-w/2-0.05, yPos, cz); sign.rotation.y = Math.PI/2; }
    cityGroup.add(sign);
  }

  buildingColliders.push({minX:cx-w/2-0.6, maxX:cx+w/2+0.6, minZ:cz-d/2-0.6, maxZ:cz+d/2+0.6});
}

function addNeonHotel(cx, cz){
  // Real Kenney skyscraper model as the structure (not a plain box), tinted
  // pastel coral for a Vice-City "Ocean View" beachfront-hotel look
  const key = choice(SKYSCRAPER_MODEL_KEYS);
  const template = buildingTemplates[key];
  let w=BLOCK*0.5, d=BLOCK*0.5, h=66;
  if (template){
    const model = template.clone(true);
    const nativeSize = getTemplateSize(key, template);
    // scale to the hotel's actual plaza-sized lot, not a fixed multiplier —
    // native skyscraper footprints vary (1.3-1.4 units across variants), so
    // a flat 2.1x left this comically tiny whenever a smaller variant was
    // picked. Same fix as the regular real-building scaling.
    const targetFootprint = BLOCK*0.85;
    const scale = targetFootprint / Math.max(nativeSize.x, nativeSize.z);
    model.scale.setScalar(scale);
    model.traverse(o=>{
      if (o.isMesh && o.material){
        const old = o.material;
        o.material = new THREE.MeshPhysicalMaterial({
          map: old.map||null, color: old.map?0xffb8c4:0xffb8c4,
          roughness:0.7, metalness:0.08, clearcoat:0.1, clearcoatRoughness:0.5, envMapIntensity:0.45,
          emissive:0x3a1a20, emissiveMap: old.map||null, emissiveIntensity:0.2
        });
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    model.position.set(cx,0,cz);
    cityGroup.add(model);
    w = nativeSize.x*scale; d = nativeSize.z*scale; h = nativeSize.y*scale;
  } else {
    const mat = makeRealMaterial('concrete', { color: 0xffb8a8, emissive: 0x3a1a20, emissiveIntensity: 0.25, roughness:0.55 });
    mat.map.repeat.set(w/8, h/8);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    tower.position.set(cx, h/2, cz);
    tower.castShadow = true; tower.receiveShadow = true;
    cityGroup.add(tower);
  }

  // teal art-deco accent bands running around the tower
  const bandMat = new THREE.MeshBasicMaterial({color:0x2fe6c9});
  for (let b=1;b<=4;b++){
    const band = new THREE.Mesh(new THREE.BoxGeometry(w+0.15,0.5,d+0.15), bandMat);
    band.position.set(cx, h*(b/5), cz);
    cityGroup.add(band);
  }

  // rooftop crown + rooftop pool deck
  const crown = new THREE.Mesh(new THREE.BoxGeometry(w+0.4,0.6,d+0.4), new THREE.MeshBasicMaterial({color:0xff3fb0}));
  crown.position.set(cx, h+0.3, cz);
  cityGroup.add(crown);
  const roofPoolMat = new THREE.MeshPhysicalMaterial({color:0x1fd9e0, roughness:0.1, metalness:0.05, envMapIntensity:1.3});
  const roofPool = new THREE.Mesh(new THREE.BoxGeometry(w*0.5,0.2,d*0.35), roofPoolMat);
  roofPool.position.set(cx, h+0.65, cz);
  cityGroup.add(roofPool);

  // big vertical marquee sign: OCEAN / VIEW — the signature landmark element
  const signTex = buildVerticalSignTexture('OCEAN', 'VIEW', '#2fe6c9', '#ff3fb0');
  const signMat = new THREE.MeshBasicMaterial({map:signTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, h*0.5), signMat);
  sign.position.set(cx - w*0.28, h*0.4, cz + d/2 + 0.08);
  cityGroup.add(sign);
  const signBack = sign.clone(); signBack.rotation.y = Math.PI;
  signBack.position.set(cx - w*0.28, h*0.4, cz - d/2 - 0.08);
  cityGroup.add(signBack);
  const signSide = sign.clone(); signSide.rotation.y = -Math.PI/2;
  signSide.position.set(cx + w/2+0.08, h*0.4, cz - d*0.28);
  cityGroup.add(signSide);

  // additional big graphic ad panels lower on the facade — a real building
  // has more than one flat plaque of text on it
  addBigAdPanels(cx, cz, w, h*0.55, d, 2);
  addBaseGlow(cx, cz, Math.max(w,d)*1.1, 0xff8fb0);

  // entrance canopy + glow strip at street level
  const canopyMat = new THREE.MeshStandardMaterial({color:0x111318, roughness:0.4, metalness:0.6});
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(w*0.7, 0.4, 5), canopyMat);
  canopy.position.set(cx, 4.2, cz+d/2+2.5);
  canopy.castShadow = true;
  cityGroup.add(canopy);
  const canopyGlow = new THREE.Mesh(new THREE.BoxGeometry(w*0.7-0.4,0.06,4.6), new THREE.MeshBasicMaterial({color:0xff3fb0}));
  canopyGlow.position.set(cx, 4.0, cz+d/2+2.5);
  cityGroup.add(canopyGlow);

  // ground-level pool + deck out front, beach-club style
  const poolMat = new THREE.MeshPhysicalMaterial({color:0x1fa9c9, roughness:0.12, metalness:0.05, envMapIntensity:1.3});
  const pool = new THREE.Mesh(new THREE.BoxGeometry(9,0.2,6), poolMat);
  pool.position.set(cx - w*0.55, 0.1, cz + d*0.5);
  cityGroup.add(pool);
  const poolDeck = new THREE.Mesh(new THREE.BoxGeometry(11,0.08,8), new THREE.MeshStandardMaterial({color:0xe8dcc8, roughness:0.9}));
  poolDeck.position.set(pool.position.x, 0.04, pool.position.z);
  cityGroup.add(poolDeck);
  // beach umbrellas around the pool
  for (let u=0;u<3;u++){
    const ux = pool.position.x - 3 + u*3, uz = pool.position.z + 3.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2.2,6), new THREE.MeshStandardMaterial({color:0xdddddd}));
    pole.position.set(ux, 1.1, uz);
    cityGroup.add(pole);
    const canopyU = new THREE.Mesh(new THREE.ConeGeometry(1.1,0.6,10), new THREE.MeshStandardMaterial({color: u%2?0xff3fb0:0x2fe6c9, roughness:0.7}));
    canopyU.position.set(ux, 2.3, uz);
    cityGroup.add(canopyU);
  }

  // valet palms either side of the entrance
  addPalm(cx-w*0.42, cz+d/2+3.5);
  addPalm(cx+w*0.42, cz+d/2+3.5);
  addPalm(pool.position.x-4, pool.position.z-3);
  addPalm(pool.position.x+4, pool.position.z-3);

  buildingColliders.push({minX:cx-w/2-0.6, maxX:cx+w/2+0.6, minZ:cz-d/2-0.6, maxZ:cz+d/2+0.6});
}

function buildVerticalSignTexture(word1, word2, color1, color2){
  const c = makeCanvas(128,512);
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,128,512);
  ctx.save();
  ctx.translate(64,256);
  ctx.rotate(-Math.PI/2);
  ctx.font = '700 76px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowBlur = 30;
  ctx.shadowColor = color1; ctx.fillStyle = color1;
  ctx.fillText(word1, -110, 0);
  ctx.shadowColor = color2; ctx.fillStyle = color2;
  ctx.fillText(word2, 110, 0);
  ctx.restore();
  return new THREE.CanvasTexture(c);
}

const plazaBlocks = new Set();
plazaBlocks.add(CENTER_I+','+CENTER_J);
const hotelKey = (GRID-2)+','+CENTER_J;
plazaBlocks.add(hotelKey);

function addHouse(cx, cz){
  const houseW = rand(10,14), houseD = rand(9,12), houseH = rand(4.5,6);
  const wallMat = makeRealMaterial(choice(['concrete','brick']), {roughness:0.85});
  const rep = [Math.max(1,houseW/6), Math.max(1,houseH/6)];
  wallMat.map.repeat.set(rep[0],rep[1]);
  if (wallMat.normalMap) wallMat.normalMap.repeat.set(rep[0],rep[1]);
  if (wallMat.roughnessMap) wallMat.roughnessMap.repeat.set(rep[0],rep[1]);
  const body = new THREE.Mesh(new THREE.BoxGeometry(houseW, houseH, houseD), wallMat);
  body.position.set(cx, houseH/2, cz);
  body.castShadow = true; body.receiveShadow = true;
  cityGroup.add(body);

  const roofMat = new THREE.MeshStandardMaterial({color:0x2a1f1f, roughness:0.85});
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(houseW,houseD)*0.72, 2.6, 4), roofMat);
  roof.rotation.y = Math.PI/4;
  roof.position.set(cx, houseH+1.3, cz);
  roof.castShadow = true;
  cityGroup.add(roof);

  const porchLight = new THREE.PointLight(0xffc98a, 0.5, 6, 2);
  porchLight.position.set(cx, houseH*0.6, cz+houseD/2+0.5);
  cityGroup.add(porchLight);

  // yard: lawn filling the rest of the block
  const yardMat = new THREE.MeshStandardMaterial({color:0x1c3a22, roughness:1.0});
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK*0.9, BLOCK*0.9), yardMat);
  yard.rotation.x = -Math.PI/2;
  yard.position.set(cx, 0.02, cz);
  yard.receiveShadow = true;
  cityGroup.add(yard);

  // small backyard pool
  const poolSide = Math.random()<0.5 ? -1 : 1;
  const poolMat = new THREE.MeshPhysicalMaterial({color:0x1fa9c9, roughness:0.15, metalness:0.1, transparent:true, opacity:0.85, envMapIntensity:1.2});
  const pool = new THREE.Mesh(new THREE.BoxGeometry(5,0.15,3.2), poolMat);
  pool.position.set(cx + poolSide*(houseW/2+3.5), 0.08, cz - houseD*0.15);
  cityGroup.add(pool);
  const poolTrim = new THREE.Mesh(new THREE.BoxGeometry(5.6,0.1,3.8), new THREE.MeshStandardMaterial({color:0xdcdcdc, roughness:0.6}));
  poolTrim.position.set(pool.position.x, 0.03, pool.position.z);
  cityGroup.add(poolTrim);

  // low hedges out front
  for (let k=0;k<3;k++){
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.8,6,5), new THREE.MeshStandardMaterial({color:0x1e4a28, roughness:1}));
    shrub.position.set(cx-houseW/2-1+k*1.2, 0.7, cz+houseD/2+1.5);
    shrub.castShadow = true;
    cityGroup.add(shrub);
  }

  buildingColliders.push({minX:cx-houseW/2-0.6, maxX:cx+houseW/2+0.6, minZ:cz-houseD/2-0.6, maxZ:cz+houseD/2+0.6});
}

const buildingBoxCache = {};
function getTemplateSize(key, template){
  if (!buildingBoxCache[key]){
    const box = new THREE.Box3().setFromObject(template);
    buildingBoxCache[key] = box.getSize(new THREE.Vector3());
  }
  return buildingBoxCache[key];
}

function addBigAdPanels(cx, cz, w, h, d, count){
  for (let a=0;a<count;a++){
    const vertical = h > w*1.3 && Math.random()<0.5;
    const adTex = buildBigAdTexture(vertical);
    const adMat = new THREE.MeshBasicMaterial({map:adTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
    const adW = vertical ? w*0.34 : w*rand(0.55,0.82);
    const adH = vertical ? h*rand(0.5,0.78) : Math.min(h*0.4, adW*0.62);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(adW,adH), adMat);
    const side = choice([0,1,2,3]);
    const yPos = rand(h*0.22, Math.max(h*0.22, h-adH*0.6));
    if (side===0){ ad.position.set(cx, yPos, cz+d/2+0.06); }
    else if (side===1){ ad.position.set(cx, yPos, cz-d/2-0.06); ad.rotation.y=Math.PI; }
    else if (side===2){ ad.position.set(cx+w/2+0.06, yPos, cz); ad.rotation.y=-Math.PI/2; }
    else { ad.position.set(cx-w/2-0.06, yPos, cz); ad.rotation.y=Math.PI/2; }
    cityGroup.add(ad);
  }
}

function addBaseGlow(cx, cz, radius, color){
  const spriteMat = new THREE.SpriteMaterial({map:glowSpriteTex, color, transparent:true, opacity:0.5, depthWrite:false, blending:THREE.AdditiveBlending});
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(radius,radius,1);
  sprite.position.set(cx, 0.3, cz);
  cityGroup.add(sprite);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(radius*0.9,0.4,radius*0.9), new THREE.MeshBasicMaterial({color}));
  strip.position.set(cx,0.2,cz);
  cityGroup.add(strip);
}

function addRealBuilding(cx, cz, isSkyscraper){
  const keys = isSkyscraper ? SKYSCRAPER_MODEL_KEYS : BUILDING_MODEL_KEYS;
  const key = choice(keys);
  const template = buildingTemplates[key];
  if (!template){ addBuilding(cx, cz, rand(BLOCK*0.55,BLOCK*0.8), rand(BLOCK*0.55,BLOCK*0.8)); return; }
  const model = template.clone(true);
  const nativeSize = getTemplateSize(key, template);
  // scale relative to this specific model's OWN native size, not a flat
  // multiplier — Kenney's kit ranges from small 2-story shops to full towers,
  // so a flat 1.0-1.7x left small buildings tiny while big ones looked fine.
  // Target a consistent fraction of the block regardless of native size.
  const targetSize = isSkyscraper ? rand(BLOCK*0.55, BLOCK*0.9) : rand(BLOCK*0.75, BLOCK*1.05);
  const scale = targetSize / Math.max(nativeSize.x, nativeSize.z);
  model.scale.setScalar(scale);
  model.rotation.y = choice([0,Math.PI/2,Math.PI,-Math.PI/2]);

  model.traverse(o=>{
    if (o.isMesh && o.material){
      const old = o.material;
      o.material = new THREE.MeshPhysicalMaterial({
        map: old.map||null,
        color: old.map ? 0xffffff : (old.color ? old.color.clone() : 0xffffff),
        roughness:0.85, metalness:0.06, clearcoat:0.0, envMapIntensity:0.4,
        emissive: 0xffffff, emissiveMap: old.map||null, emissiveIntensity: 0.2
      });
      o.castShadow = true; o.receiveShadow = true;
    }
  });
  model.position.set(cx,0,cz);
  cityGroup.add(model);

  const w = nativeSize.x*scale, d = nativeSize.z*scale, h = nativeSize.y*scale;

  const trimColor = choice(NEON_COLORS);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w*0.92,0.3,d*0.92), new THREE.MeshBasicMaterial({color:trimColor}));
  trim.position.set(cx, h+0.15, cz);
  cityGroup.add(trim);

  // colored uplight glow at the base — cheap (sprite, not a real light) so we
  // can afford one per building; gives each building its own lighting mood
  addBaseGlow(cx, cz, Math.max(w,d)*0.9, choice(NEON_COLORS));

  addBigAdPanels(cx, cz, w, h, d, h>28 ? randInt(1,2) : 1);

  buildingColliders.push({minX:cx-w/2-0.6, maxX:cx+w/2+0.6, minZ:cz-d/2-0.6, maxZ:cz+d/2+0.6});
}

/* ---------------------------------------------------------------------- */
/* Landmark "arts quarter" — a few blocks of deliberately different,       */
/* non-boxy architecture for a distinct vibing street                      */
/* ---------------------------------------------------------------------- */
function addLandmarkSphere(cx,cz){
  const h = rand(38,54);
  const stemMat = makeRealMaterial('facadeB', {emissive:0x1a2a44, emissiveIntensity:0.3, roughness:0.3});
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(5.5,7.5,h*0.72,14), stemMat);
  stem.position.set(cx,h*0.36,cz);
  stem.castShadow = true;
  cityGroup.add(stem);
  const sphereMat = new THREE.MeshPhysicalMaterial({color:0x1fd9e0, roughness:0.2, metalness:0.25, emissive:0x0a3a3a, emissiveIntensity:0.5});
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10.5,20,16), sphereMat);
  sphere.position.set(cx,h*0.72+10.5,cz);
  sphere.castShadow = true;
  cityGroup.add(sphere);
  addBaseGlow(cx,cz,16,0x2fe6ff);
  addBigAdPanels(cx,cz,13,h*0.6,13,1);
  buildingColliders.push({minX:cx-7.5,maxX:cx+7.5,minZ:cz-7.5,maxZ:cz+7.5});
}

function addLandmarkPyramid(cx,cz){
  const h = rand(34,48);
  const mat = new THREE.MeshPhysicalMaterial({color:0xffd24d, roughness:0.3, metalness:0.35, emissive:0x3a2400, emissiveIntensity:0.35});
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(15.5,h,4), mat);
  pyramid.rotation.y = Math.PI/4;
  pyramid.position.set(cx,h/2,cz);
  pyramid.castShadow = true;
  cityGroup.add(pyramid);
  addBaseGlow(cx,cz,20,0xffb23e);
  buildingColliders.push({minX:cx-11,maxX:cx+11,minZ:cz-11,maxZ:cz+11});
}

function addLandmarkTwistedTier(cx,cz){
  const mat = makeRealMaterial('facadeA', {emissive:0x2a1030, emissiveIntensity:0.3, roughness:0.3});
  let y=0;
  const tiers=5;
  for (let t=0;t<tiers;t++){
    const size = 14-t*2.1;
    const th = rand(6.5,9.5);
    const box = new THREE.Mesh(new THREE.BoxGeometry(size,th,size), mat);
    box.rotation.y = t*0.36;
    box.position.set(cx, y+th/2, cz);
    box.castShadow = true; box.receiveShadow = true;
    cityGroup.add(box);
    y += th;
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1,7,8), new THREE.MeshBasicMaterial({color:0xff3fb0}));
  spire.position.set(cx,y+3.5,cz);
  cityGroup.add(spire);
  addBaseGlow(cx,cz,18,0xff3fb0);
  addBigAdPanels(cx,cz,10,y*0.5,10,1);
  buildingColliders.push({minX:cx-8.5,maxX:cx+8.5,minZ:cz-8.5,maxZ:cz+8.5});
}

function addLandmarkScreenBuilding(cx,cz){
  const w=26,h=36,d=14;
  const mat = new THREE.MeshStandardMaterial({color:0x0a0a10, roughness:0.6});
  const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  body.position.set(cx,h/2,cz);
  body.castShadow = true; body.receiveShadow = true;
  cityGroup.add(body);
  [0,Math.PI].forEach(rotY=>{
    const screenTex = buildBigAdTexture(false);
    const screenMat = new THREE.MeshBasicMaterial({map:screenTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w*0.9,h*0.68), screenMat);
    screen.position.set(cx, h*0.55, cz + (rotY===0? d/2+0.1 : -d/2-0.1));
    screen.rotation.y = rotY;
    cityGroup.add(screen);
  });
  addBaseGlow(cx,cz,22,0x8b5cff);
  buildingColliders.push({minX:cx-w/2-0.6,maxX:cx+w/2+0.6,minZ:cz-d/2-0.6,maxZ:cz+d/2+0.6});
}

const LANDMARK_FNS = [addLandmarkSphere, addLandmarkPyramid, addLandmarkTwistedTier, addLandmarkScreenBuilding];
const landmarkBlocks = new Set(['1,1','1,2','2,1','2,2']);

function generateCity(){
  buildGround();
  buildOcean();
  for (let i=0;i<GRID;i++){
    for (let j=0;j<GRID;j++){
      const key = i+','+j;
      const c = cellCenter(i,j);
      if (key === hotelKey){ addNeonHotel(c.x, c.z); continue; }
      if (landmarkBlocks.has(key)){ choice(LANDMARK_FNS)(c.x, c.z); continue; }
      if (plazaBlocks.has(key)) continue;
      if (Math.random() < 0.08 && key !== (CENTER_I+','+CENTER_J)){
        plazaBlocks.add(key);
        continue;
      }
      if (Math.random() < 0.14){
        addHouse(c.x, c.z);
        continue;
      }
      // most blocks: real Kenney building/skyscraper models — this is the
      // main fix for "everything looks like a plain textured box"
      const roll = Math.random();
      if (roll < 0.75){
        addRealBuilding(c.x, c.z, Math.random()<0.3);
      } else if (roll < 0.9){
        const w1 = rand(BLOCK*0.36, BLOCK*0.46);
        addBuilding(c.x - BLOCK*0.22, c.z, w1, rand(BLOCK*0.55,BLOCK*0.85));
        const w2 = BLOCK*0.9 - w1 - 2;
        addBuilding(c.x + (w1/2)+ (w2/2) + 1 - BLOCK*0.22, c.z, w2, rand(BLOCK*0.5,BLOCK*0.8));
      } else {
        addBuilding(c.x, c.z, rand(BLOCK*0.55,BLOCK*0.82), rand(BLOCK*0.55,BLOCK*0.82));
      }
    }
  }
  // plazas: palms + lamps
  plazaBlocks.forEach(key=>{
    if (key === hotelKey) return;
    const [i,j] = key.split(',').map(Number);
    const c = cellCenter(i,j);
    if (key === CENTER_I+','+CENTER_J){
      // garage plaza gets a big GARAGE sign floor ring instead of palms in the middle
      for (let k=0;k<4;k++){
        addPalm(c.x + Math.cos(k/4*TAU)*BLOCK*0.42, c.z + Math.sin(k/4*TAU)*BLOCK*0.42);
      }
    } else {
      const n = randInt(3,6);
      for (let k=0;k<n;k++){
        addPalm(c.x+rand(-BLOCK*0.35,BLOCK*0.35), c.z+rand(-BLOCK*0.35,BLOCK*0.35));
      }
    }
  });
  // street lamps along road midlines at intersections
  for (let i=0;i<=GRID;i++){
    for (let j=0;j<=GRID;j++){
      const x = -HALF + i*CELL - ROAD/2;
      const z = -HALF + j*CELL - ROAD/2;
      if (Math.random()<0.7) addStreetLamp(x + rand(-2,2), z + rand(-2,2));
    }
  }
}
// city generation deferred to init() — needs REAL_MATS ready first

