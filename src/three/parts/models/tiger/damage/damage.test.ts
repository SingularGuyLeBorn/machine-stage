import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { applyDamage } from "@/app/three/pose";
import {
  animateTigerBurning,
  animateTigerDetonation,
  animateTigerEngine,
  animateTigerHit,
  tigerCrankAngleAt,
  tigerEngineRpmAt,
  TIGER_IDLE_RPM,
} from "../motion";

// ============================================================================
// 战损三态 + 发动机启动 + 燃烧殉爆验收（P3 综合任务包）
//
// 1. 6 个关键件有预制 damaged/broken 变体；切换只改可见性。
// 2. 变体与完好件同位置（同父节点/同一局部 TRS），破碎几何非空。
// 3. 构建进度仍然优先：没装到该件时，切战损也不显示。
// 4. 发动机启动：曲轴/活塞运动、排气烟可见、rpm 曲线到达 650 怠速。
// 5. 受击：轻/重都有命中闪光，重击更大；火花实例可见。
// 6. 殉爆：炮塔被掀起、火球/烟柱可见；发动机起火状态独立可见。
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

const DAMAGE_PARTS = [
  "tiger.hull.front_plate",
  "tiger.hull.engine_deck",
  "tiger.hull.fighting_roof",
  "tiger.turret.mantlet",
  "tiger.engine.fuel_tank_l",
  "tiger.engine.fuel_tank_r",
];

describe("tiger/P3 战损三态", () => {
  it("6 个关键件都有 damaged/broken 变体，切换只改可见性", () => {
    const built = build();
    for (const id of DAMAGE_PARTS) {
      const handle = built.getPart(id)!;
      expect(handle, id).toBeTruthy();
      expect(handle.damageObjects.damaged, `${id} damaged`).toBeTruthy();
      expect(handle.damageObjects.broken, `${id} broken`).toBeTruthy();
      expect(handle.object.visible).toBe(true);
      expect(handle.damageObjects.damaged!.visible).toBe(false);
      expect(handle.damageObjects.broken!.visible).toBe(false);
    }

    applyDamage(built, "damaged");
    for (const id of DAMAGE_PARTS) {
      const handle = built.getPart(id)!;
      expect(handle.object.visible, `${id} intact hidden`).toBe(false);
      expect(handle.damageObjects.damaged!.visible, `${id} damaged shown`).toBe(true);
      expect(handle.damageObjects.broken!.visible).toBe(false);
    }

    applyDamage(built, "broken");
    for (const id of DAMAGE_PARTS) {
      const handle = built.getPart(id)!;
      expect(handle.damageObjects.damaged!.visible).toBe(false);
      expect(handle.damageObjects.broken!.visible).toBe(true);
    }

    applyDamage(built, "intact");
    for (const id of DAMAGE_PARTS) {
      const handle = built.getPart(id)!;
      expect(handle.object.visible).toBe(true);
      expect(handle.damageObjects.damaged!.visible).toBe(false);
      expect(handle.damageObjects.broken!.visible).toBe(false);
    }
    built.dispose();
  });

  it("变体与完好件同位置，破碎几何非空（断面内构在同一网格里）", () => {
    const built = build();
    built.root.updateMatrixWorld(true);
    const baseBox = new THREE.Box3();
    const variantBox = new THREE.Box3();
    const baseCenter = new THREE.Vector3();
    const variantCenter = new THREE.Vector3();
    for (const id of DAMAGE_PARTS) {
      const handle = built.getPart(id)!;
      const base = handle.object as THREE.Mesh;
      base.geometry.computeBoundingBox();
      baseBox.copy(base.geometry.boundingBox!).applyMatrix4(base.matrixWorld);
      baseBox.getCenter(baseCenter);
      for (const state of ["damaged", "broken"] as const) {
        const variant = handle.damageObjects[state]!;
        variant.geometry.computeBoundingBox();
        variantBox.copy(variant.geometry.boundingBox!).applyMatrix4(variant.matrixWorld);
        variantBox.getCenter(variantCenter);
        expect(
          variantCenter.distanceTo(baseCenter),
          `${id}@${state} 与完好件中心偏移`,
        ).toBeLessThan(0.5);
        const position = variant.geometry.getAttribute("position");
        expect(position.count, `${id}@${state} 顶点数`).toBeGreaterThan(0);
      }
    }
    built.dispose();
  });

  it("构建进度优先：未装配到的零件切战损也不显示", () => {
    const built = build();
    const handle = built.getPart("tiger.hull.front_plate")!;
    applyDamage(built, "broken");
    expect(handle.damageObjects.broken!.visible).toBe(true);
    built.setBuildThreshold(0);
    expect(handle.object.visible).toBe(false);
    expect(handle.damageObjects.damaged!.visible).toBe(false);
    expect(handle.damageObjects.broken!.visible).toBe(false);
    built.setBuildThreshold(null);
    expect(handle.damageObjects.broken!.visible).toBe(true);
    built.dispose();
  });
});

describe("tiger/P3 发动机 / 事故特效", () => {
  it("发动机冷启动：预热不转 → 起动机拖动 → 点火 → 怠速", () => {
    expect(tigerEngineRpmAt(0)).toBe(0);
    // 预热 1.6s：曲轴不转，车体只有燃油泵 tick
    expect(tigerEngineRpmAt(0.8)).toBe(0);
    expect(tigerCrankAngleAt(0.8)).toBe(0);
    // 起动机拖动：约 165rpm，曲轴开始转
    expect(tigerEngineRpmAt(2.4)).toBeGreaterThan(100);
    expect(tigerCrankAngleAt(2.4)).toBeGreaterThan(0.5);
    // 点火：转速跳变
    expect(tigerEngineRpmAt(3.3)).toBeLessThan(220);
    expect(tigerEngineRpmAt(3.5)).toBeGreaterThan(240);
    // 怠速
    expect(tigerEngineRpmAt(8)).toBeGreaterThan(TIGER_IDLE_RPM - 20);
    expect(tigerEngineRpmAt(8)).toBeLessThan(TIGER_IDLE_RPM + 20);

    const built = build();
    built.resetNodes();
    animateTigerEngine(built, 1.0);
    const crank = built.getNode("Crank")!;
    expect(Math.abs(crank.rotation.x)).toBeLessThan(1e-9);
    const smoke = built.getPart("tiger.effects.exhaust_smoke")!;
    expect(smoke.object.visible).toBe(false);

    built.resetNodes();
    animateTigerEngine(built, 2.4);
    expect(Math.abs(crank.rotation.x)).toBeGreaterThan(0.5);
    const piston = built.getNode("Piston_1")!;
    const rest = built.nodeRest.get("Piston_1")!;
    const restPosition = new THREE.Vector3().setFromMatrixPosition(rest);
    expect(piston.position.distanceTo(restPosition)).toBeGreaterThan(0.001);
    expect(smoke.object.visible).toBe(true);
    built.dispose();
  });

  it("加油路径贯通：甲板盖 → 加注管 → 油箱颈，同轴且上下衔接", () => {
    const built = build();
    built.root.updateMatrixWorld(true);
    const filler = built.getPart("tiger.engine.fuel_filler")!;
    const cap = built.getPart("tiger.hull.fuel_cap")!;
    const tank = built.getPart("tiger.engine.fuel_tank_r")!;
    expect(filler.instances.length).toBe(2);
    expect(cap.instances.length).toBe(2);
    const fillerPos = new THREE.Vector3().setFromMatrixPosition(filler.instances[0]!.restMatrix);
    const capPos = new THREE.Vector3().setFromMatrixPosition(cap.instances[0]!.restMatrix);
    expect(Math.abs(fillerPos.x - capPos.x)).toBeLessThan(0.001);
    expect(Math.abs(fillerPos.z - capPos.z)).toBeLessThan(0.001);

    const fillerBox = built.partBounds(filler, new THREE.Box3());
    const capBox = built.partBounds(cap, new THREE.Box3());
    const tankBox = built.partBounds(tank, new THREE.Box3());
    // 上端穿甲板孔接到盖底座；下端套在油箱颈上
    expect(capBox.min.y - fillerBox.max.y).toBeLessThan(0.02);
    expect(fillerBox.min.y - tankBox.max.y).toBeLessThan(0.01);
    built.dispose();
  });

  it("受击：轻/重车体响应分级；爆闪/火花由 quarks VFX 渲染，不再有手搓 fx 件", () => {
    const built = build();
    built.resetNodes();
    animateTigerHit(built, 0.3, "light");
    const lightHeave = Math.abs(built.root.position.y);
    const lightPitch = Math.abs(built.root.rotation.z);
    built.resetNodes();
    animateTigerHit(built, 0.3, "heavy");
    const heavyHeave = Math.abs(built.root.position.y);
    const heavyPitch = Math.abs(built.root.rotation.z);
    expect(heavyHeave).toBeGreaterThan(0.005);
    expect(heavyHeave).toBeGreaterThan(lightHeave * 3);
    expect(heavyPitch).toBeGreaterThan(lightPitch * 3);
    expect(built.getPart("tiger.effects.hit_spark")).toBeUndefined();
    expect(built.getPart("tiger.effects.ammo_fire")).toBeUndefined();
    built.dispose();
  });

  it("弹药殉爆：炮塔掀飞 + 车体冲击；持续燃烧只保留车体震颤", () => {
    const built = build();
    built.resetNodes();
    animateTigerDetonation(built, 1.3);
    const turret = built.getNode("Turret")!;
    expect(turret.position.y).toBeGreaterThan(0.2);
    expect(Math.abs(built.root.position.y)).toBeGreaterThan(0.001);

    built.resetNodes();
    animateTigerBurning(built, 1.0);
    expect(Math.abs(built.root.position.y)).toBeLessThan(0.003);
    expect(built.getPart("tiger.effects.engine_fire")).toBeUndefined();
    built.dispose();
  });
});
