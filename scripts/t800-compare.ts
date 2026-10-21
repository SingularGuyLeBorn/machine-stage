// ============================================================================
// 对比存档：GLB 原型 vs 机械拆解版（同一角度、同一姿态并排）
//
// 验收项："对比截图：GL块 vs 替换后的机械版（外形一致 + 内部有机械）"
//
// 用法：npx tsx scripts/t800-compare.ts
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import * as THREE from "three";
import { buildModel, type AssembledModel } from "../src/three/parts/assembler/assembler";
import {
  makeT800,
  makeT800Layouts,
  t800AllBuilders,
} from "../src/three/parts/models/t800/registry";
import { animateT800 } from "../src/three/parts/models/t800/motion";
import { applyExplode } from "../src/app/three/pose";

const OUT = "docs/qa/t800/compare";
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- PNG 编码
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 画布
class Canvas {
  data: Uint8Array;
  zbuf: Float32Array;
  constructor(
    public w: number,
    public h: number,
    bg: [number, number, number] = [232, 236, 241],
  ) {
    this.data = new Uint8Array(w * h * 3);
    this.zbuf = new Float32Array(w * h).fill(Infinity);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 3] = bg[0];
      this.data[i * 3 + 1] = bg[1];
      this.data[i * 3 + 2] = bg[2];
    }
  }
  set(x: number, y: number, c: [number, number, number]): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  putDepth(x: number, y: number, depth: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    if (depth >= this.zbuf[i]) return false;
    this.zbuf[i] = depth;
    return true;
  }
  /** 贴到另一张画布的指定位置。 */
  blitTo(target: Canvas, ox: number, oy: number): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 3;
        const d = ((y + oy) * target.w + (x + ox)) * 3;
        target.data[d] = this.data[s];
        target.data[d + 1] = this.data[s + 1];
        target.data[d + 2] = this.data[s + 2];
      }
    }
  }
  toPng(): Buffer {
    return encodePng(this.w, this.h, this.data);
  }
}

const MATERIAL_COLOR: Record<string, [number, number, number]> = {
  chrome: [176, 186, 199],
  bone: [150, 163, 178],
  mirror: [200, 210, 220],
  dark_chrome: [96, 105, 118],
  gunmetal: [78, 86, 97],
  frame: [62, 69, 79],
  rubber: [40, 44, 50],
  brass: [196, 158, 84],
  servo: [176, 74, 74],
};

const LIGHT = new THREE.Vector3(0.35, 0.75, 0.56).normalize();

const W = 640;
const H = 1040;
const SCALE = 520;

interface Shot {
  dir: THREE.Vector3;
  label: string;
}

const SHOTS: Shot[] = [
  { dir: new THREE.Vector3(1, 0, 0), label: "front" },
  { dir: new THREE.Vector3(0, 0, 1), label: "side" },
  { dir: new THREE.Vector3(0.7071, 0, 0.7071), label: "iso" },
];

function renderModel(
  model: AssembledModel,
  seconds: number,
  shot: Shot,
  explode = 0,
): Canvas {
  model.resetNodes();
  animateT800(model, seconds);
  model.syncInstances();
  if (explode > 0) {
    // 爆炸视图（用 app 里的同一套逻辑，存档与页面所见一致）
    applyExplode(model, explode);
    model.root.updateMatrixWorld(true);
  }

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, shot.dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(shot.dir, right).normalize();
  const project = (p: THREE.Vector3): [number, number] => [
    W / 2 + p.dot(right) * SCALE,
    H - 60 - p.dot(camUp) * SCALE,
  ];

  const canvas = new Canvas(W, H);
  const matrix = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (const handle of model.parts) {
    const base = MATERIAL_COLOR[handle.def.material] ?? [130, 138, 148];
    const pos = handle.geometry.attributes.position;
    const index = handle.geometry.index;
    const count = index ? index.count : pos.count;
    for (const instance of handle.instances) {
      model.instanceMatrix(handle, instance.index, matrix);
      for (let i = 0; i < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, ib).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, ic).applyMatrix4(matrix);
        n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
        if (!Number.isFinite(n.x)) continue;
        const shade = 0.35 + 0.65 * Math.abs(n.dot(LIGHT));
        const color: [number, number, number] = [
          Math.min(255, base[0] * shade),
          Math.min(255, base[1] * shade),
          Math.min(255, base[2] * shade),
        ];
        const [ax, ay] = project(a);
        const [bx, by] = project(b);
        const [cx, cy] = project(c);
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
            const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const depth = w0 * a.dot(shot.dir) + w1 * b.dot(shot.dir) + w2 * c.dot(shot.dir);
            if (!canvas.putDepth(x, y, depth)) continue;
            canvas.set(x, y, color);
          }
        }
      }
    }
  }
  return canvas;
}

// ---------------------------------------------------------------- 出图
const glb = buildModel(makeT800().registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});
const mech = buildModel(makeT800({ decompose: true }).registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts({ decompose: true }),
  warnMissingLayout: false,
});

for (const shot of SHOTS) {
  const left = renderModel(glb, 0, shot);
  const right = renderModel(mech, 0, shot);
  const out = new Canvas(W * 2 + 12, H);
  left.blitTo(out, 0, 0);
  right.blitTo(out, W + 12, 0);
  // 分隔线
  for (let y = 0; y < H; y++) {
    for (let d = 0; d < 2; d++) out.set(W + 5 + d, y, [160, 168, 178]);
  }
  writeFileSync(`${OUT}/glb-vs-mech-${shot.label}.png`, out.toPng());
  console.log("wrote", `glb-vs-mech-${shot.label}.png`, "(左：GLB 原型 / 右：机械拆解版)");
}

// 爆炸视图：机械版拆开看内部层次
for (const shot of SHOTS) {
  const exploded = renderModel(mech, 0, shot, 1);
  writeFileSync(`${OUT}/mech-exploded-${shot.label}.png`, exploded.toPng());
  console.log("wrote", `mech-exploded-${shot.label}.png`, "(机械拆解版 · 爆炸视图)");
}
console.log("done");
