// 探查真实网格数据：OBJ 结构 / 蒙皮归属表 / 部位清单
import { readFileSync } from "node:fs";

const OBJ = "D:/FunnyProjects/t800-refs/t800-mesh.obj";
const CSV = "D:/FunnyProjects/t800-refs/t800-verts-joints.csv";
const MEAS = "D:/FunnyProjects/t800-refs/t800-measure.txt";

// ---- OBJ 结构 ----
const obj = readFileSync(OBJ, "utf8");
const lines = obj.split("\n");
let v = 0, vt = 0, vn = 0, f = 0, g = 0, o = 0, usemtl = 0, other = 0;
const groups: string[] = [];
const objects: string[] = [];
const materials: string[] = [];
let firstFaces: string[] = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith("v ")) v++;
  else if (l.startsWith("vt ")) vt++;
  else if (l.startsWith("vn ")) vn++;
  else if (l.startsWith("f ")) {
    f++;
    if (firstFaces.length < 3) firstFaces.push(l);
  } else if (l.startsWith("g ")) { g++; if (groups.length < 20) groups.push(l.slice(2)); }
  else if (l.startsWith("o ")) { o++; if (objects.length < 20) objects.push(l.slice(2)); }
  else if (l.startsWith("usemtl ")) { usemtl++; if (materials.length < 20) materials.push(l.slice(7)); }
  else if (l.trim().length) other++;
}
console.log(`OBJ: v=${v} vt=${vt} vn=${vn} f=${f} g=${g} o=${o} usemtl=${usemtl} other=${other}`);
console.log("first faces:", firstFaces);
console.log("groups:", groups.slice(0, 10));
console.log("objects:", objects.slice(0, 10));
console.log("materials:", materials.slice(0, 10));

// ---- 蒙皮归属表 ----
const csv = readFileSync(CSV, "utf8").split("\n").filter((l) => l.trim());
console.log("csv rows:", csv.length, "header:", csv[0]);
const byJoint = new Map<string, number>();
for (let i = 1; i < csv.length; i++) {
  const p = csv[i].split(",");
  const j = p[3]?.trim();
  if (!j) continue;
  byJoint.set(j, (byJoint.get(j) ?? 0) + 1);
}
console.log("distinct joints:", byJoint.size);
console.log(
  [...byJoint.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join("\n"),
);
