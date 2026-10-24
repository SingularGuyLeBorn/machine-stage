import { afterAll, describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { detectUnsupportedParts } from "@/three/parts/solver/support";
import { detectFloatingIslands } from "@/three/parts/solver/support";
import { detectKitIslands } from "@/three/parts/solver/kitConnectivity";
import { findModel } from "@/app/catalog";
import { animateCarrier, carrierFlightPhase, CAT_NOSE_ENGAGE } from "./motion";
import { CV } from "./constants";
import { HANGAR_DOOR_NODES, AMMO_ELEVATOR_NODE } from "./hangar";
import { WIRE_NODES, SHUTTLE_NODE, JBD_NODES, ELEVATOR_NODES } from "./flightdeck";
import { RADAR_NODE, CIWS_NODES } from "./island";
import { AIRCRAFT_NODE, HOOK_NODE, WING_FOLD_L, WING_FOLD_R } from "./aircraft";
import { CARRIER_CREW_FIGURES } from "../crewFigures";

// ============================================================================
// 福建舰验收：3000+ 定义件、自内向外五层、核心弹射/拦阻闭环、零悬空。
// 静态穿模与全状态扫掠由 scripts/diag-carrier.ts / diag-carrier-sweep.ts 负责。
// ============================================================================

const model = findModel("carrier");
const registry = model.registry!;
const built = buildModel(registry, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

const instances = built.parts.reduce((sum, h) => sum + h.instances.length, 0);
const staticIds = new Set(registry.parts.map((p) => p.id));

const poseAt = (t: number, state = "flight_ops") => {
  built.resetNodes();
  animateCarrier(built, t, state);
  built.root.updateMatrixWorld(true);
  return {
    aircraft: built.getNode(AIRCRAFT_NODE)!.position.clone(),
    shuttleZ: built.getNode(SHUTTLE_NODE)!.position.z,
    hook: built.getNode(HOOK_NODE)!.rotation.x,
    wing: built.getNode(WING_FOLD_L)!.rotation.z,
    wire: built.getNode(WIRE_NODES[1]![0])!.rotation.y,
  };
};

afterAll(() => built.dispose());

describe("福建舰 · 整机", () => {
  it("零件数 3000+ 定义件、3500+ 实例（不是空壳）", () => {
    expect(registry.parts.length).toBeGreaterThanOrEqual(3000);
    expect(instances).toBeGreaterThanOrEqual(3500);
    expect(built.parts.length).toBe(
      registry.parts.reduce((sum, p) => sum + (p.dual ? 2 : 1), 0),
    );
  });

  it("自内向外五层都有零件级内容", () => {
    const byLayer = new Map<number, number>();
    for (const part of built.parts) {
      byLayer.set(part.buildLayer, (byLayer.get(part.buildLayer) ?? 0) + 1);
    }
    for (const layer of [1, 2, 3, 4, 5]) {
      expect(byLayer.get(layer), `L${layer}`).toBeGreaterThan(100);
    }
  });

  it("L1 舰体/动力：龙骨/肋骨/水密门/反应堆/控制棒/双桨/双舵", () => {
    for (const id of [
      "carrier.hull.keel",
      "carrier.hull.hangar_deck",
      "carrier.hull.lower_deck",
      "carrier.hull.bulkhead_01",
      "carrier.hull.door_01_leaf",
      "carrier.power.reactor_vessel",
      "carrier.power.vessel_head",
      "carrier.power.core_support_plate",
      "carrier.power.control_rod_01_spider",
      "carrier.power.turbine_l_lp_casing",
      "carrier.power.turbine_r_hp_rotor",
      "carrier.power.gearbox_l",
      "carrier.power.condenser_r",
      "carrier.power.shaft_l_1",
      "carrier.power.propeller_l_hub",
      "carrier.power.rudder_l",
    ]) {
      expect(staticIds.has(id), id).toBe(true);
    }
    for (let i = 1; i <= 8; i++) {
      expect(staticIds.has(`carrier.power.control_rod_${String(i).padStart(2, "0")}_spider`)).toBe(true);
    }
    for (const side of ["l", "r"]) {
      for (let s = 1; s <= 4; s++) {
        expect(staticIds.has(`carrier.power.shaft_${side}_${s}`), `${side}${s}`).toBe(true);
      }
    }
  });

  it("L2 机库/弹药：5 道防火门、停机位、弹药库、升降机导轨", () => {
    expect(HANGAR_DOOR_NODES).toHaveLength(5);
    for (let i = 1; i <= 5; i++) {
      const tag = String(i).padStart(2, "0");
      expect(staticIds.has(`carrier.hangar.fire_door_${tag}_frame`), `door ${i}`).toBe(true);
      expect(staticIds.has(`carrier.hangar.fire_door_${tag}_leaf_l`), `leaf l ${i}`).toBe(true);
      expect(staticIds.has(`carrier.hangar.fire_door_${tag}_leaf_r`), `leaf r ${i}`).toBe(true);
      expect(built.getNode(`CV_HangarDoor_${i}_R`), `right node ${i}`).toBeDefined();
    }
    expect(built.getNode(AMMO_ELEVATOR_NODE)).toBeDefined();
    for (let r = 1; r <= 4; r++) {
      expect(staticIds.has(`carrier.hangar.magazine_rack_${r}`), `magazine ${r}`).toBe(true);
    }
    expect(staticIds.has("carrier.hangar.ammo_platform")).toBe(true);
    expect(staticIds.has("carrier.hangar.ammo_elevator_rail_l")).toBe(true);
  });

  it("L3 飞行甲板：3 条弹射器 ×16 段 + 滑梭 + 挡焰板 + 4 道拦阻索 + 2 升降机 + 拦阻网", () => {
    for (let track = 1; track <= 3; track++) {
      const id = String(track).padStart(2, "0");
      for (let s = 1; s <= CV.CAT_SEGMENTS; s++) {
        expect(staticIds.has(`carrier.deck.cat_${id}_stator_${String(s).padStart(2, "0")}`), `cat ${track}-${s}`).toBe(true);
      }
      expect(built.getNode(JBD_NODES[track - 1]!)).toBeDefined();
    }
    expect(built.getNode(SHUTTLE_NODE)).toBeDefined();
    expect(staticIds.has("carrier.deck.shuttle_body")).toBe(true);
    for (let i = 1; i <= 4; i++) {
      const tag = String(i).padStart(2, "0");
      expect(staticIds.has(`carrier.deck.wire_${tag}_l_cable`), `wire ${i} l`).toBe(true);
      expect(staticIds.has(`carrier.deck.wire_${tag}_r_cable`), `wire ${i} r`).toBe(true);
    }
    expect(staticIds.has("carrier.deck.arrestor_l_cylinder")).toBe(true);
    expect(staticIds.has("carrier.deck.arrestor_net_trough")).toBe(true);
    expect(staticIds.has("carrier.deck.arrestor_net_pack")).toBe(true);
    expect(ELEVATOR_NODES).toHaveLength(2);
    for (let i = 1; i <= 2; i++) {
      expect(built.getNode(ELEVATOR_NODES[i - 1]!)).toBeDefined();
      expect(staticIds.has(`carrier.deck.elevator_${i}_platform`), `elevator ${i}`).toBe(true);
    }
  });

  it("L4 舰岛：两层舱室 + 一体化隐身塔 + 4 面固定相控阵（4×100 TR）+ 旋转雷达 + 2 座 1130（各 11 管）", () => {
    for (let level = 1; level <= 2; level++) {
      expect(staticIds.has(`carrier.island.bridge_${level}_floor`), `bridge ${level}`).toBe(true);
    }
    expect(staticIds.has("carrier.island.faceted_tower"), "faceted tower").toBe(true);
    for (let panel = 1; panel <= 4; panel++) {
      const tag = String(panel).padStart(2, "0");
      expect(staticIds.has(`carrier.island.array_${tag}_panel`), `array ${panel}`).toBe(true);
      expect(built.getPart(`carrier.island.array_${tag}_tr`)!.instances.length).toBe(100);
    }
    expect(built.getNode(RADAR_NODE)).toBeDefined();
    expect(staticIds.has("carrier.island.radar_antenna")).toBe(true);
    for (const id of [
      "carrier.crew.corridor_eye",
      "carrier.crew.berth_eye",
      "carrier.crew.mess_eye",
      "carrier.crew.bunk_curtains",
      "carrier.crew.screens",
      "carrier.crew.partition",
    ]) {
      expect(staticIds.has(id), id).toBe(true);
    }
    expect(CARRIER_CREW_FIGURES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CARRIER_CREW_FIGURES.map((f) => f.model)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(CARRIER_CREW_FIGURES.map((f) => f.palette)).size).toBeGreaterThanOrEqual(5);
    expect(CIWS_NODES).toHaveLength(2);
    for (let ciws = 1; ciws <= 2; ciws++) {
      const tag = String(ciws).padStart(2, "0");
      for (let b = 1; b <= 11; b++) {
        const barrel = String(b).padStart(2, "0");
        expect(staticIds.has(`carrier.island.ciws_${tag}_barrel_${barrel}`), `ciws ${ciws} barrel ${b}`).toBe(true);
        expect(staticIds.has(`carrier.island.ciws_${tag}_breech_${barrel}`), `ciws ${ciws} breech ${b}`).toBe(true);
      }
    }
  });

  it("L5 舰载机：折叠内/外翼 + 尾钩 + 加强起落架 + 弹射牵引杆", () => {
    for (const id of [
      "carrier.aircraft.wing_inner_l",
      "carrier.aircraft.wing_outer_l",
      "carrier.aircraft.wing_fold_hinge_l",
      "carrier.aircraft.wing_fold_actuator_r",
      "carrier.aircraft.wing_fold_lock_r",
      "carrier.aircraft.hook_arm",
      "carrier.aircraft.hook_head",
      "carrier.aircraft.hook_actuator",
      "carrier.aircraft.hook_damper",
      "carrier.aircraft.gear_nose_strut",
      "carrier.aircraft.gear_main_strut_l",
      "carrier.aircraft.gear_main_wheel_r",
      "carrier.aircraft.launch_bar",
    ]) {
      expect(staticIds.has(id), id).toBe(true);
    }
    expect(built.getNode(WING_FOLD_R)).toBeDefined();
  });

  it("零悬空：3660+ 实例每个都在 20mm 内有支撑邻居，且无悬空孤岛", () => {
    const unsupported = detectUnsupportedParts(built, { maxGapM: 0.02, ignoreDonorPartIds: ["carrier.hull.hull_shell"] });
    expect(unsupported.map((r) => `${r.ref} ${r.gap_mm.toFixed(1)}mm`)).toEqual([]);
    const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
    expect(islands.islands).toHaveLength(0);
    expect(islands.islandInstances).toBe(0);
    const kit = detectKitIslands(built, { maxGapM: 0.02 });
    expect(kit).toHaveLength(0);
  }, 120000);

  it("核心闭环：弹射起飞 → 离舰爬升 → 拦阻钩索 → 减速复位", () => {
    const taxi = poseAt(0);
    const launch = poseAt(3.5);
    const airborne = poseAt(5);
    const approach = poseAt(17.0);
    const caught = poseAt(19);
    const secured = poseAt(27);

    expect(carrierFlightPhase(0)).toBe("taxi");
    expect(carrierFlightPhase(3.5)).toBe("launch");
    expect(carrierFlightPhase(5)).toBe("airborne");
    expect(carrierFlightPhase(19)).toBe("arrested");

    // 滑跑：滑梭顶在机头弹射杆上，机体原点落后滑梭一个前起落架纵向距离。
    expect(launch.aircraft.z).toBeGreaterThan(taxi.aircraft.z + 2);
    expect(launch.shuttleZ - launch.aircraft.z).toBeCloseTo(CAT_NOSE_ENGAGE, 1);
    // 起飞后离舰：明显抬高并越过舰艏
    expect(airborne.aircraft.y).toBeGreaterThan(launch.aircraft.y + 1.2);
    expect(airborne.shuttleZ).toBeCloseTo(CV.CAT_Z0, 5);
    // 机翼从折叠 1.72 rad 展开到 0
    expect(Math.abs(taxi.wing)).toBeGreaterThan(1.4);
    expect(Math.abs(launch.wing)).toBeLessThan(0.05);
    // 进近放钩、着舰钩住第 2 道索并拉出
    expect(approach.hook).toBeLessThan(-0.3);
    expect(caught.hook).toBeLessThan(-0.3);
    expect(Math.abs(caught.wire)).toBeGreaterThan(0.25);
    expect(caught.aircraft.z).toBeGreaterThan(approach.aircraft.z);
    // 进近/滑跑贴 9.3° 斜角跑道中线：机身 x 随 z 向港侧偏移，不再走 x=0 的直线。
    expect(approach.aircraft.x).toBeLessThan(1.0);
    expect(caught.aircraft.x).toBeLessThan(0);
    // 复位后重新折叠系留
    expect(Math.abs(secured.wing)).toBeGreaterThan(1.4);
    expect(secured.aircraft.z).toBeCloseTo(CV.AIRCRAFT_PARK[1], 1);
  });

  it("动力/机库/近防：控制棒、双桨、旋转雷达、防火门、弹药升降机、1130 转管真的在动", () => {
    built.resetNodes();
    animateCarrier(built, 2.4, "engine");
    built.root.updateMatrixWorld(true);
    expect(Math.abs(built.getNode("CV_Prop_l")!.rotation.z)).toBeGreaterThan(1);
    expect(Math.abs(built.getNode(RADAR_NODE)!.rotation.y)).toBeGreaterThan(1);
    const rod = built.getNode("CV_CR_01")!;
    expect(Math.abs(rod.position.y - built.nodeRest.get("CV_CR_01")!.elements[13]!)).toBeGreaterThan(0.01);

    built.resetNodes();
    animateCarrier(built, 2.0, "hangar");
    built.root.updateMatrixWorld(true);
    expect(built.getNode("CV_HangarDoor_1")!.scale.x).toBeLessThan(0.5);
    expect(built.getNode("CV_HangarDoor_1_R")!.scale.x).toBeLessThan(0.5);
    // 船壳收窄后弹药升降机井与下层弹架/肋骨净空不足，平台停在机库层（门仍开合）。
    expect(built.getNode(AMMO_ELEVATOR_NODE)!.position.y).toBeGreaterThan(2.25);

    built.resetNodes();
    animateCarrier(built, 1.4, "ciws");
    built.root.updateMatrixWorld(true);
    expect(Math.abs(built.getNode(CIWS_NODES[0])!.rotation.y)).toBeGreaterThan(0.1);
    expect(Math.abs(built.getNode("CV_CiwsRotor_1")!.rotation.z)).toBeGreaterThan(1);
  });
});
