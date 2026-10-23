import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { bevelBoxGeometry, cylinderGeometry, mergeGeometries, plateGeometry } from "../../../kernel/geometry";

// ============================================================================
// models/ak47/kits-parts —— 导气活塞 / 机匣盖（防尘盖）等运动件 kits
// 约定同 kits-shell：+Z 枪口方向、+Y 上、+X 右，原点按零件装配特征点。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`ak47 kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

// ---------------------------------------------------------------------------
// pistonKit —— 导气活塞（头部 + 长杆 + 与枪机框结合的法兰）。
// 局部系：origin = 杆后端（结合面）中心；杆沿 +Z 前伸到头部。
// ---------------------------------------------------------------------------
const pistonKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rodLen = num(p, "rodLen", 0.15);
  const rodR = num(p, "rodR", 0.0045);
  const headLen = num(p, "headLen", 0.032);
  const headR = num(p, "headR", 0.0082);
  const parts: THREE.BufferGeometry[] = [];
  // 杆（沿 +Z）
  const rod = cylinderGeometry(rodR, rodLen, rodR, 12);
  rod.rotateX(Math.PI / 2);
  rod.translate(0, 0, rodLen / 2);
  parts.push(rod);
  // 头部（前端外环，车内气室）
  const head = cylinderGeometry(headR, headLen, headR * 0.92, 14);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, rodLen + headLen / 2);
  parts.push(head);
  // 前端密封环槽
  const ring = cylinderGeometry(headR + 0.0004, 0.003, headR + 0.0004, 14);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, rodLen + headLen - 0.0015);
  parts.push(ring);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// dustCoverKit —— 机匣盖（防尘盖）：弧形冲压板 + 尾部卡榫。
// 局部系：origin = 盖后端面中心（+Z 向枪口）。
// ---------------------------------------------------------------------------
const dustCoverKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.175);
  const w = num(p, "w", 0.036);
  const sag = num(p, "sag", 0.006);
  const t = num(p, "t", 0.0016);
  const parts: THREE.BufferGeometry[] = [];
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const s0 = -len / 2 + (i / segs) * len;
    const s1 = -len / 2 + ((i + 1) / segs) * len;
    const sc = (s0 + s1) / 2;
    const y = -sag * (1 - (sc / (len / 2)) ** 2);
    const seg = plateGeometry(w, s1 - s0 + 0.0005, t);
    // plate 的局部 X→X、Y→-Z：转到长边沿 Z
    seg.rotateY(Math.PI / 2);
    seg.translate(0, y, sc);
    parts.push(seg);
  }
  // 尾部卡榫（插入机匣尾端）
  const tang = bevelBoxGeometry(0.012, 0.006, 0.012, 0.0008, 1);
  tang.translate(0, -sag, -len / 2 - 0.004);
  parts.push(tang);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

export const ak47PartKitBuilders: Record<string, GeometryBuilder> = {
  pistonKit,
  dustCoverKit,
};
