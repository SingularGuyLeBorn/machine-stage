// 整机演示：渲染完整步态循环（侧视 + 斜 45°），交给 ffmpeg 编码成 mp4/gif
// 用法：npx tsx scripts/t800-demo.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800, makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { animateT800, t800CylinderReadout, t800Pose } from "../src/three/parts/models/t800/motion";

const MECH = process.argv.includes("--mech");
const OUT = MECH ? "docs/qa/t800/demo-mech" : "docs/qa/t800/demo";
mkdirSync(OUT, { recursive: true });

const registry = MECH ? makeT800({ decompose: true }).registry : makeT800Registry();
const model = buildModel(registry, {
  builders: t800AllBuilders,
  instanceLayouts: MECH ? makeT800Layouts({ decompose: true }) : makeT800Layouts(),
  warnMissingLayout: false,
});

const W = 640;
const H = 1100;
const SCALE = 470;
const X_SHIFT = 0.0;

class Canvas {
  data: Uint8Array;
  /** 深度缓冲（沿视线方向，越小越近） */
  zbuf: Float32Array;
  constructor(
    public w: number,
    public h: number,
    bg: [number, number, number] = [235, 238, 242],
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
  /** 写入深度：比缓冲里更近才返回 true。 */
  putDepth(x: number, y: number, depth: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    if (depth >= this.zbuf[i]) return false;
    this.zbuf[i] = depth;
    return true;
  }
  toPng(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      Buffer.from(this.data.buffer, y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const crc32 = (buf: Buffer) => {
      let c = ~0;
      for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
      return ~c >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 6 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const MATERIAL_COLOR: Record<string, [number, number, number]> = {
  chrome: [214, 220, 227],
  bone: [198, 205, 213],
  mirror: [232, 236, 240],
  dark_chrome: [104, 111, 120],
  gunmetal: [62, 68, 77],
  frame: [38, 43, 50],
  rubber: [24, 27, 32],
  brass: [196, 158, 84],
  servo: [150, 48, 52],
};

const LIGHT = new THREE.Vector3(0.4, 0.72, 0.57).normalize();

function renderAt(seconds: number, view: "side" | "iso"): { png: Buffer; caption: string } {
  model.resetNodes();
  animateT800(model, seconds);
  model.syncInstances();
  model.root.updateMatrixWorld(true);

  const dir =
    view === "side" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0.7071, 0, 0.7071);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const project = (p: THREE.Vector3): [number, number] => [
    W / 2 + (p.dot(right) + X_SHIFT) * SCALE,
    H - 70 - p.dot(camUp) * SCALE,
  ];

  const canvas = new Canvas(W, H);
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  interface Tri {
    pts: [number, number][];
    depth: [number, number, number];
    color: [number, number, number];
  }
  const tris: Tri[] = [];

  for (const handle of model.parts) {
    const base = MATERIAL_COLOR[handle.def.material] ?? [130, 138, 148];
    const geom = handle.geometry;
    const pos = geom.attributes.position;
    const index = geom.index;
    const count = index ? index.count : pos.count;
    for (const instance of handle.instances) {
      model.instanceMatrix(handle, instance.index, matrix);
      normalMatrix.getNormalMatrix(matrix);
      for (let i = 0; i < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, ib).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, ic).applyMatrix4(matrix);
        n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
        if (!Number.isFinite(n.x)) continue;
        const facing = Math.abs(n.dot(LIGHT));
        const shade = 0.42 + 0.58 * facing;
        const color: [number, number, number] = [
          Math.min(255, base[0] * shade),
          Math.min(255, base[1] * shade),
          Math.min(255, base[2] * shade),
        ];
        const [ax, ay] = project(a);
        const [bx, by] = project(b);
        const [cx, cy] = project(c);
        tris.push({
          pts: [
            [ax, ay],
            [bx, by],
            [cx, cy],
          ],
          depth: [a.dot(dir), b.dot(dir), c.dot(dir)],
          color,
        });
      }
    }
  }

  for (const t of tris) {
    const [p0, p1, p2] = t.pts;
    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const area =
      (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * t.depth[0] + w1 * t.depth[1] + w2 * t.depth[2];
        if (!canvas.putDepth(x, y, depth)) continue;
        canvas.set(x, y, t.color);
      }
    }
  }
  // 地面线
  const gy = project(new THREE.Vector3(0, 0, 0))[1];
  for (let x = 0; x < W; x += 5) for (let d = 0; d < 2; d++) canvas.set(x, gy + d, [168, 176, 186]);

  const pose = t800Pose();
  const knee = t800CylinderReadout(model).find((r) => r.key === "knee_r");
  const caption =
    `T-800 endoskeleton · ${view === "side" ? "side" : "iso 45°"} · t=${seconds.toFixed(2)}s · ` +
    `phase ${(pose.phase * 100).toFixed(0)}% · knee_r |AB|=${knee?.lengthMm.toFixed(1)}mm ` +
    `rod exposed=${knee?.exposedMm.toFixed(1)}mm · ${registry.parts.length} parts / 120854 verts`;
  return { png: canvas.toPng(), caption };
}

const CYCLE = 6.4;
const FRAMES = 128;
for (const view of ["side", "iso"] as const) {
  for (let i = 0; i < FRAMES; i++) {
    const t = (i / FRAMES) * CYCLE;
    const { png, caption } = renderAt(t, view);
    writeFileSync(`${OUT}/${view}-${String(i).padStart(3, "0")}.png`, png);
    if (i === 0) writeFileSync(`${OUT}/caption.txt`, `${caption}\n`, "utf8");
  }
  console.log("rendered", view, FRAMES, "frames");
}
console.log("done");
