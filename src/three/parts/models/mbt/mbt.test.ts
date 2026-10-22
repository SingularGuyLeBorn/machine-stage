import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { detectUnsupportedParts } from "@/three/parts/solver/support";
import { animateMbt } from "./motion";
import { MBT } from "./constants";

// ============================================================================
// MBT-90 验收：1200+ 定义件、自内向外五层、发动机逐件、装弹机/弹药/ERA。
// 静态穿模由 scripts/diag-mbt.ts（7k+ 报告全部命中构造性接触白名单）负责；
// 这里锁结构、动画与悬空（每个实例都有 20mm 内的支撑邻居）。
// ============================================================================

const model = findModel("mbt90");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

const instances = built.parts.reduce((sum, h) => sum + h.instances.length, 0);
const restPos = (name: string): THREE.Vector3 => {
  const matrix = built.nodeRest.get(name);
  const p = new THREE.Vector3();
  matrix?.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
  return p;
};

afterAll(() => built.dispose());

describe("MBT-90 主战坦克 · 整机", () => {
  it("零件数 1200+ 定义件、3000+ 实例（不是空壳）", () => {
    expect(built.parts.length).toBeGreaterThanOrEqual(1200);
    expect(instances).toBeGreaterThan(3000);
    expect(built.parts.length).toBe(
      model.registry!.parts.reduce((sum, p) => sum + (p.dual ? 2 : 1), 0),
    );
  });

  it("自内向外五层都有零件级内容", () => {
    const byLayer = new Map<number, number>();
    for (const part of built.parts) {
      const layer = part.buildLayer;
      byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
    }
    for (const layer of [1, 2, 3, 4, 5]) {
      expect(byLayer.get(layer), `L${layer}`).toBeGreaterThan(20);
    }
  });

  it("L1 发动机：12 缸逐件、48 气门、双涡轮、双凸轮轴", () => {
    for (let i = 1; i <= 12; i++) {
      const pad = String(i).padStart(2, "0");
      expect(built.getPart(`mbt90.engine.cyl${pad}_piston`), `piston ${i}`).toBeDefined();
      expect(built.getPart(`mbt90.engine.cyl${pad}_connecting_rod`), `rod ${i}`).toBeDefined();
      expect(built.getPart(`mbt90.engine.cyl${pad}_liner`), `liner ${i}`).toBeDefined();
      expect(built.getPart(`mbt90.engine.cyl${pad}_head`), `head ${i}`).toBeDefined();
    }
    expect(built.getPart("mbt90.engine.camshaft_l")).toBeDefined();
    expect(built.getPart("mbt90.engine.camshaft_r")).toBeDefined();
    expect(built.getPart("mbt90.engine.turbo_rotor_l")).toBeDefined();
    expect(built.getPart("mbt90.engine.turbo_rotor_r")).toBeDefined();
    expect(built.getPart("mbt90.engine.flywheel")).toBeDefined();
    // 48 气门 = 12 缸 × 4；每缸 I1/I2/E1/E2
    const valves = model.registry!.parts.filter((p) => /_valve_(i1|i2|e1|e2)$/.test(p.id));
    expect(valves.length).toBeGreaterThanOrEqual(48);
    let valveNodes = 0;
    for (const part of built.parts) if (/_valve_(i1|i2|e1|e2)$/.test(part.partId)) valveNodes += part.instances.length;
    expect(valveNodes).toBe(48);
  });

  it("L3 战斗室：驾驶/炮长/车长 + 吊篮 + 自动装弹机 + 尾舱弹药架", () => {
    for (const id of [
      "mbt90.interior.driver_seat_pan",
      "mbt90.interior.driver_wheel",
      "mbt90.interior.gunner_seat",
      "mbt90.interior.gunner_day_sight",
      "mbt90.interior.gunner_thermal_sight",
      "mbt90.interior.commander_seat",
      "mbt90.interior.commander_cupola_ring",
      "mbt90.interior.basket_floor_ring",
      "mbt90.interior.carousel_ring",
      "mbt90.interior.autoloader_rammer",
      "mbt90.interior.bustle_rack_frame",
      "mbt90.interior.blowout_l",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
    // 40 发：待发 12+6+4，尾舱 4+6+4+4
    expect(built.getPart("mbt90.interior.ammo_ap_carousel_case")!.instances).toHaveLength(12);
    expect(built.getPart("mbt90.interior.ammo_heat_carousel_case")!.instances).toHaveLength(6);
    expect(built.getPart("mbt90.interior.ammo_he_carousel_case")!.instances).toHaveLength(4);
    expect(built.getPart("mbt90.interior.ammo_ap_rack_case")!.instances).toHaveLength(4);
    expect(built.getPart("mbt90.interior.ammo_heat_rack_case")!.instances).toHaveLength(6);
    expect(built.getPart("mbt90.interior.ammo_he_rack_case")!.instances).toHaveLength(4);
    expect(built.getPart("mbt90.interior.ammo_hesh_rack_case")!.instances).toHaveLength(4);
  });

  it("炮弹零件化：APFSDS 钨芯/弹托/风帽/尾翼/药筒/发射药/底火 + HEAT 药型罩", () => {
    for (const id of [
      "mbt90.interior.ammo_ap_carousel_penetrator",
      "mbt90.interior.ammo_ap_carousel_sabot",
      "mbt90.interior.ammo_ap_carousel_windscreen",
      "mbt90.interior.ammo_ap_carousel_fins",
      "mbt90.interior.ammo_ap_carousel_case",
      "mbt90.interior.ammo_ap_carousel_propellant",
      "mbt90.interior.ammo_ap_carousel_primer",
      "mbt90.interior.ammo_heat_carousel_liner",
      "mbt90.interior.ammo_heat_carousel_fuze",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
    expect(built.getPart("mbt90.interior.ammo_ap_carousel_penetrator")!.def.material).toBe("mbt_tungsten");
    expect(built.getPart("mbt90.interior.ammo_heat_carousel_liner")!.def.material).toBe("mbt_copper");
  });

  it("L4 复合装甲分层 + 100+ 块 ERA（壳体/背板/炸药/飞板/前盖）", () => {
    for (const id of [
      "mbt90.hull.turret_cheek_outer_l",
      "mbt90.hull.turret_cheek_ceramic_l",
      "mbt90.hull.turret_cheek_backing_l",
      "mbt90.hull.armor_glacis_outer",
      "mbt90.hull.armor_side_r",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
    const blocks =
      built.getPart("mbt90.hull.era_glacis_casing")!.instances.length +
      built.getPart("mbt90.hull.era_cheek_r_casing")!.instances.length +
      built.getPart("mbt90.hull.era_cheek_l_casing")!.instances.length +
      built.getPart("mbt90.hull.era_side_r_casing")!.instances.length +
      built.getPart("mbt90.hull.era_side_l_casing")!.instances.length +
      built.getPart("mbt90.hull.era_skirt_r_casing")!.instances.length +
      built.getPart("mbt90.hull.era_skirt_l_casing")!.instances.length;
    expect(blocks).toBeGreaterThanOrEqual(100);
    const distances = ["casing", "liner", "explosive", "flyer", "cover"].map((kind) => {
      const part = built.getPart(`mbt90.hull.era_glacis_${kind}`);
      expect(part, kind).toBeDefined();
      expect(part!.def.explode?.direction, kind).toBeDefined();
      return Number(part!.def.explode?.distance);
    });
    expect(new Set(distances).size).toBeGreaterThanOrEqual(4);
  });

  it("车长 M2HB 机枪：枪架上有轭架/机匣/枪管/握把/弹箱/弹链", () => {
    for (const id of [
      "mbt90.hull.cupola_mg_mount",
      "mbt90.hull.cupola_mg_cradle",
      "mbt90.hull.cupola_mg_receiver",
      "mbt90.hull.cupola_mg_barrel",
      "mbt90.hull.cupola_mg_grips",
      "mbt90.hull.cupola_mg_ammo_box",
      "mbt90.hull.cupola_mg_belt",
      "mbt90.hull.cupola_mg_rear_sight",
      "mbt90.hull.cupola_mg_spent_bag",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
    expect(built.getPart("mbt90.hull.cupola_mg_receiver")!.instances.length).toBe(1);
    expect(built.getPart("mbt90.hull.cupola_mg_barrel")!.instances.length).toBe(1);
  });

  it("120mm 滑膛炮：热护套两段 + 抽烟装置 + 炮闩/制退机/复进机", () => {
    for (const id of [
      "mbt90.hull.gun_barrel",
      "mbt90.hull.thermal_sleeve_front",
      "mbt90.hull.thermal_sleeve_rear",
      "mbt90.hull.evacuator",
      "mbt90.hull.muzzle",
      "mbt90.hull.breech_block",
      "mbt90.hull.recoil_cylinder_l",
      "mbt90.hull.recoil_cylinder_r",
      "mbt90.hull.recuperator",
      "mbt90.hull.turret_mantlet",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
  });

  it("零悬空：3800+ 实例每个都在 20mm 内有支撑邻居", () => {
    const unsupported = detectUnsupportedParts(built, { maxGapM: 0.02 });
    expect(unsupported.map((r) => `${r.ref} ${r.gap_mm.toFixed(1)}mm`)).toEqual([]);
  }, 120000);

  it("发动机运转：曲轴/活塞/气门/涡轮节点真的在动", () => {
    built.resetNodes();
    animateMbt(built, 0.1, "running");
    const crank = built.getNode("MBT_Crank")!;
    expect(Math.abs(crank.rotation.x)).toBeGreaterThan(0.1);
    const piston = built.getNode("MBT_Piston_1")!;
    const pistonRest = restPos("MBT_Piston_1");
    expect(piston.position.distanceTo(pistonRest)).toBeGreaterThan(0.001);
    const valve = built.getNode("MBT_Valve_I1_1")!;
    const valveRest = restPos("MBT_Valve_I1_1");
    expect(valve.position.distanceTo(valveRest)).toBeGreaterThan(0.0005);
    const turbo = built.getNode("MBT_Turbo_L")!;
    expect(Math.abs(turbo.rotation.x)).toBeGreaterThan(0.1);
    const cam = built.getNode("MBT_Cam_L")!;
    expect(Math.abs(cam.rotation.x)).toBeGreaterThan(0.05);
    built.resetNodes();
  });

  it("自动装弹机：转盘/提弹臂/推弹杆/演示弹按节拍运动", () => {
    built.resetNodes();
    animateMbt(built, 3.4, "loading");
    const round = built.getNode("MBT_LoadRound")!;
    expect(round.position.y).toBeGreaterThan(1.5);
    expect(round.position.z).toBeGreaterThan(0.9);
    const rammer = built.getNode("MBT_Rammer")!;
    expect(rammer.position.z).toBeGreaterThan(0.7);
    const carousel = built.getNode("MBT_Carousel")!;
    expect(Math.abs(carousel.rotation.y)).toBeGreaterThan(0.1);
    expect(built.getPart("mbt90.interior.demo_penetrator")!.object.visible).toBe(true);
    built.resetNodes();
  });

  it("击发：后坐 + 抛壳（炮口焰/排烟由 VFX 负责）", () => {
    built.resetNodes();
    animateMbt(built, 0.06, "fire");
    expect(built.getNode("GunRecoil")!.position.z).toBeLessThan(-0.1);
    // 旧球体 fx 必须保持隐藏，不能和照片级 VFX 叠两层。
    expect(built.getPart("mbt90.interior.muzzle_flash")!.object.visible).toBe(false);
    animateMbt(built, 0.6, "fire");
    expect(built.getPart("mbt90.interior.evacuator_smoke")!.object.visible).toBe(false);
    animateMbt(built, 2.2, "fire");
    expect(built.getPart("mbt90.interior.ejected_case")!.object.visible).toBe(true);
    built.resetNodes();
  });

  it("ERA 被击中：单块消失 + 碎片/来袭弹可见（火球由 VFX 负责）", () => {
    built.resetNodes();
    const casing = built.getPart("mbt90.hull.era_glacis_casing")!;
    const before = new THREE.Matrix4();
    built.instanceMatrix(casing, 12, before);
    animateMbt(built, 0.4, "era_hit");
    const after = new THREE.Matrix4();
    built.instanceMatrix(casing, 12, after);
    const scale = new THREE.Vector3();
    after.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(Math.max(scale.x, scale.y, scale.z)).toBeLessThan(0.01);
    expect(built.getPart("mbt90.interior.era_fireball")!.object.visible).toBe(false);
    expect(built.getPart("mbt90.interior.era_debris")!.object.visible).toBe(true);
    expect(built.getPart("mbt90.interior.incoming_round")!.object.visible).toBe(true);
    built.resetNodes();
  });

  it("殉爆：泄压板掀开；泄压失败：炮塔被掀飞（火焰由 VFX 负责）", () => {
    built.resetNodes();
    animateMbt(built, 1.4, "blowout");
    expect(Math.abs(built.getNode("MBT_Blowout_L")!.rotation.z)).toBeGreaterThan(0.5);
    expect(built.getPart("mbt90.interior.blowout_fire")!.object.visible).toBe(false);
    built.resetNodes();
    animateMbt(built, 1.0, "detonation");
    expect(built.getNode("Turret")!.position.y).toBeGreaterThan(0.05);
    expect(Math.abs(built.getNode("MBT_Blowout_L")!.rotation.z)).toBeLessThan(0.1);
    expect(built.getPart("mbt90.interior.detonation_fire")!.object.visible).toBe(false);
    built.resetNodes();
  });

  it("行进：负重轮/主动轮/履带板都在滚，悬挂随地形起伏", () => {
    built.resetNodes();
    const track = built.getPart("mbt90.running.track_link")!;
    const rest = new THREE.Matrix4();
    built.instanceMatrix(track, 0, rest);
    animateMbt(built, 1.5, "drive");
    const moved = new THREE.Matrix4();
    built.instanceMatrix(track, 0, moved);
    expect(moved.elements.some((v, i) => Math.abs(v - rest.elements[i]!) > 1e-4)).toBe(true);
    expect(Math.abs(built.getNode("MBT_Wheel_0")!.rotation.x)).toBeGreaterThan(0.5);
    expect(Math.abs(built.getNode("MBT_Arm_0")!.rotation.z)).toBeGreaterThan(0.0005);
    built.resetNodes();
  });

  it("履带板/负重轮/ERA 都是实例族（不是手摆几十件）", () => {
    expect(built.getPart("mbt90.running.track_link")!.instances.length).toBeGreaterThan(150);
    expect(built.getPart("mbt90.running.track_pad")!.instances.length).toBeGreaterThan(150);
    expect(built.getPart("mbt90.running.wheel_tire")!.instances).toHaveLength(14);
    expect(built.getPart("mbt90.running.wheel_bolt")!.instances).toHaveLength(112);
    expect(MBT.WHEEL_COUNT).toBe(7);
  });
});
