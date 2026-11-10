// Spielszenen und Durchsagen. Sorgt für Leben im Stadion, ändert aber nichts am Ablauf der Tour:
// vor dem Spiel gibt es ab und zu eine Stadiondurchsage, während des Spiels Torchancen und Tore.
// Meldet alles über onEvent({ type, ... }); was dann zu sehen und zu hören ist, entscheidet main.js.

const KICKOFF = 23 * 60 + 41; // Spielzeit beim Umschalten auf «Im Spiel» (wie bisher auf der Anzeigetafel)
const ANNOUNCE_EVERY = 75;

// Zeitpunkte in Sekunden nach dem Umschalten auf «Im Spiel»
const TIMELINE = [
  { at: 18, type: 'chance', team: 'alb' },
  { at: 46, type: 'goal', team: 'alb' },
  { at: 82, type: 'chance', team: 'ita' },
  { at: 115, type: 'goal', team: 'ita' },
];
const CHANCE_EVERY = 52; // danach nur noch Torchancen, abwechselnd

const clockText = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MatchDirector {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.live = false;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.score = [0, 0];
    this.next = 0;
    this.pendingGoal = null;
    this.flash = 0;
    this.lastClock = '';
    this.sinceAnnounce = ANNOUNCE_EVERY - 6; // erste Durchsage kurz nach dem Start der Tour
    this.onEvent({ type: 'score', score: this.score, clock: clockText(KICKOFF) });
  }

  setMode(mode) {
    this.live = mode === 'live';
  }

  // active: nur während der Tour (nicht auf der Startseite)
  update(dt, active) {
    if (!active) return;
    if (!this.live) {
      this.sinceAnnounce += dt;
      if (this.sinceAnnounce >= ANNOUNCE_EVERY) {
        this.sinceAnnounce = 0;
        this.onEvent({ type: 'announce' });
      }
      return;
    }
    this.t += dt;
    const clock = clockText(KICKOFF + this.t);
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      this.onEvent({ type: 'clock', clock });
    }
    // Tor: zuerst läuft der Angriff, gut eine Sekunde später ist der Ball im Netz
    if (this.pendingGoal && this.t >= this.pendingGoal.at) {
      const team = this.pendingGoal.team;
      this.pendingGoal = null;
      this.score = team === 'alb' ? [this.score[0] + 1, this.score[1]] : [this.score[0], this.score[1] + 1];
      this.flash = 7;
      this.onEvent({ type: 'goal', team, score: this.score });
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.onEvent({ type: 'flashEnd' });
    }
    const ev = this.next < TIMELINE.length ? TIMELINE[this.next] : { at: TIMELINE[TIMELINE.length - 1].at + (this.next - TIMELINE.length + 1) * CHANCE_EVERY, type: 'chance', team: this.next % 2 ? 'ita' : 'alb' };
    if (this.t >= ev.at) {
      this.next++;
      this.onEvent({ type: 'attack', team: ev.team, goal: ev.type === 'goal' });
      if (ev.type === 'goal') this.pendingGoal = { at: this.t + 1.3, team: ev.team };
      else this.onEvent({ type: 'chance', team: ev.team });
    }
  }
}
