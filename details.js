import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVEL, PITCH, TIERS, TIER_UNDERSIDE, BOWL } from './config.js';
import { boxAt } from './geometry.js';
import { N, PATHS } from './layout.js';
import { BOARD, BENCH } from './stadium.js';
import { personGeometries, STREET_Z } from './surroundings.js';
import * as T from './textures.js';

// Kleine Details für mehr Realismus – dort, wo man sie in der Tour aus der Nähe sieht.
// Alles als Instanzen oder zusammengeführte Geometrien: der ganze Baustein kostet rund 35 Zeichenaufrufe.
// Positionen sind so gewählt, dass nichts auf den Fahrwegen steht und nichts in die Sichtlinien der drei
// Rollstuhlplätze ragt (die Sicht ist Teil der Testhypothesen).

const E2 = LEVEL.E2;
const T3_BASE = TIERS[2].y - TIER_UNDERSIDE;
const WALL0 = N.facadeInnerZ; // Aussenwand im Umgang (innen)

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Geometrie einfärben (Vertexfarben), damit viele Bauteile ein Material teilen können
function tint(geo, hex) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) arr.set([_c.r, _c.g, _c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Rohr zwischen zwei Punkten
function rod(a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function matrixOf(s) {
  const sc = s.scale ?? 1;
  _q.setFromAxisAngle(UP, s.rot ?? 0);
  return _m.compose(_p.set(s.x, s.y ?? 0, s.z), _q, _s.set(sc, sc, sc));
}

// Figuren als zwei Instanzen-Meshes (Oberteil mit Farbe pro Person, Rest mit Vertexfarben)
function people(group, list, pose = 'stand') {
  const { shirt, rest } = personGeometries(pose);
  const shirtMesh = new THREE.InstancedMesh(shirt, new THREE.MeshStandardMaterial({ roughness: 0.7 }), list.length);
  const restMesh = new THREE.InstancedMesh(rest, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), list.length);
  list.forEach((s, i) => {
    matrixOf(s);
    shirtMesh.setMatrixAt(i, _m);
    restMesh.setMatrixAt(i, _m);
    shirtMesh.setColorAt(i, _c.setHex(s.color ?? 0x2f3b55));
  });
  shirtMesh.computeBoundingSphere();
  restMesh.computeBoundingSphere();
  group.add(shirtMesh, restMesh);
  return { shirtMesh, restMesh };
}

function instanced(group, geo, mat, list) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((s, i) => mesh.setMatrixAt(i, matrixOf(s)));
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

export function buildDetails({ scoreboard }) {
  const group = new THREE.Group();
  group.name = 'details';
  const mats = {
    dark: new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.6 }),
    tinted: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.15 }),
  };
  addPitchside(group, mats);
  addConcourse(group, mats, scoreboard);
  const forecourt = addForecourt(group, mats);
  return {
    group,
    // cam: Kameraposition. Bewegte Teile draussen rechnen nur, wenn man draussen ist.
    update(dt, time, cam) {
      if (cam.z < -84 || cam.y > 45) forecourt.update(dt, time);
    },
  };
}

/* =====================================================================
   Spielfeldrand: Ordner, Ballkinder, Trainer, Ersatzspieler, Fotografen, TV-Kameras, Coaching-Zonen
   ===================================================================== */
function addPitchside(group, mats) {
  const hx = BOWL.hx; // Mauer des Unterrings
  const hz = BOWL.hz;
  const tz = PITCH.width / 2; // Seitenlinie
  const stand = [];
  const sit = [];

  // Ordner mit Warnweste am Fuss jeder Treppe, Blick zu den Zuschauern
  const VEST = 0xf3d21b;
  for (const x of [-48, -24, 0, 24]) {
    stand.push({ x, z: -(hz - 0.9), rot: Math.PI, color: VEST });
    stand.push({ x, z: hz - 0.9, rot: 0, color: VEST });
  }
  for (const z of [-20, 0, 20]) {
    stand.push({ x: hx - 0.9, z, rot: Math.PI / 2, color: VEST });
    stand.push({ x: -(hx - 0.9), z, rot: -Math.PI / 2, color: VEST });
  }

  // Ballkinder zwischen Seitenlinie und Bande (nicht direkt vor Platz 1)
  const KID = 0xf08a1c;
  for (const x of [-42, -27, -8, 31, 45]) stand.push({ x, z: -(tz + 2.9), rot: 0, scale: 0.78, color: KID });
  for (const x of [-40, -22, 22, 40]) stand.push({ x, z: tz + 2.9, rot: Math.PI, scale: 0.78, color: KID });
  for (const sx of [-1, 1]) for (const z of [-21, 21]) stand.push({ x: sx * (BOARD.hx - 1.1), z, rot: -sx * (Math.PI / 2), scale: 0.78, color: KID });

  // Trainer in den Coaching-Zonen, vierter Offizieller dazwischen
  stand.push({ x: BENCH.xs[0] + 2.2, z: tz + 2.3, rot: Math.PI, color: 0x1a1d24 });
  stand.push({ x: BENCH.xs[1] - 2.6, z: tz + 2.1, rot: Math.PI - 0.3, color: 0x20305a });
  stand.push({ x: -3.2, z: tz + 2.4, rot: Math.PI, color: 0x1f9d55 });

  // Ersatzspieler auf den Bänken (Albanien links, Italien rechts)
  BENCH.xs.forEach((bx, k) => {
    for (let i = 0; i < 7; i++) sit.push({ x: bx + (i - 3) * 1.15, y: 0.05, z: BENCH.z - 0.05, rot: Math.PI, color: k === 0 ? 0xb3141f : 0x2457b8, scale: 0.98 });
  });

  // Fotografen hinter den Toren (sitzen am Boden hinter der Torlinie)
  const photographers = [];
  for (const sx of [-1, 1]) {
    for (const z of [-15.5, -12.6, -9.8, 9.6, 12.4, 15.2]) {
      const s = { x: sx * (BOARD.hx - 0.9), y: -0.18, z: z + (sx > 0 ? 0.3 : 0), rot: -sx * (Math.PI / 2), color: z < 0 ? 0x8a8f99 : 0x3a6ea5 };
      sit.push(s);
      photographers.push(s);
    }
  }

  // TV-Kameras an der Seitenlinie und hinter den Toren, je mit Kameraperson
  const cams = [
    { x: -36, z: -(tz + 2.7), rot: 0 },
    { x: 36, z: -(tz + 2.7), rot: 0 },
    { x: 0, z: tz + 3.0, rot: Math.PI },
    { x: BOARD.hx - 0.9, z: -5.4, rot: -Math.PI / 2 },
    { x: -(BOARD.hx - 0.9), z: 5.4, rot: Math.PI / 2 },
  ];
  for (const c of cams) stand.push({ x: c.x - Math.sin(c.rot) * 0.62, z: c.z - Math.cos(c.rot) * 0.62, rot: c.rot, color: 0x2a2e36 });

  people(group, stand, 'stand');
  people(group, sit, 'sit');

  // Kamera auf Stativ (vorwärts = +z)
  const camParts = [];
  const top = V(0, 1.22, 0);
  for (const [x, z] of [
    [-0.42, -0.3],
    [0.42, -0.3],
    [0, 0.48],
  ])
    camParts.push(rod(V(x, 0, z), top, 0.022));
  camParts.push(boxAt(0.3, 0.34, 0.6, 0, 1.24, 0.05));
  camParts.push(new THREE.CylinderGeometry(0.11, 0.085, 0.46, 12).rotateX(Math.PI / 2).translate(0, 1.42, 0.56));
  camParts.push(boxAt(0.16, 0.12, 0.2, 0.2, 1.52, -0.2));
  camParts.push(boxAt(0.5, 0.03, 0.03, 0, 1.2, -0.42));
  instanced(group, mergeGeometries(camParts), mats.dark, cams);

  // Fotoapparat mit langem Objektiv auf Einbeinstativ (vor der sitzenden Person)
  const gear = [];
  gear.push(tint(boxAt(0.15, 0.11, 0.1, 0, 1.0, 0.2), 0x17181c));
  gear.push(tint(new THREE.CylinderGeometry(0.06, 0.045, 0.36, 10).rotateX(Math.PI / 2).translate(0, 1.055, 0.43), 0xd9dcdf));
  gear.push(tint(rod(V(0, 0.18, 0.42), V(0, 1.0, 0.4), 0.012), 0x17181c));
  instanced(group, mergeGeometries(gear), mats.tinted, photographers);

  // Coaching-Zonen: gestrichelte Linien vor den Bänken
  const dashes = [];
  const dash = (x, z, alongX) => dashes.push(new THREE.PlaneGeometry(alongX ? 0.55 : 0.1, alongX ? 0.1 : 0.55).rotateX(-Math.PI / 2).translate(x, 0.058, z));
  for (const bx of BENCH.xs) {
    const x0 = bx - 5.5;
    const x1 = bx + 5.5;
    const z0 = tz + 1.0;
    const z1 = tz + 3.7;
    for (let x = x0; x <= x1 + 0.01; x += 1) dash(x, z0, true);
    for (let z = z0 + 0.6; z < z1; z += 1) {
      dash(x0, z, false);
      dash(x1, z, false);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshStandardMaterial({ color: 0xdfe3df, roughness: 0.9 })));
}

/* =====================================================================
   Umgang: Abfalleimer, Becher, Notausgang-Leuchten, Feuerlöscher, Bodenmarkierungen, Info-Bildschirme
   ===================================================================== */
function addConcourse(group, mats, scoreboard) {
  // --- Abfalleimer (an den Stützen, an Laternen, bei den Food-Trucks, an der Haltestelle) ---
  const binGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.24, 0.22, 0.8, 12).translate(0, 0.4, 0), 0x2b2f36),
    tint(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 12).translate(0, 0.835, 0), 0x8d939c),
    tint(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12).translate(0, 0.872, 0), 0x0d0e11),
  ]);
  const bins = [];
  for (const x of [-34, -18, 30, 46]) for (const y of [0, E2]) bins.push({ x: x + 0.86, y, z: -72 });
  bins.push({ x: 19.1, z: -104.9 }, { x: -20.9, z: -104.9 }, { x: 30.6, z: -121.6 }, { x: 30.6, z: -112.4 }, { x: 10, y: 0.28, z: STREET_Z + 8.8 });
  instanced(group, binGeo, mats.tinted, bins);

  // --- Getränkebecher (auf Theken und Stehtischen, einzelne am Boden neben den Eimern) ---
  const cupGeo = new THREE.CylinderGeometry(0.04, 0.029, 0.11, 10, 1, true).translate(0, 0.055, 0);
  const cupMat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide });
  const cupColors = [0xe9e9e4, 0xb3202a, 0x2a5fbf, 0xe9e9e4];
  const cups = [];
  const cup = (x, y, z, tipped = false) => cups.push({ x, y, z, tipped });
  for (const x of [-32.6, -31.9, -29.4, -28.2]) cup(x, E2 + 1.05, -78.28 + (x % 1) * 0.12);
  for (const x of [-20.6, -18.1, -17.5, -15.2]) cup(x, 1.05, -78.3 + (x % 1) * 0.12);
  for (let i = 0; i < 3; i++) {
    for (const dz of [-1.5, 1.5]) {
      cup(28.38, 1.12, -126 + i * 9 + dz - 0.1);
      cup(28.62, 1.12, -126 + i * 9 + dz + 0.14);
    }
  }
  cup(-17.5, 0.04, -72.5, true);
  cup(31.3, 0.04, -71.4, true);
  cup(-33.6, E2 + 0.04, -72.7, true);
  cup(19.7, 0.04, -105.3, true);
  cup(31.2, 0.04, -121.1, true);
  const cupMesh = new THREE.InstancedMesh(cupGeo, cupMat, cups.length);
  cups.forEach((c, i) => {
    _q.setFromEuler(_e.set(c.tipped ? Math.PI / 2 : 0, i * 1.7, 0, 'YXZ'));
    cupMesh.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(1, 1, 1)));
    cupMesh.setColorAt(i, _c.setHex(cupColors[i % cupColors.length]));
  });
  cupMesh.computeBoundingSphere();
  group.add(cupMesh);

  // --- Notausgang-Leuchten: Ebene 2 von der Decke abgehängt (beidseitig), Ebene 0 an der Wand ---
  const lampFaces = [];
  const lampBodies = [];
  const W = 0.62;
  const H = 0.31;
  for (const x of [-40, -24, 6, 26, 42]) {
    const y = E2 + 2.72;
    const z = -74.3;
    for (const side of [-1, 1]) lampFaces.push(new THREE.PlaneGeometry(W, H).rotateY((side * Math.PI) / 2).translate(x + side * 0.032, y, z));
    lampBodies.push(boxAt(0.06, H + 0.05, W + 0.05, x, y - H / 2 - 0.025, z));
    for (const dz of [-0.22, 0.22]) lampBodies.push(rod(V(x, y + H / 2, z + dz), V(x, T3_BASE, z + dz), 0.008, 4));
  }
  for (const x of [-46, -26, 6, 34, 46]) {
    lampFaces.push(new THREE.PlaneGeometry(W, H).translate(x, 2.78, WALL0 + 0.062));
    lampBodies.push(boxAt(W + 0.05, H + 0.05, 0.06, x, 2.78 - H / 2 - 0.025, WALL0 + 0.03));
  }
  // dezent leuchtend (unter der Bloom-Schwelle)
  group.add(new THREE.Mesh(mergeGeometries(lampFaces), new THREE.MeshBasicMaterial({ map: T.exitLampTexture(), color: new THREE.Color(0.95, 0.95, 0.95) })));
  group.add(new THREE.Mesh(mergeGeometries(lampBodies), mats.dark));

  // --- Feuerlöscher-Kästen an der Aussenwand, darüber das Piktogramm ---
  const boxes = [];
  const fronts = [];
  const setUv = (g, u0, u1) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    return g;
  };
  for (const [x, y] of [
    [-25.5, 0],
    [20.5, 0],
    [42, 0],
    [-23.5, E2],
    [8, E2],
    [22, E2],
    [44, E2],
  ]) {
    boxes.push(boxAt(0.34, 0.66, 0.2, x, y + 0.75, WALL0 + 0.1));
    fronts.push(setUv(new THREE.PlaneGeometry(0.34, 0.66), 0.5, 1).translate(x, y + 1.08, WALL0 + 0.203));
    fronts.push(setUv(new THREE.PlaneGeometry(0.25, 0.5), 0, 0.5).translate(x, y + 1.95, WALL0 + 0.012));
  }
  group.add(new THREE.Mesh(mergeGeometries(boxes), new THREE.MeshStandardMaterial({ color: 0x9c161c, roughness: 0.5, metalness: 0.2 })));
  group.add(new THREE.Mesh(mergeGeometries(fronts), new THREE.MeshStandardMaterial({ map: T.extinguisherTexture(), roughness: 0.6 })));

  // --- Bodenmarkierungen vom Lift zur Rollstuhlplattform (Ebene 2, rechts neben dem Weg) ---
  // Nur auf Ebene 2: am Eingang wird keine Route vorab markiert.
  const curve = new THREE.CatmullRomCurve3(
    PATHS.C_upper.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
  );
  const len = curve.getLength();
  const marks = [];
  for (let s = 2.4; s < len - 2.1; s += 2.6) {
    const u = s / len;
    const p = curve.getPointAt(u);
    const d = curve.getTangentAt(u);
    const g = new THREE.PlaneGeometry(0.42, 0.63).rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(d.x, d.z) + Math.PI);
    g.translate(p.x - d.z * 0.78, E2 + 0.03, p.z + d.x * 0.78);
    marks.push(g);
  }
  const markMesh = new THREE.Mesh(mergeGeometries(marks), new THREE.MeshBasicMaterial({ map: T.wheelchairGuideTexture(), transparent: true, depthWrite: false, color: new THREE.Color(0.8, 0.8, 0.8) }));
  markMesh.renderOrder = 1;
  group.add(markMesh);

  // --- Kleine Info-Bildschirme mit Spielstand (gleiche Textur wie die Anzeigetafel) ---
  const screens = [];
  const frames = [];
  const SW = 1.3;
  const SH = 0.57;
  const monitor = (x, y, z) => {
    // an einer Wand, die nach Norden zeigt (Blick aus dem Umgang)
    screens.push(new THREE.PlaneGeometry(SW, SH).rotateY(Math.PI).translate(x, y, z - 0.075));
    frames.push(boxAt(SW + 0.08, SH + 0.08, 0.07, x, y - SH / 2 - 0.04, z - 0.035));
  };
  const wall2 = N.t2BackZ - 0.5;
  for (const x of [-38, -16, 16, 36]) monitor(x, E2 + 2.25, wall2);
  for (const x of [-28, 7.6, 30]) monitor(x, 2.3, N.t1BackZ);
  group.add(new THREE.Mesh(mergeGeometries(screens), new THREE.MeshBasicMaterial({ map: scoreboard.texture, color: new THREE.Color(0.8, 0.8, 0.8) })));
  group.add(new THREE.Mesh(mergeGeometries(frames), mats.dark));
}

/* =====================================================================
   Vorplatz: Schal-Verkaufsstand, Polizei-Absperrung, Fans in Trikots, Tram mit Licht
   ===================================================================== */
function softGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function addForecourt(group, mats) {
  const structures = []; // alle festen Bauteile mit Vertexfarben in einem Mesh
  const fans = [];
  const JERSEY = [0xcf1f2a, 0xcf1f2a, 0xb3141f, 0x2457b8, 0x2a63c9, 0xf2f2f2];
  const jersey = (i) => JERSEY[i % JERSEY.length];

  /* --- Schal-Verkaufsstand (schaut nach Osten zum Weg vom Parkplatz) --- */
  const stall = { x: -46, z: -117, rot: Math.PI / 2 };
  const stallM = new THREE.Matrix4().makeRotationY(stall.rot).setPosition(stall.x, 0, stall.z);
  const place = (g) => g.applyMatrix4(stallM);
  const local = (lx, lz) => ({ x: stall.x + lx * Math.cos(stall.rot) + lz * Math.sin(stall.rot), z: stall.z - lx * Math.sin(stall.rot) + lz * Math.cos(stall.rot) });
  structures.push(place(tint(boxAt(3.0, 0.85, 0.9, 0, 0, 0.3), 0x1d2433)));
  structures.push(place(tint(boxAt(3.04, 0.04, 0.94, 0, 0.85, 0.3), 0x4a3a2a)));
  for (const sx of [-1.65, 1.65]) for (const sz of [-0.95, 1.05]) structures.push(place(tint(boxAt(0.07, 2.45, 0.07, sx, 0, sz), 0x2c3038)));
  structures.push(place(tint(boxAt(3.7, 0.08, 2.5, 0, 2.45, 0.05), 0x1d2433)));
  structures.push(place(tint(boxAt(3.7, 0.3, 0.03, 0, 2.15, 1.29), 0x8f1a22)));
  structures.push(place(tint(boxAt(3.3, 0.04, 0.04, 0, 2.02, -0.85), 0x2c3038)));
  // Schals: hängend an der Stange und ausgelegt auf dem Tisch (Farben aus dem Fan-Atlas, untere Hälfte)
  const cloth = [];
  const scarfUv = (g, cell, lengthAlongY) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const along = lengthAlongY ? uv.getY(i) : uv.getX(i);
      const across = lengthAlongY ? uv.getX(i) : uv.getY(i);
      uv.setXY(i, (along + cell) * 0.5, across * 0.5);
    }
    return g;
  };
  for (let i = 0; i < 13; i++) cloth.push(place(scarfUv(new THREE.PlaneGeometry(0.19, 1.05), i % 2, true).translate(-1.44 + i * 0.24, 1.5, -0.83 + (i % 3) * 0.012)));
  for (let i = 0; i < 4; i++) cloth.push(place(scarfUv(new THREE.PlaneGeometry(0.62, 0.17), (i + 1) % 2, false).rotateX(-Math.PI / 2).translate(-1.05 + i * 0.7, 0.9, 0.2 + (i % 2) * 0.28)));
  group.add(new THREE.Mesh(mergeGeometries(cloth), new THREE.MeshStandardMaterial({ map: T.fanClothAtlas(), roughness: 0.9, side: THREE.DoubleSide })));
  const stallSign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.42), new THREE.MeshBasicMaterial({ map: T.truckSignTexture('SCHALS · SCIARPE', '#1d2433'), color: new THREE.Color(1.1, 1.1, 1.1) }));
  stallSign.geometry.translate(0, 2.74, 1.31).applyMatrix4(stallM);
  group.add(stallSign);
  // warmes Licht unter dem Dach (klein, damit nichts überstrahlt)
  const warm = [place(boxAt(2.8, 0.03, 0.12, 0, 2.4, 0.6))];
  const v = local(0.5, -0.35);
  fans.push({ ...v, rot: stall.rot, color: 0x3d4a5c });
  const c1 = local(-0.6, 1.7);
  const c2 = local(0.55, 1.95);
  fans.push({ ...c1, rot: stall.rot + Math.PI, color: 0xcf1f2a }, { ...c2, rot: stall.rot + Math.PI + 0.3, color: 0x2457b8 });

  /* --- Polizei-Absperrung im Osten des Vorplatzes --- */
  const bz = -109;
  const boards = [];
  for (let x = 62; x < 80; x += 2) {
    for (const y of [0.92, 0.5]) {
      const g = new THREE.PlaneGeometry(1.9, 0.2).translate(x + 1, y, bz);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
      boards.push(g);
    }
    for (const dx of [0.08, 1.92]) {
      structures.push(tint(boxAt(0.05, 1.05, 0.05, x + dx, 0, bz), 0x8d939c));
      structures.push(tint(boxAt(0.06, 0.04, 0.5, x + dx, 0, bz), 0x8d939c));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(boards), new THREE.MeshStandardMaterial({ map: T.hazardTexture(), roughness: 0.6, side: THREE.DoubleSide })));
  // Einsatzwagen
  const van = { x: 71.5, z: -104.6 };
  const NAVY = 0x15264d;
  structures.push(tint(boxAt(5.2, 1.9, 2.0, van.x, 0.35, van.z), NAVY));
  structures.push(tint(boxAt(5.22, 0.16, 2.02, van.x, 0.95, van.z), 0xe6e8ec));
  structures.push(tint(boxAt(3.4, 0.55, 2.03, van.x + 0.5, 1.45, van.z), 0x0c1018));
  structures.push(tint(boxAt(1.3, 0.75, 2.03, van.x - 1.9, 1.4, van.z), 0x0c1018));
  for (const dx of [-1.7, 1.7]) for (const dz of [-0.95, 0.95]) structures.push(tint(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12).rotateX(Math.PI / 2).translate(van.x + dx, 0.36, van.z + dz), 0x111111));
  const vanSignMat = new THREE.MeshBasicMaterial({ map: T.truckSignTexture('POLIZIA', '#15264d'), color: new THREE.Color(0.9, 0.9, 0.9) });
  const vanSign = new THREE.Mesh(mergeGeometries([new THREE.PlaneGeometry(1.6, 0.4).rotateY(Math.PI).translate(van.x + 1.3, 0.72, van.z - 1.012), new THREE.PlaneGeometry(1.6, 0.4).translate(van.x - 1.3, 0.72, van.z + 1.012)]), vanSignMat);
  group.add(vanSign);
  // Blaulicht: pulsiert langsam und ruhig
  const blueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.7, 2.2) });
  group.add(new THREE.Mesh(boxAt(1.1, 0.12, 0.3, van.x - 0.6, 2.25, van.z), blueMat));
  const POLICE = 0x16223f;
  fans.push({ x: 65.4, z: bz - 0.9, rot: Math.PI, color: POLICE, scale: 1.02 }, { x: 70.6, z: bz - 0.9, rot: Math.PI + 0.25, color: POLICE, scale: 1.0 }, { x: 75.2, z: van.z - 1.7, rot: -2.4, color: POLICE, scale: 1.03 });

  /* --- Fans in Trikots: Warteschlangen an den Food-Trucks, Gruppen auf dem Vorplatz --- */
  for (let i = 0; i < 3; i++) {
    const z0 = -126 + i * 9 - 0.4;
    fans.push({ x: 31.9, z: z0, rot: Math.PI / 2, color: jersey(i) });
    fans.push({ x: 31.0, z: z0 + 0.25, rot: Math.PI / 2, color: jersey(i + 3) });
    if (i !== 1) fans.push({ x: 30.1, z: z0 - 0.15, rot: Math.PI / 2 + 0.3, color: jersey(i + 4) });
  }
  const groupAt = (cx, cz, n, seed) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      fans.push({ x: cx + Math.cos(a) * 0.85, z: cz + Math.sin(a) * 0.85, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), color: jersey(i + seed), scale: 0.94 + ((i * 7 + seed) % 5) * 0.03 });
    }
  };
  groupAt(-58, -114, 4, 1);
  groupAt(51.5, -126, 3, 2);
  groupAt(-66, -108, 3, 4);
  groupAt(22, -117, 3, 5);
  groupAt(52, -100, 4, 3);
  people(group, fans, 'stand');

  /* --- Fans unterwegs: gehen ruhig auf festen Bahnen abseits der Fahrwege --- */
  const lanes = [
    { a: [46, -142], b: [46, -101], n: 5 },
    { a: [-52, -121], b: [-52, -101], n: 4 },
    { a: [-8, -145.5], b: [62, -145.5], n: 5 },
  ];
  const walkers = [];
  lanes.forEach((lane, li) => {
    const dx = lane.b[0] - lane.a[0];
    const dz = lane.b[1] - lane.a[1];
    const length = Math.hypot(dx, dz);
    for (let i = 0; i < lane.n; i++) {
      const dir = i % 2 ? -1 : 1;
      walkers.push({ lane, length, ux: dx / length, uz: dz / length, s: ((i + 0.37 * li) / lane.n) * length, dir, side: dir * (0.35 + (i % 3) * 0.3), speed: 1.05 + ((i * 3 + li) % 4) * 0.11, color: jersey(i + li * 2), scale: 0.93 + (i % 4) * 0.035 });
    }
  });
  const walk = people(group, walkers.map((w) => ({ x: w.lane.a[0], z: w.lane.a[1], color: w.color })), 'stand');
  // feste Hülle über alle Bahnen, damit die Figuren im Stadioninnern nicht mitgezeichnet werden
  const walkBounds = new THREE.Sphere(new THREE.Vector3(5, 1, -124), 75);
  walk.shirtMesh.boundingSphere = walkBounds;
  walk.restMesh.boundingSphere = walkBounds;
  const placeWalkers = (dt, time) => {
    walkers.forEach((w, i) => {
      w.s += w.dir * w.speed * dt;
      if (w.s > w.length) {
        w.s = w.length;
        w.dir = -1;
        w.side = -Math.abs(w.side);
      } else if (w.s < 0) {
        w.s = 0;
        w.dir = 1;
        w.side = Math.abs(w.side);
      }
      // seitlicher Versatz: wer hin geht, läuft rechts, wer zurück geht, links
      const x = w.lane.a[0] + w.ux * w.s - w.uz * w.side;
      const z = w.lane.a[1] + w.uz * w.s + w.ux * w.side;
      const bob = Math.abs(Math.sin(time * w.speed * 3.1 + i)) * 0.022;
      _q.setFromAxisAngle(UP, Math.atan2(w.ux * w.dir, w.uz * w.dir));
      _m.compose(_p.set(x, bob, z), _q, _s.set(w.scale, w.scale, w.scale));
      walk.shirtMesh.setMatrixAt(i, _m);
      walk.restMesh.setMatrixAt(i, _m);
    });
    walk.shirtMesh.instanceMatrix.needsUpdate = true;
    walk.restMesh.instanceMatrix.needsUpdate = true;
  };
  placeWalkers(0, 0);

  /* --- Tram mit Licht: Scheinwerfer, Zielanzeige und Lichtschein an der stehenden Tram,
         dazu eine zweite Tram, die auf dem Nachbargleis vorbeifährt --- */
  const glowTex = softGlowTexture();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.82, 0.55), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const tramX = 18;
  const tramZ = STREET_Z - 1.9;
  const stillGlow = new THREE.Mesh(new THREE.PlaneGeometry(40, 7).rotateX(-Math.PI / 2).translate(tramX, 0.04, tramZ + 2.6), glowMat);
  stillGlow.renderOrder = 1;
  group.add(stillGlow);
  warm.push(boxAt(0.05, 0.16, 0.3, tramX + 16.53, 0.85, tramZ - 0.8), boxAt(0.05, 0.16, 0.3, tramX + 16.53, 0.85, tramZ + 0.8));
  group.add(new THREE.Mesh(mergeGeometries(warm), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.45, 1.05) })));
  const tail = new THREE.Mesh(mergeGeometries([boxAt(0.05, 0.12, 0.26, tramX - 16.53, 0.85, tramZ - 0.8), boxAt(0.05, 0.12, 0.26, tramX - 16.53, 0.85, tramZ + 0.8)]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.12, 0.1) }));
  group.add(tail);
  const signTex = T.tramSignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1.1, 1.1, 1.1) });
  group.add(new THREE.Mesh(mergeGeometries([new THREE.PlaneGeometry(1.5, 0.36).rotateY(Math.PI / 2).translate(tramX + 16.53, 2.95, tramZ), new THREE.PlaneGeometry(1.7, 0.4).translate(tramX + 13, 2.98, tramZ + 1.262)]), signMat));

  // zweites Gleis und fahrende Tram
  const z2 = STREET_Z + 1.3;
  structures.push(tint(boxAt(900, 0.02, 0.08, 0, 0.012, z2 - 0.72), 0x8d939c), tint(boxAt(900, 0.02, 0.08, 0, 0.012, z2 + 0.72), 0x8d939c));
  const tram = new THREE.Group();
  const body = [
    tint(boxAt(30, 2.9, 2.5, 0, 0.35, 0), 0xe8e6df),
    tint(boxAt(30.05, 0.35, 2.55, 0, 0.55, 0), 0xc9262c),
    tint(boxAt(29.5, 0.3, 2.2, 0, 3.25, 0), 0x3a3e46),
  ];
  tram.add(new THREE.Mesh(mergeGeometries(body), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 })));
  const lights = [];
  for (let x = -13; x <= 13; x += 2.6) lights.push(boxAt(2.0, 1.1, 2.56, x, 1.55, 0));
  for (const dz of [-0.8, 0.8]) lights.push(boxAt(0.05, 0.16, 0.3, 15.03, 0.85, dz));
  tram.add(new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.12, 0.96, 0.72) })));
  tram.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36).rotateY(Math.PI / 2).translate(15.03, 2.95, 0), signMat));
  const moveGlow = new THREE.Mesh(new THREE.PlaneGeometry(38, 7).rotateX(-Math.PI / 2).translate(2, 0.04, 0), glowMat);
  moveGlow.renderOrder = 1;
  tram.add(moveGlow);
  tram.position.set(-400, 0, z2);
  group.add(tram);

  const structMesh = new THREE.Mesh(mergeGeometries(structures), mats.tinted);
  group.add(structMesh);

  // Die Tram fährt alle rund 80 Sekunden von West nach Ost durch
  const CYCLE = 82;
  const SPEED = 8.5;
  return {
    update(dt, time) {
      placeWalkers(dt, time);
      const t = (time + 30) % CYCLE;
      tram.position.x = -290 + t * SPEED;
      tram.visible = tram.position.x < 300;
      const pulse = 0.55 + 0.45 * Math.sin(time * 2.2);
      blueMat.color.setRGB(0.25 + 0.3 * pulse, 0.45 + 0.5 * pulse, 1.2 + 1.3 * pulse);
    },
  };
}
