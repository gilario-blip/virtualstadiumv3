import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HIGH, PITCH } from './config.js';
import { placePeople, personGeometries } from './surroundings.js';
import { SEATS } from './layout.js';
import * as T from './textures.js';

// Publikum auf den Tribünen als leichte Billboards (zwei Dreiecke pro Person).
// Jede Person kann sitzen, stehen oder jubeln. Dichte und Haltung werden per Uniform gesteuert.

const CELLS = 6; // sitzend vorne/hinten, stehend vorne/hinten, jubelnd vorne/hinten
const CW = 96;
const CH = 288;

function atlas() {
  const c = document.createElement('canvas');
  c.width = CW * CELLS;
  c.height = CH;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const S = 'rgb(255,0,0)';
  const K = 'rgb(0,255,0)';
  const H = 'rgb(0,0,255)';
  const P = 'rgb(0,0,0)';
  const px = CH / 1.8; // Pixel pro Meter
  const draw = (cell, pose, back) => {
    const ox = cell * CW + CW / 2;
    const base = CH;
    const y = (m) => base - m * px;
    const sitting = pose === 'sit';
    const headY = sitting ? 1.22 : 1.62;
    const shoulderY = headY - 0.2;
    const hipY = sitting ? 0.62 : 0.92;
    // Beine / Hose
    g.fillStyle = P;
    if (sitting) {
      g.fillRect(ox - 0.17 * px, y(hipY + 0.02), 0.34 * px, 0.14 * px);
      g.fillRect(ox - 0.16 * px, y(0.48), 0.13 * px, 0.48 * px);
      g.fillRect(ox + 0.03 * px, y(0.48), 0.13 * px, 0.48 * px);
    } else {
      g.fillRect(ox - 0.16 * px, y(hipY), 0.14 * px, hipY * px);
      g.fillRect(ox + 0.02 * px, y(hipY), 0.14 * px, hipY * px);
    }
    // Oberkörper (Trikot)
    g.fillStyle = S;
    const tw = 0.4 * px;
    g.beginPath();
    g.roundRect(ox - tw / 2, y(shoulderY + 0.03), tw, (shoulderY + 0.03 - hipY) * px, 0.07 * px);
    g.fill();
    // Arme
    if (pose === 'cheer') {
      g.fillRect(ox - 0.27 * px, y(headY + 0.45), 0.09 * px, 0.5 * px);
      g.fillRect(ox + 0.18 * px, y(headY + 0.45), 0.09 * px, 0.5 * px);
      g.fillStyle = K;
      g.beginPath();
      g.arc(ox - 0.225 * px, y(headY + 0.47), 0.05 * px, 0, Math.PI * 2);
      g.arc(ox + 0.225 * px, y(headY + 0.47), 0.05 * px, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(ox - 0.27 * px, y(shoulderY), 0.08 * px, 0.42 * px);
      g.fillRect(ox + 0.19 * px, y(shoulderY), 0.08 * px, 0.42 * px);
    }
    // Hals und Kopf
    g.fillStyle = K;
    g.fillRect(ox - 0.04 * px, y(headY - 0.07), 0.08 * px, 0.12 * px);
    g.beginPath();
    g.ellipse(ox, y(headY + 0.04), 0.1 * px, 0.12 * px, 0, 0, Math.PI * 2);
    g.fill();
    // Haare (hinten mehr)
    g.fillStyle = H;
    g.beginPath();
    if (back) g.ellipse(ox, y(headY + 0.05), 0.105 * px, 0.12 * px, 0, 0, Math.PI * 2);
    else g.ellipse(ox, y(headY + 0.12), 0.1 * px, 0.06 * px, 0, Math.PI, Math.PI * 2);
    g.fill();
  };
  draw(0, 'sit', false);
  draw(1, 'sit', true);
  draw(2, 'stand', false);
  draw(3, 'stand', true);
  draw(4, 'cheer', false);
  draw(5, 'cheer', true);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const vertexShader = /* glsl */ `
  attribute vec3 iPos;
  attribute float iFacing;
  attribute vec3 iShirt;
  attribute vec3 iSkin;
  attribute vec4 iRand; // x: Dichte-Schwelle, y: Steh-Schwelle (>= 2: Fan-Block), z: Phase, w: Grösse
  attribute float iTeam; // 0 neutral, 1 Albanien, 2 Italien
  uniform float uFill;
  uniform float uStand;
  uniform float uCheer;
  uniform float uTime;
  uniform float uGoalA; // Torjubel Albanien 0..1
  uniform float uGoalB; // Torjubel Italien 0..1
  varying vec2 vUv;
  varying vec3 vShirt;
  varying vec3 vSkin;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    float visible = step(iRand.x, uFill);
    // Fan-Blöcke hinter den Toren stehen während des Spiels immer
    float block = step(1.5, iRand.y);
    float standing = max(step(iRand.y, uStand), block * uCheer);
    float cheering = standing * uCheer * max(step(0.45, fract(iRand.z * 7.13)), block * step(0.2, fract(iRand.z * 3.31)));
    // Torjubel: die Fans der Mannschaft springen auf (nur die fernen Zuschauer, nicht die Reihen vor den Rollstuhlplätzen)
    float g = iTeam < 0.5 ? 0.25 * max(uGoalA, uGoalB) : (iTeam < 1.5 ? uGoalA : uGoalB);
    float jubel = step(fract(iRand.z * 3.7) + 0.02, g);
    standing = max(standing, jubel);
    cheering = max(cheering, jubel);
    // Kamera-Richtung in der Ebene -> Billboard nur um die Hochachse drehen
    vec3 toCam = cameraPosition - iPos;
    vec2 d = normalize(toCam.xz + vec2(1e-4));
    vec3 right = vec3(d.y, 0.0, -d.x);
    float front = step(0.0, dot(d, vec2(sin(iFacing), cos(iFacing))));
    float pose = cheering > 0.5 ? 4.0 : (standing > 0.5 ? 2.0 : 0.0);
    float cell = pose + (1.0 - front);
    float bob = cheering * abs(sin(uTime * (3.2 + jubel * 1.4) + iRand.z * 6.28)) * (0.12 + jubel * 0.1);
    // ruhiges Wippen: jede Person bewegt sich leicht und in eigenem Tempo (weiche Sinuskurven, kein Ruckeln)
    float ph = iRand.z * 43.0;
    float sway = (sin(uTime * (0.55 + iRand.z * 0.5) + ph) * 0.022 + sin(uTime * 1.31 + ph * 1.7) * 0.008) * position.y;
    float breathe = sin(uTime * (0.9 + iRand.z * 0.4) + ph * 0.6) * 0.012 * position.y;
    float s = iRand.w * visible;
    vec3 pos = iPos + right * (position.x * 0.62 + sway) * s + vec3(0.0, (position.y * 1.8 + bob + breathe) * s, 0.0);
    vUv = vec2((cell + uv.x) / 6.0, uv.y);
    vShirt = iShirt;
    vSkin = iSkin;
    vShade = 0.55 + 0.45 * position.y;
    vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uLight;
  varying vec2 vUv;
  varying vec3 vShirt;
  varying vec3 vSkin;
  varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.5) discard;
    vec3 pants = vec3(0.05, 0.055, 0.07);
    vec3 hair = vec3(0.06, 0.045, 0.03);
    vec3 col = vShirt * t.r + vSkin * t.g + hair * t.b + pants * max(0.0, 1.0 - t.r - t.g - t.b);
    gl_FragColor = vec4(col * uLight * vShade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function buildCrowd(seats) {
  const group = new THREE.Group();
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const n = seats.length;
  const pos = new Float32Array(n * 3);
  const facing = new Float32Array(n);
  const shirt = new Float32Array(n * 3);
  const skin = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 4);
  const team = new Float32Array(n);
  const c = new THREE.Color();
  const alb = [0xcf1f2a, 0xcf1f2a, 0xb3141f, 0x151515];
  const ita = [0x2457b8, 0x2a63c9, 0xf2f2f2, 0x1c3f8a];
  const neutral = [0x2f3b55, 0x5a5f68, 0x8a8f99, 0x3d2f2a, 0x1f2a24];
  const skins = [0xe8c2a0, 0xd9a882, 0xc68c64, 0x9a6844, 0xf0d2b8];
  // Fans direkt bei den Rollstuhlplätzen werden als 3D-Figuren gezeigt (siehe unten)
  // Nur Fans auf gleicher Höhe oder tiefer, also die, die wirklich vor oder neben dem Platz sitzen.
  const nearRadius = HIGH ? 14 : 11;
  const near = [];
  seats.forEach((s, i) => {
    const owner = SEATS.findIndex((p) => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < nearRadius && s.y - p.pos.y < 1.2 && s.y - p.pos.y > -9);
    const isNear = owner >= 0;
    if (isNear) {
      s.owner = owner;
      near.push(s);
    }
    pos.set([s.x, s.y, s.z], i * 3);
    facing[i] = Math.atan2(-s.nx, -s.nz);
    // Albanien-Fans eher im Norden und Westen, Italien-Fans im Süden und Osten
    const northWest = s.z < 0 || s.x < -60;
    // Fan-Blöcke hinter den Toren (Unterring an den Stirnseiten): fast einfarbig, stehen und singen im Spiel
    const block = !isNear && s.tier === 0 && s.a === null && s.nx !== 0;
    const r = Math.random();
    const own = northWest ? alb : ita;
    const other = northWest ? ita : alb;
    const pal = block ? (r < 0.95 ? (s.nx < 0 ? alb : ita) : neutral) : r < 0.7 ? own : r < 0.85 ? other : neutral;
    team[i] = pal === alb ? 1 : pal === ita ? 2 : 0;
    s.team = team[i];
    s.index = i;
    s.block = block;
    c.setHex(pal[Math.floor(Math.random() * pal.length)]).convertSRGBToLinear();
    shirt.set([c.r, c.g, c.b], i * 3);
    c.setHex(skins[Math.floor(Math.random() * skins.length)]).convertSRGBToLinear();
    skin.set([c.r, c.g, c.b], i * 3);
    // einzelne Sitze bleiben leer: Fan-Blöcke sind dichter besetzt als der Rest
    const fill = isNear ? 2 : block ? Math.random() * 0.78 : Math.random();
    rnd.set([fill, block ? 2 : Math.random(), Math.random(), 0.92 + Math.random() * 0.14], i * 4);
    if (isNear) s.shirt = [shirt[i * 3], shirt[i * 3 + 1], shirt[i * 3 + 2]];
  });
  geo.setAttribute('iTeam', new THREE.InstancedBufferAttribute(team, 1));
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('iFacing', new THREE.InstancedBufferAttribute(facing, 1));
  geo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('iSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('iRand', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = n;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uAtlas: { value: null },
      uFill: { value: 0.18 },
      uStand: { value: 0 },
      uCheer: { value: 0 },
      uTime: { value: 0 },
      uLight: { value: 0.75 },
      uGoalA: { value: 0 },
      uGoalB: { value: 0 },
    },
  ]);
  uniforms.uAtlas.value = atlas();
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);

  // Spieler auf dem Rasen (nur während des Spiels)
  const players = createPlayers(group);
  const swayTime = { value: 0 };
  const nearFans = createNearFans(group, near, swayTime);
  const cloth = createFanCloth(group, seats, (i) => {
    rnd[i * 4] = 0;
  });

  const target = { fill: 0.18, stand: 0, cheer: 0 };
  const goal = { a: 0, b: 0, ta: 0, tb: 0 };
  let mode = 'before';
  let standing = false;
  return {
    group,
    ball: players.ball,
    // Atmosphäre: 'before' = vor dem Spiel, 'live' = während des Spiels
    setMode(m) {
      mode = m;
      target.fill = m === 'live' ? (HIGH ? 0.9 : 0.75) : 0.18;
      target.cheer = m === 'live' ? 1 : 0;
      players.setVisible(m === 'live');
      cloth.setLive(m === 'live');
      if (m !== 'live') goal.ta = goal.tb = 0;
      nearFans.apply(m === 'live' ? 0.9 : 0.18, standing);
    },
    setStanding(on) {
      standing = on;
      target.stand = on ? 0.97 : 0.06;
      nearFans.apply(mode === 'live' ? 0.9 : 0.18, on);
    },
    // Spielszene: Tor (team 'alb' oder 'ita') oder Torchance. Die Reihen direkt vor den Rollstuhlplätzen
    // bleiben, wie sie sind (sitzen/stehen ist die Sichtbedingung des Tests).
    // Angriff: der Ball läuft zum Tor (Albanien greift nach Osten an, Italien nach Westen)
    attack(team, isGoal) {
      const side = team === 'alb' ? 1 : -1;
      if (isGoal) players.goal(side);
      else players.chance(side);
    },
    // Torjubel der Fans dieser Mannschaft
    goal(team, seconds = 7) {
      if (team === 'alb') goal.ta = seconds;
      else goal.tb = seconds;
    },
    update(dt, time) {
      const k = 1 - Math.exp(-dt * 4);
      uniforms.uFill.value += (target.fill - uniforms.uFill.value) * k;
      uniforms.uStand.value += (target.stand - uniforms.uStand.value) * k;
      uniforms.uCheer.value = target.cheer;
      uniforms.uTime.value = time;
      // Torjubel schwillt schnell an und klingt langsam ab
      goal.ta = Math.max(0, goal.ta - dt);
      goal.tb = Math.max(0, goal.tb - dt);
      goal.a += ((goal.ta > 0 ? 1 : 0) - goal.a) * (1 - Math.exp(-dt * (goal.ta > 0 ? 3.5 : 0.9)));
      goal.b += ((goal.tb > 0 ? 1 : 0) - goal.b) * (1 - Math.exp(-dt * (goal.tb > 0 ? 3.5 : 0.9)));
      uniforms.uGoalA.value = goal.a;
      uniforms.uGoalB.value = goal.b;
      swayTime.value = time;
      cloth.update(time, goal.a, goal.b);
      players.update(dt, time);
    },
  };
}

/* ---------- Fahnen und Schals bei den Fans ----------
   Zwei Instanzen-Meshes (Fahnen, Schals), Farben über einen kleinen Atlas, Bewegung im Vertex-Shader.
   Nur in den Fan-Blöcken hinter den Toren, im Oberring und im Unterring Süd – nicht vor den Rollstuhlplätzen
   und nicht im Mittelring, damit keine Fahne in die Sichtlinien der drei Plätze ragt. */
function createFanCloth(group, seats, occupy) {
  const atlasTex = T.fanClothAtlas();
  const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.35 }, uGoalA: { value: 0 }, uGoalB: { value: 0 } };
  const make = (kind) => {
    const mat = new THREE.MeshBasicMaterial({ map: atlasTex, side: THREE.DoubleSide, color: new THREE.Color(0.82, 0.82, 0.82) });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iCell;\nuniform float uTime;\nuniform float uAmp;\nuniform float uGoalA;\nuniform float uGoalB;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2((uv.x + iCell) * 0.5, uv.y * 0.5 + ${kind === 'flag' ? '0.5' : '0.0'});`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 2.11;
          float amp = uAmp + (iCell < 0.5 ? uGoalA : uGoalB) * 0.9;
          ${
            kind === 'flag'
              ? `float w = max(0.0, position.x);
          transformed.z += sin(position.x * 3.4 - uTime * (3.6 + fract(ph) * 1.5) + ph) * 0.2 * w * amp;
          transformed.y += sin(position.x * 2.1 - uTime * 2.7 + ph) * 0.05 * w * amp;
          // die ganze Fahne schwenkt um den Griff
          transformed.x += sin(uTime * (1.2 + fract(ph * 0.37)) + ph) * 0.3 * amp * max(0.0, position.y - 0.9);`
              : `float sw = sin(uTime * (1.7 + fract(ph) * 0.6) + ph);
          transformed.x += sw * 0.14 * amp;
          transformed.y += (abs(sw) * 0.06 + sin(position.x * 5.0 + uTime * 3.0 + ph) * 0.02) * amp;`
          }`,
        );
    };
    mat.customProgramCacheKey = () => `fancloth-${kind}`;
    return mat;
  };
  // Fahne: Stange (schmaler Streifen, dunkler Teil des Atlas) und Tuch. Schal: breites Band über den Köpfen.
  const flagCloth = new THREE.PlaneGeometry(1.25, 0.8, 6, 2).translate(0.645, 2.6, 0);
  const pole = new THREE.PlaneGeometry(0.04, 2.1).translate(0, 1.95, 0);
  const pUv = pole.attributes.uv;
  for (let i = 0; i < pUv.count; i++) pUv.setXY(i, 0.5, 0.5); // schwarzer Streifen in der Mitte beider Fahnen
  const flagGeo = mergeGeometries([flagCloth, pole]);
  const scarfGeo = new THREE.PlaneGeometry(0.95, 0.17, 5, 1).translate(0, 1.98, 0);

  const flags = [];
  const scarves = [];
  for (const s of seats) {
    if (s.owner !== undefined || !s.team) continue;
    const upper = s.tier === 2;
    const southLower = s.tier === 0 && s.a === null && s.nz === 1;
    if (!(s.block || upper || southLower)) continue;
    const r = Math.random();
    // Schals nur in den stehenden Fan-Blöcken, Fahnen auch vereinzelt im Oberring und im Unterring Süd
    if (s.block) {
      if (s.row >= 2 && r < 0.022) flags.push(s);
      else if (r < 0.085) scarves.push(s);
    } else if (r < 0.004) flags.push(s);
  }
  // wer eine Fahne oder einen Schal hält, ist immer da (sonst schwebt das Tuch über einem leeren Sitz)
  for (const s of [...flags, ...scarves]) occupy(s.index);
  const build = (geo, list, kind) => {
    const g = geo.clone();
    const mesh = new THREE.InstancedMesh(g, make(kind), list.length);
    const cell = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    // zufällige Reihenfolge, damit vor dem Spiel ein kleiner Teil gleichmässig verteilt sichtbar ist
    list.sort(() => Math.random() - 0.5);
    list.forEach((s, i) => {
      const sc = 0.9 + Math.random() * 0.25;
      m.makeRotationY(Math.atan2(-s.nx, -s.nz) + (Math.random() - 0.5) * 0.5).scale(v.set(sc, sc, sc)).setPosition(s.x, s.y, s.z);
      mesh.setMatrixAt(i, m);
      cell[i] = s.team === 1 ? 0 : 1;
    });
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(cell, 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const flagMesh = build(flagGeo, flags, 'flag');
  const scarfMesh = build(scarfGeo, scarves, 'scarf');
  return {
    setLive(live) {
      // vor dem Spiel sind erst wenige Fans da
      flagMesh.count = live ? flags.length : Math.round(flags.length * 0.15);
      scarfMesh.count = live ? scarves.length : 0;
      uniforms.uAmp.value = live ? 0.55 : 0.25;
    },
    update(time, goalA, goalB) {
      uniforms.uTime.value = time;
      uniforms.uGoalA.value = goalA;
      uniforms.uGoalB.value = goalB;
    },
  };
}

/* ---------- Fans in der Nähe der Rollstuhlplätze (echte 3D-Figuren) ----------
   Pro Platz ein eigenes Paket, damit die Grafikkarte nicht sichtbare Pakete auslässt.
   Es wird immer nur eine Haltung gezeichnet (sitzen oder stehen) und nur die besetzten Sitze. */
function createNearFans(group, seats, swayTime) {
  const restMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const shirtMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  // Leichtes Wippen im Vertex-Shader: jede Figur schwankt ruhig um ihre Füsse (kostet keine Rechenzeit im Skript)
  for (const mat of [restMat, shirtMat]) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = swayTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSwayTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swPh = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float swT = uSwayTime * (0.75 + fract(swPh * 0.31) * 0.5);
          transformed.x += (sin(swT + swPh) * 0.014 + sin(swT * 0.43 + swPh * 1.9) * 0.008) * transformed.y;
          transformed.z += cos(swT * 0.67 + swPh) * 0.007 * transformed.y;
        #endif`,
      );
    };
    mat.customProgramCacheKey = () => 'nearfan-sway';
  }
  const geos = { sit: personGeometries('sit'), stand: personGeometries('stand') };
  const buckets = new Map();
  for (const s of seats) {
    if (!buckets.has(s.owner)) buckets.set(s.owner, []);
    buckets.get(s.owner).push(s);
  }
  const packs = [];
  for (const list of buckets.values()) {
    const pack = { list, rnd: list.map(() => Math.random()), scale: list.map(() => 0.93 + Math.random() * 0.12), sets: {} };
    for (const pose of ['sit', 'stand']) {
      const shirt = new THREE.InstancedMesh(geos[pose].shirt, shirtMat, list.length);
      const rest = new THREE.InstancedMesh(geos[pose].rest, restMat, list.length);
      shirt.count = rest.count = 0;
      group.add(shirt, rest);
      pack.sets[pose] = { shirt, rest };
    }
    packs.push(pack);
  }
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  return {
    apply(fill, standing) {
      for (const pack of packs) {
        for (const pose of ['sit', 'stand']) {
          const set = pack.sets[pose];
          const show = (pose === 'stand') === standing;
          set.shirt.visible = set.rest.visible = show;
          if (!show) continue;
          let n = 0;
          pack.list.forEach((s, i) => {
            if (pack.rnd[i] >= fill) return;
            const sc = pack.scale[i];
            m.makeRotationY(Math.atan2(-s.nx, -s.nz)).scale(v.set(sc, sc, sc)).setPosition(s.x, s.y, s.z);
            set.shirt.setMatrixAt(n, m);
            set.rest.setMatrixAt(n, m);
            c.setRGB(s.shirt[0], s.shirt[1], s.shirt[2], THREE.LinearSRGBColorSpace);
            set.shirt.setColorAt(n, c);
            n++;
          });
          set.shirt.count = set.rest.count = n;
          set.shirt.instanceMatrix.needsUpdate = set.rest.instanceMatrix.needsUpdate = true;
          if (set.shirt.instanceColor) set.shirt.instanceColor.needsUpdate = true;
          set.shirt.computeBoundingSphere();
          set.rest.computeBoundingSphere();
        }
      }
    },
  };
}

/* ---------- Spieler ---------- */
function createPlayers(group) {
  const L = PITCH.length / 2;
  const formation = [
    [-48, 0],
    [-36, -20],
    [-38, -7],
    [-38, 7],
    [-36, 20],
    [-22, -12],
    [-24, 0],
    [-22, 12],
    [-10, -18],
    [-6, 0],
    [-10, 18],
  ];
  const spots = [];
  formation.forEach(([x, z], i) => spots.push({ x, z, color: i === 0 ? 0x1a1a1a : 0xcf1f2a, team: 0 }));
  formation.forEach(([x, z], i) => spots.push({ x: -x, z: -z, color: i === 0 ? 0xf2c230 : 0x2457b8, team: 1 }));
  const meshes = placePeople(group, spots);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  group.add(ball);
  const state = spots.map((s) => ({ home: { x: s.x, z: s.z }, x: s.x, z: s.z, rot: 0 }));
  const mtx = new THREE.Matrix4();
  const ballPos = new THREE.Vector2(0, 0);
  const roam = new THREE.Vector2();
  const want = new THREE.Vector2();
  // Spielszene: der Ball läuft kurz zu einem Tor (Tor: bis ins Netz, danach Anstoss in der Mitte)
  const scene = { t: 0, total: 0, side: 1, goal: false };
  let visible = false;
  const setVisible = (v) => {
    visible = v;
    meshes.shirtMesh.visible = v;
    meshes.restMesh.visible = v;
    ball.visible = v;
  };
  setVisible(false);
  return {
    setVisible,
    ball,
    // side: +1 = Tor im Osten (Albanien greift dorthin an), -1 = Tor im Westen
    goal(side) {
      Object.assign(scene, { t: 8.5, total: 8.5, side, goal: true });
    },
    chance(side) {
      Object.assign(scene, { t: 4.5, total: 4.5, side, goal: false });
    },
    update(dt, t) {
      if (!visible) return;
      // Ball wandert langsam über das Feld, Spieler verschieben sich mit
      roam.set(Math.sin(t * 0.13) * L * 0.55, Math.sin(t * 0.21 + 1) * 20);
      want.copy(roam);
      if (scene.t > 0) {
        scene.t -= dt;
        const el = scene.total - scene.t;
        if (scene.goal) {
          if (el < 5) want.set(scene.side * (L + 1.2), scene.side * 1.4);
          else want.set(0, 0);
        } else if (el < 2.6) want.set(scene.side * (L - 3), -scene.side * 5.5);
      }
      const speed = scene.t > 0 ? 3.2 : 1.6;
      ballPos.lerp(want, 1 - Math.exp(-dt * speed));
      ball.position.set(ballPos.x, 0.11, ballPos.y);
      state.forEach((p, i) => {
        const pull = i % 11 === 0 ? 0.1 : 0.35;
        const tx = p.home.x + ballPos.x * pull + Math.sin(t * 0.6 + i) * 2;
        const tz = p.home.z + ballPos.y * pull * 0.6 + Math.cos(t * 0.5 + i * 1.7) * 2;
        const dx = tx - p.x;
        const dz = tz - p.z;
        p.x += dx * Math.min(1, dt * 0.8);
        p.z += dz * Math.min(1, dt * 0.8);
        if (Math.hypot(dx, dz) > 0.05) p.rot = Math.atan2(dx, dz);
        mtx.makeRotationY(p.rot).setPosition(p.x, 0, p.z);
        meshes.shirtMesh.setMatrixAt(i, mtx);
        meshes.restMesh.setMatrixAt(i, mtx);
      });
      meshes.shirtMesh.instanceMatrix.needsUpdate = true;
      meshes.restMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
