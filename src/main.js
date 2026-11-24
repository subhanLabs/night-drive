/* ---------------------------------------------------------------------- *
 * NIGHT DRIVE — src/main.js
 * The animation loop and game bootstrap/init sequence.
 * ---------------------------------------------------------------------- */
"use strict";

/* ---------------------------------------------------------------------- */
/* Main loop                                                                */
/* ---------------------------------------------------------------------- */
let running = false;
let lastT = performance.now();

function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min((now-lastT)/1000, 0.05);
  lastT = now;
  if (!running) { renderer.render(scene,camera); return; }

  updatePhysics(dt);
  updateSmoke(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updateRaceAI(dt);
  checkRaceTrigger(dt);
  updateCamera(dt);
  updateDayNight(dt);
  drawMinimap(dt);

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

/* ---------------------------------------------------------------------- */
/* Init — preload real textures, THEN build the city, cars, and reveal UI  */
/* ---------------------------------------------------------------------- */
async function init(){
  loadSave();
  await Promise.all([
    preloadAllTextures(),
    preloadCarModels(),
    preloadBuildingModels(),
    preloadHDRI(),
    preloadAudio()
  ]);
  buildRealMats();
  generateCity();
  createCars();
  createTraffic();
  createPedestrians();
  setActiveCar(0);
  initSmokePool();
  spawnRaceMarker();
  refreshGarageUI();
  document.getElementById('loadingLine').classList.add('hidden');
  document.getElementById('startBtn').classList.remove('hidden');
}
init();

document.getElementById('garageClose').addEventListener('click', ()=>toggleGarage(false));

document.getElementById('startBtn').addEventListener('click', ()=>{
  pendingRadioToggle = false; pendingRadioOff = false; pendingCarSwitch = false; // ignore any stray presses from before the game started
  Audio_.init();
  const name = Audio_.nextStation();
  document.getElementById('radioName').textContent = name;
  startRandomMission();
  running = true;
  document.getElementById('startScreen').classList.add('hidden');
});
