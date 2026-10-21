// 探查 2：网格坐标范围 / 每个 joint 的面归属 / 关节中心
import { readFileSync } from "node:fs";

const OBJ = "D:/FunnyProjects/t800-refs/t800-mesh.obj";
const CSV = "D:/FunnyProjects/t800-refs/t800-verts-joints.csv";

const objLines = readFileSync(OBJ, "utf8").split("\n");
const verts: number[] = [];
const faces: number[] = [];
for (const l of objLines) {
  if (l.startsWith("v ")) {
    const p = l.slice(2).trim().split(/\s+/);
    verts.push(+p[0], +p[1], +p[2]);
  } else if (l.startsWith("f ")) {
    const p = l.slice(2).trim().split(/\s+/);
    faces.push(+p[0] - 1, +p[1] - 1, +p[2] - 1);
  }
}
const nV = verts.length / 3;
const nF = faces.length / 3;
console.log(`verts=${nV} faces=${nF}`);

const csv = readFileSync(CSV, "utf8").split("\n");
console.log("csv rows:", csv.length - 1);

// CSV 与 OBJ 顶点顺序是否一致
let maxDiff = 0;
let mismatch = 0;
for (let i = 0; i < nV && i + 1 < csv.length; i++) {
  const p = csv[i + 1].split(",");
  const d = Math.max(
    Math.abs(+p[0] - verts[i * 3]),
    Math.abs(+p[1] - verts[i * 3 + 1]),
    Math.abs(+p[2] - verts[i * 3 + 2]),
  );
  if (d > 1e-4) mismatch++;
  if (d > maxDiff) maxDiff = d;
}
console.log(`csv/obj 顶点顺序：mismatch=${mismatch} maxDiff=${maxDiff}`);

// 范围
let mn = [Infinity, Infinity, Infinity];
let mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nV; i++) {
  for (let k = 0; k < 3; k++) {
    const v = verts[i * 3 + k];
    if (v < mn[k]) mn[k] = v;
    if (v > mx[k]) mx[k] = v;
  }
}
console.log("bounds min", mn.map((v) => v.toFixed(4)).join(","));
console.log("bounds max", mx.map((v) => v.toFixed(4)).join(","));

// 关节表
const jointOf = new Int32Array(nV);
const jointIndex = new Map<string, number>();
const jointNames: string[] = [];
for (let i = 0; i < nV; i++) {
  const p = csv[i + 1].split(",");
  const name = (p[3] ?? "").trim();
  let id = jointIndex.get(name);
  if (id === undefined) {
    id = jointNames.length;
    jointIndex.set(name, id);
    jointNames.push(name);
  }
  jointOf[i] = id;
}
console.log("joints:", jointNames.length);

// 面归属：多数顶点所在 joint
const faceJoint = new Int32Array(nF);
const faceCount = new Int32Array(jointNames.length);
for (let f = 0; f < nF; f++) {
  const a = jointOf[faces[f * 3]];
  const b = jointOf[faces[f * 3 + 1]];
  const c = jointOf[faces[f * 3 + 2]];
  const counts = new Map<number, number>();
  for (const j of [a, b, c]) counts.set(j, (counts.get(j) ?? 0) + 1);
  let best = a;
  let bestN = 0;
  for (const [j, n] of counts) if (n > bestN || (n === bestN && j < best)) { best = j; bestN = n; }
  faceJoint[f] = best;
  faceCount[best]++;
}
console.log("每 joint 的面数：");
for (let j = 0; j < jointNames.length; j++) {
  console.log(`  ${jointNames[j]}\tfaces=${faceCount[j]}`);
}

// 每个 joint 的顶点范围与中心
console.log("每 joint 中心 / 尺寸：");
for (let j = 0; j < jointNames.length; j++) {
  const jmn = [Infinity, Infinity, Infinity];
  const jmx = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i < nV; i++) {
    if (jointOf[i] !== j) continue;
    n++;
    for (let k = 0; k < 3; k++) {
      const v = verts[i * 3 + k];
      if (v < jmn[k]) jmn[k] = v;
      if (v > jmx[k]) jmx[k] = v;
    }
  }
  console.log(
    `  ${jointNames[j]}\tverts=${n}\tcenter=(${((jmn[0]+jmx[0])/2).toFixed(3)},${((jmn[1]+jmx[1])/2).toFixed(3)},${((jmn[2]+jmx[2])/2).toFixed(3)})\tsize=(${((jmx[0]-jmn[0])).toFixed(3)},${((jmx[1]-jmn[1])).toFixed(3)},${((jmx[2]-jmn[2])).toFixed(3)})`,
  );
}
