# Projektkontext für Claude Code – Virtual Stadium Experience

Diese Datei liest Claude Code automatisch. Sie beschreibt das Projekt, die festen Entscheidungen und die Arbeitsregeln.

## Worum es geht

Schulprojekt **ÜK 368, LB Element c** von Giuliano und Kimi (Swisscom, Klasse EDB24A). Abgabe: erlebbarer Prototyp + Testkonzept, zwei Tests, Auswertung, Reflexion. Bewertet werden u. a. Gestaltung/Umsetzung, Nutzererlebnis und «Begeisterungsfaktor».

Die App ist eine **interaktive 3D-Stadionvorschau für Rollstuhlfahrende**. Szenario: **San Siro bei Nacht, Freundschaftsspiel Albanien – Italien** (fiktiv). Die Nutzerin/der Nutzer begleitet **Edi Ramadani** (18, blonde Locken, rotes Albanien-Trikot «EDI 18», manueller Rollstuhl **68 × 110 cm**) mit seinem Freund **Maxim** (17, Italien-Fan, blaues Shirt) vom Parkplatz bis zum Platz.

Live: Vercel (automatischer Build aus GitHub, Branch `main`). Build: `npm run build`, Output `dist`.

## Ablauf in der App (5 Schritte)

1. **Ankunft** – Edi fährt selbst vom Rollstuhl-Parkplatz über den Vorplatz bis vor drei Eingänge.
2. **Route** – drei Routen, die Testperson entscheidet selbst (keine Route vorab markieren!):
   - **A**: Eingang N1, Drehkreuz 60 cm → Edi stoppt davor (Hindernis).
   - **B**: Eingang N2, führt auf ebenem Boden hinter dem Lift um den erhöhten Liftvorplatz herum → Edi stoppt **vor zwei Stufen**.
   - **C**: Eingang N3 → Rampe → Lift (Kabine 110 × 140 cm, Tür ≥ 90 cm) → Ebene 2 → Plattform.
3. **Platz** – drei Rollstuhlplätze mit echter 3D-Sicht aus Edis Augenhöhe (1,15 m):
   - **Platz 1** Unterring hinter Metallgeländer → Sicht eingeschränkt, wenn Fans stehen.
   - **Platz 2** erhöhte Plattform Mittelring Nord, Glasbrüstung → freie Sicht.
   - **Platz 3** Ecke Nordwest → teilweise durch das Kamerapodest verdeckt.
   - Fans sitzen/stehen umschaltbar. **Sichtqualität erst nach der Wahl** zeigen (Ticketvorschau).
4. **Service** – Weg zum barrierefreien WC selbst fahren (ab allen drei Plätzen), Fluchtweg (grüne Linie + Bodenpfeile), Hilfe & Notfall.
5. **Ticket** – simulierte Ticketvorschau + Stadionpass als Bild.

Zusätzlich: **Frei erkunden** (8 Bereiche), **Karte** (grosse Ansicht, Esc schliesst, auf dem Handy Schliessen unten), **Hilfe & Notfall** immer oben rechts, **Optionen** (Ton, Kamera Ego/Third-Person, Atmosphäre vor dem Spiel/im Spiel, Sprache DE/EN, Bedienung ausblenden), **Testprotokoll** mit Zeitstempeln (Startseite unten), Testleitung kann über die Fortschrittsstriche zu Schritten springen.

## Testhypothesen (dürfen durch Änderungen nicht kaputtgehen)

- G1: Route auf dem Plan nachvollziehen · G2: Notfall-Sicherheitsgefühl (Skala 1–5) · G3: freieste Sicht von 3 Plätzen wählen
- K1: passende Route von 3 wählen · K2: WC-Weg auf dem Plan finden · K3: Notfallhilfe innerhalb 60 s finden

## Feste Regeln (bitte einhalten)

- **Simulation kennzeichnen**: Wege, Masse und Notfallinformationen sind simuliert, keine offiziellen San-Siro-Daten. Der Hinweis «Simulation» bleibt sichtbar.
- **Keine** UEFA-/Verbands-Logos, keine echten Markenlogos, keine Apple-Logos, kein Ticketverkauf.
- Keine Route und keinen Platz als «richtig» oder «empfohlen» markieren.
- Sprache: **Schweizer Hochdeutsch**, «ss» statt «ß», echte Umlaute. Jede neue Beschriftung in `i18n.js` auf **DE und EN**.
- Design: UEFA-Champions-League-Nacht × Apple: schwarz/dunkelblau, weisse Schrift, Silber-/Goldakzente, Systemschrift, viel Luft, feine Linien. **Vermeiden**: KI-Farbverläufe, überladene Dashboards, übermässige Rundungen, unnötige Icons/Emojis, `backdrop-filter`-Unschärfe über der 3D-Szene (kostet Leistung).
- **Alle Dateien bleiben im Hauptordner** (keine Unterordner) – das Team lädt über die GitHub-Weboberfläche hoch, und die kann keine Ordner.
- Abhängigkeiten nur mit festen Versionen (aktuell `three@0.170.0`, `vite@6.4.5`).
- Performance zuerst: Details dort, wo man sie in der Tour aus der Nähe sieht. Instanzen (`InstancedMesh`) und zusammengeführte Geometrien (`mergeGeometries`) statt vieler Einzelobjekte. Nach grösseren Änderungen Dreiecke/Draw-Calls mit `?perf` prüfen (Ziel: high ≤ ~1,5 Mio. Dreiecke, ≤ ~600 Draw-Calls).
- **Blendung vermeiden**: Flutlicht wirkt über Bloom (high) bzw. weiche Halo-Flächen (low). Lichtkegel werden nahe der Kamera ausgeblendet, Flutlicht-Batterien in Kameranähe gedimmt. Glas und Handläufe der Rollstuhlplätze sind matt. Neue helle/emissive Flächen vorsichtig dosieren und an Platz 2 und 3 prüfen. In eigenen Shadern alle Werte begrenzen (`clamp`): ein einziger überheller Bildpunkt wird vom Bloom zu einem grossen weissen Fleck.
- **Sicht ist Testbedingung**: Die Reihen direkt vor den Rollstuhlplätzen reagieren nicht auf Spielszenen (nur «Fans sitzen/stehen» ändert sie). Fahnen stehen nicht im Mittelring und nicht im Unterring Nord. Am Eingang wird keine Route markiert (Bodenmarkierungen zum Rollstuhlplatz nur auf Ebene 2).
- **Spielszenen** (`match.js`): vor dem Spiel Stadiondurchsage (rund alle 75 s), im Spiel Chance/Tor nach 18/46/82/115 s (Endstand 1 : 1), danach nur noch Chancen. Wird nicht ins Testprotokoll geschrieben.

## Dateien

```
index.html       Seitenaufbau (Startseite, Tour, Karte, Hilfe, Fenster)
main.js          App: Ablauf der 5 Schritte, Bedienung, Renderloop (Klasse App)
main.css         Gestaltung (Tokens oben in :root)
i18n.js          Texte DE/EN, t(key, ...args)
config.js        Stadionmasse, Grafikstufe (QUALITY/HIGH), BLOOM, SHOW_PERF, ADAPTIVE
layout.js        Eingänge, Routen (PATHS), Plätze (SEATS), Bereiche (AREAS), POIs – eine Quelle für 3D und Karte
stadium.js       Ränge, Sitze, Fassade, Dach, rote Dachträger, Türme, Flutlicht, Lichtkegel, Blocknummern
interior.js      Zaun, Eingänge, Absperrgitter, Rampe, Lift, WC, Hilfepunkte, Plattformen, Schilder
surroundings.js  Himmel, Vorplatz, Tram, Parkplatz, Foodtrucks, Bäume, Stadt, Figuren
crowd.js         Publikum (Billboards fern, echte 3D-Figuren nahe den Rollstuhlplätzen), Fan-Blöcke hinter den Toren, Fahnen/Schals, Torjubel, Spieler
details.js       Kleine Details als Instanzen/zusammengeführte Geometrien: Spielfeldrand (Ordner, Ballkinder, Trainer, Ersatzspieler, Fotografen, TV-Kameras), Umgang (Abfalleimer, Becher, Notausgang-Leuchten, Feuerlöscher, Bodenmarkierungen, Info-Bildschirme), Vorplatz (Schal-Stand, Polizei-Absperrung, Fans, fahrende Tram)
match.js         Spielszenen (Torchancen, Tore, Spieluhr) und Stadiondurchsage – nur Atmosphäre, kein Teil des Testablaufs
avatar.js        Edi + Rollstuhl (Greifreifen, Anschiebe-Animation per IK, Blinzeln, Torjubel), Maxim (Gesicht, schaut dem Ball nach, reagiert auf Spielszenen), Ordner
drive.js         Fahren entlang der Wege (CatmullRom)
camera.js        Kamera: Startseite, Kamerafahrt, Folgen (Ego/Third), Umsehen
map.js           SVG-Karte
textures.js      selbst gezeichnete Canvas-Texturen und Schilder
geometry.js      Hilfsfunktionen für die Stadionform (perimeter, band, ribbon, boxAt)
renderer.js      Renderer, MSAA, Bloom
perf.js          Bildrate messen, Auflösung anpassen, Shader vorab laden
audio.js         Stadionatmosphäre (WebAudio, synthetisch)
log.js           Testprotokoll · pass.js Stadionpass · toast.js Meldungen
test-e2e.cjs     Funktionstest (Playwright) · test-perf.cjs Leistungsmessung
```

Koordinaten: Spielfeld in der Mitte, Norden = −z, y = Höhe in Metern. Ebene 0 = Boden, Ebene 2 = y 21,9.

## Arbeiten und Testen

```bash
npm install
npm run dev            # lokal entwickeln
npm run build          # muss ohne Fehler durchlaufen
npx vite preview --port 4173
node test-e2e.cjs out desktop "&quality=high"   # Funktionstest (braucht: npm i -D playwright@1.48.2 && npx playwright install chromium)
node test-e2e.cjs out mobile ""
node test-perf.cjs 4173 "&adaptive=0&quality=high" high on
```

Nützliche Adressparameter: `?debug` (window.__app), `?perf` (Messanzeige + 10-s-Messung ins Testprotokoll), `?quality=low|high`, `?bloom=0|1`, `?adaptive=0`.

Vor jeder Abgabe: `npm run build`, Funktionstest Desktop + Handy, Sicht an allen drei Plätzen anschauen (keine Blendung), Konsole ohne Fehler.
