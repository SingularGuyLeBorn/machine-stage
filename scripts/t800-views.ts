// 侧视投影存档：把装配后的真实几何投影成平涂侧视图（无头可用，不依赖浏览器窗口）
// 用法：npx tsx scripts/t800-views.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { animateT800, t800Pose } from "../src/three/parts/models/t800/motion";

const OUT = "docs/qa/t800/views";
mkdirSync(OUT, { recursive: true });

const registry = makeT800Registry();
const model = buildModel(registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});

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
const W = 900;
const H = 1500;
const SCALE = 560;
const X_SHIFT = 0.0;

class Canvas {
  data: Uint8Array;
  constructor(
    public w: number,
    public h: number,
    bg: [number, number, number] = [232, 236, 241],
  ) {
    this.data = new Uint8Array(w * h * 3);
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
  toPng(): Buffer {
    return encodePng(this.w, this.h, this.data);
  }
}

const MATERIAL_COLOR: Record<string, [number, number, number]> = {
  chrome: [176, 186, 199],
  bone: [150, 163, 178],
  dark_chrome: [96, 105, 118],
  gunmetal: [78, 86, 97],
  frame: [62, 69, 79],
  rubber: [40, 44, 50],
  brass: [201, 162, 86],
  servo: [176, 74, 74],
};

const LIGHT = new THREE.Vector3(0.35, 0.75, 0.56).normalize();

// ---------------------------------------------------------------- 投影
type View = "side" | "front" | "iso";

const VIEWS: Record<View, { dir: THREE.Vector3; up: THREE.Vector3; label: string }> = {
  // 侧视：+Z 看过去（腿的左右厚度被压掉，看到前后起伏）
  side: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), label: "侧视" },
  // 正视：+X 看过去（看到腿的左右厚度 / 肌肉块宽度）
  front: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: "正视" },
  // 斜 45°：同时看到厚度与起伏
  iso: {
    dir: new THREE.Vector3(0.7071, 0, 0.7071),
    up: new THREE.Vector3(0, 1, 0),
    label: "斜 45°",
  },
};

function makeProjector(view: View): (p: THREE.Vector3) => [number, number] {
  const { dir, up } = VIEWS[view];
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  return (p: THREE.Vector3) => [
    W / 2 + (p.dot(right) + X_SHIFT) * SCALE,
    H - 40 - p.dot(camUp) * SCALE,
  ];
}

interface Tri {
  pts: [number, number][];
  depth: number;
  color: [number, number, number];
}

function fillTriangle(canvas: Canvas, t: Tri): void {
  const [p0, p1, p2] = t.pts;
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(canvas.w - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(canvas.h - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
      const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      canvas.set(x, y, t.color);
    }
  }
}

function renderAt(seconds: number, view: View): { png: Buffer; caption: string } {
  model.resetNodes();
  animateT800(model, seconds);
  model.syncInstances();
  model.root.updateMatrixWorld(true);
  const project = makeProjector(view);

  const tris: Tri[] = [];
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

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
        n.set(0, 0, 0);
        n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
        if (!Number.isFinite(n.x)) continue;
        const facing = Math.abs(n.dot(LIGHT));
        const shade = 0.35 + 0.65 * facing;
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
          depth: (a.z + b.z + c.z) / 3,
          color,
        });
      }
    }
  }

  // 画家算法：远的先画
  tris.sort((p, q) => p.depth - q.depth);
  const canvas = new Canvas(W, H);
  for (const t of tris) fillTriangle(canvas, t);

  // 地面线
  const groundY = project(new THREE.Vector3(0, 0, 0))[1];
  for (let x = 0; x < W; x += 6) {
    for (let d = 0; d < 2; d++) canvas.set(x, groundY + d, [150, 160, 172]);
  }

  const pose = t800Pose();
  const knee = pose.extensions.find((e) => e.key === "knee_main");
  const caption = `T-800 right leg - ${VIEWS[view].label} - t=${seconds.toFixed(2)}s - hip/knee/ankle ${pose.hipDeg.toFixed(1)}/${pose.kneeDeg.toFixed(1)}/${pose.ankleDeg.toFixed(1)} deg - knee_main exposed rod ${knee?.exposedMm.toFixed(1)} mm - ${registry.parts.length} part definitions`;
  return { png: canvas.toPng(), caption };
}

const frames: Array<[number, string]> = [
  [0, "view-00-stand"],
  [0.55, "view-01-flexing"],
  [1.1, "view-02-flexing"],
  [1.65, "view-03-flexing"],
  [2.2, "view-04-peak"],
  [2.6, "view-05-hold"],
  [3.4, "view-06-returning"],
  [4.3, "view-07-returning"],
  [5.2, "view-08-rest"],
];

for (const [seconds, name] of frames) {
  const { png, caption } = renderAt(seconds, "side");
  writeFileSync(`${OUT}/${name}.png`, png);
  writeFileSync(`${OUT}/${name}.txt`, `${caption}\n`, "utf8");
  console.log("wrote", name, "t=", seconds);
}

// 正视 / 斜 45°：站姿 + 屈膝峰值
for (const view of ["front", "iso"] as View[]) {
  for (const [seconds, tag] of [
    [0, "stand"],
    [2.2, "peak"],
  ] as Array<[number, string]>) {
    const { png, caption } = renderAt(seconds, view);
    const name = `${view}-${tag}`;
    writeFileSync(`${OUT}/${name}.png`, png);
    writeFileSync(`${OUT}/${name}.txt`, `${caption}\n`, "utf8");
    console.log("wrote", name, "t=", seconds);
  }
}
console.log("done");
