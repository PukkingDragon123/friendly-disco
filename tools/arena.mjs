// The arena, with a rack of animals on it. The only view in which you can say whether the
// island reads as a table you would aim at.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas } = await import('../src/core/pixel.js');
const A = await import('../src/render/arena.js');
const PH = await import('../src/game/physics.js');
const { ANIMALS, ANIMAL_BY_ID } = await import('../src/data/animals.js');
const { ISLANDS } = await import('../src/data/islands.js');

const t = Number(process.env.T || 1.4);
const island = ISLANDS[Number(process.env.ISLE || 0)] || ISLANDS[0];
const c = makeCanvas(960, 540);
const bake = A.bakeArena(island, 3);
c.g.drawImage(bake, 0, 0);
A.drawArenaWater(c.g, t);
A.drawArenaFoliage(c.g, island, t, 3);
A.drawArenaGrass(c.g, island, t, 3);

const world = PH.createWorld({ w: A.AW, h: A.AH });
PH.setGates(world, A.buildGates());
const posts = [{ x: 46, y: 38, r: 7 }, { x: 122, y: 52, r: 8 }, { x: 85, y: 24, r: 6 }];
PH.setPosts(world, posts);
for (const p of world.posts) A.drawPost(c.g, p, island);
for (const gp of world.gates) A.drawGate(c.g, gp, t, gp.id === 'main' ? 'open' : 'shut');

const mine = ['lion', 'cow', 'pig', 'goat'];
const foes = ['wolf', 'boar', 'hyena', 'rhino', 'raven'];
mine.forEach((id, i) => { const b = PH.addBall(world, { animalId: id, x: 40 + i * 28, y: 72 }); void b; });
foes.forEach((id, i) => { PH.addBall(world, { animalId: id, x: 34 + i * 26, y: 26 + (i % 2) * 12 }); });
const order = world.balls.slice().sort((p, q) => p.y - q.y);
for (const b of order) {
  const a = ANIMAL_BY_ID[b.animalId] || ANIMALS[0];
  const foe = foes.includes(b.animalId);
  A.drawBall(c.g, b, a, { t, material: foe ? 'corrupt' : null, mood: foe ? 'angry' : 'idle' });
}
const cue = world.balls[1];
A.drawAim(c.g, cue, -1.35, 1.1, t);
A.drawCharge(c.g, cue, 1.1, t);
writePNG(c.canvas, process.argv[2] || 'arena.png');
console.log('wrote', process.argv[2]);
