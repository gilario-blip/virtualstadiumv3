// Leistungsmessung. Aufruf: node test-perf.cjs 4173 "&adaptive=0&quality=high" name on|off
// Misst Ladezeit, Frame-Zeiten und Render-Statistik für Route C und Sitzansicht P2
const { chromium } = require('playwright');
const [, , PORT, Q, LABEL, BLOOM] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?debug${Q || ''}`);
  await page.waitForSelector('#start:not([hidden])', { timeout: 180000 });
  const loadMs = Date.now() - t0;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // Messhilfe einbauen
  await ev((bloom) => {
    const a = window.__app;
    if (bloom === 'off') a.composer.passes.forEach((p) => { if (p.constructor.name.includes('Bloom') || p.strength !== undefined) p.enabled = false; });
    a.renderer.info.autoReset = false;
    const orig = a.composer.render.bind(a.composer);
    window.__m = { frames: [], cpu: [], calls: 0, tris: 0, n: 0 };
    a.composer.render = (...args) => {
      a.renderer.info.reset();
      const s = performance.now();
      orig(...args);
      a.renderer.getContext().finish();
      window.__m.cpu.push(performance.now() - s);
      window.__m.calls = a.renderer.info.render.calls;
      window.__m.tris = a.renderer.info.render.triangles;
    };
    let last = performance.now();
    const tick = (t) => { window.__m.frames.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, BLOOM);
  const stats = await ev(() => {
    const a = window.__app;
    const lights = {};
    let meshes = 0, inst = 0;
    a.scene.traverse((o) => {
      if (o.isLight) lights[o.type] = (lights[o.type] || 0) + 1;
      if (o.isInstancedMesh) inst++;
      else if (o.isMesh) meshes++;
    });
    return { lights, meshes, inst, programs: a.renderer.info.programs?.length, textures: a.renderer.info.memory.textures, geometries: a.renderer.info.memory.geometries, pr: a.renderer.getPixelRatio() };
  });
  const sample = async (ms) => {
    await ev(() => { window.__m.frames = []; window.__m.cpu = []; });
    await page.waitForTimeout(ms);
    return ev(() => {
      const f = window.__m.frames.slice(1).sort((x, y) => x - y);
      const c = window.__m.cpu.slice(1);
      const avg = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
      return { n: f.length, avgFrame: +avg(f).toFixed(1), p95Frame: +(f[Math.floor(f.length * 0.95)] || 0).toFixed(1), avgRender: +avg(c).toFixed(1), calls: window.__m.calls, tris: window.__m.tris };
    });
  };
  await ev(() => document.querySelector('#enter').click());
  await page.waitForTimeout(500);
  await ev(() => { const r = window.__app.rig; if (r.flight) r.flight.t = r.flight.duration; });
  const startPhase = await sample(6000);
  await ev(() => { const a = window.__app; a.driver.place({ x: 0, y: 0, z: -110 }, 0); a.toRouteChoice(); a.chooseRoute('C'); a.driver.auto = true; });
  await page.waitForTimeout(1500);
  const drive = await sample(12000);
  await ev(() => { const a = window.__app; a.arrivedPlatform(); a.setMode && a.setMode('live'); a.setStanding(true); });
  await page.waitForTimeout(4000);
  const seat = await sample(8000);
  // Drehen in der Sitzansicht
  await ev(() => { window.__turn = setInterval(() => window.__app.rig.look(0.03, 0), 30); });
  const turn = await sample(8000);
  console.log(JSON.stringify({ label: LABEL, loadMs, stats, startPhase, drive, seat, turn, errors }));
  await browser.close();
})();
