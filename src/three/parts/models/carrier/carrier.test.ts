import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { detectUnsupportedParts } from "@/three/parts/solver/support";
import { detectFloatingIslands } from "@/three/parts/solver/support";
import { detectKitIslands } from "@/three/parts/solver/kitConnectivity";
import { findModel } from "@/app/catalog";
import { animateCarrier, carrierFlightPhase, CAT_NOSE_ENGAGE } from "./motion";
import { BOW_RAMP_RISE, BOW_RAMP_Z0, BOW_RAMP_Z1, CAT_TRACKS, CV, carrierJbdOffset, catPoint, deckTopAt } from "./constants";
import {
  HANGAR_CREW_DOOR_NODE,
  HANGAR_DOOR_NODES,
  HANGAR_ENGINE_DOOR_NODE,
  AMMO_ELEVATOR_NODE,
} from "./hangar";
import {
  BARRIER_NET_NODE,
  BARRIER_POST_NODES,
  WIRE_NODES,
  SHUTTLE_NODE,
  JBD_NODES,
  ELEVATOR_NODES,
} from "./flightdeck";
import { deckEdgeAt, deckPlan } from "./kits";
import { distanceToPlanEdge, pointInPlan } from "./deckClearance";
import { LANDING_RUNWAY, LANDING_RUNWAY_POLYGON, TAKEOFF_RUNWAY_POLYGON } from "./runwayPlan";
import { RADAR_NODE, CIWS_NODES } from "./island";
import { AIRCRAFT_NODE, HOOK_NODE, WING_FOLD_L, WING_FOLD_R } from "./aircraft";
import { CARRIER_CREW_FIGURES } from "../crewFigures";

// ============================================================================
// 福建舰验收：10,000+ 定义件、用户甲板轮廓/着舰区、自内向外五层、核心弹射/拦阻闭环、零悬空。
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
    wire: built.getNode(WIRE_NODES[2]![0])!.rotation.y,
  };
};

afterAll(() => built.dispose());

describe("福建舰 · 整机", () => {
  it("零件数 10000+ 定义件、11000+ 实例（不是空壳）", () => {
    expect(registry.parts.length).toBeGreaterThanOrEqual(10000);
    expect(instances).toBeGreaterThanOrEqual(11000);
    expect(built.parts.length).toBe(
      registry.parts.reduce((sum, p) => sum + (p.dual ? 2 : 1), 0),
    );
  });

  it("甲板轮廓采用用户 36 点数据，lnj 起飞/着舰跑道落在甲板内", () => {
    const plan = deckPlan();
    expect(plan).toHaveLength(36);
    const inside = (poly: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]!;
        const [xj, zj] = poly[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
      }
      return hit;
    };
    // 艉端两角几乎贴着艉板折线，向跑道中心收 6% 再判内；前两角同样收一点。
    const checkPolygon = (poly: ReadonlyArray<readonly [number, number]>, inset: number) => {
      const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
      const cz = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
      for (const [x, z] of poly) {
        expect(inside(plan, x + (cx - x) * inset, z + (cz - z) * inset), `${x},${z}`).toBe(true);
      }
    };
    checkPolygon(LANDING_RUNWAY_POLYGON, 0.06);
    checkPolygon(TAKEOFF_RUNWAY_POLYGON, 0.04);
    // 目标跑道艏端压在外缘线 13、艉端压在外缘线 1 上，航向约 2.46°。
    expect(LANDING_RUNWAY.deg).toBeCloseTo(2.46, 1);
    // 舰艏两条弹射器一左一右分列前甲板中线，不再一起挤在右舷。
    const centre15 = (deckEdgeAt(15, -1).x + deckEdgeAt(15, 1).x) / 2;
    const bowXs = CAT_TRACKS.slice(0, 2).map((track) => track.x0);
    expect(Math.min(...bowXs)).toBeLessThan(centre15);
    expect(Math.max(...bowXs)).toBeGreaterThan(centre15);
    expect(Math.abs(bowXs[1]! - bowXs[0]!)).toBeGreaterThan(1.5);
    for (const track of CAT_TRACKS.slice(0, 2)) {
      expect(inside(plan, track.x0, track.z0), `cat ${track.id} start on deck`).toBe(true);
      expect(inside(LANDING_RUNWAY_POLYGON, track.x0, track.z0), `cat ${track.id} clear of landing`).toBe(false);
    }
    // 腰部三号整体后移外靠：轨道与 JBD 都不得压着着舰跑道。
    const waist = CAT_TRACKS[2]!;
    expect(inside(LANDING_RUNWAY_POLYGON, waist.x0, waist.z0)).toBe(false);
    const waistJbd = catPoint(waist, carrierJbdOffset(waist.id));
    expect(inside(LANDING_RUNWAY_POLYGON, waistJbd.x, waistJbd.z)).toBe(false);
    // 起飞跑道底色已删除，只留两条弹射器自己的轨道/车道线。
    expect(staticIds.has("carrier.deck.takeoff_runway_underlay")).toBe(false);
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
    // 近程防空按用户要求改为舰艏/舰艉左右舷各一套 HQ-10（共 4 套），
    // 不再是舰岛顶上的 2 套；左右各一套 6 联装干扰弹发射器。
    for (const tag of ["bow_p", "bow_s", "stern_p", "stern_s"]) {
      expect(staticIds.has(`carrier.island.sam_${tag}_body`), `HQ-10 ${tag}`).toBe(true);
      expect(staticIds.has(`carrier.island.sam_${tag}_cell_rims`), `HQ-10 cells ${tag}`).toBe(true);
    }
    for (const tag of ["p", "s"]) {
      expect(staticIds.has(`carrier.island.decoy_${tag}`), `decoy ${tag}`).toBe(true);
    }
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

  it("零悬空：11300+ 实例每个都在 20mm 内有支撑邻居，且无悬空孤岛", () => {
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
    // 进近放钩、着舰钩住第 3 道索并拉出
    expect(approach.hook).toBeLessThan(-0.3);
    expect(caught.hook).toBeLessThan(-0.3);
    expect(Math.abs(caught.wire)).toBeGreaterThan(0.25);
    expect(caught.aircraft.z).toBeGreaterThan(approach.aircraft.z);
    // 进近/滑跑贴 3.59° 斜角跑道中线：机身 x 随 z 向港侧偏移，不再走 x=0 的直线。
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

describe("福建舰 · 舰艏甲板上翘与漫游交互件", () => {
  it("甲板本体从起翘起点连续抬升，艏端抬升 0.3（不是另贴一块板）", () => {
    const flat = CV.DECK_Y + CV.DECK_T;
    expect(deckTopAt(BOW_RAMP_Z0)).toBeCloseTo(flat, 6);
    expect(deckTopAt(BOW_RAMP_Z1)).toBeCloseTo(flat + BOW_RAMP_RISE, 6);
    let previous = -Infinity;
    for (let i = 0; i <= 24; i++) {
      const z = BOW_RAMP_Z0 + ((BOW_RAMP_Z1 - BOW_RAMP_Z0) * i) / 24;
      const y = deckTopAt(z);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = y;
    }
    expect(staticIds.has("carrier.deck.bow_ramp_core")).toBe(true);
    expect(staticIds.has("carrier.deck.bow_ramp_plate_05")).toBe(true);
    expect(staticIds.has("carrier.deck.bow_ramp_edge_p")).toBe(true);
    expect(staticIds.has("carrier.deck.bow_ramp_edge_s")).toBe(true);
    expect(staticIds.has("carrier.deck.bow_ramp_01")).toBe(false);
  });

  it("应急拦阻网/漫游水密门节点齐备；拦阻网静止时收在网槽内", () => {
    expect(built.getNode(BARRIER_NET_NODE)).toBeDefined();
    for (const name of BARRIER_POST_NODES) expect(built.getNode(name)).toBeDefined();
    expect(registry.nodes.find((node) => node.name === BARRIER_NET_NODE)?.scale).toEqual([1, 0.03, 1]);
    expect(built.getNode(HANGAR_ENGINE_DOOR_NODE)).toBeDefined();
    expect(built.getNode(HANGAR_CREW_DOOR_NODE)).toBeDefined();
    expect(staticIds.has("carrier.deck.barrier_net_panel")).toBe(true);
    expect(staticIds.has("carrier.deck.barrier_net_control")).toBe(true);
    expect(staticIds.has("carrier.hangar.walk_engine_door_leaf")).toBe(true);
    expect(staticIds.has("carrier.hangar.walk_crew_door_leaf")).toBe(true);
    expect(staticIds.has("carrier.hangar.ceiling_lamp_01_glow")).toBe(true);
  });
});

describe("福建舰 · 甲板净空 / 边缘 / 座舱体验", () => {
  const landing = LANDING_RUNWAY_POLYGON;
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const deckTop = CV.DECK_Y + CV.DECK_T;

  const segCross = (
    ax: number, az: number, bx: number, bz: number,
    cx: number, cz: number, dx: number, dz: number,
  ) => {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const boxHitsPlan = (b: THREE.Box3, poly: ReadonlyArray<readonly [number, number]>) => {
    const pts: Array<[number, number]> = [
      [b.min.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z], [b.max.x, b.min.z],
    ];
    if (pts.some(([x, z]) => pointInPlan(poly, x, z))) return true;
    if (poly.some(([x, z]) => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z)) return true;
    for (let i = 0; i < 4; i++) {
      const a = pts[i]!;
      const c = pts[(i + 1) % 4]!;
      for (let j = 0; j < poly.length; j++) {
        const p = poly[j]!;
        const q = poly[(j + 1) % poly.length]!;
        if (segCross(a[0], a[1], c[0], c[1], p[0], p[1], q[0], q[1])) return true;
      }
    }
    return false;
  };

  it("着舰跑道上没有抬高的甲板设备（拦阻索/应急拦阻网除外）", () => {
    const allowed = /carrier\.deck\.(wire_|arrestor_net|barrier_net|flight_deck|deck_underside|sponson_)/;
    const offenders: string[] = [];
    for (const handle of built.parts) {
      if (allowed.test(handle.partId)) continue;
      const total = built.partBounds(handle, new THREE.Box3());
      if (total.isEmpty() || total.max.y <= deckTop + 0.03) continue;
      let hit = false;
      if (handle.instanced) {
        for (const instance of handle.instances) {
          built.instanceMatrix(handle, instance.index, matrix);
          box.copy(handle.geometry.boundingBox ?? (handle.geometry.computeBoundingBox(), handle.geometry.boundingBox)!).applyMatrix4(matrix);
          if (boxHitsPlan(box, landing)) { hit = true; break; }
        }
      } else {
        hit = boxHitsPlan(total, landing);
      }
      if (hit) offenders.push(`${handle.partId} ${handle.def.name_cn}`);
    }
    expect(offenders).toEqual([]);
  });

  it("80 个甲板系留点和 30 个系留环全部避开两条跑道与升降机", () => {
    const tiedown = built.getPart("carrier.deck.tiedown")!;
    expect(tiedown.instances).toHaveLength(80);
    const positions: Array<[number, number]> = [];
    for (const instance of tiedown.instances) {
      built.instanceMatrix(tiedown, instance.index, matrix);
      const v = new THREE.Vector3().setFromMatrixPosition(matrix);
      positions.push([v.x, v.z]);
      expect(pointInPlan(deckPlan(), v.x, v.z), `tiedown ${instance.index} on deck`).toBe(true);
      expect(pointInPlan(LANDING_RUNWAY_POLYGON, v.x, v.z), `tiedown ${instance.index} landing`).toBe(false);
      expect(pointInPlan(TAKEOFF_RUNWAY_POLYGON, v.x, v.z), `tiedown ${instance.index} takeoff`).toBe(false);
    }
    expect(new Set(positions.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`)).size).toBe(80);
    for (let i = 1; i <= 30; i++) {
      const eye = built.getPart(`carrier.deck.detail_padeye_${String(i).padStart(2, "0")}`);
      expect(eye, `padeye ${i}`).toBeDefined();
      built.instanceMatrix(eye!, 0, matrix);
      const v = new THREE.Vector3().setFromMatrixPosition(matrix);
      expect(pointInPlan(LANDING_RUNWAY_POLYGON, v.x, v.z), `padeye ${i} landing`).toBe(false);
      expect(pointInPlan(TAKEOFF_RUNWAY_POLYGON, v.x, v.z), `padeye ${i} takeoff`).toBe(false);
    }
  });

  it("升降机围边整体收在右舷甲板外缘线以内", () => {
    for (let i = 0; i < 2; i++) {
      const z = CV.ELEVATOR_Z[i]!;
      const frame = built.getPart(`carrier.deck.elevator_${i + 1}_frame`)!;
      const b = built.partBounds(frame, new THREE.Box3());
      const edge = Math.min(
        deckEdgeAt(z - CV.ELEVATOR_L / 2, 1).x,
        deckEdgeAt(z + CV.ELEVATOR_L / 2, 1).x,
        deckEdgeAt(z, 1).x,
      );
      expect(b.max.x, `elevator ${i + 1} outboard edge`).toBeLessThanOrEqual(edge - 0.01);
    }
  });

  it("左舷外缘线红边外缘贴甲板折线，整圈留在甲板内且接头无缝", () => {
    const plan = deckPlan();
    const bands = built.parts.filter((handle) => handle.partId.startsWith("carrier.deck.deck_edge_"));
    expect(bands.length).toBeGreaterThan(20);
    for (const handle of bands) {
      const position = handle.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const inside = pointInPlan(plan, x, z);
        const gap = distanceToPlanEdge(plan, x, z);
        expect(inside || gap <= 0.002, `${handle.partId} vertex ${x},${z} outside deck`).toBe(true);
      }
    }
  });

  it("艉部装甲板按真实轮廓裁剪，没有任何顶点伸出甲板轮廓", () => {
    const plan = deckPlan();
    const plates = built.parts.filter((handle) => handle.partId.startsWith("carrier.deck.deck_armor_"));
    expect(plates.length).toBeGreaterThan(30);
    for (const handle of plates) {
      const position = handle.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const inside = pointInPlan(plan, x, z);
        const gap = distanceToPlanEdge(plan, x, z);
        expect(inside || gap <= 0.002, `${handle.partId} vertex ${x},${z} outside deck`).toBe(true);
      }
    }
  });

  it("艏部两舷舷墙同高，水密基层/外飘封边随甲板上翘", () => {
    for (let i = 1; i <= 5; i++) {
      const s = built.partBounds(built.getPart(`carrier.deck.bow_bulwark_s_${i}`)!, new THREE.Box3());
      const p = built.partBounds(built.getPart(`carrier.deck.bow_bulwark_p_${i}`)!, new THREE.Box3());
      expect(s.max.y - s.min.y, `S-${i}`).toBeCloseTo(p.max.y - p.min.y, 2);
    }
    const base = built.partBounds(built.getPart("carrier.deck.flight_deck")!, new THREE.Box3());
    expect(base.max.y).toBeGreaterThan(4.8);
    const skirt = built.parts.find((handle) => handle.partId.startsWith("carrier.deck.sponson_skirt_s_") && built.partBounds(handle, new THREE.Box3()).max.y > 4.65);
    expect(skirt, "bow skirt follows deck curve").toBeDefined();
  });

  it("座舱内装与弹射体验所需节点齐备", () => {
    const cockpitParts = registry.parts.filter((part) => part.id.startsWith("carrier.aircraft.cockpit_"));
    expect(cockpitParts.length).toBeGreaterThanOrEqual(30);
    for (const id of [
      "carrier.aircraft.cockpit_floor",
      "carrier.aircraft.cockpit_mfd_screen_2",
      "carrier.aircraft.cockpit_hud_glass",
      "carrier.aircraft.cockpit_stick_grip",
      "carrier.aircraft.cockpit_throttle_lever_l",
      "carrier.aircraft.cockpit_seat_harness_l",
      "carrier.aircraft.cockpit_ejection_handle",
    ]) {
      expect(staticIds.has(id), id).toBe(true);
    }
    expect(built.getNode(AIRCRAFT_NODE)).toBeDefined();
  });
});
