// Gun models built from boxes and cylinders. Local frame: origin at the top
// of the grip (where the right hand holds), barrel along -Z, up +Y.
// The same builders feed the first-person viewmodels (with moving parts and
// ink edges) and the instanced guns carried/dropped by enemies.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { PartBuilder } from './builder.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const GUN_INFO = {
  smg: { muzzle: V(0, 0.045, -0.285), support: V(0, -0.02, -0.15), supportRot: 0.2, magOffset: V(0, -0.16, 0) },
  shotgun: { muzzle: V(0, 0.062, -0.64), support: V(0, 0.0, -0.3), supportRot: 0.1, magOffset: null },
  rifle: { muzzle: V(0, 0.047, -0.58), support: V(0, 0.0, -0.27), supportRot: 0.15, magOffset: V(0, -0.18, 0.02) },
  pistol: { muzzle: V(0, 0.062, -0.155), support: V(-0.005, -0.05, 0.02), supportRot: 0.9, magOffset: V(0, -0.14, 0.02) },
};

// Returns { main, pump?, slide?, mag? } PartBuilders.
export function buildGun(id) {
  const main = new PartBuilder();
  const out = { main };
  if (id === 'smg') {
    // boxy Uzi-style: receiver, big rear block, grip holding the magazine,
    // short barrel and twin sight posts
    main.box('gun', 0, 0.045, -0.085, 0.056, 0.074, 0.25);
    main.box('gun', 0, 0.05, 0.075, 0.07, 0.09, 0.075);
    main.box('gunDark', 0, 0.02, 0.118, 0.05, 0.05, 0.012);
    main.cyl('gun', 0, 0.045, -0.225, 0.02, 0.02, 0.03, 10, { rx: Math.PI / 2 });
    main.cyl('gunDark', 0, 0.045, -0.255, 0.012, 0.012, 0.06, 8, { rx: Math.PI / 2 });
    main.box('gun', 0, -0.05, 0.0, 0.046, 0.13, 0.055, { rx: 0.05 });
    main.box('gunDark', 0, -0.035, -0.058, 0.012, 0.012, 0.055);
    main.box('gunDark', 0, -0.012, -0.03, 0.006, 0.03, 0.006);
    // twin front posts + twin rear posts
    for (const x of [-0.014, 0.014]) {
      main.box('gunDark', x, 0.095, -0.19, 0.007, 0.03, 0.012);
      main.box('gunDark', x, 0.107, 0.075, 0.008, 0.024, 0.012);
    }
    main.box('gunDark', 0, 0.087, -0.06, 0.018, 0.012, 0.02);
    const mag = new PartBuilder();
    mag.box('gunDark', 0, -0.165, 0.004, 0.034, 0.1, 0.034);
    mag.box('gunDark', 0, -0.218, 0.004, 0.04, 0.012, 0.04);
    out.mag = mag;
  } else if (id === 'shotgun') {
    main.box('gun', 0, 0.045, -0.03, 0.052, 0.074, 0.2);
    main.cyl('gun', 0, 0.062, -0.39, 0.013, 0.013, 0.5, 10, { rx: Math.PI / 2 });
    main.cyl('gunDark', 0, 0.03, -0.35, 0.012, 0.012, 0.42, 8, { rx: Math.PI / 2 });
    main.box('gun', 0, 0.047, -0.585, 0.02, 0.035, 0.02);
    main.cyl('gunDark', 0, 0.081, -0.625, 0.004, 0.004, 0.01, 6);
    main.box('gun', 0, -0.045, 0.045, 0.04, 0.11, 0.045, { rx: -0.35 });
    main.box('gun', 0, 0.0, 0.17, 0.042, 0.075, 0.2, { rx: 0.12 });
    main.box('gunDark', 0, -0.012, 0.275, 0.046, 0.09, 0.02, { rx: 0.12 });
    main.box('gunDark', 0, -0.012, -0.02, 0.01, 0.03, 0.006);
    main.box('gunDark', 0, -0.028, -0.045, 0.01, 0.006, 0.06);
    // ribbed pump slides along the tube
    const pump = new PartBuilder();
    pump.box('gun', 0, 0.03, -0.3, 0.05, 0.046, 0.16);
    for (let i = 0; i < 6; i++) pump.box('gunDark', 0, 0.03, -0.235 - i * 0.026, 0.056, 0.05, 0.008);
    out.pump = pump;
  } else if (id === 'rifle') {
    // AK-style: receiver, handguard, gas tube, fork front sight, curved mag
    main.box('gun', 0, 0.038, -0.05, 0.05, 0.07, 0.26);
    main.box('gun', 0, 0.075, -0.07, 0.04, 0.012, 0.2);
    main.box('gun', 0, 0.03, -0.27, 0.052, 0.05, 0.17);
    main.cyl('gun', 0, 0.066, -0.28, 0.012, 0.012, 0.19, 8, { rx: Math.PI / 2 });
    main.cyl('gunDark', 0, 0.047, -0.46, 0.009, 0.009, 0.24, 8, { rx: Math.PI / 2 });
    main.cyl('gunDark', 0, 0.047, -0.57, 0.013, 0.013, 0.03, 8, { rx: Math.PI / 2 });
    main.box('gun', 0, 0.06, -0.525, 0.024, 0.032, 0.022);
    main.box('gunDark', -0.009, 0.088, -0.525, 0.005, 0.03, 0.008);
    main.box('gunDark', 0.009, 0.088, -0.525, 0.005, 0.03, 0.008);
    main.box('gunDark', 0, 0.082, -0.525, 0.003, 0.018, 0.003);
    main.box('gun', 0, 0.084, -0.16, 0.03, 0.018, 0.03);
    main.box('gun', 0, -0.045, 0.045, 0.036, 0.105, 0.042, { rx: -0.3 });
    main.box('gun', 0, 0.01, 0.2, 0.04, 0.06, 0.22, { rx: 0.14 });
    main.box('gunDark', 0, -0.012, 0.31, 0.044, 0.085, 0.02, { rx: 0.14 });
    main.box('gunDark', 0, -0.012, -0.015, 0.01, 0.03, 0.006);
    const mag = new PartBuilder();
    for (let i = 0; i < 5; i++) {
      mag.box('gunDark', 0, -0.015 - i * 0.036, -0.1 - i * i * 0.0065, 0.03, 0.04, 0.05, { rx: -0.12 * i });
    }
    out.mag = mag;
  } else if (id === 'pistol') {
    main.box('gun', 0, 0.034, -0.055, 0.03, 0.022, 0.14);
    main.box('gun', 0, -0.02, 0.012, 0.031, 0.105, 0.046, { rx: 0.25 });
    main.box('gunDark', 0, 0.006, -0.03, 0.008, 0.02, 0.006);
    main.box('gunDark', 0, -0.006, -0.058, 0.008, 0.006, 0.055);
    const slide = new PartBuilder();
    slide.box('gun', 0, 0.062, -0.065, 0.032, 0.034, 0.18);
    slide.box('gunDark', 0, 0.082, -0.145, 0.006, 0.01, 0.01);
    slide.box('gunDark', -0.009, 0.082, 0.012, 0.006, 0.01, 0.01);
    slide.box('gunDark', 0.009, 0.082, 0.012, 0.006, 0.01, 0.01);
    for (let i = 0; i < 4; i++) slide.line(0.0165, 0.05, 0.0 - i * 0.008, 0.0165, 0.074, 0.0 - i * 0.008);
    out.slide = slide;
    const mag = new PartBuilder();
    mag.box('gunDark', 0, -0.078, 0.028, 0.034, 0.014, 0.05, { rx: 0.25 });
    out.mag = mag;
  }
  return out;
}

// Single merged geometry of a whole gun (all roles), for instancing.
export function mergedGunGeometry(id) {
  const parts = buildGun(id);
  const list = [];
  for (const pb of Object.values(parts)) {
    for (const geoms of Object.values(pb.parts)) list.push(...geoms);
  }
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g;
}
