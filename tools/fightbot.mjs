// Plays fights with no screen, so the numbers can be tuned before the art exists.
//
// The bot is deliberately DUMB: it picks the healthiest of its own animals, aims at the
// nearest beast that is still fighting (or at the nearest door if something is beaten and
// close to one), and fires at a power that scales with the distance. If a stupid bot cannot
// win an ordinary landing, the fight is too hard; if it wins a boss, it is too easy.
import { installDom } from './stubdom.mjs';
installDom();
const A = await import('../src/game/arena.js');
const { AW, AH, buildGates } = await import('../src/render/arena.js');
const { ISLANDS } = await import('../src/data/islands.js');

const N = Number(process.argv[2] || 8);
const KIND = process.env.KIND || 'fight';
const VERB = !!process.env.V;
const DT = 1 / 60;

function play(seed, island, kind) {
  const f = A.createFight({ seed, island, kind });
  let guard = 0;
  while (f.phase !== 'won' && f.phase !== 'lost' && guard++ < 20000) {
    if (f.phase === 'aim') {
      const mine = f.mine.filter((m) => !m.out && !m.aboard);
      if (!mine.length) break;
      mine.sort((a, b) => b.hp - a.hp);
      const m = mine[0];
      f.picked = f.mine.indexOf(m);
      const foes = A.livingFoes(f);
      if (!foes.length) { A.update(f, DT); continue; }
      // a beaten beast near a door: herd it. otherwise hit the nearest one still fighting.
      const beaten = foes.filter((x) => x.dazed);
      let tx, ty, power;
      if (beaten.length) {
        const b = beaten[0];
        const gs = buildGates();
        let bg = gs[0], bd = 1e9;
        for (const g of gs) {
          const d = Math.hypot(g.x - b.ball.x, g.y - b.ball.y);
          if (d < bd) { bd = d; bg = g; }
        }
        // GHOST BALL. To send it toward the door you have to arrive on the far side of it
        // from the door, so the point to aim at is the beast's centre pushed BACK along the
        // line to the door by the two radii. Aiming at the beast itself sends it wherever
        // the geometry felt like, which is why the bot used to catch nothing.
        const ang = Math.atan2(bg.y - b.ball.y, bg.x - b.ball.x);
        const gap = b.ball.r + m.ball.r;
        tx = b.ball.x - Math.cos(ang) * gap;
        ty = b.ball.y - Math.sin(ang) * gap;
        power = 0.5;
      } else {
        const live = foes.filter((x) => !x.dazed);
        const t = live.length ? live : foes;
        t.sort((p, q) => Math.hypot(p.ball.x - m.ball.x, p.ball.y - m.ball.y)
          - Math.hypot(q.ball.x - m.ball.x, q.ball.y - m.ball.y));
        tx = t[0].ball.x; ty = t[0].ball.y;
        power = 0.95;
      }
      const ang = Math.atan2(ty - m.ball.y, tx - m.ball.x);
      A.shoot(f, ang, power);
    }
    A.update(f, DT);
  }
  return { f, res: A.result(f), guard, timeout: guard >= 20000 };
}

const rows = [];
for (let i = 0; i < N; i++) {
  const island = ISLANDS[i % ISLANDS.length];
  const { f, res, guard, timeout } = play(`bot-${i}`, island, KIND);
  rows.push({ i, name: island.name, danger: island.danger, timeout, ...res, steps: guard,
    nfoes: f.foes.length });
  if (VERB) console.log(f.notes.slice(-8).join(' | '));
}
const won = rows.filter((r) => r.won).length;
for (const r of rows) {
  console.log(
    `${String(r.i).padStart(2)}  ${String(r.name).slice(0, 14).padEnd(14)} d${r.danger}  `
    + `${r.timeout ? 'HUNG' : r.won ? 'WON ' : r.left ? 'LEFT' : 'LOST'}  rounds ${String(r.rounds).padStart(2)}  shots `
    + `${String(r.shots).padStart(3)}  caught ${r.caught.length}  killed ${r.fallen.length}  `
    + `down ${r.downed.length}  aboard ${r.aboardSafe.length}  clay ${r.clay}`,
  );
}
console.log(`\n${won}/${rows.length} won  ·  avg rounds `
  + `${(rows.reduce((s, r) => s + r.rounds, 0) / rows.length).toFixed(1)}`
  + `  ·  avg caught ${(rows.reduce((s, r) => s + r.caught.length, 0) / rows.length).toFixed(1)}`
  + `  ·  avg killed ${(rows.reduce((s, r) => s + r.fallen.length, 0) / rows.length).toFixed(1)}`);
