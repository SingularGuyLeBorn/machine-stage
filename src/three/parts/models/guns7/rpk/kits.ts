import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { box, cylinderX, cylinderY, mergeAll, tubeZ } from "../kits";

// ============================================================================
// models/guns7/rpk —— RPK 轻机枪专用几何
//
// RPK 由 AK 派生：长枪管、加厚机匣、两脚架、固定木托、30 发弹匣。
// 这里只做 AK 上没有的两脚架和长枪管附件；其余复用 AK 的枪管/机匣/枪机。
// ============================================================================

const bipodClamp: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const body = box(0.030, 0.020, 0.024, 0.0012);
  body.translate(0, -0.010, 0);
  parts.push(body);
  const band = tubeZ(0.0112, 0.0092, 0.014, 20);
  band.translate(0, -0.002, 0);
  parts.push(band);
  for (const x of [-0.016, 0.016]) {
    const ear = box(0.006, 0.014, 0.010, 0.0006);
    ear.translate(x, -0.014, 0);
    parts.push(ear);
  }
  const bolt = cylinderX(0.0027, 0.038, 12);
  bolt.translate(0, -0.016, 0);
  parts.push(bolt);
  return mergeAll(parts);
};

const bipodLeg: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const len = p.len ?? 0.26;
  const sign = p.sign ?? 1;
  const parts: THREE.BufferGeometry[] = [];
  // 上 hinge 耳 + 矩形钢管 + 下端脚座；脚座单独做成零件。
  const hinge = cylinderX(0.0042, 0.012, 12);
  parts.push(hinge);
  const tube = box(0.012, len, 0.010, 0.0008);
  tube.translate(0, -len / 2, 0);
  parts.push(tube);
  const brace = box(0.008, len * 0.46, 0.007, 0.0005);
  brace.rotateZ(sign * 0.08);
  brace.translate(sign * 0.010, -len * 0.46, 0.006);
  parts.push(brace);
  const collar = cylinderY(0.008, 0.012, 12);
  collar.translate(0, -len + 0.008, 0);
  parts.push(collar);
  return mergeAll(parts);
};

const bipodFoot: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const shoe = box(0.024, 0.010, 0.032, 0.0012);
  shoe.translate(0, -0.004, 0.004);
  parts.push(shoe);
  const pad = box(0.020, 0.004, 0.026, 0.0014);
  pad.translate(0, -0.010, 0.004);
  parts.push(pad);
  const spike = cylinderY(0.0022, 0.014, 10, 0.0007);
  spike.translate(0, -0.018, 0.004);
  parts.push(spike);
  return mergeAll(parts);
};

const bipodSpring: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const r = p.r ?? 0.006;
  const len = p.len ?? 0.08;
  const wireR = p.wireR ?? 0.0009;
  const coils = p.coils ?? 8;
  const points: THREE.Vector3[] = [];
  const steps = coils * 14;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = u * coils * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * r, -len / 2 + u * len, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wireR, 5, false);
};

const rpkRearSight: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const base = box(0.022, 0.004, 0.030, 0.0006);
  base.translate(0, 0.004, 0);
  parts.push(base);
  const leaf = box(0.016, 0.002, 0.024, 0.0004);
  leaf.rotateX(-0.18);
  leaf.translate(0, 0.010, -0.002);
  parts.push(leaf);
  const notch = box(0.003, 0.0024, 0.003, 0.0002);
  notch.translate(0, 0.0115, -0.010);
  parts.push(notch);
  return mergeAll(parts);
};

export const rpkKits: Record<string, GeometryBuilder> = {
  rpkBipodClamp: bipodClamp,
  rpkBipodLeg: bipodLeg,
  rpkBipodFoot: bipodFoot,
  rpkBipodSpring: bipodSpring,
  rpkRearSight,
};
