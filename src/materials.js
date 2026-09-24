// One shared material per role (wall, floor, gun, enemy ...). Switching the
// visual style only recolours these objects in place; nothing is rebuilt, so
// positions, bodies, decals and every other bit of game state survive.
import * as THREE from 'three';
import { LineMaterial } from '../vendor/three/addons/lines/LineMaterial.js';
import { makeToonRamp, makeSplatTexture, makePoolTexture, makeCloudTexture } from './textures.js';

// c = Classic colour, n = Neobrutalist colour, ne = Neo emissive.
// shadow:false keeps a role out of the shadow pass (the roof must not cast,
// so interiors stay bright).
export const ROLE_DEFS = {
  wall: { c: 0xffffff, n: 0xff8cc6 },
  wallExt: { c: 0xffffff, n: 0xff74b6 },
  ceiling: { c: 0xffffff, n: 0xfff2f8, shadow: false },
  roof: { c: 0xffffff, n: 0x3fd6ee, shadow: false },
  parapet: { c: 0xffffff, n: 0x27b9d6 },
  floor: { c: 0xffffff, n: 0x98f2c8, shadow: false },
  tile: { c: 0xffffff, n: 0x7ce6d8, shadow: false },
  ground: { c: 0xffffff, n: 0x8ce6a2, shadow: false },
  path: { c: 0xffffff, n: 0xf5ead0, shadow: false },
  concrete: { c: 0xffffff, n: 0xd5d8ec },
  steel: { c: 0xffffff, n: 0x9b7bff },
  table: { c: 0xffffff, n: 0xff9a3d },
  chair: { c: 0xffffff, n: 0x3f7cff },
  counter: { c: 0xffffff, n: 0xffd84a },
  tray: { c: 0xffffff, n: 0x6fd3ff },
  food: { c: 0xffffff, n: 0xff5a5a },
  door: { c: 0xffffff, n: 0xffe24a },
  frame: { c: 0xffffff, n: 0xffffff },
  glass: { c: 0xffffff, n: 0xbff0ff, co: 0.1, no: 0.4, transparent: true, shadow: false },
  appliance: { c: 0xffffff, n: 0xe9ebff },
  locker: { c: 0xffffff, n: 0x8f79ff },
  vending: { c: 0xffffff, n: 0xff4f6d },
  crate: { c: 0xffffff, n: 0xffb13d },
  barrier: { c: 0xffffff, n: 0xf3f3f3 },
  stripe: { c: 0xffffff, n: 0xff7a1a },
  barracks: { c: 0xffffff, n: 0xffc89c },
  barracksRoof: { c: 0xffffff, n: 0xff5c5c },
  pine: { c: 0xffffff, n: 0x2ecf78 },
  trunk: { c: 0xffffff, n: 0xa8663a },
  tank: { c: 0xffffff, n: 0x46d2f0 },
  sign: { c: 0xffffff, n: 0x20c05a },
  lamp: { c: 0xffffff, n: 0xfff27a, ne: 0x5a5000 },
  ink: { c: 0x121212, n: 0x161616 },
  gun: { c: 0xffffff, n: 0x9b7bff },
  gunDark: { c: 0x161616, n: 0x2b2640 },
  sleeve: { c: 0xffffff, n: 0x3f7cff },
  hand: { c: 0xffffff, n: 0xffd3ad },
  enemy: { c: 0x0a0a0a, n: 0x0c0c0c },
  enemyEye: { c: 0xffffff, n: 0xffe600, ne: 0xffe600 },
  enemyPupil: { c: 0x000000, n: 0x000000 },
  enemyGun: { c: 0x1d1d1d, n: 0x3a2d66 },
  // unlit roles
  signText: { kind: 'basic', c: 0x111111, n: 0xffffff, transparent: true },
  blood: { kind: 'basic', c: 0x6b0a0a, n: 0x7a0c0c },
  debris: { kind: 'basic', c: 0x111111, n: 0x151515 },
  tracerPlayer: { kind: 'basic', c: 0x111111, n: 0xffe600 },
  tracerEnemy: { kind: 'basic', c: 0x111111, n: 0xff2bd6 },
  flash: { kind: 'basic', c: 0xffffff, n: 0xffa000 },
  flashCore: { kind: 'basic', c: 0xffffff, n: 0xfff27a },
  flashWorld: { kind: 'basic', c: 0x111111, n: 0xffa000 },
  rim: { kind: 'basic', c: 0xffffff, n: 0xffffff, side: THREE.BackSide, neoOnly: true },
  tracerRim: { kind: 'basic', c: 0x000000, n: 0x000000, side: THREE.BackSide, neoOnly: true },
};

export const LINE_STYLE = {
  // Classic: thin ~1.2 px ink. Neo: 3 px black outlines.
  main: { classic: { color: 0x000000, width: 1.2 }, neo: { color: 0x000000, width: 3.0 } },
  fence: { classic: { color: 0x303030, width: 1.0 }, neo: { color: 0x111111, width: 1.5 } },
  vm: { classic: { color: 0x000000, width: 1.3 }, neo: { color: 0x000000, width: 3.0 } },
  flash: { classic: { color: 0x000000, width: 2.6 }, neo: { color: 0x000000, width: 3.0 } },
};

export class Materials {
  constructor() {
    this.style = 'classic';
    this.ramp = makeToonRamp();
    this.roles = {};
    for (const [name, def] of Object.entries(ROLE_DEFS)) {
      let m;
      if (def.kind === 'basic') {
        m = new THREE.MeshBasicMaterial({ color: def.c, side: def.side ?? THREE.FrontSide });
      } else {
        m = new THREE.MeshToonMaterial({ color: 0x000000, emissive: def.c, gradientMap: this.ramp });
        // Push faces back a little so the ink edges always win the depth test.
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 1;
      }
      if (def.transparent) {
        m.transparent = true;
        m.depthWrite = false;
        if (def.co !== undefined) m.opacity = def.co;
      }
      m.name = name;
      this.roles[name] = m;
    }

    this.splat = makeSplatTexture();
    this.pool = makePoolTexture();
    this.cloudTex = makeCloudTexture();
    this.decal = new THREE.MeshBasicMaterial({
      map: this.splat, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.poolMat = new THREE.MeshBasicMaterial({
      map: this.pool, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.cloud = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, alphaTest: 0.5, fog: false, depthWrite: false });

    this.lines = {};
    for (const [name, st] of Object.entries(LINE_STYLE)) {
      this.lines[name] = new LineMaterial({
        color: st.classic.color,
        linewidth: st.classic.width,
        fog: name === 'main' || name === 'fence',
      });
    }
  }

  get(role) {
    const m = this.roles[role];
    if (!m) throw new Error('unknown material role ' + role);
    return m;
  }

  apply(style) {
    this.style = style;
    const neo = style === 'neo';
    for (const [name, def] of Object.entries(ROLE_DEFS)) {
      const m = this.roles[name];
      if (def.kind === 'basic') {
        m.color.setHex(neo ? def.n : def.c);
        if (def.neoOnly) m.visible = neo;
      } else if (neo) {
        m.color.setHex(def.n);
        m.emissive.setHex(def.ne ?? 0x000000);
      } else {
        // Classic is unlit: emissive carries the role colour and the diffuse
        // term is black, so dark parts (guns, magazines) stay dark.
        m.color.setHex(0x000000);
        m.emissive.setHex(def.c);
      }
      if (def.transparent && def.co !== undefined) m.opacity = neo ? def.no : def.co;
    }
    for (const [name, st] of Object.entries(LINE_STYLE)) {
      const s = neo ? st.neo : st.classic;
      this.lines[name].color.setHex(s.color);
      this.lines[name].linewidth = s.width;
    }
    this.cloud.visible = neo;
  }
}
