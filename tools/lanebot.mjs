// A COMPETENT PLAYER, on every island, so the lane game can be balanced against something
// that plays it properly. Wells at the back, walls at the front, thorns in between, and an
// apple thrown at anything it knocks down.
import { installDom } from './stubdom.mjs';
installDom();
const LA = await import('../src/game/lane.js');
const { ISLANDS } = await import('../src/data/islands.js');
const V = await import('../src/game/voyage.js');

function play(isl, seed) {
  const v = V.newVoyage(seed);
  const f = LA.newLane(v, isl, 'x');
  let steps = 0, tamed = 0;
  while (!f.over && steps++ < 40000) {
    LA.update(f, 1 / 30);
    // a mote is clay lying on the ground: no competent player walks past one
    while (f.motes.length) LA.takeMote(f, f.motes[0]);
    // a ripe apple is always worth the click
    for (const tr of f.trees) if (tr.ripe) LA.harvest(f, tr.row, tr.col);
    for (let guard = 0; guard < 3; guard++) {
      let did = false;
      // A WATER ROW WITH NO REED IN IT IS AN OPEN DOOR. Left alone it is the row every
      // breach comes through, and the ark falls with four guards still standing.
      if (!did && f.hand.some((b) => b.id === 'reed') && f.clay >= 25) {
        for (const r of f.waterRows) {
          for (let c = 6; c >= 2 && !did; c--) {
            if (LA.plant(f, 'reed', r, c).ok) did = true;
          }
          if (did) break;
        }
      }
      const wells = f.plants.filter((p) => p.def.kind === 'gen').length;
      if (!did && wells < 4 && f.clay >= 50) {
        for (let r = 0; r < LA.ROWS && !did; r++) if (LA.plant(f, 'well', r, 0).ok) did = true;
      }
      if (!did && f.clay >= 100) {
        for (let r = 0; r < LA.ROWS && !did; r++) {
          if (f.plants.some((p) => p.row === r && p.def.kind === 'shoot')) continue;
          for (let c = 1; c <= 3 && !did; c++) if (LA.plant(f, 'thorn', r, c).ok) did = true;
        }
      }
      if (!did && f.clay >= 150 && f.hand.some((b) => b.id === 'maul')) {
        for (let r = 0; r < LA.ROWS && !did; r++) {
          if (f.plants.some((p) => p.row === r && p.def.pierce)) continue;
          for (let c = 1; c <= 3 && !did; c++) if (LA.plant(f, 'maul', r, c).ok) did = true;
        }
      }
      if (!did && f.clay >= 50) {
        for (let r = 0; r < LA.ROWS && !did; r++) {
          if (f.plants.some((p) => p.row === r && p.def.kind === 'wall')) continue;
          for (let c = 7; c >= 5 && !did; c--) if (LA.plant(f, 'boar', r, c).ok) did = true;
        }
      }
      // the rest of the hand, in the order a player would reach for it: the crowd answers
      // first, then the tempo, then more of everything
      const extras = [['tide', 200], ['ember', 175], ['owl', 240], ['bell', 200], ['hive', 240]];
      for (const [id, need] of extras) {
        if (did || f.clay < need || !f.hand.some((b) => b.id === id)) continue;
        for (let r = 0; r < LA.ROWS && !did; r++) {
          if (f.plants.some((p) => p.row === r && p.def.id === id)) continue;
          for (let c = 2; c <= 5 && !did; c++) if (LA.plant(f, id, r, c).ok) did = true;
        }
      }
      if (!did && f.clay >= 220) {
        for (let r = 0; r < LA.ROWS && !did; r++) {
          for (let c = 1; c <= 4 && !did; c++) if (LA.plant(f, 'thorn', r, c).ok) did = true;
        }
      }
      if (!did) break;
    }
    // and a breather it has nothing left to spend on is a breather worth selling
    if (f.clay >= 300 && LA.callable(f)) LA.callWave(f);

  }
  // THE RAMP: what it kept is what it could feed, not what it knocked down
  while (f.apples > 0 && f.held.length) {
    const st = f.held[0];
    if (!LA.tame(f, st.row, Math.round(st.col)).ok) break;
    tamed++;
  }
  LA.endFeeding(f);
  return { f, tamed, v };
}

let held = 0;
for (const isl of ISLANDS) {
  const { f, tamed, v } = play(isl, 'BOT-' + isl.id);
  if (f.why === 'clear') held++;
  console.log(
    isl.id.padEnd(10), ('d' + isl.danger).padEnd(3), f.why.padEnd(8),
    'guards', f.guards.filter(Boolean).length, 'ark', f.ark.hp,
    '| held', String(f.held.length + tamed).padStart(2),
    'fed', String(tamed).padStart(2), 'kept', String(f.saved.length).padStart(2),
    'lost', f.lost.length, '| plants', String(f.plants.length).padStart(2),
    '| knows', (v.beasts || []).length, '| boss', f.bossSeen ? (f.bossDown ? 'down' : 'alive') : '-',
    '| t', f.t.toFixed(0) + 's',
  );
}
console.log(`\n${held}/${ISLANDS.length} islands held`);
