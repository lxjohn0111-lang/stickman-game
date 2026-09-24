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
  tray: { c: 0xffffff, n: 0x6fd3ff, shadow: false },
  food: { c: 0xffffff, n: 0xff5a5a, shadow: false },
  door: { c: 0xffffff, n: 0xffe24a },
  frame: { c: 0xffffff, n: 0xffffff, shadow: false },
  glass: { c: 0xffffff, n: 0xbff0ff, co: 0.1, no: 0.4, transparent: true, shadow: false },
  appliance: { c: 0xffffff, n: 0xe9ebff },
  locker: { c: 0xffffff, n: 0x8f79ff },
  vending: { c: 0xffffff, n: 0xff4f6d },
  crate: { c: 0xffffff, n: 0xffb13d },
  barrier: { c: 0xffffff, n: 0xf3f3f3 },
  stripe: { c: 0xffffff, n: 0xff7a1a, shadow: false },
  barracks: { c: 0xffffff, n: 0xffc89c },
  barracksRoof: { c: 0xffffff, n: 0xff5c5c },
  pine: { c: 0xffffff, n: 0x2ecf78 },
  trunk: { c: 0xffffff, n: 0xa8663a },
  tank: { c: 0xffffff, n: 0x46d2f0 },
  sign: { c: 0xffffff, n: 0x20c05a, shadow: false },
  lamp: { c: 0xffffff, n: 0xfff27a, shadow: false, ne: 0x5a5000 },
  ink: { c: 0x121212, n: 0x161616, shadow: false },
  // --- campaign locations
  cont1: { c: 0xffffff, n: 0xff5a4e },
  cont2: { c: 0xffffff, n: 0x3f7cff },
  cont3: { c: 0xffffff, n: 0xff9a3d },
  cont4: { c: 0xffffff, n: 0x2ec27e },
  crane: { c: 0xffffff, n: 0xffd23f },
  hull: { c: 0xffffff, n: 0x2b3a67 },
  deck: { c: 0xffffff, n: 0xc9543f },
  water: { c: 0xf3f5f7, n: 0x2f8fd8, shadow: false },
  asphalt: { c: 0xffffff, n: 0x6c6f86, shadow: false },
  sidewalk: { c: 0xffffff, n: 0xc8c3d8, shadow: false },
  shed: { c: 0xffffff, n: 0xb9c7d9 },
  catwalk: { c: 0xffffff, n: 0xff7a1a },
  platform: { c: 0xffffff, n: 0xe6d9b8, shadow: false },
  tileWall: { c: 0xffffff, n: 0x7fd8c9 },
  train: { c: 0xffffff, n: 0xdfe5f0 },
  trainTrim: { c: 0xffffff, n: 0xff4f6d },
  rail: { c: 0xffffff, n: 0x8a8fa3 },
  sand: { c: 0xffffff, n: 0xf2cf8a, shadow: false },
  rock: { c: 0xffffff, n: 0xd4955c },
  tent: { c: 0xffffff, n: 0x9fb36a },
  sandbag: { c: 0xffffff, n: 0xd8c08a },
  bunker: { c: 0xffffff, n: 0xb8b2a4 },
  snow: { c: 0xffffff, n: 0xf4f8ff, shadow: false },
  ice: { c: 0xffffff, n: 0xb9e6ff, shadow: false },
  carpet: { c: 0xffffff, n: 0xc2415b, shadow: false },
  wood: { c: 0xffffff, n: 0xc98a4b },
  hotel: { c: 0xffffff, n: 0xffd9a8 },
  hotelRoof: { c: 0xffffff, n: 0x5b6fd6 },
  marble: { c: 0xffffff, n: 0xeae6f7, shadow: false },
  bed: { c: 0xffffff, n: 0xffffff },
  sofa: { c: 0xffffff, n: 0x6a4cff },
  machine: { c: 0xffffff, n: 0x7bc1ff },
  belt: { c: 0xffffff, n: 0x3a3a4a },
  hazard: { c: 0xffffff, n: 0xffd400 },
  pipe: { c: 0xffffff, n: 0xd35fff },
  furnace: { c: 0xffffff, n: 0xff6a2a, ne: 0x6a1a00 },
  brick: { c: 0xffffff, n: 0xc4674b },
  shop: { c: 0xffffff, n: 0x55d6be },
  neon1: { c: 0xffffff, n: 0xff3cc7, ne: 0xb0107a, shadow: false },
  neon2: { c: 0xffffff, n: 0x3ce8ff, ne: 0x0a8aa0, shadow: false },
  car1: { c: 0xffffff, n: 0xff5a4e },
  car2: { c: 0xffffff, n: 0xffd23f },
  car3: { c: 0xffffff, n: 0x5f7bff },
  tire: { c: 0x151515, n: 0x1c1c24 },
  stone: { c: 0xffffff, n: 0xcbb99a },
  stoneDark: { c: 0xffffff, n: 0x9d8a70 },
  flag: { c: 0xffffff, n: 0xe0283b },
  heli: { c: 0xffffff, n: 0x2e3a4a },
  panel: { c: 0xffffff, n: 0x31d0a0 },
  transmitter: { c: 0xffffff, n: 0xe0e4ff },
  // --- characters and items
  gun: { c: 0xffffff, n: 0x9b7bff },
  gunDark: { c: 0x161616, n: 0x2b2640 },
  sleeve: { c: 0xffffff, n: 0x3f7cff },
  hand: { c: 0xffffff, n: 0xffd3ad },
  // Stickmen are coloured per instance (black enemies, grey civilians); the
  // role itself is white so the instance colour decides.
  enemy: { c: 0xffffff, n: 0xffffff, instanceTint: true },
  enemyEye: { c: 0xffffff, n: 0xffe600, ne: 0xffe600 },
  enemyPupil: { c: 0x000000, n: 0x000000 },
  enemyGun: { c: 0x1d1d1d, n: 0x3a2d66 },
  vest: { c: 0x9a9a9a, n: 0xffb000 },
  cap: { c: 0xb0141e, n: 0xe0283b, ne: 0x300000 },
  healthKit: { c: 0xffffff, n: 0xffffff },
  healthCross: { c: 0xb3121c, n: 0xff2d3d },
  ammoBox: { c: 0x3a3f2a, n: 0x5d6b2a },
  ammoBand: { c: 0xd8c040, n: 0xffd400 },
  secret: { c: 0xffd23f, n: 0xffd23f, ne: 0x6a5000 },
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
  hull2: { kind: 'basic', c: 0x000000, n: 0x000000, side: THREE.BackSide },
  laser: { kind: 'basic', c: 0xe0101a, n: 0xff1a2a, transparent: true, co: 0.85, no: 0.9, fog: false },
  marker: { kind: 'basic', c: 0x111111, n: 0xff2bd6, fog: false },
  lightOn: { kind: 'basic', c: 0x1ea84a, n: 0x2dff7a },
  lightOff: { kind: 'basic', c: 0xc0141e, n: 0xff2d3d },
  weather: { kind: 'basic', c: 0x8a8f99, n: 0xdfeaff, transparent: true, co: 0.55, no: 0.6, fog: true },
  snowflake: { kind: 'basic', c: 0x9aa0a8, n: 0xffffff, transparent: true, co: 0.9, no: 0.95 },
  dust: { kind: 'basic', c: 0xb9a78a, n: 0xf5d9a0, transparent: true, co: 0.35, no: 0.4 },
  steam: { kind: 'basic', c: 0xc9ccd2, n: 0xffffff, transparent: true, co: 0.55, no: 0.7 },
  puddle: { kind: 'basic', c: 0xe8ebf0, n: 0x33416a, transparent: true, co: 0.8, no: 0.75 },
  reflect: { kind: 'basic', c: 0xc8ccd4, n: 0xfff27a, transparent: true, co: 0.6, no: 0.45 },
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
        if (def.fog === false) m.fog = false;
      } else {
        m = new THREE.MeshToonMaterial({ color: 0x000000, emissive: def.c, gradientMap: this.ramp });
        // Push faces back a little so the ink edges always win the depth test.
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 1;
        if (def.instanceTint) {
          // Classic is emissive-driven, so let the per-instance colour tint
          // the emissive term too (vColor is the instance colour). The
          // fragment shader only sees USE_COLOR for instance colours;
          // USE_INSTANCING_COLOR is defined in the vertex shader alone.
          m.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\ntotalEmissiveRadiance *= vColor;\n#endif');
          };
        }
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

  // Outline quality: Low draws slightly thinner lines.
  setLineScale(k) {
    this.lineScale = k;
    this.apply(this.style);
  }

  apply(style) {
    this.style = style;
    const ls = this.lineScale || 1;
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
      this.lines[name].linewidth = s.width * (name === 'flash' ? 1 : ls);
    }
    this.cloud.visible = neo;
  }
}
