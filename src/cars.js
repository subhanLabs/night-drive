/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/cars.js
 * Car model loading/factory, the player's owned-car roster, and the
 * garage UI for picking or buying cars.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Car factory                                                             */
/* ---------------------------------------------------------------------- */
// maxSpeed and accel are the tuning knobs for how fast each car actually
// is — maxSpeed is the top speed (roughly ×7.2 for the km/h number shown on
// the HUD), accel is how quickly it gets there. Raise/lower these directly
// to change how fast the game feels; handling affects turn sharpness, not speed.
const CAR_DEFS = [
  { name:'VESTA GT',   modelKey:'sedan-sports',     accent:0x0bd7ff, maxSpeed:35, accel:16, handling:2.5, stat:'Balanced sports coupe',        price:0 },
  { name:'RIOT V8',    modelKey:'race',             accent:0xff3fb0, maxSpeed:45, accel:19, handling:2.1, stat:'Heavy muscle, brutal accel',   price:0 },
  { name:'AURORA SE',  modelKey:'hatchback-sports', accent:0x8b5cff, maxSpeed:38, accel:13, handling:3.0, stat:'Light tuner, sharp handling',  price:0 },
  { name:'ONYX SUV',   modelKey:'suv-luxury',       accent:0xffe14a, maxSpeed:30, accel:14, handling:2.0, stat:'Luxury SUV — tanky, stable',   price:900 },
  { name:'PHANTOM X',  modelKey:'race-future',      accent:0x2fe6ff, maxSpeed:60, accel:21, handling:2.7, stat:'Concept racer — fastest in the city', price:1600 },
  { name:'CITY CAB',   modelKey:'taxi',             accent:0xffb23e, maxSpeed:32, accel:15, handling:2.4, stat:'Old reliable — well-rounded',  price:400 },
  { name:'IRON SEDAN', modelKey:'sedan',            accent:0x7dffb0, maxSpeed:29, accel:12, handling:2.2, stat:'Cheap and steady, nothing flashy', price:200 },
  { name:'INTERCEPTOR',modelKey:'police',           accent:0xff4444, maxSpeed:45, accel:20, handling:2.6, stat:'Ex-police pursuit spec — quick off the line', price:1250 },
];
// which cars the player currently owns (index into CAR_DEFS) — starter 3 are always owned
let ownedCars = [0,1,2];

// real CC0 car models (Kenney Car Kit) — loaded once, cloned per car instance
let carTemplates = {};
// Kenney's GLB export references its shared texture atlas as an external
// relative path (Textures/colormap.png) instead of embedding it, which
// fails hard under file:// (fetch() refuses the file: scheme outright).
// A URL modifier intercepts that request and redirects it to our embedded copy.
const gltfManager = new THREE.LoadingManager();
gltfManager.setURLModifier(url=>{
  if (url.indexOf('colormap.png') !== -1 && window.MEDIA_DATA){
    if (url.indexOf('bld/') !== -1) return window.MEDIA_DATA['building/colormap'];
    return window.MEDIA_DATA['car/colormap'];
  }
  return url;
});
const gltfLoader = new THREE.GLTFLoader(gltfManager);

function dataURItoArrayBuffer(dataURI){
  const base64 = dataURI.slice(dataURI.indexOf(',')+1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function loadCarModel(key){
  return new Promise(resolve=>{
    const uri = window.MEDIA_DATA && window.MEDIA_DATA['car/'+key];
    if (!uri){ resolve(new THREE.Group()); return; }
    const buf = dataURItoArrayBuffer(uri);
    gltfLoader.parse(buf, '', gltf=>resolve(gltf.scene), err=>{
      console.error('car model failed to load:', key, err);
      resolve(new THREE.Group());
    });
  });
}

async function preloadCarModels(){
  const keys = ['sedan-sports','race','hatchback-sports','suv-luxury','race-future','taxi','sedan','police'];
  const scenes = await Promise.all(keys.map(loadCarModel));
  keys.forEach((k,i)=>{ carTemplates[k] = scenes[i]; });
}

// real CC0 building models (Kenney City Kit Commercial) — same loader, a
// distinct 'bld/' path prefix lets the URL modifier tell the two kits'
// same-named colormap.png files apart
let buildingTemplates = {};
const BUILDING_MODEL_KEYS = ['building-a','building-b','building-c','building-d','building-e','building-f',
  'building-g','building-h','building-i','building-j','building-k','building-l','building-m','building-n'];
const SKYSCRAPER_MODEL_KEYS = ['skyscraper-a','skyscraper-b','skyscraper-c','skyscraper-d','skyscraper-e'];

function loadBuildingModel(key){
  return new Promise(resolve=>{
    const uri = window.MEDIA_DATA && window.MEDIA_DATA['building/'+key];
    if (!uri){ resolve(new THREE.Group()); return; }
    const buf = dataURItoArrayBuffer(uri);
    gltfLoader.parse(buf, 'bld/', gltf=>resolve(gltf.scene), err=>{
      console.error('building model failed to load:', key, err);
      resolve(new THREE.Group());
    });
  });
}

async function preloadBuildingModels(){
  const keys = [...BUILDING_MODEL_KEYS, ...SKYSCRAPER_MODEL_KEYS];
  const scenes = await Promise.all(keys.map(loadBuildingModel));
  keys.forEach((k,i)=>{ buildingTemplates[k] = scenes[i]; });
}

// Kenney's kit models each face their own baked-in direction; calibrated by
// visual test so the visual nose matches the physics heading convention.
const MODEL_ROT_Y = { 'sedan-sports': Math.PI/2, 'race': Math.PI/2, 'hatchback-sports': Math.PI/2, 'suv-luxury': Math.PI/2, 'race-future': Math.PI/2, 'taxi': Math.PI/2, 'sedan': Math.PI/2, 'police': Math.PI/2,
  'q_BasicCar': Math.PI/2, 'q_Taxi': Math.PI/2, 'q_RaceCar': Math.PI/2, 'q_CopCar': Math.PI/2, 'q_SimpleCarHigh': Math.PI/2, 'q_SimpleCarShort': Math.PI/2 };
const MODEL_SCALE = { 'sedan-sports': 1.3, 'race': 1.3, 'hatchback-sports': 1.3, 'suv-luxury': 1.3, 'race-future': 1.3, 'taxi': 1.3, 'sedan': 1.3, 'police': 1.3,
  'q_BasicCar': 1.0, 'q_Taxi': 1.0, 'q_RaceCar': 1.0, 'q_CopCar': 1.0, 'q_SimpleCarHigh': 1.0, 'q_SimpleCarShort': 1.0 };

function buildCarMesh(def){
  const group = new THREE.Group();
  const template = carTemplates[def.modelKey];
  const model = template ? template.clone(true) : new THREE.Group();

  const wheels = [];
  model.traverse(o=>{
    if (o.isMesh){
      o.castShadow = true; o.receiveShadow = true;
      if (o.material){
        // The kit's shared "colormap" atlas packs several unrelated paint
        // swatches into one texture, so used at full brightness every car
        // came out as a blotchy mix of random colours. Tinting the same
        // texture with the car's accent colour keeps the panel/window/trim
        // detail from the atlas but pulls the whole car toward one coherent
        // colour instead of looking like mismatched panels.
        const old = o.material;
        const isWheel = /wheel/i.test(o.name);
        o.material = isWheel
          ? new THREE.MeshStandardMaterial({ map:old.map||null, color:0x2a2c33, roughness:0.75, metalness:0.25 })
          : new THREE.MeshPhysicalMaterial({
              map: old.map || null, color: def.accent,
              roughness:0.42, metalness:0.2,
              clearcoat:0.7, clearcoatRoughness:0.2, envMapIntensity:1.15
            });
      }
      if (/wheel/i.test(o.name)) wheels.push(o);
    }
  });

  model.scale.setScalar(MODEL_SCALE[def.modelKey] || 1);
  model.rotation.y = MODEL_ROT_Y[def.modelKey] || 0;
  group.add(model);

  // underglow (our own addition, sits beneath the model regardless of its origin)
  const underMat = new THREE.MeshBasicMaterial({color:def.accent, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false});
  const under = new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.5), underMat);
  under.rotation.x = -Math.PI/2;
  under.position.y = 0.03;
  group.add(under);
  const underLight = new THREE.PointLight(def.accent, 0.35, 4, 2);
  underLight.position.y = 0.3;
  group.add(underLight);

  group.userData.wheels = wheels;
  group.userData.def = def;
  return group;
}

/* ---------------------------------------------------------------------- */
/* Cars in the world                                                       */
/* ---------------------------------------------------------------------- */
const garage = cellCenter(CENTER_I, CENTER_J);
const parkSpots = [
  {x:garage.x-6.3, z:garage.z-3, heading:0},
  {x:garage.x-2.1, z:garage.z-3, heading:0},
  {x:garage.x+2.1, z:garage.z-3, heading:0},
  {x:garage.x+6.3, z:garage.z-3, heading:0},
  {x:garage.x,     z:garage.z+3, heading:Math.PI},
];

// `cars` only ever holds cars the player actually owns (locked/unbought
// CAR_DEFS entries never get a mesh spawned until purchased in the garage).
// Each entry keeps `defIdx` — its index back into CAR_DEFS — so the garage
// UI and save file can refer to it stably even though `cars`' own array
// position shifts as new cars are unlocked.
let cars = [];
function createCars(){
  cars = ownedCars.map(defIdx=>{
    const def = CAR_DEFS[defIdx];
    const mesh = buildCarMesh(def);
    const spot = parkSpots[defIdx] || {x:garage.x, z:garage.z, heading:0};
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    return {
      def, defIdx, mesh,
      x:spot.x, z:spot.z, heading:spot.heading, velAngle:spot.heading,
      speed:0, active:false
    };
  });
}
function spawnOwnedCar(defIdx){
  if (cars.some(c=>c.defIdx===defIdx)) return;
  const def = CAR_DEFS[defIdx];
  const mesh = buildCarMesh(def);
  const spot = parkSpots[defIdx] || {x:garage.x, z:garage.z, heading:0};
  mesh.position.set(spot.x, 0, spot.z);
  mesh.rotation.y = spot.heading;
  scene.add(mesh);
  cars.push({ def, defIdx, mesh, x:spot.x, z:spot.z, heading:spot.heading, velAngle:spot.heading, speed:0, active:false });
}
function setActiveCarByDefIndex(defIdx){
  const i = cars.findIndex(c=>c.defIdx===defIdx);
  if (i>=0) setActiveCar(i);
}

/* ---------------------------------------------------------------------- */
/* Garage — press G any time to pick or unlock any car, instead of having  */
/* to physically find and walk up to another parked one.                  */
/* ---------------------------------------------------------------------- */
let garageOpen = false;
function toggleGarage(force){
  const panel = document.getElementById('garagePanel');
  if (!panel) return;
  const show = force!==undefined ? force : panel.classList.contains('hidden');
  garageOpen = show;
  if (show){ refreshGarageUI(); panel.classList.remove('hidden'); }
  else panel.classList.add('hidden');
}
function pickCarFromGarage(defIdx){
  if (!player || player.defIdx===defIdx) { toggleGarage(false); return; }
  spawnOwnedCar(defIdx); // no-op if it's already standing in the world
  const newCar = cars.find(c=>c.defIdx===defIdx);
  // hand the new car the exact spot/heading the player is standing at, so
  // nothing teleports oddly and the old car is simply left parked there
  newCar.x = player.x; newCar.z = player.z; newCar.heading = player.heading;
  newCar.velAngle = player.heading; newCar.speed = 0;
  setActiveCarByDefIndex(defIdx);
  toggleGarage(false);
}
function buyCarFromGarage(defIdx){
  const def = CAR_DEFS[defIdx];
  if (cash < def.price){ showToast('NOT ENOUGH CASH', '#ff3fb0'); return; }
  cash -= def.price;
  ownedCars.push(defIdx);
  spawnOwnedCar(defIdx);
  showToast('UNLOCKED '+def.name, '#7dffb0');
  saveGame();
  refreshGarageUI();
}
function refreshGarageUI(){
  const list = document.getElementById('garageList');
  if (!list) return;
  const cashEl = document.getElementById('garageCash');
  if (cashEl) cashEl.textContent = 'CASH: $'+cash;
  list.innerHTML = '';
  CAR_DEFS.forEach((def, idx)=>{
    const owned = ownedCars.includes(idx);
    const isActive = !!(player && player.defIdx===idx);
    const row = document.createElement('div');
    row.className = 'garageRow' + (isActive?' active':'') + (owned?'':' locked');
    row.innerHTML =
      '<div class="garageName">'+def.name+(isActive?' <span class="tag">IN USE</span>':'')+'</div>'+
      '<div class="garageStat">'+def.stat+'</div>'+
      '<div class="garageAction">'+(owned ? (isActive?'ACTIVE':'DRIVE ▸') : ('$'+def.price+' — UNLOCK'))+'</div>';
    if (owned && !isActive) row.addEventListener('click', ()=>pickCarFromGarage(idx));
    else if (!owned) row.addEventListener('click', ()=>buyCarFromGarage(idx));
    list.appendChild(row);
  });
}

