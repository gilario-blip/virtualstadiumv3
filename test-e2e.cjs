// Funktionstest. Aufruf: node test-e2e.cjs <ausgabeordner> desktop|mobile "&quality=high"  (vorher: npx vite preview --port 4173)
// Funktionstest: fährt alle Wege in der Seite selbst ab (ohne Bild für Bild zu rendern) und prüft das Verhalten.
const { chromium } = require('playwright');
const [, , OUT = 'test-out', MODE = 'desktop', Q = ''] = process.argv;
require('fs').mkdirSync(OUT, { recursive: true });
const mobile = MODE === 'mobile';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const results = [];
  const check = (name, ok, info = '') => { results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' – ' + info : ''}`); };
  const t0 = Date.now();
  await page.goto('http://localhost:4173/?debug' + (Q || ''));
  await page.waitForSelector('#start:not([hidden])', { timeout: 180000 });
  check('Startseite geladen', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (n, w = 1500) => { await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }); };
  await shot('e01-start', 1000);
  check('Startseite: Titel', (await ev(() => document.querySelector('#start-title').textContent)).includes('Albanien'));
  check('Startseite: Button «Stadion betreten»', (await ev(() => document.querySelector('#enter').textContent)) === 'Stadion betreten');

  // Hilfsfunktion: Weg abfahren
  await ev(() => {
    window.__drive = (maxSteps = 4000) => {
      const a = window.__app;
      const pts = [];
      for (let i = 0; i < maxSteps && a.driver.active; i++) {
        a.driver.update(0.05, { fwd: true, back: false, fast: false });
        const p = a.edi.root.position;
        pts.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
      return pts;
    };
  });
  await ev(() => document.querySelector('#enter').click());
  await page.waitForTimeout(600);
  await ev(() => { const r = window.__app.rig; if (r.flight) r.flight.t = r.flight.duration; });
  await page.waitForTimeout(1500);
  // Ankunft selbst fahren
  const arrival = await ev(() => window.__drive());
  check('Ankunft: Fahrt bis zu den Eingängen', (await ev(() => window.__app.state.phase)) === 'choose', `${arrival.length} Schritte`);
  check('Routenwahl: keine Route vorab markiert', await ev(() => !document.querySelector('#panel').innerHTML.match(/empfohlen|recommended|richtig/i)));
  await shot('e02-routes');

  // Route A
  await ev(() => window.__app.chooseRoute('A'));
  const pa = await ev(() => window.__drive());
  const endA = pa[pa.length - 1];
  check('Route A: stoppt vor dem Drehkreuz', endA[2] < -95.6 && !(await ev(() => document.querySelector('#modal').hidden)), `Ende z=${endA[2]} (Drehkreuz bei z=-95)`);
  await shot('e03-routeA-blocked');
  await ev(() => document.querySelector('#modal-actions button').click());
  await page.waitForFunction(() => window.__app.state.phase === 'choose' && !document.body.classList.contains('is-fading'), null, { timeout: 120000 });

  // Route B
  await ev(() => window.__app.chooseRoute('B'));
  const pb = await ev(() => window.__drive());
  const endB = pb[pb.length - 1];
  // Abstand zum Liftvorplatz (x 11–14.1, z -79.2…-76.2) und Lift (x 14.1–16.7, z -79…-76.4)
  const dRect = (p, r) => { const dx = Math.max(r[0] - p[0], 0, p[0] - r[1]); const dz = Math.max(r[2] - p[2], 0, p[2] - r[3]); return Math.hypot(dx, dz); };
  const minLobby = Math.min(...pb.map((p) => dRect(p, [11, 14.1, -79.2, -76.2])));
  const minLift = Math.min(...pb.map((p) => dRect(p, [14.1, 16.7, -79, -76.4])));
  const maxY = Math.max(...pb.map((p) => p[1]));
  check('Route B: bleibt auf ebenem Boden', maxY < 0.01, `max. Höhe ${maxY} m`);
  check('Route B: Abstand Mitte zu Liftvorplatz ≥ 0,79 m (halbe Breite + 45 cm)', minLobby >= 0.79, `${minLobby.toFixed(2)} m`);
  check('Route B: Abstand Mitte zu Lift ≥ 0,79 m', minLift >= 0.79, `${minLift.toFixed(2)} m`);
  check('Route B: stoppt vor den zwei Stufen', Math.abs(endB[2] - -62.8) < 0.05 && endB[2] + 0.55 < -62.1, `Ende z=${endB[2]}, Front z=${(endB[2] + 0.55).toFixed(2)}, erste Stufe z=-62.1`);
  await shot('e04-routeB-steps');
  await ev(() => document.querySelector('#modal-actions button').click());
  await page.waitForFunction(() => window.__app.state.phase === 'choose' && !document.body.classList.contains('is-fading'), null, { timeout: 120000 });

  // Route C bis zur Plattform
  await ev(() => window.__app.chooseRoute('C'));
  const pc = await ev(() => window.__drive());
  await shot('e05-routeC-lift', 800);
  await page.waitForFunction(() => window.__app.driver.active && window.__app.driver.path.id === 'C_upper', null, { timeout: 120000 });
  const pc2 = await ev(() => window.__drive());
  await page.waitForTimeout(1200);
  const st = await ev(() => ({ step: window.__app.state.step, seat: window.__app.state.seatView }));
  check('Route C: Eingang → Rampe → Lift → Plattform', st.step === 3 && st.seat === 'p2', `${pc.length + pc2.length} Schritte, Schritt ${st.step}`);
  await shot('e06-seat2', 2500);

  // Sitzplätze: Augenhöhe und Fans sitzen/stehen
  for (const id of ['p1', 'p2', 'p3']) {
    await ev((id) => window.__app.viewSeat(id, false), id);
    await page.waitForTimeout(600);
    await ev(() => window.__app.rig.update(0.016));
    const eye = await ev(() => { const a = window.__app; return { cam: a.camera.position.y, floor: a.edi.root.position.y, persp: a.rig.perspective }; });
    check(`Platz ${id.slice(1)}: Sicht aus Augenhöhe (Ego)`, eye.persp === 'ego' && Math.abs(eye.cam - eye.floor - 1.15) < 0.02, `Kamera ${(eye.cam - eye.floor).toFixed(2)} m über Boden`);
    const hasScore = await ev(() => /bars|Sichtqualität|View quality/.test(document.querySelector('#panel').innerHTML));
    check(`Platz ${id.slice(1)}: keine Bewertung vor der Wahl`, !hasScore);
    await ev(() => window.__app.setStanding(true));
    await shot(`e07-${id}-stand`, 2500);
    await ev(() => window.__app.setStanding(false));
  }
  // WC-Fahrt ab allen drei Plätzen
  for (const id of ['p1', 'p2', 'p3']) {
    await ev((id) => { const a = window.__app; a.viewSeat(id, false); }, id);
    await page.waitForTimeout(300);
    await ev(() => window.__app.chooseSeat());
    await page.waitForTimeout(300);
    await ev(() => window.__app.driveToWc());
    await page.waitForFunction(() => window.__app.driver.active && !document.body.classList.contains('is-fading'), null, { timeout: 120000 });
    const start = await ev(() => { const p = window.__app.edi.root.position; return [p.x, p.y, p.z]; });
    const pw = await ev(() => window.__drive());
    const end = pw[pw.length - 1] || start;
    const jumps = pw.slice(1).map((p, i) => Math.hypot(p[0] - pw[i][0], p[2] - pw[i][2])).filter((d) => d > 0.5).length;
    const phase = await ev(() => window.__app.state.phase);
    check(`WC-Fahrt ab Platz ${id.slice(1)}`, pw.length > 10 && jumps === 0 && phase === 'service', `${pw.length} Schritte, Start (${start.map((v) => v.toFixed(1)).join(', ')}), Ende (${end.join(', ')}), Sprünge: ${jumps}`);
    if (id === 'p1') await shot('e08-wc-p1', 1500);
    await ev(() => window.__app.backToSeat());
    await page.waitForFunction(() => !document.body.classList.contains('is-fading'), null, { timeout: 120000 });
    await page.waitForTimeout(300);
  }
  // Ticket
  const hasScoreTicket = await (async () => { await ev(() => window.__app.toTicket()); await page.waitForTimeout(800); return ev(() => /bars/.test(document.querySelector('#panel').innerHTML)); })();
  check('Ticketvorschau mit Sichtqualität nach der Wahl', hasScoreTicket);
  await shot('e09-ticket');
  // Fluchtweg und Hilfe
  await ev(() => window.__app.toService());
  await ev(() => window.__app.showExitRoute());
  await page.waitForTimeout(300);
  check('Fluchtweg: Linie auf Karte und Bodenpfeile', await ev(() => !!document.querySelector('.m-path-exit') && window.__app.scene.children.some((c) => c.isInstancedMesh && c.visible && c.count > 3 && c.renderOrder === 2)));
  await shot('e10-exit');
  await ev(() => document.querySelector('#help-btn').click());
  await page.waitForTimeout(500);
  check('Hilfe & Notfall öffnet', await ev(() => !document.querySelector('#help-sheet').hidden && document.querySelector('#help-body').textContent.length > 50));
  await shot('e11-help', 800);
  await ev(() => document.querySelector('#help-body button')?.click());
  await page.waitForTimeout(1500);
  await shot('e12-helppoint', 1500);
  await page.keyboard.press('Escape');
  // Karte
  await ev(() => window.__app.returnFromHelpView?.());
  await page.waitForTimeout(800);
  await ev(() => document.querySelector('#map-btn').click());
  await page.waitForTimeout(600);
  const mapBox = await ev(() => {
    const b = [...document.querySelectorAll('#mapsheet-close, #mapsheet-close-bottom')].find((x) => x.offsetParent);
    const r = b.getBoundingClientRect();
    const svg = document.querySelector('#mapsheet .map-svg').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: innerHeight, w: innerWidth, svgBottom: svg.bottom, svgRight: svg.right, id: b.id };
  });
  check('Karte: Schliessen-Button ohne Scrollen sichtbar', mapBox.top >= 0 && mapBox.bottom <= mapBox.h, `${mapBox.id} bei y ${Math.round(mapBox.top)}–${Math.round(mapBox.bottom)} von ${mapBox.h}`);
  check('Karte: passt in den Bildschirm', mapBox.svgBottom <= mapBox.h && mapBox.svgRight <= mapBox.w, `Kartenunterkante ${Math.round(mapBox.svgBottom)}`);
  await shot('e13-map', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Karte: schliesst mit Escape', await ev(() => document.querySelector('#mapsheet').hidden));
  // Testprotokoll
  await ev(() => window.__app.toStart());
  await page.waitForTimeout(1500);
  await ev(() => document.querySelector('#open-log').click());
  await page.waitForTimeout(500);
  const log = await ev(() => document.querySelector('textarea.log')?.value || '');
  check('Testprotokoll mit Einträgen', log.split('\n').length > 15, `${log.split('\n').length} Zeilen`);
  await shot('e14-log', 500);
  check('Keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
