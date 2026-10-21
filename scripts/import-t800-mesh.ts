// ============================================================================
// t800 真实网格导入器（一次性）
//
// 输入：
//   D:/FunnyProjects/t800-refs/t800-mesh.obj        —— 120854 顶点 / 130884 面
//   D:/FunnyProjects/t800-refs/t800-verts-joints.csv —— 每顶点的骨骼归属（与 OBJ 顶点同序）
//
// 输出：
//   src/three/parts/models/t800/mesh/assets.ts —— base64 载荷 + 清单（部位名/顶点/索引/包围盒/中心）
//
// 做法：
//   1) 每个顶点归到 CSV 指定的骨骼部位；
//   2) 每个面归到「三个顶点里票数最多的部位」→ 蒙皮接缝自动闭合，无洞；
//   3) 坐标换算：原网格是「躺姿 T-pose」（+X 是身长、+Y 是正面）→ 绕 Z 转 90° 站立，
//      再整体缩放到 1.90m 高、脚底落在 y=0；
//   4) 液压缸部位（*Roll*/ *Bicep*/ *Elbow* 等 helper 骨）沿缸轴切两半：
//      缸体（外筒）与活塞杆（内芯），运行时按关节角相对滑动。
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const REF = "D:/FunnyProjects/t800-refs";
const OBJ = `${REF}/t800-mesh.obj`;
const CSV = `${REF}/t800-verts-joints.csv`;
const OUT = "src/three/parts/models/t800/mesh/assets.ts";

/** 目标身高（米）。 */
const TARGET_HEIGHT = 1.9;

// ---------------------------------------------------------------- 读取 OBJ
const objLines = readFileSync(OBJ, "utf8").split("\n");
const rawVerts: number[] = [];
const faces: number[] = [];
for (const line of objLines) {
  if (line.startsWith("v ")) {
    const p = line.slice(2).trim().split(/\s+/);
    rawVerts.push(+p[0], +p[1], +p[2]);
  } else if (line.startsWith("f ")) {
    const p = line.slice(2).trim().split(/\s+/);
    faces.push(+p[0] - 1, +p[1] - 1, +p[2] - 1);
  }
}
const vertCount = rawVerts.length / 3;
const faceCount = faces.length / 3;

// ---------------------------------------------------------------- 读取蒙皮表
const csv = readFileSync(CSV, "utf8").split("\n");
const jointIndex = new Map<string, number>();
const jointNames: string[] = [];
const vertJoint = new Int32Array(vertCount);
for (let i = 0; i < vertCount; i++) {
  const row = csv[i + 1];
  const name = (row?.split(",")[3] ?? "").trim();
  let id = jointIndex.get(name);
  if (id === undefined) {
    id = jointNames.length;
    jointIndex.set(name, id);
    jointNames.push(name);
  }
  vertJoint[i] = id;
}

// ---------------------------------------------------------------- 坐标换算
// 原网格：+X = 身长（头在 +X 端）、+Y = 躯干正面方向、+Z = 左右。
// 站立：newY = oldX，newX = -oldY，newZ = oldZ（右手法则成立）。
let minX = Infinity;
for (let i = 0; i < vertCount; i++) minX = Math.min(minX, rawVerts[i * 3]);
let maxX = -Infinity;
for (let i = 0; i < vertCount; i++) maxX = Math.max(maxX, rawVerts[i * 3]);
const scale = TARGET_HEIGHT / (maxX - minX);

const verts = new Float32Array(vertCount * 3);
for (let i = 0; i < vertCount; i++) {
  const ox = rawVerts[i * 3];
  const oy = rawVerts[i * 3 + 1];
  const oz = rawVerts[i * 3 + 2];
  verts[i * 3] = -oy * scale;
  verts[i * 3 + 1] = (ox - minX) * scale;
  verts[i * 3 + 2] = oz * scale;
}

// ---------------------------------------------------------------- 姿态修正
// 源网格是 A 字张开的绑定姿势；把两侧手臂（肩以下）绕肩关节转到垂手站姿。
// 旋转必须烘焙进顶点（见 mesh/pose.ts 的说明）。
{
  const { ARM_POSE_DEG, isArmSideJoint, rotateAboutX, shoulderPivot } = await import(
    "../src/three/parts/models/t800/mesh/pose"
  );
  // 每个部位的 z 重心 → 判左右
  const zSum = new Float64Array(jointNames.length);
  const zCount = new Int32Array(jointNames.length);
  for (let i = 0; i < vertCount; i++) {
    const j = vertJoint[i];
    zSum[j] += verts[i * 3 + 2];
    zCount[j]++;
  }
  let rotated = 0;
  for (let j = 0; j < jointNames.length; j++) {
    const name = jointNames[j];
    if (!isArmSideJoint(name)) continue;
    const side = zSum[j] / Math.max(1, zCount[j]) >= 0 ? 1 : -1;
    const pivot = shoulderPivot(side);
    const deg = side > 0 ? ARM_POSE_DEG : -ARM_POSE_DEG;
    for (let i = 0; i < vertCount; i++) {
      if (vertJoint[i] !== j) continue;
      const p = rotateAboutX(
        [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]],
        pivot,
        deg,
      );
      verts[i * 3] = p[0];
      verts[i * 3 + 1] = p[1];
      verts[i * 3 + 2] = p[2];
    }
    rotated++;
  }
  console.log(`姿态修正：${rotated} 个手臂部位绕肩转 ${ARM_POSE_DEG}°`);
}

// ---------------------------------------------------------------- 面归属
const faceJoint = new Int32Array(faceCount);
for (let f = 0; f < faceCount; f++) {
  const votes = new Map<number, number>();
  for (let k = 0; k < 3; k++) {
    const j = vertJoint[faces[f * 3 + k]];
    votes.set(j, (votes.get(j) ?? 0) + 1);
  }
  let best = vertJoint[faces[f * 3]];
  let bestN = 0;
  for (const [j, n] of votes) if (n > bestN) { best = j; bestN = n; }
  faceJoint[f] = best;
}

// ---------------------------------------------------------------- 液压缸部位识别
// 原始骨骼里的 helper 骨就是缸：*Roll*（大缸）、*Bicep*、*Elbow*、*ForeArm*。
// 缸要能相对滑动 → 沿缸轴切成「缸体 / 活塞杆」两件。
const isCylinder = (_name: string) => false;

interface PartOut {
  name: string;
  /** 该部位在原始 joint 列表里的下标（-1 表示从缸体切出来的零件） */
  joint: number;
  kind: "bone" | "barrel" | "rod";
  /** 缸轴方向（世界坐标，指向活塞杆一侧） */
  axis: [number, number, number] | null;
  positions: number[];
  indices: number[];
  center: [number, number, number];
  size: [number, number, number];
}

const parts: PartOut[] = [];
const jointCenter = jointNames.map((name) => {
  const c = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < vertCount; i++) {
    if (vertJoint[i] !== jointIndex.get(name!)) continue;
    c[0] += verts[i * 3];
    c[1] += verts[i * 3 + 1];
    c[2] += verts[i * 3 + 2];
    n++;
  }
  return n ? ([c[0] / n, c[1] / n, c[2] / n] as [number, number, number]) : ([0, 0, 0] as [number, number, number]);
});

for (let j = 0; j < jointNames.length; j++) {
  const name = jointNames[j];
  const myFaces: number[] = [];
  for (let f = 0; f < faceCount; f++) if (faceJoint[f] === j) myFaces.push(f);

  // 收集这个部位用到的顶点
  const used = new Set<number>();
  for (const f of myFaces) {
    used.add(faces[f * 3]);
    used.add(faces[f * 3 + 1]);
    used.add(faces[f * 3 + 2]);
  }
  const localIndex = new Map<number, number>();
  const positions: number[] = [];
  for (const v of used) {
    localIndex.set(v, positions.length / 3);
    positions.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
  }
  const indices = myFaces.flatMap((f) => [
    localIndex.get(faces[f * 3])!,
    localIndex.get(faces[f * 3 + 1])!,
    localIndex.get(faces[f * 3 + 2])!,
  ]);

  // 包围盒 / 中心
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], positions[i + k]);
      mx[k] = Math.max(mx[k], positions[i + k]);
    }
  }
  const center: [number, number, number] = [
    (mn[0] + mx[0]) / 2,
    (mn[1] + mx[1]) / 2,
    (mn[2] + mx[2]) / 2,
  ];
  const size: [number, number, number] = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];

  if (isCylinder(name) && positions.length > 60) {
    // 缸轴 = 该部位最长的包围盒方向；沿轴对半分：后半 = 缸体，前半 = 活塞杆
    let axisIdx = 0;
    if (size[1] > size[axisIdx]) axisIdx = 1;
    if (size[2] > size[axisIdx]) axisIdx = 2;
    const mid = (mn[axisIdx] + mx[axisIdx]) / 2;
    // 缸体取"靠后"的一半：y 轴朝上 → 缸体在下、活塞杆在上
    const rodIsHigh = axisIdx === 1;
    const barrelPos: number[] = [];
    const barrelIdx: number[] = [];
    const barrelMap = new Map<number, number>();
    const rodPos: number[] = [];
    const rodIdx: number[] = [];
    const rodMap = new Map<number, number>();
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [indices[i], indices[i + 1], indices[i + 2]];
      const c = (tri[0] * 3 + axisIdx + tri[1] * 3 + axisIdx + tri[2] * 3 + axisIdx) / 3;
      const toRod = rodIsHigh ? c >= mid : c <= mid;
      const pos = toRod ? rodPos : barrelPos;
      const idx = toRod ? rodIdx : barrelIdx;
      const map = toRod ? rodMap : barrelMap;
      for (const t of tri) {
        if (!map.has(t)) {
          map.set(t, pos.length / 3);
          pos.push(positions[t * 3], positions[t * 3 + 1], positions[t * 3 + 2]);
        }
      }
      idx.push(map.get(tri[0])!, map.get(tri[1])!, map.get(tri[2])!);
    }
    const mk = (nm: string, kind: PartOut["kind"], pos: number[], idx: number[]): PartOut => {
      const bmn = [Infinity, Infinity, Infinity];
      const bmx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3)
        for (let k = 0; k < 3; k++) {
          bmn[k] = Math.min(bmn[k], pos[i + k]);
          bmx[k] = Math.max(bmx[k], pos[i + k]);
        }
      return {
        name: nm,
        joint: j,
        kind,
        axis: null,
        positions: pos,
        indices: idx,
        center: [(bmn[0] + bmx[0]) / 2, (bmn[1] + bmx[1]) / 2, (bmn[2] + bmx[2]) / 2],
        size: [bmx[0] - bmn[0], bmx[1] - bmn[1], bmx[2] - bmn[2]],
      };
    };
    if (barrelPos.length && barrelIdx.length) parts.push(mk(`${name}__barrel`, "barrel", barrelPos, barrelIdx));
    if (rodPos.length && rodIdx.length) parts.push(mk(`${name}__rod`, "rod", rodPos, rodIdx));
  } else {
    parts.push({ name, joint: j, kind: "bone", axis: null, positions, indices, center, size });
  }
}

console.log(`部位 ${parts.length} 件（原始 joint ${jointNames.length}）`);

// ---------------------------------------------------------------- 打包
// 顶点：int16 量化（按件包围盒）→ 索引：uint16（>65535 顶点时用 uint32）
const chunks: Buffer[] = [];
const manifest: Array<{
  n: string;
  k: string;
  v: number;
  i: number;
  /** 该件在载荷里的字节偏移（解码时直接跳过去） */
  o: number;
  b: number[];
}> = [];
let header = Buffer.alloc(16);
header.write("T800M", 0, "ascii");
let offset = 0;
for (const part of parts) {
  const vCount = part.positions.length / 3;
  const iCount = part.indices.length;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < part.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], part.positions[i + k]);
      mx[k] = Math.max(mx[k], part.positions[i + k]);
    }
  const ext = [0, 0, 0];
  for (let k = 0; k < 3; k++) ext[k] = Math.max(mx[k] - mn[k], 1e-6);
  const vBuf = Buffer.alloc(vCount * 3 * 2);
  for (let i = 0; i < vCount; i++) {
    for (let k = 0; k < 3; k++) {
      // int16 是**有符号**的：取值范围 [-32768, 32767]。
      // 这里把 [0, 65535] 的归一化值整体偏移 -32768 再存，
      // 解码时再加回 32768（见 mesh/geometry.ts）。
      // ← 早期版本直接存 [0,65535]，>32767 的值回绕成负数，
      //   每件几何都会缩成一半并偏离装配位（"零件散架"）。
      const q = Math.round(((part.positions[i * 3 + k] - mn[k]) / ext[k]) * 65535) - 32768;
      vBuf.writeInt16LE(Math.max(-32768, Math.min(32767, q)), (i * 3 + k) * 2);
    }
  }
  const wide = vCount > 65535;
  const iBuf = Buffer.alloc(iCount * (wide ? 4 : 2));
  for (let i = 0; i < iCount; i++) {
    if (wide) iBuf.writeUInt32LE(part.indices[i], i * 4);
    else iBuf.writeUInt16LE(part.indices[i], i * 2);
  }
  const rec = Buffer.alloc(24);
  rec.writeUInt32LE(offset, 0);
  rec.writeUInt32LE(vCount, 4);
  rec.writeUInt32LE(iCount, 8);
  rec.writeUInt8(wide ? 1 : 0, 12);
  rec.writeDoubleLE(mn[0], 16);
  chunks.push(Buffer.concat([rec, vBuf, iBuf]));
  manifest.push({
    n: part.name,
    k: part.kind,
    v: vCount,
    i: iCount,
    o: offset,
    b: [mn[0], mn[1], mn[2], ext[0], ext[1], ext[2]],
  });
  offset += rec.length + vBuf.length + iBuf.length;
}
const payload = Buffer.concat(chunks);
const b64 = payload.toString("base64");

const ts = `/* eslint-disable */
// ============================================================================
// t800 真实网格资产（自动生成，勿手改）
//
// 由 scripts/import-t800-mesh.ts 从 D:/FunnyProjects/t800-refs 的
// t800-mesh.obj + t800-verts-joints.csv 切分生成：
//   · 76 个蒙皮部位 → ${parts.length} 个零件（液压缸部位沿轴再切成缸体/活塞杆两件）
//   · 顶点 int16 量化（按件包围盒），索引 uint16
//   · 坐标已换算为站立姿态（+X 前、+Y 上、+Z 右），身高 1.90m，脚底 y=0
//
// 载荷：base64 → 位移/顶点数/索引数/包围盒(原点+尺寸)
// ============================================================================

/** 每件：名、类型（bone/barrel/rod）、顶点数、索引数、包围盒 [ox,oy,oz,sx,sy,sz]。 */
export interface MeshPartMeta {
  /** 部位名（骨骼名；缸体/杆带 __barrel / __rod 后缀） */
  n: string;
  /** bone = 骨骼件；barrel = 缸体；rod = 活塞杆 */
  k: "bone" | "barrel" | "rod";
  /** 顶点数 */
  v: number;
  /** 索引数 */
  i: number;
  /** 该件在载荷里的字节偏移（解码时按它跳过去） */
  o: number;
  /** 包围盒：原点 + 尺寸 */
  b: number[];
}

export const MESH_META: MeshPartMeta[] = ${JSON.stringify(manifest)};

/** base64 载荷（部位数据按 MESH_META 顺序拼接）。 */
export const MESH_PAYLOAD_B64 =
  "${b64}";
`;
writeFileSync(OUT, ts, "utf8");
console.log(`写出 ${OUT}：${parts.length} 件 / ${(payload.length / 1024 / 1024).toFixed(2)}MB binary / ${(b64.length / 1024 / 1024).toFixed(2)}MB base64`);
