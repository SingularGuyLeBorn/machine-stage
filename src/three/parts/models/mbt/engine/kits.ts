import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  spurGearGeometry,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/mbt/engine/kits —— V12 柴油机专用几何
//
// 所有 kit 都在「发动机局部系」建模（+X 曲轴轴 / +Y 上 / +Z 车头），
// 装配时由 registry 的 mate/rotation 安放到车体坐标。轴类件默认轴 = X。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`mbt engine kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

/** 绕 X 轴旋转到指定角度（弧度）的辅助。 */
function aroundX(geometry: THREE.BufferGeometry, angle: number): THREE.BufferGeometry {
  geometry.rotateX(angle);
  return geometry;
}

const dieselPiston: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0721);
  const crown = num(p, "crown", 0.046);
  const skirt = num(p, "skirt", 0.056);
  const grooveR = num(p, "grooveR", 0.0694);
  const ringY = [0.04, 0.026, 0.012];
  const profile: [number, number][] = [
    [0, -skirt],
    [r * 0.72, -skirt],
    [r, -skirt + 0.006],
    [r, ringY[2]! - 0.003],
    [grooveR, ringY[2]! - 0.002],
    [grooveR, ringY[2]! + 0.002],
    [r, ringY[2]! + 0.003],
    [r, ringY[1]! - 0.003],
    [grooveR, ringY[1]! - 0.002],
    [grooveR, ringY[1]! + 0.002],
    [r, ringY[1]! + 0.003],
    [r, ringY[0]! - 0.003],
    [grooveR, ringY[0]! - 0.002],
    [grooveR, ringY[0]! + 0.002],
    [r, ringY[0]! + 0.003],
    [r, crown - 0.008],
    [r - 0.003, crown],
    [0, crown],
  ];
  return latheGeometry(profile, 36);
};

const conRod: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.335);
  const bigR = num(p, "bigR", 0.052);
  const bigBore = num(p, "bigBore", 0.0305);
  const smallR = num(p, "smallR", 0.027);
  const smallBore = num(p, "smallBore", 0.0192);
  const shankW = num(p, "shankW", 0.032);
  const shankT = num(p, "shankT", 0.024);
  const parts: THREE.BufferGeometry[] = [];
  const big = tubeGeometry(bigR, bigBore, shankW, 24);
  big.rotateZ(Math.PI / 2);
  big.translate(0, -length, 0);
  parts.push(big);
  const small = tubeGeometry(smallR, smallBore, shankW * 0.82, 20);
  small.rotateZ(Math.PI / 2);
  parts.push(small);
  const shank = bevelBoxGeometry(shankT, length - bigR - smallR + 0.02, shankW * 0.78, 0.004);
  shank.translate(0, -(length - bigR - smallR) / 2 - smallR + 0.01, 0);
  parts.push(shank);
  // 工字筋
  for (const x of [-shankT / 2 - 0.003, shankT / 2 + 0.003]) {
    const rib = bevelBoxGeometry(0.006, length - bigR - smallR, 0.014, 0.002);
    rib.translate(x, -(length - bigR - smallR) / 2 - smallR + 0.01, 0);
    parts.push(rib);
  }
  return mergeGeometries(parts);
};

const rodCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const bigR = num(p, "bigR", 0.052);
  const bigBore = num(p, "bigBore", 0.0305);
  const width = num(p, "width", 0.032);
  const parts: THREE.BufferGeometry[] = [];
  const half = tubeGeometry(bigR, bigBore, width, 24);
  half.rotateZ(Math.PI / 2);
  // 只保留下半：切掉上半用薄盖板替代（视觉上仍是剖分瓦盖）
  half.translate(0, -0.012, 0);
  parts.push(half);
  parts.push(bevelBoxGeometry(width, 0.018, bigR * 1.7, 0.003).translate(0, -bigR - 0.008, 0));
  for (const z of [-bigR * 0.55, bigR * 0.55]) {
    parts.push(
      bevelBoxGeometry(width + 0.012, 0.03, 0.02, 0.002).translate(0, -bigR + 0.008, z),
    );
  }
  return mergeGeometries(parts);
};

const rodBearing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const outer = num(p, "outer", 0.038);
  const inner = num(p, "inner", 0.0315);
  const width = num(p, "width", 0.028);
  const bearing = tubeGeometry(outer, inner, width, 24);
  bearing.rotateZ(Math.PI / 2);
  return bearing;
};

const dieselValve: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const discR = num(p, "discR", 0.026);
  const stemR = num(p, "stemR", 0.007);
  const len = num(p, "len", 0.115);
  const profile: [number, number][] = [
    [0, -0.009],
    [discR, -0.009],
    [discR, -0.003],
    [discR * 0.72, 0.001],
    [stemR * 1.5, 0.006],
    [stemR, 0.014],
    [stemR, len],
    [0, len],
  ];
  return latheGeometry(profile, 24);
};

const valveSpring: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.019);
  const free = num(p, "free", 0.075);
  const parts: THREE.BufferGeometry[] = [];
  const coils = 9;
  for (let i = 0; i < coils; i++) {
    const y = (i / (coils - 1)) * free;
    const ring = tubeGeometry(r, r - 0.0022, 0.0034, 20);
    ring.translate(0, y - free / 2, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts);
};

const valveRocker: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const arm = num(p, "arm", 0.052);
  const parts: THREE.BufferGeometry[] = [];
  const boss = cylinderGeometry(0.014, 0.034, 0.014, 18, 0.001);
  boss.rotateZ(Math.PI / 2);
  parts.push(boss);
  const beam = bevelBoxGeometry(0.028, 0.012, arm, 0.003);
  beam.translate(0, -0.004, arm / 2);
  parts.push(beam);
  const pad = cylinderGeometry(0.012, 0.008, 0.012, 16, 0.001);
  pad.rotateX(Math.PI / 2);
  pad.translate(0, -0.014, arm - 0.006);
  parts.push(pad);
  const screw = cylinderGeometry(0.006, 0.018, 0.006, 12, 0.001);
  screw.translate(0, 0.012, arm * 0.42);
  parts.push(screw);
  return mergeGeometries(parts);
};

/** 桥式摇臂：一根摇臂同时压两个同名气门（每缸进/排各一根）。 */
const rockerBridge: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const arm = num(p, "arm", 0.039);
  const span = num(p, "span", 0.07);
  const parts: THREE.BufferGeometry[] = [];
  const boss = cylinderGeometry(0.016, 0.04, 0.016, 18, 0.001);
  boss.rotateZ(Math.PI / 2);
  parts.push(boss);
  const beam = bevelBoxGeometry(0.026, 0.014, arm, 0.003);
  beam.translate(0, -0.002, arm / 2);
  parts.push(beam);
  const bridge = bevelBoxGeometry(span, 0.016, 0.022, 0.003);
  bridge.translate(0, -0.006, arm - 0.008);
  parts.push(bridge);
  for (const x of [-span / 2 + 0.01, span / 2 - 0.01]) {
    const pad = cylinderGeometry(0.011, 0.007, 0.011, 14, 0.001);
    pad.rotateX(Math.PI / 2);
    pad.translate(x, -0.016, arm - 0.008);
    parts.push(pad);
  }
  const screw = cylinderGeometry(0.006, 0.018, 0.006, 12, 0.001);
  screw.translate(0, 0.014, arm * 0.4);
  parts.push(screw);
  return mergeGeometries(parts);
};

/** 推杆总成：推杆 + 滚子挺杆 + 球头。 */
const pushrodAssembly: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.13);
  const r = num(p, "r", 0.007);
  const parts: THREE.BufferGeometry[] = [];
  const rod = cylinderGeometry(r, length, r, 14, 0.001);
  rod.translate(0, length / 2, 0);
  parts.push(rod);
  const ball = new THREE.SphereGeometry(r * 1.7, 12, 8);
  ball.translate(0, length, 0);
  parts.push(ball);
  const tappet = cylinderGeometry(0.013, 0.034, 0.011, 16, 0.001);
  tappet.translate(0, 0.01, 0);
  parts.push(tappet);
  const roller = cylinderGeometry(0.009, 0.014, 0.009, 14, 0.001);
  roller.rotateZ(Math.PI / 2);
  roller.translate(0, -0.006, 0);
  parts.push(roller);
  return mergeGeometries(parts);
};

const valveTappet: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.011);
  const h = num(p, "h", 0.036);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinderGeometry(r, h, r, 18, 0.001));
  const roller = cylinderGeometry(r * 0.7, 0.012, r * 0.7, 16, 0.001);
  roller.rotateZ(Math.PI / 2);
  roller.translate(0, h / 2, 0);
  parts.push(roller);
  return mergeGeometries(parts);
};

const camshaftAssembly: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.9);
  const shaftR = num(p, "shaftR", 0.022);
  const lobeR = num(p, "lobeR", 0.029);
  const lobeW = num(p, "lobeW", 0.018);
  const pitch = num(p, "pitch", 0.16);
  const x1 = num(p, "x1", 0.4);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = cylinderGeometry(shaftR, length, shaftR, 20, 0.001);
  shaft.rotateZ(Math.PI / 2);
  parts.push(shaft);
  for (let pin = 0; pin < 6; pin++) {
    // 每缸两根桥式摇臂（进/排），凸轮相位相差 180°
    for (const [dx, phaseOffset] of [
      [-0.035, 0],
      [0.035, Math.PI],
    ] as const) {
      const phase = (pin * 60 * Math.PI) / 180 + phaseOffset;
      const lobe = cylinderGeometry(lobeR, lobeW, lobeR, 24, 0.001);
      lobe.rotateZ(Math.PI / 2);
      lobe.translate(x1 - pin * pitch + dx, Math.cos(phase) * 0.008, Math.sin(phase) * 0.008);
      parts.push(lobe);
    }
  }
  for (let j = 0; j < 7; j++) {
    const journal = cylinderGeometry(shaftR + 0.006, 0.018, shaftR + 0.006, 20, 0.001);
    journal.rotateZ(Math.PI / 2);
    journal.translate(0.48 - j * 0.16, 0, 0);
    parts.push(journal);
  }
  return mergeGeometries(parts);
};

const turboRotor: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const hubR = num(p, "hubR", 0.018);
  const wheelR = num(p, "wheelR", 0.055);
  const bladeCount = num(p, "bladeCount", 11);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = cylinderGeometry(hubR, 0.2, hubR, 16, 0.001);
  shaft.rotateZ(Math.PI / 2);
  parts.push(shaft);
  for (const [x, r, count] of [
    [-0.07, wheelR, bladeCount],
    [0.07, wheelR * 0.92, bladeCount + 2],
  ] as const) {
    const disc = cylinderGeometry(r * 0.32, 0.016, r * 0.32, 20, 0.001);
    disc.rotateZ(Math.PI / 2);
    disc.translate(x, 0, 0);
    parts.push(disc);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const blade = bevelBoxGeometry(0.008, r * 0.62, 0.028, 0.002);
      blade.translate(x, Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56);
      blade.rotateX(a);
      parts.push(blade);
    }
  }
  return mergeGeometries(parts);
};

const v12Fan: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.22);
  const parts: THREE.BufferGeometry[] = [];
  const hub = cylinderGeometry(r * 0.2, 0.06, r * 0.2, 20, 0.002);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const blade = bevelBoxGeometry(0.028, r * 0.8, 0.07, 0.004);
    blade.translate(0, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    blade.rotateX(a + 0.35);
    parts.push(blade);
  }
  return mergeGeometries(parts);
};

const pulley: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.07);
  const w = num(p, "w", 0.045);
  const parts: THREE.BufferGeometry[] = [];
  const body = tubeGeometry(r, r - 0.014, w, 28);
  body.rotateZ(Math.PI / 2);
  parts.push(body);
  for (const x of [-w * 0.28, w * 0.28]) {
    const flange = tubeGeometry(r + 0.008, r - 0.006, 0.006, 28);
    flange.rotateZ(Math.PI / 2);
    flange.translate(x, 0, 0);
    parts.push(flange);
  }
  const hub = cylinderGeometry(r * 0.28, w + 0.02, r * 0.28, 18, 0.002);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  return mergeGeometries(parts);
};

const flywheelAssembly: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.18);
  const teeth = num(p, "teeth", 118);
  const parts: THREE.BufferGeometry[] = [];
  const disc = cylinderGeometry(r, 0.026, r, 40, 0.002);
  disc.rotateZ(Math.PI / 2);
  parts.push(disc);
  const gear = spurGearGeometry(teeth, r + 0.004, 0.02, r - 0.01, 0.0008);
  gear.rotateY(Math.PI / 2);
  parts.push(gear);
  const pilot = cylinderGeometry(0.042, 0.06, 0.042, 20, 0.002);
  pilot.rotateZ(Math.PI / 2);
  pilot.translate(-0.02, 0, 0);
  parts.push(pilot);
  return mergeGeometries(parts);
};

/** 每缸独立缸盖框：四面壁围出气门室，上下贯通（x 光下能看到气门动作）。
 *  气门座圈与导管随缸盖一起铸出（不作为独立件，避免每缸 4 组小件把零件树撑爆）。 */
const cylinderHead: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.152);
  const d = num(p, "d", 0.15);
  const h = num(p, "h", 0.078);
  const wall = num(p, "wall", 0.012);
  const vx = num(p, "vx", 0.035);
  const vz = num(p, "vz", 0.036);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-d / 2 + wall / 2, d / 2 - wall / 2]) {
    parts.push(bevelBoxGeometry(w, h, wall, 0.002).translate(0, h / 2, z));
  }
  for (const x of [-w / 2 + wall / 2, w / 2 - wall / 2]) {
    parts.push(bevelBoxGeometry(wall, h, d - wall * 2, 0.002).translate(x, h / 2, 0));
  }
  // 4 个气门座圈 + 导管（缸盖铸件的一部分）
  for (const ax of [-vx, vx]) {
    for (const az of [-vz, vz]) {
      const seat = tubeGeometry(0.0315, 0.0268, 0.004, 22);
      seat.translate(ax, 0.0005, az);
      parts.push(seat);
      const guide = tubeGeometry(0.0115, 0.0086, 0.062, 18);
      guide.translate(ax, 0.034, az);
      parts.push(guide);
    }
  }
  return mergeGeometries(parts);
};

const bankBlock: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 1.02);
  const width = num(p, "width", 0.21);
  const height = num(p, "height", 0.29);
  const wall = num(p, "wall", 0.02);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(length, wall, width, 0.003).translate(0, wall / 2, 0));
  for (const z of [-width / 2 + wall / 2, width / 2 - wall / 2]) {
    parts.push(bevelBoxGeometry(length, height, wall, 0.003).translate(0, height / 2, z));
  }
  for (const x of [-length / 2 + wall / 2, length / 2 - wall / 2]) {
    parts.push(bevelBoxGeometry(wall, height, width - wall * 2, 0.003).translate(x, height / 2, 0));
  }
  return mergeGeometries(parts);
};

const liner: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const inner = num(p, "inner", 0.0725);
  const outer = num(p, "outer", 0.078);
  const h = num(p, "h", 0.285);
  const parts: THREE.BufferGeometry[] = [];
  const barrel = tubeGeometry(outer, inner, h, 32);
  parts.push(barrel);
  const flange = tubeGeometry(outer + 0.014, inner, 0.012, 32);
  flange.translate(0, h / 2, 0);
  parts.push(flange);
  return mergeGeometries(parts);
};

const injectorBody: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const h = num(p, "h", 0.14);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinderGeometry(0.013, h * 0.55, 0.013, 16, 0.001).translate(0, h * 0.3, 0));
  parts.push(cylinderGeometry(0.009, h * 0.34, 0.006, 14, 0.001).translate(0, -h * 0.14, 0));
  parts.push(cylinderGeometry(0.019, 0.016, 0.019, 16, 0.001).translate(0, h * 0.55, 0));
  parts.push(bevelBoxGeometry(0.05, 0.012, 0.022, 0.002).translate(0, h * 0.48, 0));
  return mergeGeometries(parts);
};

const turboHousing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.08);
  const w = num(p, "w", 0.09);
  const parts: THREE.BufferGeometry[] = [];
  const snail = tubeGeometry(r, r * 0.8, w, 28);
  snail.rotateZ(Math.PI / 2);
  parts.push(snail);
  const inlet = tubeGeometry(r * 0.34, r * 0.28, 0.1, 20);
  inlet.translate(0, r * 1.15, 0);
  parts.push(inlet);
  const outlet = cylinderGeometry(r * 0.3, 0.08, r * 0.3, 18, 0.001);
  outlet.rotateZ(Math.PI / 2);
  outlet.translate(w / 2 + 0.055, 0, 0);
  parts.push(outlet);
  return mergeGeometries(parts);
};

const intercoolerCore: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.5);
  const h = num(p, "h", 0.42);
  const d = num(p, "d", 0.12);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, d, 0.006));
  for (let i = 0; i < 13; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 13);
    parts.push(bevelBoxGeometry(0.012, h * 0.92, d + 0.006, 0.001).translate(x, 0, 0));
  }
  for (const y of [-h / 2 - 0.022, h / 2 + 0.022]) {
    parts.push(cylinderGeometry(0.024, w * 0.92, 0.024, 18, 0.001).rotateZ(Math.PI / 2).translate(0, y, 0));
  }
  return mergeGeometries(parts);
};

const radiatorCore: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.72);
  const h = num(p, "h", 0.58);
  const d = num(p, "d", 0.09);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, d, 0.006));
  for (let i = 0; i < 17; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 17);
    parts.push(bevelBoxGeometry(0.01, h * 0.94, d + 0.004, 0.001).translate(x, 0, 0));
  }
  for (const y of [-h / 2 - 0.02, h / 2 + 0.02]) {
    parts.push(bevelBoxGeometry(w + 0.04, 0.04, d + 0.04, 0.004).translate(0, y, 0));
  }
  return mergeGeometries(parts);
};

const gearBlank: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const teeth = num(p, "teeth", 24);
  const r = num(p, "r", 0.06);
  const w = num(p, "w", 0.03);
  const bore = num(p, "bore", 0.016);
  const gear = spurGearGeometry(teeth, r, w, bore, 0.0008);
  gear.rotateY(Math.PI / 2);
  return gear;
};

const springStack: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.024);
  const h = num(p, "h", 0.1);
  const parts: THREE.BufferGeometry[] = [];
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const ring = tubeGeometry(r, r - 0.0026, 0.004, 18);
    ring.translate(0, -h / 2 + (i / (rings - 1)) * h, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts);
};

const accumulatorSphere: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.065);
  const parts: THREE.BufferGeometry[] = [];
  const sphere = new THREE.SphereGeometry(r, 24, 16);
  parts.push(sphere);
  parts.push(tubeGeometry(r * 0.38, r * 0.28, 0.05, 18).translate(0, -r - 0.02, 0));
  return mergeGeometries(parts);
};

const wireRing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.05);
  const tubeR = num(p, "tubeR", 0.004);
  return tubeGeometry(r + tubeR, r - tubeR, 0.012, 24);
};

export const mbtEngineKitBuilders: Record<string, GeometryBuilder> = {
  dieselPiston,
  conRod,
  rodCap,
  rodBearing,
  dieselValve,
  valveSpring,
  valveRocker,
  rockerBridge,
  pushrodAssembly,
  valveTappet,
  camshaftAssembly,
  turboRotor,
  v12Fan,
  pulley,
  flywheelAssembly,
  cylinderHead,
  bankBlock,
  liner,
  injectorBody,
  turboHousing,
  intercoolerCore,
  radiatorCore,
  gearBlank,
  springStack,
  accumulatorSphere,
  wireRing,
};

// 供 registry 生成器使用的小工具。
export function rotateAroundX(geometry: THREE.BufferGeometry, angle: number): THREE.BufferGeometry {
  return aroundX(geometry, angle);
}
