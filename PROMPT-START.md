# Start-Prompt für Claude Code (Fable 5.2)

So gehts:
1. ZIP entpacken, Ordner in Claude Code öffnen (die Datei `CLAUDE.md` wird automatisch gelesen).
2. Den Text unten zwischen den Linien kopieren und als erste Nachricht senden.
3. Danach eigene Wünsche einfach in normaler Sprache nachschieben (Beispiele ganz unten).

---

Du arbeitest an unserem bestehenden Prototyp «Virtual Stadium Experience» (ÜK 368, LB Element c). Lies zuerst `CLAUDE.md` und verschaff dir einen Überblick über `main.js`, `layout.js`, `stadium.js`, `interior.js`, `crowd.js` und `avatar.js`. Ändere nichts an den festen Regeln aus `CLAUDE.md` (Simulation kennzeichnen, keine Route vorab markieren, Sichtqualität erst nach der Wahl, DE/EN, ss statt ß, alle Dateien im Hauptordner, feste Versionen).

**Ziel:** Das Erlebnis soll sich so nah wie möglich wie ein echtes Nachtspiel im San Siro anfühlen – hochwertig, ruhig, glaubwürdig – und dabei flüssig bleiben, auch auf schwächeren Laptops.

**Arbeite in dieser Reihenfolge und zeig mir nach jedem Schritt kurz, was du geändert hast:**

1. **Kontrolle:** `npm install`, `npm run build`, Seite starten. Prüfe die komplette Tour (Ankunft, Routen A/B/C, drei Plätze, WC ab allen Plätzen, Fluchtweg, Hilfe, Karte, Ticket, Testprotokoll) auf Desktop und Handy-Hochformat. Melde Fehler, bevor du Neues baust.
2. **Licht an Platz 2 und 3:** Prüfe, ob Flutlicht, Bloom, Lichtkegel oder Spiegelungen (Glasbrüstung) blenden. Ziel: hell und stimmungsvoll wie im TV-Bild, aber keine weissen Schleier oder grellen Flecken im Blickfeld.
3. **Kleine Details für Realismus** – nur dort, wo man sie in der Tour aus der Nähe sieht, mit Instanzen/zusammengeführten Geometrien:
   - Stadion innen: Werbebanden mit eigenen, erfundenen Marken (keine echten Logos), Ersatzbänke und Coaching-Zonen, Eckfahnen, Tornetze, Ballkinder, Fotografen hinter den Toren, Ordner mit Warnweste an den Treppen, TV-Kameras an der Seitenlinie.
   - Tribünen: Fahnen und Schals bei den Fans (rot für Albanien, blau für Italien), Fan-Blöcke hinter den Toren, einzelne leere Sitze, Treppen-Markierungen (gelbe Stufenkanten), Blocknummern.
   - Umgang und Wege: Getränkebecher/Abfalleimer, Notausgang-Leuchten, Feuerlöscher-Kästen, Bodenmarkierungen zum Rollstuhlplatz, kleine Info-Bildschirme mit Spielstand.
   - Vorplatz: Fans in Trikots, Schal-Verkaufsstand, Polizei-Absperrung, Tram mit Licht.
   - Atmosphäre: Stadiondurchsage vor dem Spiel, Torjubel/Gesänge im Modus «Im Spiel», leichte Kamerabewegung der Fans (nicht ruckelig).
4. **Edi und Maxim:** natürlichere Proportionen, Gesichter etwas lebendiger (Blinzeln, leichte Kopfbewegung), Maxim reagiert auf Spielszenen. Rollstuhl bleibt 68 × 110 cm.
5. **Performance:** nach jedem grösseren Schritt mit `?perf` Dreiecke, Draw-Calls und Bildrate prüfen. Zuschauer direkt vor den Rollstuhlplätzen bleiben (wichtig für den Sichtvergleich).
6. **Abschluss:** Produktionsbuild, Funktionstest (`test-e2e.cjs`) Desktop + Handy, Liste der geänderten Dateien, offene Punkte.

Frag nach, bevor du etwas an Routen, Platzpositionen oder am Testablauf änderst – das betrifft unsere Testhypothesen.

---

## Beispiele für weitere Wünsche (einfach so schreiben)

- «Mach die Werbebanden animiert, wie LED-Banden im echten Stadion.»
- «Wenn ich Platz 1 wähle, sollen die Fans vor mir beim Torjubel aufspringen.»
- «Füge vor dem Spiel ein Einlaufen der Mannschaften mit Hymne hinzu (ohne echte Hymnen-Aufnahmen).»
- «Die Rampe soll realistischer aussehen: Handlauf beidseitig, Geländer, Bodenbelag mit Rillen.»
- «Prüfe die Startseite auf dem iPhone, der Titel ist zu gross.»
- «Mach eine kurze Kamerafahrt beim Betreten des Stadions durch den Tunnel ins Innere.»
