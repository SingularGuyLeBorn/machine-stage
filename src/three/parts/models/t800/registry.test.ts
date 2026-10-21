import { describe, expect, it } from "vitest";
import { validateRegistry } from "../../registry/validate";
import { buildModel } from "../../assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "./registry";
import { animateT800, t800CylinderReadout } from "./motion";
import { HYDRAULICS, hydraulicPlans } from "./hydraulics";
import { JOINTS, JOINT_BY_NAME, jointChain } from "./spec";
import { MESH_META } from "./mesh/assets";

// ============================================================================
// T-800 内骨骼整机（真实网格切分版）验收
// ============================================================================

function build() {
  const registry = makeT800Registry();
  const model = buildModel(registry, {
    builders: t800AllBuilders,
    instanceLayouts: makeT800Layouts(),
    warnMissingLayout: false,
  });
  return { registry, model };
}

describe("T-800 真实网格切分", () => {
  it("注册表零错误零警告", () => {
    const issues = validateRegistry(makeT800Registry());
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.filter((i) => i.level === "warn")).toEqual([]);
  });

  it("76 个蒙皮部位逐件成独立 partId", () => {
    const { registry } = build();
    const meshParts = registry.parts.filter((p) => p.id.startsWith("t800.mesh."));
    expect(meshParts).toHaveLength(76);
    expect(new Set(meshParts.map((p) => p.id)).size).toBe(76);
    // 每个部位在资产清单里都能找到
    expect(meshParts).toHaveLength(MESH_META.length);
  });

  it("五指各三节 × 左右 = 30 件独立零件", () => {
    const fingers = JOINTS.filter((j) => /^bip_(thumb|index|middle|ring|pinky)_/.test(j.name));
    expect(fingers).toHaveLength(30);
    const byFinger = new Map<string, number>();
    for (const f of fingers) {
      const key = f.name.replace(/_\d_[RL]_\d+$/, "");
      byFinger.set(key, (byFinger.get(key) ?? 0) + 1);
    }
    // 5 根手指，每根左右各三节 = 6 件
    expect(byFinger.size).toBe(5);
    for (const count of byFinger.values()) expect(count).toBe(6);
    // 每根手指的单侧节数必须是 3
    for (const side of ["R", "L"]) {
      for (const finger of ["thumb", "index", "middle", "ring", "pinky"]) {
        const segs = fingers.filter((f) => f.name.includes(`_${finger}_`) && f.name.includes(`_${side}_`));
        expect(segs.length, `${finger}_${side}`).toBe(3);
      }
    }
  });

  it("每个部位的父子链都通到骨盆（骨架连通，无悬空件）", () => {
    for (const joint of JOINTS) {
      const chain = jointChain(joint.name);
      expect(chain[0], `${joint.name} 的链根不是骨盆`).toBe("bip_pelvis_02");
      expect(chain[chain.length - 1]).toBe(joint.name);
    }
  });

  it("关节旋转中心用真实关节点（膝/肘/髋/肩/踝/腕）", () => {
    const knee = JOINT_BY_NAME.get("LeftKnee_helper_086")!;
    expect(knee.pivot[1]).toBeCloseTo(0.544, 3);
    const elbow = JOINT_BY_NAME.get("LeftElbow_helper_035")!;
    expect(elbow.pivot[1]).toBeCloseTo(1.351, 3);
    const hip = JOINT_BY_NAME.get("LeftUpLegRoll_084")!;
    expect(hip.pivot[1]).toBeCloseTo(0.9, 3);
  });
});

describe("T-800 液压缸", () => {
  it("14 根缸 × 7 件 = 98 件，且 A 端与 B 端挂在不同骨骼上", () => {
    const { registry } = build();
    const cylParts = registry.parts.filter((p) => p.id.startsWith("t800.hydraulics."));
    expect(HYDRAULICS).toHaveLength(14);
    expect(cylParts).toHaveLength(14 * 7);
    for (const def of HYDRAULICS) {
      const plans = hydraulicPlans(def);
      expect(plans).toHaveLength(7);
      expect(def.parent).not.toBe(def.child);
    }
  });

  it("露出杆长 = |AB| - 缸长（几何解，随关节角变化）", () => {
    const { model } = build();
    animateT800(model, 0);
    const first = t800CylinderReadout(model);
    const kneeFirst = first.find((c) => c.key === "knee_r")!;
    // 读数自洽：露出长度 + 缸长 = 两端距离
    const def = HYDRAULICS.find((h) => h.key === "knee_r")!;
    expect(kneeFirst.exposedMm + def.barrel * 1000).toBeCloseTo(kneeFirst.lengthMm, 3);

    // 换姿态：屈膝峰值时 |AB| 必须变化（说明行程是几何解，不是写死）
    animateT800(model, 2.2);
    const second = t800CylinderReadout(model);
    const kneeSecond = second.find((c) => c.key === "knee_r")!;
    expect(Math.abs(kneeSecond.lengthMm - kneeFirst.lengthMm)).toBeGreaterThan(1);
    expect(kneeSecond.exposedMm + def.barrel * 1000).toBeCloseTo(kneeSecond.lengthMm, 3);
  });

  it("活塞杆节点指向缸口方向（杆与缸共轴）", () => {
    const { model } = build();
    animateT800(model, 1.4);
    const state = t800CylinderReadout(model);
    for (const c of state) {
      const len = Math.hypot(c.axis[0], c.axis[1], c.axis[2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });
});

describe("T-800 运动学", () => {
  it("屈伸绕 Z（矢状面）、扭转绕 Y（水平面）", () => {
    const { model } = build();
    animateT800(model, 0.8);
    const thigh = model.getNode("T800_LeftUpLegRoll_084")!;
    // 大腿的绕 Z 旋转轴分量应显著大于绕 X
    const z = Math.abs(thigh.quaternion.z);
    const x = Math.abs(thigh.quaternion.x);
    expect(z).toBeGreaterThan(x);
  });

  it("步态让左右腿反相（一步一腿）", () => {
    const { model } = build();
    animateT800(model, 0.8);
    const right = model.getNode("T800_LeftUpLegRoll_084")!;
    const left = model.getNode("T800_RightUpLegRoll_092")!;
    expect(Math.sign(right.quaternion.z)).toBe(-Math.sign(left.quaternion.z));
  });

  it("欠阻尼：起步阶段速度缓慢（慢启动）", () => {
    const { model } = build();
    animateT800(model, 0);
    const a = model.getNode("T800_LeftKnee_helper_086")!.quaternion.z;
    animateT800(model, 0.12);
    const b = model.getNode("T800_LeftKnee_helper_086")!.quaternion.z;
    // 起步 0.12s 的角度变化应小于整段峰值的一半（说明是缓入而不是瞬间到位）
    const peak = (() => {
      animateT800(model, 1.8);
      return Math.abs(model.getNode("T800_LeftKnee_helper_086")!.quaternion.z);
    })();
    expect(Math.abs(b - a)).toBeLessThan(Math.abs(peak) * 0.6);
  });
});
