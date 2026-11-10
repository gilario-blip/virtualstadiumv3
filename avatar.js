import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jerseyTexture } from './textures.js';

// Edi: vorbereiteter, stilisierter Avatar im manuellen Rollstuhl (68 × 110 cm).
// Vorwärts = +z. Ursprung am Boden in der Mitte des Rollstuhls.

const SKIN = 0xe8c2a0;
// Aktivrollstuhl (fiktive Projektdaten): aussen 68 cm breit, 110 cm lang (Fussstütze bis Hinterrad)
const WHEEL_R = 0.305; // 24-Zoll-Hinterrad
const RIM_R = 0.272; // Greifreifen
const AXLE = { y: WHEEL_R, z: -0.2 };
const WHEEL_X = 0.287; // Radmitte
const RIM_X = 0.322; // Greifreifen aussen (äusserste Breite ca. 0.68 m)
const CASTER_R = 0.065;

const mat = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const Y = new THREE.Vector3(0, 1, 0);

// Rohr zwischen zwei Punkten (statisch)
function tube(a, b, r, m, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
  return mesh;
}

// Körperteil zwischen zwei Punkten (Kapsel), z. B. Oberschenkel
function bone(a, b, r, m, rTo = r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = rTo === r ? new THREE.CapsuleGeometry(r, len, 4, 12) : new THREE.CylinderGeometry(rTo, r, len, 12);
  g.translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
  return mesh;
}

function limb(len, r, m) {
  // Glied, das vom Ursprung nach unten (-y) zeigt
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, m);
}

// Beweglicher Abschnitt entlang +y (für Arme mit IK)
function segment(parts) {
  const g = new THREE.Group();
  for (const p of parts) g.add(p);
  return g;
}
const tmp = new THREE.Vector3();
function aim(group, from, to) {
  group.position.copy(from);
  tmp.subVectors(to, from).normalize();
  group.quaternion.setFromUnitVectors(Y, tmp);
}

function rearWheel(m, sx) {
  const group = new THREE.Group();
  // Reifen, Felge, Speichen, Nabe – in der XY-Ebene gebaut, Achse = z
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.016, 0.016, 10, 48), m.rubber);
  const tread = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.016, 0.0165, 4, 48, Math.PI * 2), m.tread);
  tread.scale.set(1, 1, 0.55);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.036, 0.009, 6, 48), m.alu);
  const spokes = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const len = WHEEL_R - 0.05;
    const g = new THREE.CylinderGeometry(0.0018, 0.0018, len, 3);
    g.translate(0, len / 2, 0);
    g.rotateZ(a);
    // gekreuzte Einspeichung: abwechselnd leicht nach innen/aussen
    g.translate(0, 0, i % 2 ? 0.012 : -0.012);
    spokes.push(g);
  }
  const spokeMesh = new THREE.Mesh(mergeGeometries(spokes), m.chrome);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14).rotateX(Math.PI / 2), m.alu);
  // Greifreifen aussen mit vier Haltern
  const push = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.0095, 8, 56), m.chrome);
  const out = RIM_X - WHEEL_X; // nach der Drehung zeigt +z bei beiden Rädern nach aussen
  push.position.z = out;
  const tabs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.005, 0.005, Math.abs(out), 5).rotateX(Math.PI / 2);
    g.translate(Math.cos(a) * (RIM_R - 0.006), Math.sin(a) * (RIM_R - 0.006), out / 2);
    tabs.push(g);
  }
  const tabMesh = new THREE.Mesh(mergeGeometries(tabs), m.alu);
  group.add(tire, tread, rim, spokeMesh, hub, push, tabMesh);
  // in die Fahrzeugachse drehen: Radebene = YZ, Achse = x
  const spin = new THREE.Group();
  spin.add(group);
  group.rotation.y = Math.PI / 2 * sx;
  const holder = new THREE.Group();
  holder.add(spin);
  holder.userData.spin = spin;
  return holder;
}

function caster(m) {
  const c = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 10), m.frame);
  housing.position.y = 0.2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), m.alu);
  stem.position.y = 0.155;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.03), m.alu);
  crown.position.set(0, 0.135, -0.012);
  const fork = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.006, 0.075, 0.022);
    g.translate(sx * 0.022, 0.1, -0.03);
    fork.push(g);
  }
  const forkMesh = new THREE.Mesh(mergeGeometries(fork), m.alu);
  const roll = new THREE.Group();
  roll.position.set(0, CASTER_R, -0.035);
  const wheelMesh = new THREE.Mesh(new THREE.CylinderGeometry(CASTER_R, CASTER_R, 0.028, 18).rotateZ(Math.PI / 2), m.rubber);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).rotateZ(Math.PI / 2), m.alu);
  roll.add(wheelMesh, hub);
  c.add(housing, stem, crown, forkMesh, roll);
  c.userData.roll = roll;
  return c;
}

// size: [kleinster Radius, Streuung], shell: Abstand vom Kopfmittelpunkt, wide: Kopfbreite
function hairCurls(colors, count, seed = 1, { size = [0.02, 0.012], shell = 0.098, wide = 1.02, low = 1.2 } = {}) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const byColor = colors.map(() => []);
  for (let i = 0; i < count; i++) {
    // obere und hintere Kopfhälfte
    const u = rand() * Math.PI * 2;
    const v = Math.acos(1 - rand() * low);
    const dir = new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    if (dir.z > 0.5 && dir.y < 0.6) continue; // Gesicht freilassen
    if (dir.y < -0.15 && Math.abs(dir.x) > 0.75) continue; // Ohren frei
    const r = size[0] + rand() * size[1];
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = dir.multiplyScalar(shell + r * 0.42);
    g.translate(p.x * wide, p.y * 1.1 + 0.008, p.z * 1.02);
    byColor[Math.floor(rand() * colors.length)].push(g);
  }
  const group = new THREE.Group();
  byColor.forEach((geos, i) => {
    if (geos.length) group.add(new THREE.Mesh(mergeGeometries(geos), mat(colors[i], 0.72)));
  });
  return group;
}

// Oberkörper als gedrehtes Profil: Taille schmaler, Brust breiter, abfallende Schultern
function torsoGeometry() {
  const pts = [
    [0.0, 0.0],
    [0.128, 0.0],
    [0.138, 0.05],
    [0.134, 0.15],
    [0.146, 0.26],
    [0.158, 0.34],
    [0.155, 0.4],
    [0.128, 0.445],
    [0.075, 0.47],
    [0.05, 0.475],
    [0.0, 0.476],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 28);
  g.scale(1.22, 1, 0.74);
  return g;
}

// Zwei-Gelenk-IK: Ellbogen so legen, dass die Hand das Ziel erreicht
const ikDir = new THREE.Vector3();
const ikPole = new THREE.Vector3();
function solveElbow(S, H, a, b, pole, out) {
  ikDir.subVectors(H, S);
  let d = ikDir.length();
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  ikDir.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir)).normalize();
  out.copy(S).addScaledVector(ikDir, along).addScaledVector(ikPole, h);
  // Hand auf erreichbaren Abstand ziehen
  return d;
}

/* ---------- Arm mit Schulter, Ärmel und Hand (für Edi und Maxim) ---------- */
const ARM_A = 0.285; // Oberarm
const ARM_B = 0.255; // Unterarm
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function makeArm(parent, sx, skin, sleeve) {
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.064, 12, 10), sleeve);
  shoulder.scale.set(1, 0.9, 1);
  const upperArm = segment([bone(V3(0, 0, 0), V3(0, ARM_A, 0), 0.044, skin), bone(V3(0, -0.02, 0), V3(0, 0.16, 0), 0.06, sleeve, 0.054), shoulder]);
  const foreArm = segment([bone(V3(0, 0, 0), V3(0, ARM_B, 0), 0.04, skin, 0.031)]);
  // Hand: flache Handfläche mit Daumen statt einer Kugel
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), skin);
  palm.scale.set(0.6, 1.08, 1.05);
  palm.position.y = 0.012;
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.03, 3, 6), skin);
  thumb.position.set(-sx * 0.012, 0.0, 0.042);
  thumb.rotation.x = 0.9;
  hand.add(palm, thumb);
  parent.add(upperArm, foreArm, hand);
  return { sx, upperArm, foreArm, hand, S: new THREE.Vector3(), E: new THREE.Vector3(), H: new THREE.Vector3() };
}

/* ---------- Kopf, Gesicht und kleine Lebenszeichen (für Edi und Maxim) ---------- */
// Kopf in natürlichen Proportionen: rund 16,5 cm breit, 23 cm hoch, mit Kinn, Nase und Ohren
function buildHead(skin) {
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 26, 18), skin);
  skull.scale.set(0.84, 1.08, 1.0);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 12), skin);
  jaw.scale.set(0.96, 0.84, 0.98);
  jaw.position.set(0, -0.048, 0.02);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), skin);
  chin.scale.set(1.1, 0.8, 0.9);
  chin.position.set(0, -0.092, 0.058);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.036, 8).rotateX(Math.PI / 2 + 0.32), skin);
  nose.position.set(0, -0.006, 0.101);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), skin);
  tip.position.set(0, -0.016, 0.108);
  head.add(skull, jaw, chin, nose, tip);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
    ear.position.set(sx * 0.084, 0.0, -0.005);
    ear.scale.set(0.42, 1, 0.72);
    head.add(ear);
  }
  return head;
}

// Augen mit beweglichen Lidern, Brauen und Mund
function addFace(head, skin, { brow = 0x3a2c1e, iris = 0x3b2a1c, lips = 0x9a5a4a } = {}) {
  const white = mat(0xefece6, 0.45);
  const irisMat = mat(iris, 0.3);
  const browMat = mat(brow, 0.8);
  const lids = [];
  const brows = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.031, 0.018, 0.082);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 8), white);
    ball.scale.set(1.2, 0.85, 0.75);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 10, 8), irisMat);
    ir.position.z = 0.0058;
    ir.scale.z = 0.55;
    // Oberlid: halbe Kugelschale, die sich beim Blinzeln nach vorne über das Auge dreht
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), skin);
    lid.scale.set(1.22, 0.9, 0.84);
    eye.add(ball, ir, lid);
    head.add(eye);
    lids.push(lid);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.008), browMat);
    b.position.set(sx * 0.032, 0.04, 0.091);
    b.rotation.z = sx * -0.12;
    head.add(b);
    brows.push(b);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.006), mat(lips, 0.6));
  mouth.position.set(0, -0.05, 0.086);
  head.add(mouth);
  return { lids, brows, mouth };
}

// Blinzeln und ruhige Kopfbewegung. look = gewünschte Blickrichtung, calm = Stärke der kleinen Eigenbewegung
function createLife(head, face, seed = 1) {
  let blinkIn = 1.2 + seed;
  let blink = 0;
  let yaw = 0;
  let pitch = 0;
  return {
    update(dt, t, look, calm = 1) {
      blinkIn -= dt;
      if (blinkIn <= 0 && blink <= 0) {
        blink = 1;
        blinkIn = 2.4 + Math.random() * 3.8;
      }
      let closed = 0;
      if (blink > 0) {
        blink -= dt / 0.19;
        const p = 1 - Math.max(0, blink);
        closed = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      }
      // offen: Lid nach hinten oben geklappt (Iris frei), geschlossen: nach vorne über das Auge gedreht
      for (const lid of face.lids) lid.rotation.x = -0.85 + closed * 1.7;
      const ny = (Math.sin(t * 0.31 + seed * 2.1) * 0.07 + Math.sin(t * 0.83 + seed) * 0.025) * calm;
      const np = (Math.sin(t * 0.47 + seed * 1.3) * 0.03 + Math.sin(t * 1.1 + seed * 0.7) * 0.012) * calm;
      const s = 1 - Math.exp(-dt * 3.2);
      yaw += (look.yaw + ny - yaw) * s;
      pitch += (look.pitch + np - pitch) * s;
      head.rotation.set(pitch, yaw, Math.sin(t * 0.21 + seed) * 0.02 * calm);
    },
  };
}

export function createEdi() {
  const m = {
    rubber: mat(0x141518, 0.9),
    tread: mat(0x26282d, 0.95),
    alu: mat(0x9aa1ab, 0.35, 0.85),
    chrome: mat(0xd9dde3, 0.22, 1),
    frame: mat(0x23262c, 0.4, 0.75),
    guard: mat(0x101114, 0.35, 0.3),
    seat: mat(0x15171c, 0.85),
    skin: mat(SKIN, 0.62),
    pants: mat(0x1b1d24, 0.85),
    shoes: mat(0xf0f0ee, 0.55),
    sole: mat(0x2b2b2b, 0.8),
    jersey: new THREE.MeshStandardMaterial({ map: jerseyTexture('EDI', '18', '#cf1f2a', '#121212'), roughness: 0.72 }),
    red: mat(0xc81d27, 0.72),
    dark: mat(0x121212, 0.6),
  };
  const root = new THREE.Group();
  root.name = 'edi';
  const chair = new THREE.Group();
  root.add(chair);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- Rollstuhl ---------- */
  const wheels = [];
  for (const sx of [-1, 1]) {
    const w = rearWheel(m, sx);
    w.position.set(sx * WHEEL_X, AXLE.y, AXLE.z);
    w.rotation.z = sx * 0.05; // Sturz: oben nach innen, unten breiter
    chair.add(w);
    wheels.push(w.userData.spin);
  }
  const casters = [];
  for (const sx of [-1, 1]) {
    const c = caster(m);
    c.position.set(sx * 0.205, 0, 0.36);
    chair.add(c);
    casters.push(c);
  }
  // Starrrahmen: Seitenrohre, Knie nach unten zur Fussplatte, Rückenrohre, Achsrohr
  for (const sx of [-1, 1]) {
    const x = sx * 0.205;
    chair.add(tube(V(x, 0.49, -0.26), V(x, 0.47, 0.3), 0.0125, m.frame));
    chair.add(tube(V(x, 0.47, 0.3), V(x * 0.86, 0.17, 0.5), 0.0125, m.frame));
    chair.add(tube(V(x, 0.31, -0.2), V(x, 0.47, -0.12), 0.011, m.frame));
    chair.add(tube(V(x, 0.31, -0.2), V(x, 0.47, 0.3), 0.011, m.frame));
    chair.add(tube(V(x, 0.49, -0.26), V(x, 0.9, -0.31), 0.0115, m.frame));
    // Kleiderschutz über dem Rad
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.17, 0.3), m.guard);
    guard.position.set(sx * 0.232, 0.6, -0.16);
    guard.rotation.x = 0.06;
    chair.add(guard);
  }
  chair.add(tube(V(-0.205, 0.31, -0.2), V(0.205, 0.31, -0.2), 0.013, m.frame));
  chair.add(tube(V(-0.205, 0.83, -0.3), V(0.205, 0.83, -0.3), 0.009, m.frame));
  // Fussplatte
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.018, 0.13), m.alu);
  foot.position.set(0, 0.16, 0.5);
  chair.add(foot);
  // Sitzkissen und Rückenbespannung
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.42), m.seat);
  seat.position.set(0, 0.525, 0.02);
  seat.rotation.x = -0.04;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.035), m.seat);
  back.position.set(0, 0.72, -0.29);
  back.rotation.x = -0.12;
  chair.add(seat, back);

  /* ---------- Edi ---------- */
  const body = new THREE.Group();
  root.add(body);
  // Beine: Hüfte – Knie – Knöchel, Füsse auf der Fussplatte
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.095, 0.62, -0.1);
    const knee = V(sx * 0.1, 0.635, 0.3);
    const ankle = V(sx * 0.092, 0.24, 0.43);
    body.add(bone(hip, knee, 0.072, m.pants));
    body.add(bone(knee, ankle, 0.056, m.pants));
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10).rotateX(Math.PI / 2), m.shoes);
    shoe.scale.set(1.05, 0.8, 1);
    shoe.position.set(sx * 0.092, 0.205, 0.49);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.25), m.sole);
    sole.position.set(sx * 0.092, 0.177, 0.49);
    body.add(shoe, sole);
  }
  // Becken und Oberkörper (leicht nach vorne geneigt)
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), m.pants);
  pelvis.scale.set(1.2, 0.6, 0.95);
  pelvis.position.set(0, 0.62, -0.1);
  body.add(pelvis);
  const upper = new THREE.Group();
  upper.position.set(0, 0.6, -0.12);
  body.add(upper);
  const torso = new THREE.Mesh(torsoGeometry(), m.jersey);
  upper.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 6, 18).rotateX(Math.PI / 2), m.dark);
  collar.position.set(0, 0.468, 0.005);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.048, 0.09, 12), m.skin);
  neck.position.set(0, 0.5, 0.005);
  upper.add(collar, neck);

  // Kopf mit blonden Locken, Gesicht mit Lidern (blinzelt) und ruhiger Kopfbewegung
  const head = buildHead(m.skin);
  head.position.set(0, 0.575, 0.02);
  upper.add(head);
  const face = addFace(head, m.skin, { brow: 0xb38d3f, iris: 0x4a6a8a });
  head.add(hairCurls([0xd9b25c, 0xc99f45, 0xe9c97a], 230, 7, { size: [0.017, 0.011], shell: 0.092, wide: 0.93 }));
  const life = createLife(head, face, 1);

  // Arme: Schulter und Oberarm mit Trikotärmel, Unterarm, Hand – per IK an den Greifreifen
  const arms = [];
  for (const sx of [-1, 1]) arms.push(makeArm(body, sx, m.skin, m.red));

  root.add(blobShadow(0.95, 1.35));

  /* ---------- Bewegung ---------- */
  // Anschieben: Hände greifen hinten oben am Greifreifen, drehen mit dem Rad mit und lösen sich vorne.
  // Danach schwingen sie über dem Reifen zurück. Im Stand liegen sie ruhig oben auf den Greifreifen.
  const GRIP = -0.55; // Winkel ab oben (rad), negativ = hinten
  const RELEASE = 0.75;
  const REST = 0.05;
  let wheelAngle = 0;
  let contact = true;
  let handAngle = REST;
  let recover = 0; // 0..1 Rückschwung
  let recoverFrom = RELEASE;
  let recoverTo = GRIP;
  let lean = 0;
  let still = 0;
  let speed = 0;
  let lifeT = 0; // Zeit für Atmen, Blinzeln, Kopfbewegung
  let cheerT = 0; // Torjubel: Restzeit
  let cheerW = 0; // Torjubel: Gewicht 0..1
  const shoulderLocal = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const cheerTarget = new THREE.Vector3();
  const cheerPole = new THREE.Vector3();
  const rimPoint = (angle, sx, outward = 0, up = 0) =>
    new THREE.Vector3(sx * (RIM_X + 0.012 + outward), AXLE.y + Math.cos(angle) * (RIM_R + up), AXLE.z + Math.sin(angle) * (RIM_R + up));

  const pose = (dt) => {
    // Schulterposition aus der Neigung des Oberkörpers; der Brustkorb hebt und senkt sich beim Atmen
    const breath = Math.sin(lifeT * 1.5);
    upper.rotation.x = 0.06 + lean - cheerW * 0.05;
    upper.scale.set(1 + breath * 0.008, 1 + breath * 0.005, 1 + breath * 0.016);
    upper.updateMatrix();
    for (const a of arms) {
      shoulderLocal.set(a.sx * 0.168, 0.405, -0.005).applyMatrix4(upper.matrix);
      a.S.copy(shoulderLocal);
      let target;
      if (contact) target = rimPoint(handAngle, a.sx);
      else {
        // Rückschwung: Bogen aussen über dem Reifen
        const k = THREE.MathUtils.smoothstep(recover, 0, 1);
        const ang = recoverFrom + (recoverTo - recoverFrom) * k;
        const lift = Math.sin(Math.PI * k);
        target = rimPoint(ang, a.sx, 0.03 * lift, 0.07 * lift);
      }
      a.H.copy(target);
      pole.set(a.sx * 0.5, -0.15, -1); // Ellbogen nach hinten aussen
      if (cheerW > 0.001) {
        // Torjubel: beide Fäuste hoch, leichtes Wippen
        const w = THREE.MathUtils.smoothstep(cheerW, 0, 1);
        cheerTarget.set(a.sx * 0.3, 1.3 + Math.abs(Math.sin(lifeT * 8.5)) * 0.05, 0.1);
        a.H.lerp(cheerTarget, w);
        pole.lerp(cheerPole.set(a.sx, -0.4, -0.3), w);
      }
      solveElbow(a.S, a.H, ARM_A, ARM_B, pole, a.E);
      // Hand auf Reichweite begrenzen
      const reach = a.S.distanceTo(a.H);
      if (reach > ARM_A + ARM_B - 0.002) a.H.copy(a.S).addScaledVector(tmp.subVectors(a.H, a.S).normalize(), ARM_A + ARM_B - 0.002);
      aim(a.upperArm, a.S, a.E);
      aim(a.foreArm, a.E, a.H);
      a.hand.position.copy(a.H);
      a.hand.quaternion.copy(a.foreArm.quaternion);
    }
  };

  const api = {
    root,
    head,
    // Strecke gefahren (m, positiv = vorwärts): Räder drehen, Hände schieben mit
    move(distance) {
      const dA = distance / WHEEL_R;
      wheelAngle += dA;
      for (const w of wheels) w.rotation.x = wheelAngle;
      for (const c of casters) c.userData.roll.rotation.x += distance / CASTER_R;
      if (contact) {
        handAngle += dA;
        if (distance > 0 && handAngle > RELEASE) {
          contact = false;
          recover = 0;
          recoverFrom = handAngle;
          recoverTo = GRIP;
        } else if (distance < 0 && handAngle < GRIP - 0.2) {
          contact = false;
          recover = 0;
          recoverFrom = handAngle;
          recoverTo = RELEASE - 0.2;
        }
      }
    },
    // Drehen an Ort (z. B. im Lift): Räder drehen gegeneinander
    turn(dYaw) {
      const d = dYaw * WHEEL_X;
      wheels[0].rotation.x += d / WHEEL_R;
      wheels[1].rotation.x -= d / WHEEL_R;
    },
    update(dt, moving) {
      speed += ((moving ? 1 : 0) - speed) * Math.min(1, dt * 4);
      still = moving ? 0 : still + dt;
      if (!contact) {
        // Rückschwung: dauert je nach Tempo 0.18–0.45 s
        recover += dt / (moving ? 0.22 : 0.45);
        if (recover >= 1) {
          contact = true;
          handAngle = moving ? recoverTo : REST;
        }
      } else if (!moving && still > 0.25) {
        // im Stand: Hände ruhig auf den Greifreifen ablegen
        handAngle += (REST - handAngle) * Math.min(1, dt * 3);
      }
      // beim Anschieben leicht nach vorne lehnen
      const push = contact && moving ? THREE.MathUtils.clamp((handAngle - GRIP) / (RELEASE - GRIP), 0, 1) : 0;
      const targetLean = moving ? 0.05 + 0.1 * Math.sin(push * Math.PI) : 0;
      lean += (targetLean - lean) * Math.min(1, dt * 8);
      // Lebenszeichen: im Stand schaut Edi ruhig umher, beim Fahren nach vorne
      lifeT += dt;
      cheerT = Math.max(0, cheerT - dt);
      cheerW += ((cheerT > 0 && !moving ? 1 : 0) - cheerW) * Math.min(1, dt * 6);
      life.update(dt, lifeT, { yaw: moving ? 0 : Math.sin(lifeT * 0.17) * 0.22, pitch: 0.02 - cheerW * 0.1 }, moving ? 0.35 : 1);
      face.mouth.scale.set(1 + cheerW * 0.5, 1 + cheerW * 4, 1);
      pose(dt);
    },
    // Torjubel (Albanien trifft): Fäuste hoch, solange Edi nicht fährt
    cheer(seconds = 2.8) {
      cheerT = seconds;
    },
    setHeadVisible(v) {
      head.visible = v;
    },
  };
  api.update(0, false);
  return api;
}

export function blobShadow(w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

/* ---------- Weitere Personen ---------- */
// Maxim (17, Italien-Fan) auf dem Begleitsitz: Gesicht mit Lidschlag, schaut dem Ball nach und reagiert auf Spielszenen.
// Ursprung am Boden vor dem Sitz, vorwärts = +z.
export function createMaxim() {
  const g = new THREE.Group();
  g.name = 'maxim';
  const m = {
    jersey: new THREE.MeshStandardMaterial({ map: jerseyTexture('MAXIM', '17', '#2457b8', '#eef1f6'), roughness: 0.72 }),
    sleeve: mat(0x2457b8, 0.72),
    pants: mat(0x22252c, 0.85),
    skin: mat(0xddb08c, 0.62),
    shoes: mat(0xe9e9e6, 0.6),
  };
  for (const sx of [-1, 1]) {
    const hip = V3(sx * 0.095, 0.5, -0.06);
    const knee = V3(sx * 0.1, 0.52, 0.34);
    const ankle = V3(sx * 0.1, 0.1, 0.4);
    g.add(bone(hip, knee, 0.072, m.pants), bone(knee, ankle, 0.056, m.pants));
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.15, 4, 10).rotateX(Math.PI / 2), m.shoes);
    shoe.scale.set(1.05, 0.8, 1);
    shoe.position.set(sx * 0.1, 0.05, 0.45);
    g.add(shoe);
  }
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), m.pants);
  pelvis.scale.set(1.2, 0.6, 0.95);
  pelvis.position.set(0, 0.5, -0.06);
  g.add(pelvis);
  const upper = new THREE.Group();
  upper.position.set(0, 0.48, -0.08);
  g.add(upper);
  upper.add(new THREE.Mesh(torsoGeometry(), m.jersey));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.048, 0.09, 12), m.skin);
  neck.position.set(0, 0.5, 0.005);
  upper.add(neck);
  const head = buildHead(m.skin);
  head.position.set(0, 0.575, 0.02);
  upper.add(head);
  const face = addFace(head, m.skin, { brow: 0x1e1711, iris: 0x2a1d12 });
  head.add(hairCurls([0x1c1611, 0x2a2018, 0x15110d], 190, 23, { size: [0.013, 0.008], shell: 0.09, wide: 0.92, low: 1.05 }));
  const life = createLife(head, face, 2.4);
  const arms = [];
  for (const sx of [-1, 1]) arms.push(makeArm(g, sx, m.skin, m.sleeve));
  g.add(blobShadow(0.75, 0.95));

  const w = { cheer: 0, despair: 0, lean: 0 };
  const react = { kind: null, t: 0 };
  let glance = 0; // Blick zu Edi (sitzt rechts von Maxim)
  let nextGlance = 9;
  const S = new THREE.Vector3();
  const H = new THREE.Vector3();
  const P = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const local = new THREE.Vector3();

  // Spielszene: 'goal' (eigenes Team jubelt, sonst Hände über dem Kopf) oder 'chance' (vorbeugen)
  g.react = (kind, team) => {
    if (kind === 'goal') Object.assign(react, team === 'ita' ? { kind: 'cheer', t: 4.2 } : { kind: 'despair', t: 3.4 });
    else Object.assign(react, { kind: 'lean', t: 1.8 });
  };
  g.update = (dt, t, { live = false, ball = null } = {}) => {
    const was = react.t > 0;
    react.t = Math.max(0, react.t - dt);
    if (was && react.t === 0 && react.kind !== 'lean') glance = 1.6; // danach kurz zu Edi schauen
    const k = react.t > 0 ? react.kind : null;
    const s = 1 - Math.exp(-dt * 7);
    for (const key of ['cheer', 'despair', 'lean']) w[key] += ((k === key ? 1 : 0) - w[key]) * s;
    const breath = Math.sin(t * 1.4 + 1);
    upper.position.y = 0.48 + w.cheer * Math.abs(Math.sin(t * 7.5)) * 0.035;
    upper.rotation.x = 0.04 + w.lean * 0.22 + w.despair * 0.12 - w.cheer * 0.05;
    upper.scale.set(1 + breath * 0.008, 1 + breath * 0.005, 1 + breath * 0.016);
    upper.updateMatrix();
    for (const a of arms) {
      S.set(a.sx * 0.168, 0.405, -0.005).applyMatrix4(upper.matrix);
      H.set(a.sx * 0.13, 0.6, 0.22);
      P.set(a.sx * 0.5, -0.15, -1);
      H.lerp(tgt.set(a.sx * 0.15, 0.58, 0.33), w.lean);
      H.lerp(tgt.set(a.sx * 0.1, 1.17, 0.0), w.despair);
      H.lerp(tgt.set(a.sx * 0.3, 1.36 + Math.sin(t * 7.5 + a.sx) * 0.04, 0.02), w.cheer);
      P.lerp(tgt.set(a.sx, -0.2, -0.15), Math.max(w.cheer, w.despair));
      a.S.copy(S);
      a.H.copy(H);
      solveElbow(a.S, a.H, ARM_A, ARM_B, P, a.E);
      if (a.S.distanceTo(a.H) > ARM_A + ARM_B - 0.002) a.H.copy(a.S).addScaledVector(tmp.subVectors(a.H, a.S).normalize(), ARM_A + ARM_B - 0.002);
      aim(a.upperArm, a.S, a.E);
      aim(a.foreArm, a.E, a.H);
      a.hand.position.copy(a.H);
      a.hand.quaternion.copy(a.foreArm.quaternion);
    }
    // Kopf: im Spiel dem Ball nach, vor dem Spiel ruhig umherschauen, ab und zu ein Blick zu Edi
    nextGlance -= dt;
    if (nextGlance <= 0) {
      glance = 1.5;
      nextGlance = 14 + Math.random() * 12;
    }
    glance = Math.max(0, glance - dt);
    let yaw = Math.sin(t * 0.19) * 0.4;
    let pitch = 0.03;
    if (live && ball) {
      g.worldToLocal(local.copy(ball));
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.75, 0.75);
      pitch = 0.16;
    }
    if (glance > 0) {
      yaw = -0.95;
      pitch = 0.05;
    }
    pitch += w.despair * 0.3 - w.cheer * 0.18;
    life.update(dt, t, { yaw, pitch }, 1 - 0.6 * Math.max(w.cheer, w.despair));
    face.mouth.scale.set(1 + w.cheer * 0.5, 1 + w.cheer * 4.5 + w.lean * 1.5, 1);
  };
  g.update(0, 0);
  return g;
}

// Stehende Person (Personal, Fans auf dem Vorplatz). Ursprung am Boden.
export function createStandingPerson({ shirt = 0x334466, pants = 0x22252c, hair = 0x2a2018, skin = SKIN, vest = null } = {}) {
  const g = new THREE.Group();
  const m = { shirt: mat(shirt, 0.7), pants: mat(pants, 0.8), skin: mat(skin, 0.65), hair: mat(hair, 0.8) };
  for (const sx of [-1, 1]) {
    const leg = limb(0.72, 0.07, m.pants);
    leg.position.set(sx * 0.1, 0.86, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 6, 14), vest ? mat(vest, 0.5) : m.shirt);
  torso.scale.set(1.1, 1, 0.7);
  torso.position.y = 1.2;
  g.add(torso);
  for (const sx of [-1, 1]) {
    const arm = limb(0.5, 0.05, m.shirt);
    arm.position.set(sx * 0.24, 1.43, 0);
    arm.rotation.z = sx * 0.12;
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), m.skin);
  head.scale.set(0.95, 1.1, 1);
  head.position.y = 1.62;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m.hair);
  hairCap.position.y = 1.64;
  g.add(head, hairCap);
  if (vest) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.04, 16), mat(0xdfe3e8, 0.3, 0.3));
    stripe.scale.set(1.08, 1, 0.72);
    stripe.position.y = 1.12;
    g.add(stripe);
  }
  return g;
}
