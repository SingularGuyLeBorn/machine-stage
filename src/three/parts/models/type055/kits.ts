import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { T55, t55DeckHalf, t55DeckY, t55HalfAt, t55StemRake } from "./constants";

// ============================================================================
// models/type055/kits —— 055 舰体/甲板/上层建筑/阵面/螺旋桨专用几何
// 展示 1 单位 = 1 米。
// ============================================================================

const STATIONS = 72;

function stationZ(index: number): number {
  return T55.STERN_Z + ((T55.BOW_Z - T55.STERN_Z) * index) / (STATIONS - 1);
}

/** 单个横剖面：port→starboard，每个高度按艏柱前倾量回收 z。 */
function hullRing(z: number, ys: number[]): THREE.Vector3[] {
  const port = ys
    .map((y) => new THREE.Vector3(-t55HalfAt(z, y), y, z + t55StemRake(z, y)))
    .reverse();
  const starboard = ys.map((y) => new THREE.Vector3(t55HalfAt(z, y), y, z + t55StemRake(z, y)));
  return [...port, ...starboard];
}

function loft(ringYsAt: (z: number) => number[], cap: boolean): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < STATIONS; i++) rings.push(hullRing(stationZ(i), ringYsAt(stationZ(i))));
  const n = rings[0]!.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = i * n + j + 1;
      const c = (i + 1) * n + j + 1;
      const d = (i + 1) * n + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (cap) {
    const addCap = (ringIndex: number, forward: boolean) => {
      const ring = rings[ringIndex]!;
      const base = ringIndex * n;
      const center = new THREE.Vector3();
      for (const p of ring) center.add(p);
      center.multiplyScalar(1 / ring.length);
      const ci = positions.length / 3;
      positions.push(center.x, center.y, center.z);
      for (let j = 0; j < ring.length - 1; j++) {
        if (forward) indices.push(ci, base + j + 1, base + j);
        else indices.push(ci, base + j, base + j + 1);
      }
    };
    addCap(0, false);
    addCap(rings.length - 1, true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 水线以上隐身内倾外板（水线→随脊弧抬升的主甲板）。 */
export const type055HullShell: GeometryBuilder = () =>
  loft((z) => {
    const top = t55DeckY(z);
    return [T55.WATERLINE, T55.WATERLINE + (top - T55.WATERLINE) * 0.36, T55.WATERLINE + (top - T55.WATERLINE) * 0.7, top];
  }, true);

/** 水线以下防污漆壳体（龙骨→水线以上 0.03 重叠）。 */
export const type055HullUnderwater: GeometryBuilder = () =>
  loft(() => [0.4, 1.6, 3.0, 4.6, 6.0, T55.WATERLINE + 0.03], true);

/**
 * 甲板网格：沿脊弧逐站抬升，横向留 55mm 拱度（中间高、舷边低），
 * 上下面 + 舷边围板一次成形，避免平甲板插进抬高的艏部船壳。
 */
function deckGrid(topOffset: number, thickness: number): THREE.BufferGeometry {
  const nx = 20;
  const positions: number[] = [];
  const indices: number[] = [];
  const topY = (z: number, f: number) => t55DeckY(z) + topOffset - 0.055 * f * f;
  for (let i = 0; i < STATIONS; i++) {
    const z = stationZ(i);
    const half = t55DeckHalf(z);
    for (let j = 0; j <= nx; j++) {
      const f = (j / nx) * 2 - 1;
      positions.push(f * half, topY(z, f), z);
    }
  }
  const stride = nx + 1;
  const topStart = 0;
  for (let i = 0; i < STATIONS - 1; i++) {
    for (let j = 0; j < nx; j++) {
      const a = topStart + i * stride + j;
      const b = a + 1;
      const d = a + stride;
      const c = d + 1;
      indices.push(a, c, b, a, d, c);
    }
  }
  // 底面
  const bottomStart = positions.length / 3;
  for (let i = 0; i < STATIONS; i++) {
    const z = stationZ(i);
    const half = t55DeckHalf(z);
    for (let j = 0; j <= nx; j++) {
      const f = (j / nx) * 2 - 1;
      positions.push(f * half, topY(z, f) - thickness, z);
    }
  }
  for (let i = 0; i < STATIONS - 1; i++) {
    for (let j = 0; j < nx; j++) {
      const a = bottomStart + i * stride + j;
      const b = a + 1;
      const d = a + stride;
      const c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  // 舷边围板（左右）
  for (const side of [0, nx]) {
    for (let i = 0; i < STATIONS - 1; i++) {
      const t0 = topStart + i * stride + side;
      const t1 = topStart + (i + 1) * stride + side;
      const b0 = bottomStart + i * stride + side;
      const b1 = bottomStart + (i + 1) * stride + side;
      if (side === 0) indices.push(t0, b0, b1, t0, b1, t1);
      else indices.push(t0, t1, b1, t0, b1, b0);
    }
  }
  // 艏/艉端面
  for (const [i, flip] of [[0, false], [STATIONS - 1, true]] as const) {
    for (let j = 0; j < nx; j++) {
      const t0 = topStart + i * stride + j;
      const t1 = t0 + 1;
      const b0 = bottomStart + i * stride + j;
      const b1 = b0 + 1;
      if (flip) indices.push(t0, b1, t1, t0, b0, b1);
      else indices.push(t0, t1, b1, t0, b1, b0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 主甲板：顶面随脊弧（舰中 14.2m）、板厚 0.2m。 */
export const type055Deck: GeometryBuilder = () => deckGrid(0.2, 0.2);

/** 甲板底封板：仰视不穿帮。 */
export const type055DeckUnderside: GeometryBuilder = () => deckGrid(0.0, 0.06);

/** 水线漆带：6.25→7.15m 黑色环带，贴壳外 25mm。 */
export const type055BootTop: GeometryBuilder = () => {
  const stations = 56;
  const ys = [6.25, 6.75, 7.15];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < stations; i++) {
    const z = T55.STERN_Z + ((T55.BOW_Z - T55.STERN_Z) * i) / (stations - 1);
    for (const y of ys) {
      positions.push(-(t55HalfAt(z, y) + 0.025), y, z + t55StemRake(z, y));
    }
    for (const y of [...ys].reverse()) {
      positions.push(t55HalfAt(z, y) + 0.025, y, z + t55StemRake(z, y));
    }
  }
  const n = ys.length * 2;
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c = (i + 1) * n + j + 1;
      const d = (i + 1) * n + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 球鼻艏：前伸的低阻声呐导流罩，和艏柱前倾一起形成前踵。 */
export const type055BulbousBow: GeometryBuilder = () => {
  const bulb = new THREE.SphereGeometry(1, 30, 20);
  bulb.scale(1.55, 1.85, 4.35);
  bulb.translate(0, 4.35, 84.3);
  return bulb;
};

/** 舷号 101：白漆挤出数字（真字形轮廓，不是方块拼数）。 */
export const type055HullNumber: GeometryBuilder = () => {
  const one = () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.34, 0);
    shape.lineTo(0.16, 0);
    shape.lineTo(0.16, 1.98);
    shape.lineTo(0.58, 1.98);
    shape.lineTo(0.58, 2.4);
    shape.lineTo(0.02, 2.4);
    shape.lineTo(-0.34, 2.06);
    shape.lineTo(-0.34, 0);
    return shape;
  };
  const zero = () => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 1.2, 0.52, 1.2, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 1.2, 0.32, 0.98, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    return shape;
  };
  const digits: Array<[THREE.Shape, number]> = [
    [one(), -1.15],
    [zero(), 0],
    [one(), 0.83],
  ];
  // 数字底部用一条细基线与三个数字相连（单件，不留白色底板）。
  const baseline = new THREE.BoxGeometry(3.3, 0.07, 0.04);
  baseline.translate(0, 0.035, -0.01);
  const parts = digits.map(([shape, x]) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
      curveSegments: 16,
      steps: 1,
    });
    geometry.translate(x, 0, 0);
    return geometry;
  });
  return merge([baseline, ...parts]);
};

/** 通用垂发井盖：盖板 + 加强筋 + 锁钩。 */
export const type055VlsHatch: GeometryBuilder = () =>
  merge([
    new THREE.BoxGeometry(1.04, 0.08, 1.04).translate(0, 0, 0),
    new THREE.BoxGeometry(0.88, 0.03, 0.88).translate(0, 0.055, 0),
    new THREE.BoxGeometry(0.12, 0.13, 0.08).translate(-0.4, 0.03, 0.4),
    new THREE.BoxGeometry(0.12, 0.13, 0.08).translate(0.4, 0.03, 0.4),
  ]);

/** 冷发射导弹：弹体 + 头锥 + 尾翼 + 底部燃气发生器。原点在弹体中心。 */
export const type055VlsMissile: GeometryBuilder = () => {
  const fins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.CylinderGeometry(0.03, 0.11, 0.62, 5);
    fin.rotateZ(a);
    fin.rotateX(Math.PI / 2);
    fin.translate(Math.cos(a) * 0.34, -2.15, Math.sin(a) * 0.34);
    fins.push(fin);
  }
  return merge([
    new THREE.CylinderGeometry(0.28, 0.28, 5.2, 20),
    new THREE.CylinderGeometry(0.02, 0.28, 1.05, 20).translate(0, 3.12, 0),
    new THREE.CylinderGeometry(0.3, 0.3, 0.16, 20).translate(0, -2.66, 0),
    ...fins,
  ]);
};

/** 导弹尾焰（挂在弹体节点上，静止时藏在发射筒内）。 */
export const type055VlsFlame: GeometryBuilder = () =>
  new THREE.CylinderGeometry(0.32, 0.04, 3.0, 14, 1, true).translate(0, -4.2, 0);

/**
 * 双机库壳体：左右壁 + 顶盖 + 前壁，艉端敞开装门。
 * 旧版是实心四棱台，开门后只能看到一堵实心墙；改成双层壳后机库内部可见。
 * 局部原点在机库底面中心（z 轴 +9 为前壁，-9 为艉端门洞）。
 */
export const type055HangarShell: GeometryBuilder = () => {
  const h = 6.4;
  const zb = -9;
  const zf = 9;
  const wb = 6.3;
  const wt = 5.6;
  const positions: number[] = [
    -wb, 0, zb, -wt, h, zb, -wt, h, zf, -wb, 0, zf, // 左壁
    wb, 0, zb, wt, h, zb, wt, h, zf, wb, 0, zf, // 右壁
    -wt, h, zb, wt, h, zb, wt, h, zf, -wt, h, zf, // 顶盖
    -wb, 0, zf, wb, 0, zf, wt, h, zf, -wt, h, zf, // 前壁
  ];
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 4;
    indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * 舰桥壳体：两侧壁/后壁/顶盖 + 前壁窗框（下槛/上楣/两侧立柱），正面留窗洞。
 * 旧版舰桥是实心四棱台，第一人称坐进去只能看到一堵实心墙；改成空腔后
 * 舰桥内能看见显控台，并能透过前窗看到舰艏。
 */
export const type055BridgeShell: GeometryBuilder = () => {
  const h = 5.5;
  const wb = 4.8;
  const wt = 4.1;
  const db = 7.5;
  const dt = 6.25;
  const positions: number[] = [];
  const indices: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // 两侧壁
  quad([-wb, 0, -db], [-wt, h, -dt], [-wt, h, dt], [-wb, 0, db]);
  quad([wb, 0, -db], [wb, 0, db], [wt, h, dt], [wt, h, -dt]);
  // 后壁 + 顶盖
  quad([-wb, 0, -db], [wb, 0, -db], [wt, h, -dt], [-wt, h, -dt]);
  quad([-wt, h, -dt], [wt, h, -dt], [wt, h, dt], [-wt, h, dt]);
  // 前壁下槛
  const y0 = 1.05;
  const y1 = 3.35;
  const xAt = (y: number) => wb - (wb - wt) * (y / h);
  const zAt = (y: number) => db - (db - dt) * (y / h);
  quad([-wb, 0, db], [wb, 0, db], [xAt(y0), y0, zAt(y0)], [-xAt(y0), y0, zAt(y0)]);
  // 前壁上楣
  quad([-xAt(y1), y1, zAt(y1)], [xAt(y1), y1, zAt(y1)], [wt, h, dt], [-wt, h, dt]);
  // 前壁左右立柱
  for (const side of [-1, 1] as const) {
    quad(
      [side * 3.4, y0, zAt(y0)],
      [side * xAt(y0), y0, zAt(y0)],
      [side * xAt(y1), y1, zAt(y1)],
      [side * 3.4, y1, zAt(y1)],
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 艏部舷墙：沿脊弧从 52m 到 88.5m，两侧 0.75m 高、顶部内倾 0.12m。 */
export const type055Bulwark: GeometryBuilder = () => {
  const stations = 22;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1] as const) {
    const start = positions.length / 3;
    for (let i = 0; i < stations; i++) {
      const z = 52 + ((88.5 - 52) * i) / (stations - 1);
      const x = side * (t55DeckHalf(z) - 0.02);
      const y = t55DeckY(z) + 0.2;
      positions.push(x, y, z, x - side * 0.12, y + 0.75, z);
    }
    for (let i = 0; i < stations - 1; i++) {
      const a = start + i * 2;
      const b = a + 1;
      const c = a + 3;
      const d = a + 2;
      if (side > 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, d, c, a, c, b);
    }
  }
  // 艏端横向舷墙，把左右两侧连成一件。
  const zBow = 88.5;
  const halfBow = t55DeckHalf(zBow) - 0.02;
  const yBow = t55DeckY(zBow) + 0.2;
  const bowStart = positions.length / 3;
  positions.push(-halfBow, yBow, zBow, halfBow, yBow, zBow, halfBow - 0.12, yBow + 0.75, zBow, -halfBow + 0.12, yBow + 0.75, zBow);
  indices.push(bowStart, bowStart + 2, bowStart + 1, bowStart, bowStart + 3, bowStart + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

function stripePositions(x0: number, x1: number, z0: number, z1: number, width: number): number[] {
  const y0 = t55DeckY(z0) + 0.212;
  const y1 = t55DeckY(z1) + 0.212;
  const hw = width / 2;
  return [x0 - hw, y0, z0, x0 + hw, y0, z0, x1 + hw, y1, z1, x1 - hw, y1, z1];
}

/** 甲板纵向安全走道线（随脊弧分成短段）。 */
export const type055DeckWalkLines: GeometryBuilder = () => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < 10; s++) {
      const z0 = -38 + s * 9.2;
      const z1 = z0 + 9.2;
      const quad = stripePositions(
        side * (t55DeckHalf(z0) - 1.05),
        side * (t55DeckHalf(z1) - 1.05),
        z0,
        z1,
        0.1,
      );
      const base = positions.length / 3;
      positions.push(...quad);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 垂发危险区黄色虚线（前后两阵左右各一列）。 */
export const type055DeckDashes: GeometryBuilder = () => {
  const positions: number[] = [];
  const indices: number[] = [];
  const addDash = (x0: number, x1: number, z0: number, z1: number) => {
    const quad = stripePositions(x0, x1, z0, z1, 0.12);
    const base = positions.length / 3;
    positions.push(...quad);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [z0, z1] of [
    [42.8, 54.1],
    [-53.0, -44.0],
  ] as const) {
    for (const side of [-1, 1] as const) {
      for (let z = z0; z < z1; z += 1.4) addDash(side * 5.75, side * 5.75, z, Math.min(z + 0.85, z1));
    }
    for (let x = -5.4; x < 5.4; x += 1.4) {
      addDash(x, Math.min(x + 0.85, 5.4), z0, z1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 刚性充气艇：艇体 + 两侧浮筒 + 操控台 + 舷外机。原点在艇底中心。 */
export const type055Rhib: GeometryBuilder = () => {
  const hull = new THREE.SphereGeometry(1, 20, 12);
  hull.scale(1.05, 0.55, 2.5);
  hull.translate(0, 0.35, 0);
  const tubes: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const tube = new THREE.CylinderGeometry(0.24, 0.24, 4.5, 12);
    tube.rotateX(Math.PI / 2);
    tube.translate(side * 0.95, 0.55, 0);
    tubes.push(tube);
  }
  return merge([
    hull,
    ...tubes,
    new THREE.BoxGeometry(0.9, 0.55, 1.0).translate(0, 0.8, 0.35),
    new THREE.BoxGeometry(0.7, 0.65, 0.5).translate(0, 0.7, -2.35),
  ]);
};

/** 四棱台（隐身内倾上层建筑/桅杆/炮塔壳体）；原点在底面中心。 */
export const type055Frustum: GeometryBuilder = (spec) => {
  const p = (spec as { params?: { w0?: number; d0?: number; w1?: number; d1?: number; h?: number } }).params ?? {};
  const w0 = (p.w0 ?? 10) / 2;
  const d0 = (p.d0 ?? 10) / 2;
  const w1 = (p.w1 ?? 8) / 2;
  const d1 = (p.d1 ?? 8) / 2;
  const h = p.h ?? 5;
  const bottom = [
    new THREE.Vector3(-w0, 0, -d0),
    new THREE.Vector3(w0, 0, -d0),
    new THREE.Vector3(w0, 0, d0),
    new THREE.Vector3(-w0, 0, d0),
  ];
  const top = [
    new THREE.Vector3(-w1, h, -d1),
    new THREE.Vector3(w1, h, -d1),
    new THREE.Vector3(w1, h, d1),
    new THREE.Vector3(-w1, h, d1),
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z);
    return positions.length / 3 - 1;
  };
  const b = bottom.map(push);
  const t = top.map(push);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    indices.push(b[i]!, b[j]!, t[j]!, b[i]!, t[j]!, t[i]!);
  }
  indices.push(b[0]!, b[2]!, b[1]!, b[0]!, b[3]!, b[2]!);
  indices.push(t[0]!, t[1]!, t[2]!, t[0]!, t[2]!, t[3]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * 346B 阵面：暗色底板 + 外框 + 四角安装螺栓。
 * 阵元凸台不再单独建几何——深色小凸台在斜视高光下会被 bloom 洗成一片白块；
 * 阵元以 256 个内侧 T/R 组件实例表达，正面保持整块低反射阵列。
 */
export const type055AesaPanel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: { w?: number; h?: number } }).params ?? {};
  const w = p.w ?? 4.2;
  const h = p.h ?? 3.4;
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(w, h, 0.16),
    new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.12).translate(0, 0, 0.02),
  ];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const bolt = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8);
      bolt.rotateX(Math.PI / 2);
      bolt.translate(sx * (w / 2 - 0.16), sy * (h / 2 - 0.16), 0.12);
      parts.push(bolt);
    }
  }
  return merge(parts);
};

function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // 简化合并：全部转非索引后拼 position/normal/uv，避免引入额外依赖。
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.getAttribute("position").count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;
  for (const g of parts) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const u = g.getAttribute("uv");
    pos.set(p.array as Float32Array, offset * 3);
    if (n) nor.set(n.array as Float32Array, offset * 3);
    if (u) uv.set(u.array as Float32Array, offset * 2);
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

/** 五叶可调距螺旋桨：桨毂 + 5 片扭转桨叶（用 weld 圆柱近似真实叶片）。 */
export const type055Propeller: GeometryBuilder = () => {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 2.4;
    const blade = new THREE.CylinderGeometry(0.16, 0.42, r, 8);
    blade.translate(0, r / 2, 0);
    blade.rotateZ(a);
    blade.rotateX(0.42);
    blades.push(blade);
  }
  const hub = new THREE.CylinderGeometry(0.42, 0.5, 0.7, 16);
  blades.push(hub);
  return merge(blades);
};

/** 直升机甲板：防滑涂层圆 + 中心 H + 系留格栅，作为甲板贴面。 */
export const type055Helipad: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const circle = new THREE.TorusGeometry(6.8, 0.14, 6, 48);
  circle.rotateX(Math.PI / 2);
  parts.push(circle);
  const h1 = new THREE.BoxGeometry(0.45, 0.04, 5.2);
  h1.translate(-1.5, 0.02, 0);
  const h2 = h1.clone();
  h1.translate(0, 0, 0);
  const h3 = new THREE.BoxGeometry(3.0, 0.04, 0.45);
  h3.translate(0, 0.02, 0);
  const h2b = h2.clone();
  h2b.translate(3.0, 0, 0);
  parts.push(h1, h2b, h3);
  // 中线把 H 与圆圈连成一件，避免合并件内部孤岛。
  const centreFore = new THREE.BoxGeometry(0.14, 0.04, 4.2);
  centreFore.translate(0, 0.02, 4.7);
  const centreAft = centreFore.clone();
  centreAft.translate(0, 0, -9.4);
  parts.push(centreFore, centreAft);
  return merge(parts);
};

/** 130mm 主炮炮塔：内倾多面体（四棱台）+ 炮座。 */
export const type055GunTurret: GeometryBuilder = () => {
  const body = new THREE.CylinderGeometry(1.9, 2.35, 2.3, 6);
  body.translate(0, 1.15, 0);
  const roof = new THREE.BoxGeometry(2.9, 0.18, 3.4);
  roof.translate(0, 2.22, -0.1);
  const mantlet = new THREE.BoxGeometry(1.3, 0.95, 0.6);
  mantlet.translate(0, 1.35, 1.55);
  return merge([body, roof, mantlet]);
};
