// Interactive about-page hero: a palm-up robot hand holding a Rubik's cube, drawn as line art.
//
// Clicking the top face spins the cube a quarter turn on the palm (see YAW_PUSH_TIME). Clicking
// one of the two lower visible cube faces rolls the cube so that face ends up on the palm. The roll happens in two pushes: a wide 60-degree sweep, which tips the old top
// face well round towards the finger on that side, then a 30-degree finish. The two
// fingertips on the faces pierced by the rotation axis act as the pivot: they lift the cube
// clear of the palm and stay in contact. The two opposing fingers push the cube over, then
// release and regrasp between the pushes.
//
// World frame: Z up, palm top at z = 0, +Y runs from the wrist towards the fingers.
// Units are roughly centimetres.

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js";

const CUBE = 5.6;
const HALF = CUBE / 2;
// Finger links are square-ish servo segments like the LEAP hand's; the last one runs straight
// into a rounded fingertip.
const LINK_W = 2.0; // across the finger, at its widest (the swell in each link)
const LINK_T = 1.8; // palm side to back, at its thickest
const TIP_R = 0.85; // fingertip contact radius
const LINK_R = LINK_W / 2; // clearance kept between finger link centrelines and the cube
const PALM = 7.2; // side of the square palm
const PALM_T = 1.6;
const REST_CENTER = [0, 0, HALF];
const GAP = 0.4; // how far the pivot fingers lift the cube off the palm during a roll
// The two pushes of a roll. `near` and `far` are how far from the face centre each pusher
// presses (its lever arm). The near pusher (on the side the cube rolls towards) presses down
// on the top face by its edge, tipping the cube like a box; after the sweep that spot has
// come round to face it, so it only hops a little way along the same face to regrasp. The
// far pusher's face turns up towards the top as the cube rolls, so on the finish it presses
// at the edge on its own side and rides over it rather than reaching across the cube.
const PUSHES = [
  { angle: Math.PI / 3, time: 1.2, near: 2.4, far: -1.4 },
  { angle: Math.PI / 6, time: 0.8, near: 1.6, far: -2.6 },
];
const LIFT_OFF = 1.1; // how far a pusher backs off the cube while regrasping
const REGRASP_TIME = 0.75;
const BASE_GAP = 0.78; // how far the base hinges sit outside the palm edge

const LINE_PX = 1.5;
const GUIDE_PX = 3.2; // the roll preview arrow is drawn bolder than the outlines
const AXIS_PX = 1.6; // the axis drawn with each preview arrow is thinner
const LABEL_PX = 1.0; // and the strokes of its letter thinner still
const MIN_CHAIN = 0.3; // shortest traced outline worth drawing
// The hand is white with dark outlines, and the cube's grid dark, in both colour modes.
const HAND_FILL = 0x555556; // a dark grey, between mid-grey and the dark page background
const INK = 0x222222;
const CREASE = Math.cos((40 * Math.PI) / 180);

// Faces the viewer can click, in world coordinates: the two lower faces roll the cube onto
// them; the top face spins the cube a quarter turn about the vertical (clockwise from above
// when clicked on its right half, anticlockwise on its left).
const CLICKABLE = [
  [0, -1, 0],
  [-1, 0, 0],
];
const TOP = [0, 0, 1];
const SELECTABLE = [...CLICKABLE, TOP];
// The spin: a quarter turn in two pushes of 45 degrees, the cube sliding on the palm and
// always driven by a finger. Around 45 degrees the cube's corners swing out almost to the
// finger bases, and only the index and ring fingers can hold it there without a link cutting
// through a corner, each gripping by the edge of a face: one drives the first push and the
// other the second, handing the cube over at 45 degrees, where it rests briefly (the one
// closes in as the first push slows, and the other lets go as the second gets going). The thumb grips
// beside them at the start and the end of the turn, opening out of the way in between.
const YAW_PUSH_TIME = 1.4; // each push
const YAW_HANDOVER_TIME = 0.45; // the rest at 45 degrees
const YAW_HOP_TIME = 0.65; // onto the first grips beforehand, and back to rest afterwards
// Progress through the spin is counted in degrees of turn, with YAW_HANDOVER more inserted at
// 45 degrees for the handover.
const YAW_HANDOVER = 30;
// Each finger's grips, per direction of spin (+1 anticlockwise from above): on the face in
// front of it [trail, height, let go from, let go by], then on the face that comes round next
// [trail, height, close in from, holding from], the last two of each in progress. Trail is
// how far behind the face's centre the grip sits, against the turn, and height how far above
// the cube's centre. The grips, and when they are held, were found by sweeping each finger's
// inverse kinematics over the turn for poses whose links stay clear of the cube. A finger
// with no grips sits the spin out, opened out of the way: the middle finger, whose base sits
// right behind its face, where every grip sweeps across in front of it.
const YAW_GRIPS = {
  1: {
    thumb: [[2.4, 0.1, 10, 37.5], [0.3, 0.1, 93, 114]],
    index: [[0.9, 0.5, 0, 20], [-2.4, -0.3, 35, 62]],
    ring: [[2.4, -0.3, 60, 86], [-0.6, 0.5, 100, 116]],
  },
  "-1": {
    thumb: [[-0.3, 0.1, 0, 25], [-2.4, -0.3, 55, 83]],
    index: [[2.4, -0.3, 60, 86], [-0.9, 0.5, 100, 116]],
    ring: [[0.6, 0.5, 0, 20], [-2.4, -0.3, 35, 62]],
  },
};
// Between its grips, a finger opens out of the way into the flexions YAW_OPEN, in the plane
// it curls in, and while it waits turns from the plane it let go in to the one it will
// close in on. It opens and closes by blending its joints (not its tip) towards that pose, so it
// keeps one shape throughout instead of the inverse kinematics refolding it on the way.
const YAW_OPEN = [0.2, 1.1, 1.0];
const YAW_CLEAR = 0.3; // how far a fingertip stands off a face as it leaves or arrives
const YAW_ARCH = 0.6;

// Each digit is a yawed planar chain whose base joint sits against the side of the palm:
// abduction q0 about Z, then three flexion joints. With the finger pointing straight out
// from the palm, flexion lifts it up and back over, so it arcs outwards and then curls in.
// Like the Allegro hand, index, middle and ring sit towards the back (the outer two on the
// palm's sides, angled back) and the thumb opposes them from the front, angled off centre.
// Each curl plane passes through the centre of the finger's face and stays within about 30
// degrees of square to it; steeper planes cut across the cube and cannot push it.
const FINGER_POSE = [0, 0.9, 1.5, 0.9];
const BASE_Y = PALM / 2 + BASE_GAP;
const SIDE_Y = 1.0; // how far back the index and ring sit on the palm's sides
const BASE_Z = -0.5;
// Every finger has the same links: the fingertip link (hinge to contact point) is the
// longest, the middle link 5% shorter, the base link 5% shorter again.
const TIP_LENGTH = 3.78;
const LINK_LENGTHS = [TIP_LENGTH * 0.95 * 0.95, TIP_LENGTH * 0.95, TIP_LENGTH];
const FINGERS = [
  { name: "thumb", base: [0.35, -BASE_Y, BASE_Z], yaw: -2.62, len: LINK_LENGTHS, face: [0, -1, 0] },
  { name: "index", base: [-BASE_Y, SIDE_Y, BASE_Z], yaw: 0.54, len: LINK_LENGTHS, face: [-1, 0, 0] },
  { name: "middle", base: [0, BASE_Y, BASE_Z], yaw: 0, len: LINK_LENGTHS, face: [0, 1, 0] },
  { name: "ring", base: [BASE_Y, SIDE_Y, BASE_Z], yaw: -0.54, len: LINK_LENGTHS, face: [1, 0, 0] },
];

const STICKER_COLORS = {
  "0,0,1": 0xb9b5ab, // a greyish white, so the highlight shows clearly on it
  "0,0,-1": 0xe9c46a,
  "0,-1,0": 0x45a57d,
  "0,1,0": 0x4079b5,
  "1,0,0": 0xcf4f5c,
  "-1,0,0": 0xec8b43,
};

// ---------------------------------------------------------------------------
// Kinematics (plain arrays, no three.js)

function chain(f, q, frames) {
  const yaw = f.yaw + q[0];
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const lat = [cy, sy, 0];
  let x = f.base[0];
  let y = f.base[1];
  let z = f.base[2];
  let a = 0;
  for (let i = 0; i < 3; i++) {
    a += q[i + 1];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const fwd = [-sy * ca, cy * ca, sa];
    if (frames) frames[i] = { p: [x, y, z], lat, fwd, up: [sy * sa, -cy * sa, ca] };
    x += fwd[0] * f.len[i];
    y += fwd[1] * f.len[i];
    z += fwd[2] * f.len[i];
  }
  return [x, y, z];
}

// Displacement that moves a sphere of radius ob.r at `p` clear of the obstacle box (centre
// c, unit axes, half size h), or null when it is already clear. Uses the true distance to
// the box, so a point beside an edge is not penalised as if the box had square padding.
function pushOut(p, ob) {
  const d = [p[0] - ob.c[0], p[1] - ob.c[1], p[2] - ob.c[2]];
  const local = ob.axes.map((ax) => d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]);
  const outside = local.map((l) => Math.sign(l) * Math.max(0, Math.abs(l) - ob.h));
  const dist = Math.hypot(...outside);
  let dir;
  let depth;
  if (dist > 1e-6) {
    if (dist >= ob.r) return null;
    dir = outside.map((o) => o / dist);
    depth = ob.r - dist;
  } else {
    // inside the box itself: leave through the nearest face
    let k = 0;
    for (let j = 1; j < 3; j++) if (ob.h - Math.abs(local[j]) < ob.h - Math.abs(local[k])) k = j;
    dir = [0, 0, 0];
    dir[k] = local[k] >= 0 ? 1 : -1;
    depth = ob.h - Math.abs(local[k]) + ob.r;
  }
  const w = [0, 1, 2].map((i) => dir[0] * ob.axes[0][i] + dir[1] * ob.axes[1][i] + dir[2] * ob.axes[2][i]);
  return [w[0] * depth, w[1] * depth, w[2] * depth];
}

const LIMITS = [
  [-1.2, 1.2],
  [0, 2.2],
  [0, 2.3],
  [0, 2.0],
];
const DISTAL_SAMPLES = 180;
const AIR_ABDUCT_RATE = 0.07; // radians per frame, while a finger is well clear between contacts
const LIMIT_MARGIN = 0.3; // poses are kept this far off the joint limits where possible
const A3_EASE = 0.2; // how far each frame the free distal angle moves towards its optimum
// collision test points along each link, about 0.4 apart (the distal stops short of the tip,
// which is meant to touch)
const linkSamples = (len, upTo) => Array.from({ length: Math.ceil((len * upTo) / 0.4) }, (_, k) => Math.min(upTo, ((k + 1) * 0.4) / len));
for (const f of FINGERS) f.samples = f.len.map((len, i) => linkSamples(len, i < 2 ? 1 : 0.64));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Inverse kinematics for one digit. Abduction is solved exactly (the curl plane must contain
// the target); within the plane the distal link's angle is sampled and the other two
// flexions solved in closed form. Among poses inside the joint limits, pick the one that
// intrudes least into the cube, then moves least from the previous frame, then is closest
// to a natural curl. Sampling rather than iterating means it can't get stuck against the
// Inverse kinematics for one digit. Abduction is solved exactly (the curl plane must contain
// the target); within the plane, the angle a3 of the distal link is the one free choice, and
// the other two flexions follow in closed form. The choice minimises intrusion into the
// cube, then movement from the last frame, then distance from a natural curl: a coarse scan
// finds the best region (so it can't get stuck against the cube) and a golden-section search
// refines it continuously (so the pose doesn't hop between scan steps). With `state`, the
// chosen a3 also eases towards the optimum rather than snapping to it, which keeps the
// redundant freedom from flickering while the tip still lands exactly on its target.
// Returns the intrusion depth of the chosen pose.
function solveFinger(f, q, target, obstacle, state) {
  const [bx, by, bz] = f.base;
  const rx = target[0] - bx;
  const ry = target[1] - by;
  if (Math.hypot(rx, ry) > 1e-3) {
    // the curl plane points either away from the target (tip curled back) or towards it
    const back = wrap(Math.atan2(rx, -ry) - f.yaw);
    const out = wrap(back + Math.PI);
    const inside = [back, out].filter((a) => a >= LIMITS[0][0] && a <= LIMITS[0][1]);
    const pick = inside.length ? inside : [back];
    let q0 = pick.reduce((a, c) => (Math.abs(c - q[0]) < Math.abs(a - q[0]) ? c : a));
    q0 = Math.min(LIMITS[0][1], Math.max(LIMITS[0][0], q0));
    // With the target nearly above the base, the curl plane's direction is ill-defined and
    // would swing wildly; hold it, handing over to the computed direction as the target
    // moves away from above the base.
    const settle = clamp01((Math.hypot(rx, ry) - 0.3) / 1.2);
    let dq0 = (q0 - q[0]) * settle;
    // in the air between contacts, turn the finger sideways at a steady pace rather than
    // flicking it (a little lag doesn't matter until it touches down); the limit relaxes as
    // the tip comes back in, so any lag is made up on the approach rather than at touchdown
    if (state && state.free) {
      const rate = AIR_ABDUCT_RATE / Math.max(state.air, 0.2);
      dq0 = Math.max(-rate, Math.min(rate, dq0));
    }
    q[0] += dq0;
  }
  const yaw = f.yaw + q[0];
  const dx = -Math.sin(yaw);
  const dy = Math.cos(yaw);
  const ut = rx * dx + ry * dy;
  const vt = target[2] - bz;
  const [L1, L2, L3] = f.len;
  const point = (u, v) => [bx + dx * u, by + dy * u, bz + v];
  const evaluate = (a3) => {
    const wu = ut - L3 * Math.cos(a3);
    const wv = vt - L3 * Math.sin(a3);
    const c2 = (wu * wu + wv * wv - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    if (c2 < -1 || c2 > 1) return null;
    const q2 = Math.acos(c2);
    const q1 = wrap(Math.atan2(wv, wu) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)));
    const q3 = wrap(a3 - q1 - q2);
    const cand = [q[0], q1, q2, q3];
    for (let j = 1; j < 4; j++) if (cand[j] < LIMITS[j][0] || cand[j] > LIMITS[j][1]) return null;
    let pen = 0;
    if (obstacle) {
      let u = 0;
      let v = 0;
      let a = 0;
      for (let i = 0; i < 3; i++) {
        a += cand[i + 1];
        const cu = Math.cos(a);
        const cv = Math.sin(a);
        for (const t of f.samples[i]) {
          const d = pushOut(point(u + cu * f.len[i] * t, v + cv * f.len[i] * t), obstacle);
          if (d) pen += Math.hypot(d[0], d[1], d[2]);
        }
        u += cu * f.len[i];
        v += cv * f.len[i];
      }
    }
    let move = 0;
    let rest = 0;
    let edge = 0; // soft penalty for coming within LIMIT_MARGIN of a joint limit
    for (let j = 1; j < 4; j++) {
      move += (cand[j] - q[j]) ** 2;
      rest += (cand[j] - FINGER_POSE[j]) ** 2;
      edge += Math.max(0, LIMIT_MARGIN - (cand[j] - LIMITS[j][0])) ** 2 + Math.max(0, LIMIT_MARGIN - (LIMITS[j][1] - cand[j])) ** 2;
    }
    return { a3, cand, pen, cost: 50 * pen + move + 0.05 * rest + 8 * edge };
  };
  let best = null;
  const step = (2 * Math.PI) / DISTAL_SAMPLES;
  for (let s = 0; s < DISTAL_SAMPLES; s++) {
    const r = evaluate(-Math.PI + step * s);
    if (r && (!best || r.cost < best.cost)) best = r;
  }
  if (!best) return Infinity;
  // golden-section refinement around the best sample
  let lo = best.a3 - step;
  let hi = best.a3 + step;
  const costAt = (a) => evaluate(a)?.cost ?? Infinity;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = costAt(x1);
  let f2 = costAt(x2);
  for (let it = 0; it < 14; it++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = costAt(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = costAt(x2);
    }
  }
  const fine = evaluate((lo + hi) / 2);
  if (fine && fine.cost <= best.cost) best = fine;
  // ease the free choice towards the optimum rather than snapping to it
  // (easing faster when the slower pace would dig into the cube)
  const easeTowards = (rate) => {
    const goal = state.a3 + wrap(best.a3 - state.a3) * rate;
    let eased = evaluate(goal);
    if (!eased) {
      // Out of reach (the finger is near full stretch): take the reachable angle closest to
      // the eased one, so the pose slides along the edge of reach instead of snapping.
      const span = wrap(goal - best.a3);
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 20; it++) {
        const mid = (lo + hi) / 2;
        if (evaluate(best.a3 + span * mid)) lo = mid;
        else hi = mid;
      }
      eased = evaluate(best.a3 + span * lo);
    }
    return eased;
  };
  if (state && state.a3 !== undefined) {
    let eased = easeTowards(A3_EASE);
    if (eased && eased.pen > best.pen + 0.3) eased = easeTowards(0.35);
    if (eased) best = eased;
  }
  if (state) state.a3 = best.a3;
  for (let j = 1; j < 4; j++) q[j] = best.cand[j];
  return best.pen;
}

// Lines worth drawing for a mesh: creases and open boundaries always, plus its silhouette.
// Indexed meshes carry smooth vertex normals, so their silhouette is traced per frame as the
// curve where the interpolated normal turns side-on to the camera (`contour`), which runs
// cleanly across the finely tessellated surface; other meshes pick silhouette edges.
// Coplanar triangulation edges are dropped.
function buildEdges(geo) {
  const pos = geo.attributes.position;
  if (geo.userData.noCreases) {
    // smooth by design (any lines it needs are drawn explicitly): outline only
    const none = new Float32Array(0);
    return { a: none, b: none, n1: none, n2: none, smooth: new Uint8Array(0), count: 0, contour: { p: pos.array, n: geo.attributes.normal.array, idx: geo.userData.contourIndex || geo.index.array } };
  }
  const index = geo.index;
  const ids = new Int32Array(pos.count);
  const verts = [];
  const lookup = new Map();
  for (let i = 0; i < pos.count; i++) {
    // rounded integers, so -0.0004 and 0.0001 (a seam's two copies) share a key
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    if (!lookup.has(key)) {
      lookup.set(key, verts.length);
      verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
    ids[i] = lookup.get(key);
  }
  const edges = new Map();
  const triCount = (index ? index.count : pos.count) / 3;
  for (let t = 0; t < triCount; t++) {
    const tri = [0, 1, 2].map((k) => ids[index ? index.getX(3 * t + k) : 3 * t + k]);
    const [a, b, c] = tri.map((i) => verts[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]);
    if (len < 1e-9) continue;
    nrm[0] /= len;
    nrm[1] /= len;
    nrm[2] /= len;
    for (let k = 0; k < 3; k++) {
      const i = tri[k];
      const j = tri[(k + 1) % 3];
      if (i === j) continue;
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      const edge = edges.get(key);
      if (!edge) edges.set(key, { i, j, n1: nrm, n2: null });
      else if (!edge.n2) edge.n2 = nrm;
    }
  }
  const out = { a: [], b: [], n1: [], n2: [], smooth: [] };
  for (const { i, j, n1, n2 } of edges.values()) {
    let smooth = 0;
    if (n2) {
      const cos = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
      if (cos > 0.9999) continue;
      smooth = cos > CREASE ? 1 : 0;
      if (smooth && index) continue; // traced by the contour instead
    }
    out.a.push(...verts[i]);
    out.b.push(...verts[j]);
    out.n1.push(...n1);
    out.n2.push(...(n2 || n1));
    out.smooth.push(smooth);
  }
  return {
    a: new Float32Array(out.a),
    b: new Float32Array(out.b),
    n1: new Float32Array(out.n1),
    n2: new Float32Array(out.n2),
    smooth: Uint8Array.from(out.smooth),
    count: out.smooth.length,
    contour: index ? { p: pos.array, n: geo.attributes.normal.array, idx: geo.userData.contourIndex || index.array } : null,
  };
}

// ---------------------------------------------------------------------------

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

async function mountHandCube(canvas, hint) {
  const THREE = await import(THREE_URL);
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 30, 95);
  camera.up.set(0, 0, 1);
  // A low, flat three-quarter view (38 degrees round from the front, 24 degrees up): the
  // drawing comes out about 1.4 times wider than tall, and both clickable faces stay large.
  const camDir = new THREE.Vector3(-0.562, -0.72, 0.407).normalize();
  const lookAt = new THREE.Vector3(0, 0, 2.8);
  camera.position.copy(lookAt).addScaledVector(camDir, 60);
  camera.lookAt(lookAt);

  // -------------------------------------------------------------------------
  // Materials. Nothing is lit: parts are filled with the page background, so they hide
  // whatever is behind them, and the outlines carry the shape.

  // The fill is pushed back in depth, most where it is seen edge-on, so outlines (which sit
  // right where a surface turns away) are drawn at full width rather than half-hidden by
  // the fill curving towards the camera just inside them.
  const fillMaterial = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const bodyMaterial = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

  // Screen-space lines of constant pixel width: each segment is an instanced quad.
  const lineMaterial = (overlay) =>
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color() },
        opacity: { value: 1 },
        resolution: { value: new THREE.Vector2(1, 1) },
        linewidth: { value: LINE_PX },
      },
      vertexShader: `
        uniform vec2 resolution;
        uniform float linewidth;
        attribute vec3 instanceStart;
        attribute vec3 instanceEnd;
        void main() {
          vec4 a = projectionMatrix * viewMatrix * vec4(instanceStart, 1.0);
          vec4 b = projectionMatrix * viewMatrix * vec4(instanceEnd, 1.0);
          vec2 dir = (b.xy - a.xy) * resolution;
          float len = length(dir);
          dir = len > 1e-6 ? dir / len : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          vec4 p = mix(a, b, position.x);
          // square caps close the joints between consecutive segments
          vec2 offset = (nrm * position.y + dir * (position.x * 2.0 - 1.0)) * linewidth * 0.5;
          p.xy += offset / resolution * 2.0;
          p.z -= 0.001;
          gl_Position = p;
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        void main() {
          gl_FragColor = vec4(color, opacity);
          #include <colorspace_fragment>
        }`,
      transparent: overlay,
      depthTest: !overlay,
      depthWrite: !overlay,
    });
  const makeLines = (capacity, material) => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const data = new Float32Array(capacity * 6);
    const buffer = new THREE.InstancedInterleavedBuffer(data, 6, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("instanceStart", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geo.setAttribute("instanceEnd", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
      mesh,
      data,
      capacity,
      commit(n) {
        geo.instanceCount = n;
        buffer.needsUpdate = true;
      },
    };
  };
  const edgeLines = makeLines(12000, lineMaterial(false));
  const guideLines = makeLines(200, lineMaterial(true));
  guideLines.mesh.renderOrder = 10;
  // the axis of rotation shown with each preview arrow, and its label
  const axisLines = makeLines(1, lineMaterial(true));
  axisLines.mesh.renderOrder = 10;
  const labelLines = makeLines(8, lineMaterial(true));
  labelLines.mesh.renderOrder = 10;

  fillMaterial.color.setHex(HAND_FILL);
  edgeLines.mesh.material.uniforms.color.value.setHex(INK);
  bodyMaterial.color.setHex(INK);
  const colorProbe = document.createElement("canvas").getContext("2d");
  const applyTheme = () => {
    const css = getComputedStyle(document.documentElement);
    // The theme's colours can be fractional rgb() values, which three.js does not parse, so
    // let the canvas normalise them to hex first.
    const read = (name, fallback) => {
      colorProbe.fillStyle = fallback;
      colorProbe.fillStyle = css.getPropertyValue(name).trim() || fallback;
      return new THREE.Color(colorProbe.fillStyle);
    };
    // only the roll preview follows the page's accent; the drawing itself is fixed
    guideLines.mesh.material.uniforms.color.value.copy(read("--global-theme-color", "#2698ba"));
    arrowHead.material.color.copy(guideLines.mesh.material.uniforms.color.value);
    axisLines.mesh.material.uniforms.color.value.copy(guideLines.mesh.material.uniforms.color.value);
    labelLines.mesh.material.uniforms.color.value.copy(guideLines.mesh.material.uniforms.color.value);
    requestRender();
  };

  // -------------------------------------------------------------------------
  // Geometry: rounded-rectangle prisms, cylinders and domes.

  const lineParts = [];
  const edgeCache = new WeakMap();
  const part = (geo, parent, material = fillMaterial) => {
    const mesh = new THREE.Mesh(geo, material);
    if (!edgeCache.has(geo)) edgeCache.set(geo, buildEdges(geo));
    mesh.userData.edges = edgeCache.get(geo);
    mesh.userData.extra = geo.userData.extra || null;
    lineParts.push(mesh);
    parent.add(mesh);
    return mesh;
  };

  const roundedRect = (w, h, r) => {
    const x = w / 2;
    const y = h / 2;
    const s = new THREE.Shape();
    s.moveTo(-x + r, -y);
    s.lineTo(x - r, -y);
    s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r);
    s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y);
    s.quadraticCurveTo(-x, y, -x, y - r);
    s.lineTo(-x, -y + r);
    s.quadraticCurveTo(-x, -y, -x + r, -y);
    return s;
  };
  // Slab with a rounded-square plan (side w, corner radius r) and rounded top and bottom
  // edges (radius b), height h, centred on the origin. Every rounded edge carries a line
  // down its middle: loops round the top and bottom, and one down each corner.
  const slab = (w, h, r, b) => {
    const depth = h - 2 * b;
    const geo = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, w - 2 * b, r - b), {
      depth,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 6,
      curveSegments: 10,
    }).translate(0, 0, -depth / 2);
    const extra = [];
    const c = w / 2 - r; // corner centres sit at (+-c, +-c)
    const plan = (radius) => {
      const pts = [];
      [
        [c, c],
        [-c, c],
        [-c, -c],
        [c, -c],
      ].forEach(([x0, y0], k) => {
        for (let i = 0; i <= 10; i++) {
          const a = ((k + i / 10) * Math.PI) / 2;
          pts.push([x0 + radius * Math.cos(a), y0 + radius * Math.sin(a), Math.cos(a), Math.sin(a)]);
        }
      });
      return pts;
    };
    const mid = Math.SQRT1_2;
    const loop = plan(r - b + b * mid);
    for (const side of [1, -1]) {
      const z = side * (depth / 2 + b * mid);
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length];
        extra.push(p[0], p[1], z, q[0], q[1], z, p[2] * mid, p[3] * mid, side * mid);
      });
    }
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const x = sx * (c + r * mid);
      const y = sy * (c + r * mid);
      extra.push(x, y, -depth / 2, x, y, depth / 2, sx * mid, sy * mid, 0);
    }
    const merged = weld(geo);
    merged.userData.extra = new Float32Array(extra);
    return merged;
  };
  // Share vertices at equal positions and give the mesh smooth normals (the slab has no hard
  // edges, so its outline can be traced like the fingers').
  const weld = (geo) => {
    const src = geo.attributes.position;
    const lookup = new Map();
    const pos = [];
    const index = [];
    for (let i = 0; i < src.count; i++) {
      const key = `${Math.round(src.getX(i) * 1000)},${Math.round(src.getY(i) * 1000)},${Math.round(src.getZ(i) * 1000)}`;
      if (!lookup.has(key)) {
        lookup.set(key, pos.length / 3);
        pos.push(src.getX(i), src.getY(i), src.getZ(i));
      }
      index.push(lookup.get(key));
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setIndex(index);
    out.computeVertexNormals();
    return out;
  };

  // Palm: a rounded square slab a little wider than the cube, on a smaller mounting block.
  const palm = part(slab(PALM, PALM_T, 2.0, 0.45), scene);
  palm.position.z = -PALM_T / 2;
  const mount = part(slab(PALM - 1.6, 1.4, 1.6, 0.4), scene);
  mount.position.z = -PALM_T - 0.7;

  // Fingers.
  // Each link is one piece, swept along +y as rounded-rectangle cross-sections. It is slim
  // at the hinges, rounded about each hinge axis into a knuckle (the distal link ends in the
  // fingertip dome, whose end sits TIP_R beyond the contact point), and swells sharply in the middle: short steep ramps with hard,
  // outlined edges out to a flat wide middle, like a servo body between brackets.
  // At a hinge the link arriving is the larger one; the link leaving starts a little
  // smaller so it stays tucked behind the arriving knuckle.
  const BAR_W = 0.7;
  const BAR_T = 0.36; // half-thickness at the hinges, which is also each knuckle's radius
  const MID_W = (LINK_W / 2) * 1.05;
  const MID_T = LINK_T / 2;
  const TUCK = 0.9; // the leaving link's size relative to the arriving one
  const KNUCKLE = 1.12; // the arriving link's rounded end, relative to the slim section
  const RAMP = 0.28; // length of each steep ramp into the swell
  // Width and height of each link's swell, relative to MID_W and MID_T (both scale together):
  // the middle link is 5% smaller than the fingertip, the base link 10% smaller again.
  const TIP_SCALE = 0.99;
  const LINK_SCALE = [TIP_SCALE * 0.95 * 0.9, TIP_SCALE * 0.95, TIP_SCALE];
  const CORNER = 0.45;
  const CAP_STEPS = 10;
  const ARC = 8; // steps per rounded corner of the cross-section
  const cap = (y0, dir, len, dome, hw, ht) =>
    Array.from({ length: CAP_STEPS }, (_, k) => {
      const t = (((k + 1) / CAP_STEPS) * Math.PI) / 2;
      const c = Math.max(Math.cos(t), 0.03);
      return { y: y0 + dir * len * Math.sin(t), hw: dome ? hw * c : hw, ht: ht * c };
    });
  // Rings are {y, hw, ht, corner?, line?}; bands between two rings flagged `line` get a
  // line down the middle of each rounded edge. Repeating a ring gives a hard edge there.
  const sweep = (rings) => {
    const pos = [];
    for (const { y, hw, ht, corner = CORNER } of rings) {
      const r = Math.min(corner, hw, ht) * 0.999;
      [
        [hw - r, ht - r],
        [-(hw - r), ht - r],
        [-(hw - r), -(ht - r)],
        [hw - r, -(ht - r)],
      ].forEach(([x0, z0], k) => {
        for (let i = 0; i <= ARC; i++) {
          const a = ((k + i / ARC) * Math.PI) / 2;
          pos.push(x0 + r * Math.cos(a), y, z0 + r * Math.sin(a));
        }
      });
    }
    const m = 4 * (ARC + 1);
    const index = [];
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < m; i++) {
        const a = k * m + i;
        const b = k * m + ((i + 1) % m);
        index.push(a, b + m, b, a, a + m, b + m);
      }
    }
    // close both ends
    const first = pos.length / 3;
    pos.push(0, rings[0].y, 0);
    const lastRing = (rings.length - 1) * m;
    const last = first + 1;
    pos.push(0, rings[rings.length - 1].y, 0);
    for (let i = 0; i < m; i++) {
      index.push(first, i, (i + 1) % m);
      index.push(last, lastRing + ((i + 1) % m), lastRing + i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    // Trace the outline everywhere except the razor-thin last band at each end and the
    // triangles closing it, whose normals are unreliable and would leave specks.
    const bands = rings.length - 1;
    geo.userData.contourIndex = Uint32Array.from(index.slice(6 * m, 6 * m * (bands - 1)));
    geo.userData.noCreases = true;
    const nrm = geo.attributes.normal.array;
    const extra = [];
    for (let k = 0; k < rings.length - 1; k++) {
      if (!rings[k].line || !rings[k + 1].line || rings[k].y === rings[k + 1].y) continue;
      for (let c = 0; c < 4; c++) {
        const a = 3 * (k * m + c * (ARC + 1) + ARC / 2);
        const b = a + 3 * m;
        const n = [0, 1, 2].map((j) => (nrm[a + j] + nrm[b + j]) / 2);
        extra.push(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], ...n);
      }
    }
    // rings flagged `loop` are outlined all the way round (a zero normal means "always")
    rings.forEach((r, k) => {
      if (!r.loop) return;
      for (let i = 0; i < m; i++) {
        const a = 3 * (k * m + i);
        const b = 3 * (k * m + ((i + 1) % m));
        extra.push(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], 0, 0, 0);
      }
    });
    geo.userData.extra = new Float32Array(extra);
    return geo;
  };

  const DOME = 1.3;
  const tipStart = (len) => len + TIP_R - DOME;
  // Each swell runs to within SWELL_GAP of the hinges at either end; the fingertip's runs
  // on into the tip.
  const SWELL_GAP = 0.2;
  const swellSpan = (f, i) => {
    const len = f.len[i];
    return [SWELL_GAP, i === 2 ? tipStart(len) : len - SWELL_GAP];
  };
  // cross-section half sizes along link i of finger f
  const linkAt = (f, i, y) => {
    const len = f.len[i];
    const lerp = (a, b, t) => a + (b - a) * clamp01(t);
    let hw = lerp(i === 0 ? BAR_W : BAR_W * TUCK, BAR_W, y / 0.4);
    let ht = lerp(i === 0 ? BAR_T : BAR_T * TUCK, BAR_T, y / 0.4);
    if (i < 2) ht = lerp(ht, BAR_T * KNUCKLE, (y - (len - 0.6)) / 0.6);
    const [s0, s1] = swellSpan(f, i);
    const k = Math.min(clamp01((y - s0) / RAMP), i === 2 ? 1 : clamp01((s1 - y) / RAMP));
    const grow = LINK_SCALE[i];
    return { hw: lerp(hw, MID_W * grow, k), ht: lerp(ht, MID_T * grow, k) };
  };
  const linkGeo = (f, i) => {
    const len = f.len[i];
    const endY = i === 2 ? tipStart(len) : len;
    const [s0, s1] = swellSpan(f, i);
    const kinks = i === 2 ? [s0, s0 + RAMP] : [s0, s0 + RAMP, s1 - RAMP, s1];
    const ys = new Set(kinks);
    for (let y = 0; y < endY; y += 0.12) ys.add(Math.round(y * 1000) / 1000);
    ys.add(endY);
    const rings = [];
    // edge lines along the swell (and on the distal link, on over the fingertip)
    const lined = (y) => y >= s0 - 1e-6 && (i === 2 || y <= s1 + 1e-6);
    for (const y of [...ys].sort((a, b) => a - b)) {
      const ring = { y, ...linkAt(f, i, y), line: lined(y) };
      if (kinks.includes(y)) {
        // a hard edge at each kink of the swell, outlined all the way round
        rings.push({ ...ring, loop: true }, { ...ring });
      } else {
        rings.push(ring);
      }
    }
    const s = rings[0];
    // the base link starts in a dome tucked inside the ball joint
    const start = i === 0 ? cap(0, -1, BALL_R * 0.8, true, s.hw, s.ht) : cap(0, -1, s.ht, false, s.hw, s.ht);
    const e = rings[rings.length - 1];
    const end = i === 2 ? cap(endY, 1, DOME, true, e.hw, e.ht).map((r) => ({ ...r, line: true })) : cap(endY, 1, e.ht, false, e.hw, e.ht);
    return sweep([...start.reverse(), ...rings, ...end]);
  };
  // servo horns: a small disc on each side of every hinge, on the hinge axis at the middle
  // of the finger's thickness
  // (flat discs: a thin cylinder's short sides would draw as specks beside each circle)
  const hornGeo = [-1, 1].map((side) => new THREE.CircleGeometry(0.28, 28).rotateY((side * Math.PI) / 2));
  // the base joint is a ball the same radius as the other joints' knuckles
  const BALL_R = BAR_T * KNUCKLE;
  const ballGeo = new THREE.SphereGeometry(BALL_R, 28, 18);

  const hands = FINGERS.map((f) => {
    const links = f.len.map((len, i) => {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      // the base joint is a ball; the others are hinges with a horn disc on each side
      if (i === 0) part(ballGeo, g);
      else [-1, 1].forEach((side, k) => (part(hornGeo[k], g).position.x = side * (BAR_W + 0.01)));
      part(linkGeo(f, i), g);
      scene.add(g);
      return g;
    });

    const restTarget = V(REST_CENTER).addScaledVector(V(f.face), HALF + TIP_R);
    const q = FINGER_POSE.slice();
    solveFinger(f, q, restTarget.toArray(), null);
    return {
      f,
      links,
      q,
      faceDir: V(f.face),
      target: restTarget.clone(),
      normal: V(f.face),
      local: null, // contact on the cube in cube coordinates while pushing
    };
  });

  // Rubik's cube: flat stickers on a body in the outline ink, which reads as the grid.
  const cube = new THREE.Group();
  cube.position.set(...REST_CENTER);
  // start with white on top and red and blue facing the viewer
  cube.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  scene.add(cube);
  cube.add(new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), bodyMaterial));
  const stickerShape = new THREE.ShapeGeometry(roundedRect((CUBE / 3) * 0.84, (CUBE / 3) * 0.84, 0.28), 4);
  const faceMats = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const [k, color] of Object.entries(STICKER_COLORS)) {
    const n = V(k.split(",").map(Number));
    const m = new THREE.MeshBasicMaterial({ color });
    m.userData.normal = n;
    m.userData.base = new THREE.Color(color);
    faceMats.push(m);
    const u = Math.abs(n.z) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const v = new THREE.Vector3().crossVectors(n, u);
    const quat = new THREE.Quaternion().setFromUnitVectors(zAxis, n);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const st = new THREE.Mesh(stickerShape, m);
        st.quaternion.copy(quat);
        st.position
          .copy(n)
          .multiplyScalar(HALF + 0.02)
          .addScaledVector(u, (i * CUBE) / 3)
          .addScaledVector(v, (j * CUBE) / 3);
        cube.add(st);
      }
    }
  }

  const rotation = new THREE.Matrix4();
  const obstacle = { c: [0, 0, 0], axes: [[], [], []], h: HALF, r: LINK_R };
  const frames = [];
  const basis = new THREE.Matrix4();
  const updateFingers = () => {
    rotation.makeRotationFromQuaternion(cube.quaternion);
    const e = rotation.elements;
    obstacle.c = cube.position.toArray();
    obstacle.axes = [
      [e[0], e[1], e[2]],
      [e[4], e[5], e[6]],
      [e[8], e[9], e[10]],
    ];
    for (const h of hands) {
      // Between contacts the tip is only passing through a waypoint, so if the links can't
      // reach it without touching the cube, draw it back towards the finger's base (which
      // keeps it in the finger's plane). The detour eases in and out rather than stepping,
      // and scales with how far into the regrasp the finger is, so it has gone by touchdown
      // even when the grip itself leaves a link against the cube. It stops short of the
      // base, past which the curl plane would flip round. When no detour clears the links (a
      // corner of the spinning cube swinging past the base), take the one that intrudes
      // least, and never one that drags the tip itself into the cube.
      const away = V(h.f.base).sub(h.target).setZ(0);
      const room = Math.max(0, away.length() - 1.0);
      away.normalize();
      // While a spinning finger opens out of the way (see sweepPose), the inverse kinematics
      // keeps its own pose, so the blend shown never feeds back into it; as the finger starts
      // to close in on its second grip, it is solved afresh for it, starting from the open pose.
      if (h.opening > 0 && !h.qIK) h.qIK = h.q.slice();
      if (!(h.opening > 0)) h.qIK = null;
      const q = h.qIK || h.q;
      if (h.reseed) {
        for (let j = 0; j < 4; j++) q[j] = h.openPose[j];
        for (let k = 0; k < 6; k++) solveFinger(h.f, q, h.target.toArray(), obstacle);
        h.a3 = undefined;
        h.reseed = false;
      }
      let needed = 0;
      if (h.free) {
        let least = Infinity;
        for (let k = 0; k <= 8 && 0.3 * k <= room; k++) {
          const trial = h.target.clone().addScaledVector(away, 0.3 * k).toArray();
          if (k > 0 && pushOut(trial, { ...obstacle, r: TIP_R })) break;
          const intrusion = solveFinger(h.f, q.slice(), trial, obstacle);
          if (intrusion < least - 0.05) {
            least = intrusion;
            needed = 0.3 * k;
          }
          if (intrusion <= 0) break;
        }
      }
      const goal = h.free ? needed * h.air : 0;
      h.detour = (h.detour || 0) + (goal - (h.detour || 0)) * 0.3;
      solveFinger(h.f, q, h.target.clone().addScaledVector(away, h.detour).toArray(), obstacle, h);
      // opening out of the way during a spin: blend the joints towards the open pose
      if (h.qIK) for (let j = 0; j < 4; j++) h.q[j] = q[j] + (h.openPose[j] - q[j]) * h.opening;
      chain(h.f, h.q, frames);
      frames.forEach((fr, i) => {
        basis.makeBasis(V(fr.lat), V(fr.fwd), V(fr.up)).setPosition(fr.p[0], fr.p[1], fr.p[2]);
        h.links[i].matrix.copy(basis);
        h.links[i].matrixWorldNeedsUpdate = true;
      });
    }
  };

  // Light from above and in front, near the viewer. Shadows are flat and hard-edged, in the
  // ink colour: the cube's falls on the palm, and each fingertip's on the cube face it points
  // at, so the gaps between surfaces that touch (or are about to) read clearly.
  const LIGHT = new THREE.Vector3(camDir.x * 0.7, camDir.y * 0.7, 1).normalize();
  const SHADOW_ALPHA = 0.35; // the same darkness on the palm and on the cube
  const shadowMaterial = () => new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: SHADOW_ALPHA, depthWrite: false });
  const MAX_HULL = 16;
  const cubeShadowGeo = new THREE.BufferGeometry();
  cubeShadowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_HULL * 3), 3));
  cubeShadowGeo.setIndex(Array.from({ length: MAX_HULL - 2 }, (_, i) => [0, i + 1, i + 2]).flat());
  const cubeShadow = new THREE.Mesh(cubeShadowGeo, shadowMaterial());
  cubeShadow.frustumCulled = false;
  cubeShadow.renderOrder = 2;
  scene.add(cubeShadow);
  const tipShadowGeo = new THREE.CircleGeometry(1, 32);
  const tipShadows = hands.map(() => {
    const m = new THREE.Mesh(tipShadowGeo, shadowMaterial());
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    m.raycast = () => {};
    cube.add(m);
    return m;
  });

  // convex hull (counter-clockwise) of 2D points, and clipping of a polygon to |x|, |y| <= lim
  const hull = (pts) => {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return half(pts).concat(half(pts.slice().reverse()));
  };
  const clipSquare = (poly, lim) => {
    for (const [axis, sign] of [
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
    ]) {
      const inside = (p) => sign * p[axis] <= lim;
      const out = [];
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        if (inside(p)) out.push(p);
        if (inside(p) !== inside(q)) {
          const t = (sign * lim - p[axis]) / (q[axis] - p[axis]);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      });
      poly = out;
    }
    return poly;
  };

  const corner = new THREE.Vector3();
  const updateShadow = () => {
    // the cube's outline, projected along the light onto the palm and trimmed to it
    cube.updateMatrixWorld();
    const pts = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corner.set(sx * HALF, sy * HALF, sz * HALF).applyMatrix4(cube.matrixWorld);
          const t = corner.z / LIGHT.z;
          pts.push([corner.x - LIGHT.x * t, corner.y - LIGHT.y * t]);
        }
      }
    }
    const poly = clipSquare(hull(pts), PALM / 2).slice(0, MAX_HULL);
    const arr = cubeShadowGeo.attributes.position.array;
    poly.forEach(([x, y], i) => arr.set([x, y, 0.015], i * 3));
    cubeShadowGeo.attributes.position.needsUpdate = true;
    cubeShadowGeo.setDrawRange(0, Math.max(0, poly.length - 2) * 3);

    // each fingertip's shadow: follow the light from the tip to the face of the cube it hits
    const inv = cube.quaternion.clone().invert();
    const ray = LIGHT.clone().negate().applyQuaternion(inv);
    hands.forEach((h, k) => {
      const m = tipShadows[k];
      const o = V(chain(h.f, h.q)).sub(cube.position).applyQuaternion(inv);
      let near = -Infinity;
      let far = Infinity;
      let axis = 0;
      for (let a = 0; a < 3; a++) {
        const oa = o.getComponent(a);
        const da = ray.getComponent(a);
        if (Math.abs(da) < 1e-9) {
          if (Math.abs(oa) > HALF) far = -Infinity;
          continue;
        }
        let t1 = (-HALF - oa) / da;
        let t2 = (HALF - oa) / da;
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > near) {
          near = t1;
          axis = a;
        }
        far = Math.min(far, t2);
      }
      const fade = 1 - clamp01((near - TIP_R) / 3);
      m.visible = near > 0 && near <= far && fade > 0;
      if (!m.visible) return;
      const n = new THREE.Vector3().setComponent(axis, o.getComponent(axis) > 0 ? 1 : -1);
      const hit = o.clone().addScaledVector(ray, near).addScaledVector(n, 0.035);
      // a sphere's shadow on a plane: a circle stretched along the light's slant
      const slant = Math.max(Math.abs(ray.dot(n)), 0.35);
      const along = ray.clone().addScaledVector(n, -ray.dot(n));
      if (along.lengthSq() < 1e-8) along.set(n.y, n.z, n.x);
      along.normalize();
      const side = new THREE.Vector3().crossVectors(n, along);
      const r = TIP_R * 0.9;
      m.matrix.makeBasis(along.multiplyScalar(r / slant), side.multiplyScalar(r), n).setPosition(hit);
      m.matrixWorldNeedsUpdate = true;
      m.material.opacity = SHADOW_ALPHA * fade;
    });
  };

  // Collect creases, boundaries and silhouettes of every part into the line buffer.
  const collectLines = () => {
    scene.updateMatrixWorld();
    const out = edgeLines.data;
    let n = 0;
    const emit = (w, ax, ay, az, bx, by, bz) => {
      if (n >= edgeLines.capacity) return;
      const o = n * 6;
      out[o] = w[0] * ax + w[4] * ay + w[8] * az + w[12];
      out[o + 1] = w[1] * ax + w[5] * ay + w[9] * az + w[13];
      out[o + 2] = w[2] * ax + w[6] * ay + w[10] * az + w[14];
      out[o + 3] = w[0] * bx + w[4] * by + w[8] * bz + w[12];
      out[o + 4] = w[1] * bx + w[5] * by + w[9] * bz + w[13];
      out[o + 5] = w[2] * bx + w[6] * by + w[10] * bz + w[14];
      n++;
    };
    for (const mesh of lineParts) {
      const ed = mesh.userData.edges;
      const w = mesh.matrixWorld.elements;
      // view direction in the mesh's local frame
      const vx = w[0] * camDir.x + w[1] * camDir.y + w[2] * camDir.z;
      const vy = w[4] * camDir.x + w[5] * camDir.y + w[6] * camDir.z;
      const vz = w[8] * camDir.x + w[9] * camDir.y + w[10] * camDir.z;
      for (let i = 0; i < ed.count && n < edgeLines.capacity; i++) {
        const i3 = i * 3;
        if (ed.smooth[i]) {
          const s1 = ed.n1[i3] * vx + ed.n1[i3 + 1] * vy + ed.n1[i3 + 2] * vz;
          const s2 = ed.n2[i3] * vx + ed.n2[i3 + 1] * vy + ed.n2[i3 + 2] * vz;
          if (s1 * s2 > 0) continue;
        }
        emit(w, ed.a[i3], ed.a[i3 + 1], ed.a[i3 + 2], ed.b[i3], ed.b[i3 + 1], ed.b[i3 + 2]);
      }
      // centre lines of rounded edges, drawn only while the edge faces the viewer (side-on,
      // they would double up with the outline)
      const x = mesh.userData.extra;
      if (x) {
        for (let i = 0, j = 0; i < x.length; i += 9, j++) {
          const facing = x[i + 6] * vx + x[i + 7] * vy + x[i + 8] * vz;
          if (facing < 0.55 && (x[i + 6] || x[i + 7] || x[i + 8])) continue;
          emit(w, x[i], x[i + 1], x[i + 2], x[i + 3], x[i + 4], x[i + 5]);
        }
      }
      const c = ed.contour;
      if (!c) continue;
      // Silhouette: in each triangle whose vertex normals straddle side-on, join the two
      // points on its edges where the interpolated normal is exactly side-on. Pieces are
      // linked into chains through the mesh edges they cross, and chains shorter than
      // MIN_CHAIN are dropped: they are specks where a flat face is seen almost edge-on.
      const sv = (i) => c.n[3 * i] * vx + c.n[3 * i + 1] * vy + c.n[3 * i + 2] * vz;
      const segs = [];
      const parent = new Map();
      const find = (k) => {
        while (parent.get(k) !== k) {
          parent.set(k, parent.get(parent.get(k)));
          k = parent.get(k);
        }
        return k;
      };
      const join = (a, b) => {
        if (!parent.has(a)) parent.set(a, a);
        if (!parent.has(b)) parent.set(b, b);
        parent.set(find(a), find(b));
      };
      for (let t = 0; t < c.idx.length; t += 3) {
        const ids = [c.idx[t], c.idx[t + 1], c.idx[t + 2]];
        const sd = ids.map(sv);
        if ((sd[0] >= 0) === (sd[1] >= 0) && (sd[1] >= 0) === (sd[2] >= 0)) continue;
        const seg = [];
        const keys = [];
        for (let k = 0; k < 3; k++) {
          const a = ids[k];
          const b = ids[(k + 1) % 3];
          const sa = sd[k];
          const sb = sd[(k + 1) % 3];
          if ((sa >= 0) === (sb >= 0)) continue;
          const f = sa / (sa - sb);
          seg.push(
            c.p[3 * a] + (c.p[3 * b] - c.p[3 * a]) * f,
            c.p[3 * a + 1] + (c.p[3 * b + 1] - c.p[3 * a + 1]) * f,
            c.p[3 * a + 2] + (c.p[3 * b + 2] - c.p[3 * a + 2]) * f
          );
          keys.push(a < b ? a * 1e6 + b : b * 1e6 + a);
        }
        if (seg.length !== 6) continue;
        join(keys[0], keys[1]);
        segs.push({ seg, key: keys[0], len: Math.hypot(seg[3] - seg[0], seg[4] - seg[1], seg[5] - seg[2]) });
      }
      const chainLength = new Map();
      for (const sg of segs) {
        const root = find(sg.key);
        chainLength.set(root, (chainLength.get(root) || 0) + sg.len);
      }
      for (const { seg, key } of segs) {
        if (chainLength.get(find(key)) < MIN_CHAIN) continue;
        emit(w, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
      }
    }
    edgeLines.commit(n);
  };

  // Dashed arc previewing the roll on hover: it arcs well above the cube towards the face
  // that will end up on the palm, ending clear of the cube with an arrowhead.
  const GUIDE_SPAN = [-0.9, 0.62];
  const GUIDE_RADIUS = HALF * 2.0;
  const GUIDE_DASH = 0.12 * GUIDE_RADIUS; // length of each dash, and of each gap
  const guideArc = (f) => {
    const c = V(REST_CENTER).add(new THREE.Vector3(0, 0, 1.0));
    return (a) => c.clone().add(new THREE.Vector3(0, 0, GUIDE_RADIUS * Math.cos(a))).addScaledVector(f, GUIDE_RADIUS * Math.sin(a));
  };
  const arrowHead = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3)),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, transparent: true })
  );
  arrowHead.frustumCulled = false;
  arrowHead.renderOrder = 10;
  arrowHead.visible = false;
  scene.add(arrowHead);
  // A solid arrowhead with the same stroke round its edges, ending the arc `at` at parameter
  // a1, reached travelling in the direction `way` (+1 or -1). It is laid in the plane facing
  // the viewer, so it keeps its full, symmetric shape however steeply the arc turns towards or
  // away from them, and it is aimed along the arc as drawn over its length (not along the
  // arc's direction at the very tip, which can differ where the arc turns sharply as seen).
  // Returns the parameter of its base, where the dashes leading up to it should stop.
  const HEAD = [1.3, 0.425]; // length, and half width
  const arrowheadOn = (at, a1, way, seg) => {
    const end = at(a1);
    const seen = (p) => {
      const v = p.clone().sub(end);
      return v.addScaledVector(camDir, -v.dot(camDir));
    };
    // how far back along the arc its base lies, so that it is HEAD[0] long as seen
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      if (seen(at(a1 - way * mid)).length() < HEAD[0]) lo = mid;
      else hi = mid;
    }
    const aBase = a1 - way * hi;
    const back = seen(at(aBase)).normalize();
    const side = new THREE.Vector3().crossVectors(camDir, back).normalize();
    const base = end.clone().addScaledVector(back, HEAD[0]);
    const left = base.clone().addScaledVector(side, HEAD[1]);
    const right = base.clone().addScaledVector(side, -HEAD[1]);
    seg(left, end);
    seg(right, end);
    seg(left, right);
    arrowHead.geometry.attributes.position.array.set([...left.toArray(), ...end.toArray(), ...right.toArray()]);
    arrowHead.geometry.attributes.position.needsUpdate = true;
    return aBase;
  };
  // The spin preview: a dashed arc round the far side of a level circle above the cube, about
  // as wide on screen as the roll arcs, and centred on screen with its top level with theirs.
  // It heads the way the cube will turn.
  const YAW_RADIUS = HALF * 1.02;
  const YAW_SPAN = [1.25, 1.15]; // how far the arc reaches either side of straight behind, in radians: tail, head
  const yawArc = () => {
    // as seen, "up" and straight back from the viewer along the level
    const upScreen = new THREE.Vector3(0, 0, 1).addScaledVector(camDir, -camDir.z).normalize();
    const back = new THREE.Vector3(-camDir.x, -camDir.y, 0).normalize();
    // the height on screen of the tops of the roll arcs (the two are level, either side of
    // the middle)
    let top = 0;
    for (const f of CLICKABLE) {
      const at = guideArc(V(f));
      let high = -Infinity;
      for (let k = 0; k <= 60; k++) high = Math.max(high, upScreen.dot(at(GUIDE_SPAN[0] + ((GUIDE_SPAN[1] - GUIDE_SPAN[0]) * k) / 60)));
      top += high / CLICKABLE.length;
    }
    // the circle's far point (the top of its arc on screen) is put at that height
    const c = V(REST_CENTER);
    c.z = (top - YAW_RADIUS * upScreen.dot(back) - upScreen.x * c.x - upScreen.y * c.y) / upScreen.z;
    const az0 = Math.atan2(back.y, back.x);
    return {
      centre: c,
      at: (a) => c.clone().add(new THREE.Vector3(Math.cos(az0 + a) * YAW_RADIUS, Math.sin(az0 + a) * YAW_RADIUS, 0)),
    };
  };
  // The ends of the axis drawn with a preview: a short line inside the curve of the arrow, so
  // the arrow wraps round it. For the spin, upright through the centre of the arc's circle,
  // from AXIS_SPIN[0] to AXIS_SPIN[1] above that centre: up through the band the arc covers
  // as seen, and a little past its top. For a roll, level along the axis it turns about,
  // AXIS_HALF either side of a point AXIS_DROP inside the middle of its arc (the arc's own
  // centre is down in the cube), so the arc bends over it and its ends drop below it.
  const AXIS_SPIN = [HALF * 0.1, HALF * 0.75];
  const AXIS_HALF = HALF * 0.36;
  const AXIS_DROP = HALF * 0.38;
  const axisOf = (dir) => {
    if (dir === TOP) {
      const c = yawArc().centre;
      return [c.clone().setZ(c.z + AXIS_SPIN[0]), c.clone().setZ(c.z + AXIS_SPIN[1])];
    }
    const f = V(dir);
    const mid = (GUIDE_SPAN[0] + GUIDE_SPAN[1]) / 2;
    const inward = new THREE.Vector3(0, 0, -Math.cos(mid)).addScaledVector(f, -Math.sin(mid));
    const c = guideArc(f)(mid).addScaledVector(inward, AXIS_DROP);
    const axis = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, -1)).normalize();
    return [c.clone().addScaledVector(axis, -AXIS_HALF), c.clone().addScaledVector(axis, AXIS_HALF)];
  };
  // Lower-case axis letters as strokes in a unit x-height box (y has a descender), drawn
  // facing the viewer like the arrowheads.
  const GLYPHS = {
    x: [
      [-0.5, 0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5, 0.5],
    ],
    y: [
      [-0.5, 0.5, 0, -0.5],
      [0.5, 0.5, -0.25, -1],
    ],
    z: [
      [-0.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5, -0.5],
    ],
  };
  const LABEL_SIZE = HALF * 0.12; // x-height
  const LABEL_GAP = HALF * 0.12; // between the end of the axis and its label
  // Label an axis with its letter (the world axis it lies along is the one it has the largest
  // component of) just past one end, in line with it as seen: past the top of the spin's
  // upright axis, and past the lower end of a roll's, away from the arc bending over it.
  const labelAxis = ([p, q], seg) => {
    const along = q.clone().sub(p);
    const k = [0, 1, 2].reduce((a, b) => (Math.abs(along.getComponent(b)) > Math.abs(along.getComponent(a)) ? b : a));
    const right = new THREE.Vector3(0, 0, 1).cross(camDir).normalize();
    const up = camDir.clone().cross(right);
    const lower = up.dot(p) < up.dot(q) ? p : q;
    const [from, to] = k === 2 ? [p, q] : lower === p ? [q, p] : [p, q];
    const seen = to.clone().sub(from);
    seen.addScaledVector(camDir, -seen.dot(camDir)).normalize();
    // far enough out that the letter's box (about one x-height across) clears the end
    const reach = Math.abs(seen.dot(right)) + Math.abs(seen.dot(up));
    const centre = to.clone().addScaledVector(seen, LABEL_GAP + (LABEL_SIZE * 0.6) / Math.max(reach, 0.7) + LABEL_SIZE * 0.3);
    const at = (x, y) => centre.clone().addScaledVector(right, x * LABEL_SIZE).addScaledVector(up, y * LABEL_SIZE);
    for (const [x0, y0, x1, y1] of GLYPHS["xyz"[k]]) seg(at(x0, y0), at(x1, y1));
  };
  const showGuide = (dir, spin = 0) => {
    let n = 0;
    const seg = (p, q) => {
      guideLines.data.set([p.x, p.y, p.z, q.x, q.y, q.z], n * 6);
      n++;
    };
    if (dir === TOP) {
      const { at } = yawArc();
      // travel from one end of the arc to the other in the direction of turn
      const a0 = -spin * YAW_SPAN[0];
      const aBase = arrowheadOn(at, spin * YAW_SPAN[1], spin, seg);
      const dash = spin * (GUIDE_DASH / YAW_RADIUS);
      for (let t = a0; spin * (aBase - t) > 0.02; t += 2 * dash) {
        const e = spin * (aBase - t - dash) > 0 ? t + dash : aBase;
        for (let k = 0; k < 3; k++) seg(at(t + ((e - t) * k) / 3), at(t + ((e - t) * (k + 1)) / 3));
      }
    } else if (dir) {
      const at = guideArc(V(dir));
      const [a0, a1] = GUIDE_SPAN;
      const aBase = arrowheadOn(at, a1, 1, seg);
      const dash = GUIDE_DASH / GUIDE_RADIUS;
      for (let t = a0; t < aBase - 0.02; t += 2 * dash) {
        const e = Math.min(t + dash, aBase);
        for (let k = 0; k < 3; k++) seg(at(t + ((e - t) * k) / 3), at(t + ((e - t) * (k + 1)) / 3));
      }
    }
    arrowHead.visible = !!dir;
    guideLines.commit(n);
    let nl = 0;
    if (dir) {
      const axis = axisOf(dir);
      axisLines.data.set([...axis[0].toArray(), ...axis[1].toArray()], 0);
      labelAxis(axis, (p, q) => {
        labelLines.data.set([p.x, p.y, p.z, q.x, q.y, q.z], nl * 6);
        nl++;
      });
    }
    axisLines.commit(dir ? 1 : 0);
    labelLines.commit(nl);
    requestRender();
  };

  // Camera framing: fit the rest pose, plus the space the cube sweeps while it rolls (lifted,
  // and half a diagonal wide at 45 degrees).
  const fitPoints = [];
  const bodyPoints = []; // just the hand and the cube at rest, which the hint sits above
  const collectFitPoints = () => {
    scene.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    for (const o of lineParts) {
      bb.setFromObject(o);
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
    }
    bodyPoints.push(...fitPoints);
    for (const x of [-HALF, HALF]) for (const y of [-HALF, HALF]) bodyPoints.push(V(REST_CENTER).add(new THREE.Vector3(x, y, HALF)));
    // the preview arrows: the rolls, and the spin
    for (const dir of CLICKABLE) {
      const at = guideArc(V(dir));
      for (let k = 0; k <= 8; k++) fitPoints.push(at(GUIDE_SPAN[0] + ((GUIDE_SPAN[1] - GUIDE_SPAN[0]) * k) / 8));
    }
    // (either way round)
    const spinArc = yawArc();
    const reachBack = Math.max(...YAW_SPAN);
    for (let k = 0; k <= 12; k++) fitPoints.push(spinArc.at(-reachBack + (2 * reachBack * k) / 12));
    // the axes and their labels
    for (const dir of SELECTABLE) {
      const axis = axisOf(dir);
      fitPoints.push(...axis);
      labelAxis(axis, (p, q) => fitPoints.push(p, q));
    }
    const reach = HALF * Math.SQRT2;
    for (const x of [-reach, reach]) for (const y of [-reach, reach]) fitPoints.push(new THREE.Vector3(x, y, 2 * reach + GAP));
  };
  // Stretch the canvas from the left edge of the page title to the left edge of the first
  // navigation link, so the drawing sits centred between the two. When the links are
  // collapsed into the mobile menu, use the full width of the band.
  const placeCanvas = () => {
    const inner = canvas.parentElement.getBoundingClientRect();
    const title = document.querySelector(".post-title");
    const link = document.querySelector("#navbar .navbar-nav .nav-link");
    let left = title ? title.getBoundingClientRect().left : inner.left;
    let right = inner.right;
    const linkBox = link && link.getBoundingClientRect();
    if (linkBox && linkBox.width > 0 && link.offsetParent) {
      right = linkBox.left + (parseFloat(getComputedStyle(link).paddingLeft) || 0);
    }
    // the skill tags take the space under the links, from the first to the end of the last
    const skills = document.getElementById("hero-skills");
    if (skills) {
      const links = document.querySelector("#navbar .navbar-nav");
      const end = links && links.offsetParent ? Math.min(inner.right, links.getBoundingClientRect().right) : inner.right;
      skills.style.right = `${Math.round(inner.right - end)}px`;
      skills.style.width = `${Math.round(end - right)}px`;
      skills.hidden = right - left < 160;
    }
    if (right - left < 160) {
      left = inner.left;
      right = inner.right;
    }
    canvas.style.left = `${Math.round(left - inner.left)}px`;
    canvas.style.width = `${Math.round(right - left)}px`;
  };
  const fitCamera = () => {
    const w = canvas.clientWidth || 1;
    const hgt = canvas.clientHeight || 1;
    renderer.setSize(w, hgt, false);
    camera.updateMatrixWorld();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of fitPoints) {
      const c = p.clone().applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    const pad = 1.08;
    let halfW = ((maxX - minX) / 2) * pad;
    let halfH = ((maxY - minY) / 2) * pad;
    const cy = (maxY + minY) / 2;
    const aspect = w / hgt;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    // centred in the canvas, which placeCanvas stretches between the title and the nav links
    const cx = (maxX + minX) / 2;
    camera.left = cx - halfW;
    camera.right = cx + halfW;
    camera.top = cy + halfH;
    camera.bottom = cy - halfH;
    camera.updateProjectionMatrix();
    const px = renderer.getPixelRatio();
    for (const [material, width] of [
      [edgeLines.mesh.material, LINE_PX],
      [guideLines.mesh.material, GUIDE_PX],
      [axisLines.mesh.material, AXIS_PX],
      [labelLines.mesh.material, LABEL_PX],
    ]) {
      material.uniforms.resolution.value.set(w * px, hgt * px);
      material.uniforms.linewidth.value = width * px;
    }
    if (hint) {
      // the hint sits centred over the cube, its bottom at the top of the hand and cube
      let top = -Infinity;
      for (const p of bodyPoints) top = Math.max(top, p.clone().applyMatrix4(camera.matrixWorldInverse).y);
      const middle = V(REST_CENTER).applyMatrix4(camera.matrixWorldInverse).x;
      const across = (middle - camera.left) / (camera.right - camera.left);
      hint.style.left = `${canvas.offsetLeft + Math.round(across * w)}px`;
      hint.style.top = `${canvas.offsetTop + Math.round(((camera.top - top) / (camera.top - camera.bottom)) * hgt)}px`;
    }
    requestRender();
  };

  // -------------------------------------------------------------------------
  // Motion planning

  let move = null; // active roll, or null when idle

  // Height of the cube centre that keeps its lowest edge on the palm at roll angle phi.
  const liftFor = (phi) => HALF * (Math.abs(Math.cos(phi)) + Math.abs(Math.sin(phi)));

  // Pick the face a pusher should press, and where, so the normal force produces torque
  // about +omega. Faces tilted below the horizon are skipped, since the fingertip would have
  // to reach under the cube near the palm.
  const pushContact = (h, omega, near, step) => {
    const q = cube.quaternion;
    let best = null;
    // the near pusher favours faces that also point up (the top, by its edge)
    const favour = near ? h.faceDir.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0, 1.1)) : h.faceDir;
    for (const m of faceMats) {
      const n = m.userData.normal.clone().applyQuaternion(q);
      if (n.z < -0.2) continue;
      const score = n.dot(favour);
      if (!best || score > best.score) best = { n, score };
    }
    const t = new THREE.Vector3().crossVectors(omega, best.n);
    const offset = near ? PUSHES[step].near : PUSHES[step].far;
    const contact = best.n.clone().multiplyScalar(HALF).addScaledVector(t, offset);
    const inv = q.clone().invert();
    return { point: contact.applyQuaternion(inv), normal: best.n.clone().applyQuaternion(inv) };
  };

  // A finger's grip for the spin, as a point fixed on the cube (which must still be square):
  // on the face in front of it (which = 0), or on the face that will be in front of it once
  // the cube has turned (which = 1).
  const yawGrip = (h, spin, which) => {
    const [trail, height] = YAW_GRIPS[spin][h.f.name][which];
    const n = h.faceDir.clone().applyAxisAngle(zAxis, (-spin * which * Math.PI) / 2);
    const t = new THREE.Vector3(-n.y, n.x, 0); // anticlockwise along the face
    const point = n.clone().multiplyScalar(HALF).addScaledVector(t, -spin * trail).setZ(height);
    const inv = cube.quaternion.clone().invert();
    return { point: point.applyQuaternion(inv), normal: n.applyQuaternion(inv) };
  };

  // Progress through the spin (see YAW_HANDOVER) at time t into it, and the cube's turn at a
  // given progress, in degrees: each push eases in and out (gently, so that it is not much
  // faster in the middle, where fingers let go and close in), and the handover runs steadily.
  const SPIN_TIME = 2 * YAW_PUSH_TIME + YAW_HANDOVER_TIME;
  const spinProgress = (t) => {
    if (t < YAW_PUSH_TIME) return 45 * smooth(t / YAW_PUSH_TIME);
    t -= YAW_PUSH_TIME;
    if (t < YAW_HANDOVER_TIME) return 45 + (YAW_HANDOVER * t) / YAW_HANDOVER_TIME;
    return 45 + YAW_HANDOVER + 45 * smooth(clamp01((t - YAW_HANDOVER_TIME) / YAW_PUSH_TIME));
  };
  const spinTurn = (p) => Math.min(p, 45) + Math.max(0, p - 45 - YAW_HANDOVER);

  // Where a fingertip is at progress p through the spin: on its first grip until it lets go,
  // opened out of the way, then on its second grip. Leaving, it backs off the face first and
  // then opens out; arriving, the reverse, so it closes in on the grip and meets it moving
  // with it.
  const sweepPose = (h, p, out) => {
    const [first, second] = YAW_GRIPS[move.spin][h.f.name];
    // it changes to its second grip once fully open
    const leaving = p < first[3];
    const s = leaving ? clamp01((p - first[2]) / (first[3] - first[2])) : clamp01((second[3] - p) / (second[3] - second[2]));
    if (!leaving && s < 1 && !h.closing) h.closing = h.reseed = true;
    const grip = contactWorld(h.grips[leaving ? 0 : 1], cube.position, cube.quaternion);
    // its open pose turns from one grip's plane to the other's over its whole time off the cube
    const wait = smooth(clamp01((p - first[2]) / (second[3] - first[2])));
    h.openPose = [h.openPlanes[0] + (h.openPlanes[1] - h.openPlanes[0]) * wait, ...YAW_OPEN];
    h.opening = smooth(clamp01((s - 0.2) / 0.8));
    const back = smooth(clamp01(s / 0.4));
    out.copy(grip.tip).addScaledVector(grip.normal, YAW_CLEAR * back);
    out.z += YAW_ARCH * back;
    h.normal.copy(grip.normal);
    h.air = s;
    h.free = s > 0;
    return out;
  };

  const restLocal = (h) => {
    const inv = cube.quaternion.clone().invert();
    const n = h.faceDir.clone().applyQuaternion(inv);
    return { point: n.clone().multiplyScalar(HALF), normal: n };
  };

  const contactWorld = (local, center, quat) => {
    const n = local.normal.clone().applyQuaternion(quat);
    const p = local.point.clone().applyQuaternion(quat).add(center);
    return { tip: p.addScaledVector(n, TIP_R), normal: n };
  };

  const startMove = (faceDir) => {
    const f = V(faceDir);
    const omega = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, -1)).normalize();
    const pushers = hands.filter((h) => Math.abs(h.faceDir.dot(f)) > 0.9);
    const phases = [];
    let angle = 0;
    PUSHES.forEach((push, k) => {
      phases.push({ kind: "regrasp", dur: REGRASP_TIME, rest: false, step: k });
      phases.push({ kind: "push", dur: push.time, from: angle, to: angle + push.angle });
      angle += push.angle;
    });
    phases.push({ kind: "regrasp", dur: REGRASP_TIME, rest: true });
    move = { f, omega, pushers, phases, index: -1, t: 0, q0: cube.quaternion.clone(), phi: 0 };
    nextPhase();
  };

  // spin = +1 turns the cube anticlockwise seen from above, -1 clockwise
  const startYaw = (spin) => {
    const omega = new THREE.Vector3(0, 0, spin);
    const q0 = cube.quaternion.clone();
    // a finger with no grips for this direction sits the spin out, opened out of the way
    const pushers = hands.filter((h) => YAW_GRIPS[spin][h.f.name]);
    for (const h of hands) h.openPose = [h.q[0], ...YAW_OPEN];
    for (const h of pushers) {
      h.grips = [yawGrip(h, spin, 0), yawGrip(h, spin, 1)];
      h.closing = false;
      // the abduction the finger opens out at after letting go, and closes in at before it
      // lands: that of the plane through its grip as it starts to let go, and as it lands, so
      // it neither twists as it leaves the first grip nor as it reaches the second
      h.openPlanes = YAW_GRIPS[spin][h.f.name].map(([, , from, to], which) => {
        const deg = spinTurn(which ? to : from);
        const turned = new THREE.Quaternion().setFromAxisAngle(omega, (deg * Math.PI) / 180).multiply(q0);
        const tip = contactWorld(h.grips[which], V(REST_CENTER), turned).tip;
        const plane = wrap(Math.atan2(tip.x - h.f.base[0], h.f.base[1] - tip.y) - h.f.yaw);
        return Math.min(LIMITS[0][1], Math.max(LIMITS[0][0], plane));
      });
    }
    const phases = [
      { kind: "regrasp", dur: YAW_HOP_TIME, rest: false },
      { kind: "sweep", dur: SPIN_TIME },
      { kind: "regrasp", dur: YAW_HOP_TIME, rest: true },
    ];
    move = { yaw: true, spin, omega, pushers, phases, index: -1, t: 0, q0, phi: 0 };
    nextPhase();
  };

  const nextPhase = () => {
    move.index += 1;
    move.t = 0;
    const ph = move.phases[move.index];
    if (!ph) {
      finishMove();
      return;
    }
    if (ph.kind === "regrasp") {
      const center = cube.position.clone();
      for (const h of move.pushers) {
        const local = ph.rest ? restLocal(h) : move.yaw ? h.grips[0] : pushContact(h, move.omega, h.faceDir.dot(move.f) > 0, ph.step);
        const end = contactWorld(local, center, cube.quaternion);
        h.local = local;
        h.path = {
          yaw: !!move.yaw,
          start: h.target.clone(),
          startNormal: h.normal.clone(),
          startAway: retreatDir(h, h.normal),
          end: end.tip,
          endNormal: end.normal,
          endAway: retreatDir(h, end.normal),
          center,
        };
      }
    }
  };

  const finishMove = () => {
    // Snap to an exact axis-aligned orientation so rounding never accumulates.
    const m = new THREE.Matrix4().makeRotationFromQuaternion(cube.quaternion);
    const e = m.elements;
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
    cube.quaternion.setFromRotationMatrix(m);
    cube.position.set(...REST_CENTER);
    for (const h of hands) {
      h.free = false;
      h.detour = 0;
      h.opening = 0;
      h.target.copy(V(REST_CENTER).addScaledVector(h.faceDir, HALF + TIP_R));
      h.normal.copy(h.faceDir);
      h.local = null;
      h.path = null;
    }
    move = null;
    posed = false;
    restartIdle();
    // the hint fades back in now the cube is still (unless a face is hovered, see setHighlight)
    hint?.classList.remove("is-moving");
    updateHover(lastPointer);
  };

  // Direction a fingertip backs away from a face: mostly up, which every finger can do from
  // above, plus some of the face normal flattened into the plane the finger curls in (it
  // can only leave that plane by abducting).
  const retreatDir = (h, normal) => {
    const yaw = h.f.yaw + h.q[0];
    const lat = new THREE.Vector3(Math.cos(yaw), Math.sin(yaw), 0);
    const inPlane = normal.clone().addScaledVector(lat, -normal.dot(lat));
    if (inPlane.length() < 0.3) return new THREE.Vector3(0, 0, 1);
    return inPlane.normalize().multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 1)).normalize();
  };

  const regraspPose = (path, u, out) => {
    // back off the old face, move over, press in onto the new one
    const a = 0.28;
    const b = 0.72;
    if (path.yaw) {
      // spinning: a short hop along the same face, standing off it and arching up a little;
      // the move across starts before the tip is fully clear and ends as it closes in again
      const clear = smooth(clamp01(u / a)) * smooth(clamp01((1 - u) / (1 - b)));
      const s = smooth(clamp01((u - 0.6 * a) / (1 - 0.6 * (1 - b) - 0.6 * a)));
      out.lerpVectors(path.start, path.end, s).addScaledVector(path.endNormal, YAW_CLEAR * clear);
      out.z += YAW_ARCH * clear;
      return out;
    }
    const off0 = path.start.clone().addScaledVector(path.startAway, LIFT_OFF);
    const off1 = path.end.clone().addScaledVector(path.endAway, LIFT_OFF);
    if (u < a) {
      out.lerpVectors(path.start, off0, smooth(u / a));
    } else if (u < b) {
      // across on a curve that bows out round the cube (clear of the edge between the two
      // contacts) and slightly upwards, since the fingers all reach down from above
      const s = smooth((u - a) / (b - a));
      const r0 = off0.clone().sub(path.center);
      const r1 = off1.clone().sub(path.center);
      const bow = r0.clone().normalize().add(r1.clone().normalize()).normalize();
      const ctrl = path.center.clone().addScaledVector(bow, Math.max(r0.length(), r1.length()) * 1.0);
      out
        .copy(off0)
        .multiplyScalar((1 - s) * (1 - s))
        .addScaledVector(ctrl, 2 * s * (1 - s))
        .addScaledVector(off1, s * s);
      out.z += 0.2 * Math.sin(Math.PI * s);
    } else {
      out.lerpVectors(off1, path.end, smooth((u - b) / (1 - b)));
    }
    return out;
  };

  const advance = (dt) => {
    if (!move) return;
    const ph = move.phases[move.index];
    move.t += dt;
    const u = clamp01(move.t / ph.dur);
    // The pivots lift the cube clear during the first regrasp and set it down in the last.
    const lastPhase = move.index === move.phases.length - 1;
    const lift = move.index === 0 ? smooth(u) : lastPhase ? 1 - smooth(u) : 1;

    if (ph.kind === "sweep") move.progress = spinProgress(move.t);
    if (ph.kind === "push" || ph.kind === "sweep") {
      move.phi = ph.kind === "sweep" ? (spinTurn(move.progress) * Math.PI) / 180 : ph.from + (ph.to - ph.from) * ease(u);
      cube.quaternion.setFromAxisAngle(move.omega, move.phi).multiply(move.q0);
    }
    // a spin turns the cube in place on the palm; a roll lifts it clear
    cube.position.set(REST_CENTER[0], REST_CENTER[1], move.yaw ? REST_CENTER[2] : liftFor(move.phi) + GAP * lift);

    for (const h of hands) {
      if (move.yaw && !move.pushers.includes(h)) {
        // sitting the spin out: open out of the way over the first hop, close over the last
        h.opening = lift;
      } else if (!move.pushers.includes(h)) {
        // Pivot: the contact sits on the rotation axis, so it only moves with the lift.
        h.target.copy(cube.position).addScaledVector(h.faceDir, HALF + TIP_R);
      } else if (ph.kind === "sweep") {
        sweepPose(h, move.progress, h.target);
      } else if (ph.kind === "regrasp") {
        // how far clear of the cube the finger is: 0 at either contact, 1 mid-flight
        h.air = smooth(clamp01(u / 0.28)) * smooth(clamp01((1 - u) / 0.28));
        h.free = h.air > 0;
        regraspPose(h.path, u, h.target);
        // the regrasp was planned against where the cube was; follow it as it lifts
        h.target.addScaledVector(cube.position.clone().sub(h.path.center), smooth(u));
        h.normal.copy(h.path.startNormal).lerp(h.path.endNormal, smooth(u)).normalize();
      } else {
        h.free = false;
        const c = contactWorld(h.local, cube.position, cube.quaternion);
        h.target.copy(c.tip);
        h.normal.copy(c.normal);
      }
      h.target.z = Math.max(h.target.z, TIP_R + 0.1);
    }

    if (move.t >= ph.dur) {
      const spill = move.t - ph.dur;
      nextPhase();
      if (move && spill > 0) advance(spill);
    }
  };

  // -------------------------------------------------------------------------
  // Rendering loop (on demand)

  let running = false;
  let visible = true;
  let last = 0;
  let dirty = true;
  let posed = false; // fingers only need solving while the cube moves

  // Idle hint: while nothing is hovered or moving, the two clickable faces take turns to
  // light up, fading in, holding and fading out, on a fixed rhythm.
  const IDLE_DELAY = 1.2; // seconds of calm before the hint (re)starts
  const PULSE = { in: 0.35, hold: 0.45, out: 0.35, rest: 0.65 };
  const SLOT = PULSE.in + PULSE.hold + PULSE.out + PULSE.rest;
  let idleFrom = performance.now() + 800;
  let idleTimer = 0;
  const restartIdle = () => {
    idleFrom = performance.now() + IDLE_DELAY * 1000;
  };
  // highlight amount per clickable face, and whether it is mid-fade (or the ms until the
  // next fade starts)
  const idleState = (now) => {
    const amounts = SELECTABLE.map(() => 0);
    if (move || hovered || reducedMotion) return { amounts, fading: false, wait: Infinity };
    const t = (now - idleFrom) / 1000;
    if (t < 0) return { amounts, fading: false, wait: -t * 1000 };
    const slot = Math.floor(t / SLOT);
    const u = t - slot * SLOT;
    const k = slot % SELECTABLE.length;
    let fading = false;
    let wait = 0;
    if (u < PULSE.in) {
      amounts[k] = smooth(u / PULSE.in);
      fading = true;
    } else if (u < PULSE.in + PULSE.hold) {
      amounts[k] = 1;
      wait = (PULSE.in + PULSE.hold - u) * 1000;
    } else if (u < PULSE.in + PULSE.hold + PULSE.out) {
      amounts[k] = 1 - smooth((u - PULSE.in - PULSE.hold) / PULSE.out);
      fading = true;
    } else {
      wait = (SLOT - u) * 1000;
    }
    return { amounts, fading, wait };
  };
  const white = new THREE.Color(0xffffff);
  const paintFaces = (amounts) => {
    for (const m of faceMats) {
      const n = m.userData.normal.clone().applyQuaternion(cube.quaternion);
      let a = 0;
      SELECTABLE.forEach((c, k) => {
        if (n.dot(V(c)) > 0.9) a = amounts[k];
      });
      m.color.copy(m.userData.base).lerp(white, 0.3 * a);
    }
  };

  function requestRender() {
    dirty = true;
    if (!running && visible) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  const draw = () => {
    if (move || !posed) updateFingers();
    posed = !move;
    updateShadow();
    collectLines();
    renderer.render(scene, camera);
  };

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (move) advance(dt);
    const idle = idleState(now);
    paintFaces(hovered ? SELECTABLE.map((c) => (c === hovered ? 1 : 0)) : idle.amounts);
    draw();
    dirty = false;
    clearTimeout(idleTimer);
    if ((move || dirty || idle.fading) && visible) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      // sleep until the next fade of the idle hint
      if (visible && Number.isFinite(idle.wait)) idleTimer = setTimeout(requestRender, idle.wait + 5);
    }
  }

  // -------------------------------------------------------------------------
  // Interaction

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  let hoverSpin = 0;
  let lastPointer = null;
  const toScreen = (p) => p.clone().project(camera);

  const pickFace = (ev) => {
    if (!ev) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(cube.children, false)[0];
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const face = SELECTABLE.find((c) => n.dot(V(c)) > 0.9);
    if (!face) return null;
    // on the top face, the half under the pointer (on screen) picks the direction of turn
    const topCentre = cube.position.clone().add(new THREE.Vector3(0, 0, HALF));
    const spin = face === TOP ? (toScreen(hit.point).x > toScreen(topCentre).x ? -1 : 1) : 0;
    return { face, spin };
  };

  // (face colours are painted each frame from `hovered` and the idle hint)
  const setHighlight = (dir, spin = 0) => {
    if (!dir) restartIdle();
    // the preview arrows take the hint's place above the hand while they show
    hint?.classList.toggle("is-covered", !!dir && !move);
    // the preview only shows while choosing; it is gone once the cube is moving
    showGuide(move ? null : dir, spin);
  };

  function updateHover(ev) {
    const pick = move ? null : pickFace(ev);
    const dir = pick ? pick.face : null;
    const spin = pick ? pick.spin : 0;
    if (dir !== hovered || spin !== hoverSpin) {
      hovered = dir;
      hoverSpin = spin;
      canvas.style.cursor = dir ? "pointer" : "";
      setHighlight(dir, spin);
    }
  }

  canvas.addEventListener("pointermove", (ev) => {
    lastPointer = ev;
    updateHover(ev);
  });
  canvas.addEventListener("pointerleave", () => {
    lastPointer = null;
    updateHover(null);
  });
  canvas.addEventListener("click", (ev) => {
    if (move) return;
    const pick = pickFace(ev);
    if (!pick) return;
    hovered = null;
    hoverSpin = 0;
    canvas.style.cursor = "";
    if (pick.face === TOP) startYaw(pick.spin);
    else startMove(pick.face);
    setHighlight(null);
    hint?.classList.add("is-moving");
    if (reducedMotion) {
      while (move) advance(1);
    }
    requestRender();
  });

  new ResizeObserver(fitCamera).observe(canvas);
  placeCanvas();
  window.addEventListener("resize", placeCanvas);
  document.fonts?.ready.then(placeCanvas);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) requestRender();
  }).observe(canvas);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  updateFingers();
  collectFitPoints();
  applyTheme();
  fitCamera();
}

// Fade the navbar background back in once the hero has scrolled underneath it.
function trackHeroScroll() {
  const hero = document.getElementById("about-hero");
  const nav = document.getElementById("navbar");
  if (!hero || !nav) return;
  const update = () => {
    const past = window.scrollY > hero.offsetHeight - nav.offsetHeight - 1;
    nav.classList.toggle("is-past-hero", past);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

trackHeroScroll();
const heroCanvas = document.getElementById("hand-cube-canvas");
if (heroCanvas) {
  mountHandCube(heroCanvas, document.getElementById("hand-cube-hint"))
    .then(() => heroCanvas.classList.add("is-ready"))
    .catch((err) => console.warn("hand-cube: could not start", err));
}
