// What is in the way.
//
// An obstacle is a shape on the ground with a RULE, and every rule is answered by exactly
// one animal ability (data/abilities.js). That pairing is the whole puzzle of a rescue:
// you look at what is between you and the animal, then at who is standing on your boat.
//
// `physics` is the only field the solver reads, and there are deliberately few kinds:
//
//   solid   bounces animals off it, and blocks the shot
//   slow    heavy drag inside it; you cross, but you arrive with nothing left
//   slick   almost no friction; you cross too fast and overshoot
//   kill    an animal that comes to rest in it is lost
//   push    applies a steady force -- a current, a wind
//   pull    drags toward a point and drowns what reaches the middle
//   gap     empty space an animal cannot cross on the ground at all
//
// Cleared obstacles do not vanish: they become PASSABLE, and stay on screen as rubble, a
// felled trunk, a trampled briar. Seeing what you have already solved is most of what
// makes a level feel like progress.

const O = (id, o) => Object.assign({ id, r: 9, hard: 1 }, o);

export const OBSTACLES = [
  O('rock', {
    name: 'Boulder', physics: 'solid', clearedBy: 'smash', r: 11,
    color: 'stone2', dark: 'stone0', light: 'stone4', icon: 'peak',
    blurb: 'Too big to shove. Something has to hit it harder than you can.',
    cleared: 'Broken rubble. You can roll over it now.',
  }),
  O('log', {
    name: 'Fallen Trunk', physics: 'solid', clearedBy: 'climb', r: 10,
    color: 'bark', dark: 'wood0', light: 'wood3', icon: 'cue', long: 1,
    blurb: 'Chest high and slick with moss. Go over, not through.',
    cleared: 'Scrambled over. There is a path along the trunk.',
  }),
  O('cliff', {
    name: 'Scree Slope', physics: 'solid', clearedBy: 'climb', r: 13,
    color: 'stone1', dark: 'stone0', light: 'stone3', icon: 'peak',
    blurb: 'Loose stone at an angle nothing round can hold.',
    cleared: 'A trodden switchback. Steep, but it goes.',
  }),
  O('rubble', {
    name: 'Landslide', physics: 'solid', clearedBy: 'tunnel', r: 12,
    color: 'clay2', dark: 'clay0', light: 'clay4', icon: 'shell',
    blurb: 'Half the hillside, sitting on the only path.',
    cleared: 'A dug-out tunnel, propped with roots.',
  }),
  O('thorns', {
    name: 'Briar', physics: 'slow', clearedBy: 'graze', r: 12, hard: 0.6,
    color: 'leaf0', dark: 'cloth0', light: 'leaf2', icon: 'leaf',
    blurb: 'It does not stop you. It takes everything you had going.',
    cleared: 'Eaten to the stems. Someone was very happy about it.',
  }),
  O('mud', {
    name: 'Mire', physics: 'slow', clearedBy: 'tunnel', r: 14, hard: 0.5,
    color: 'clay1', dark: 'clay0', light: 'clay2', icon: 'drop',
    blurb: 'Ankle deep and hungry. Nothing crosses this at speed.',
    cleared: 'A causeway of packed earth.',
  }),
  O('deep', {
    name: 'Deep Water', physics: 'kill', clearedBy: 'ferry', r: 15, hard: 0,
    color: 'water1', dark: 'water0', light: 'water3', icon: 'wave',
    blurb: 'An animal that stops in this does not get up again.',
    cleared: 'A swimmer is holding station. Ride across on its back.',
  }),
  O('current', {
    name: 'Current', physics: 'push', clearedBy: 'ferry', r: 14, hard: 0,
    color: 'water2', dark: 'water1', light: 'foam', icon: 'arrow_r',
    blurb: 'Everything you send through it arrives somewhere else.',
    cleared: 'Broken by a body in the water. It runs straight now.',
  }),
  O('whirl', {
    name: 'Whirlpool', physics: 'pull', clearedBy: null, r: 16, hard: 0,
    color: 'water0', dark: 'ink', light: 'water3', icon: 'wheel',
    blurb: 'Nothing clears this. Go around it, or feed it.',
  }),
  O('gap', {
    name: 'Broken Bridge', physics: 'gap', clearedBy: 'lift', r: 13, hard: 0,
    color: 'shadow', dark: 'ink', light: 'wood2', icon: 'cross', long: 1,
    blurb: 'The middle of it is in the river somewhere downstream.',
    cleared: 'Something is flying the crossing, one at a time.',
  }),
  O('ice', {
    name: 'Black Ice', physics: 'slick', clearedBy: 'warm', r: 14, hard: 0.2,
    color: 'ice', dark: 'snow0', light: 'white', icon: 'snowflake',
    blurb: 'You will not stop where you meant to.',
    cleared: 'Melted to slush and grit. It holds.',
  }),
  O('lava', {
    name: 'Lava Vent', physics: 'kill', clearedBy: null, r: 11, hard: 1,
    color: 'lava1', dark: 'lava0', light: 'lava2', icon: 'flame',
    blurb: 'No animal clears this. It is a wall that also kills.',
  }),
  O('wind', {
    name: 'Gale', physics: 'push', clearedBy: null, r: 18, hard: 0,
    color: 'grey2', dark: 'grey1', light: 'white', icon: 'cloud',
    blurb: 'Leans on everything on this side of the island.',
  }),
  O('bolt', {
    name: 'Strike Zone', physics: 'strike', clearedBy: null, r: 12, hard: 0,
    color: 'gold', dark: 'brass1', light: 'white', icon: 'bolt',
    blurb: 'Lightning keeps coming back to the same patch of ground.',
  }),
];

export const OBSTACLE_BY_ID = Object.freeze(
  OBSTACLES.reduce((m, o) => { m[o.id] = o; return m; }, {}),
);

/** Which ability opens this obstacle, or null if nothing does. */
export function clearedBy(id) {
  const o = OBSTACLE_BY_ID[id];
  return o ? o.clearedBy : null;
}

/** Obstacles that no animal can clear — the ones you have to route around. */
export const UNCLEARABLE = Object.freeze(OBSTACLES.filter((o) => !o.clearedBy).map((o) => o.id));
