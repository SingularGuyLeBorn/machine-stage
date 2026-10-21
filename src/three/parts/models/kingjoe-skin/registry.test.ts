import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildModel,
  detectStatic,
  detectUnsupportedParts,
  partitionExpectedContacts,
  validateRegistry,
} from "@/three/parts";
import { makeKingJoeSkinRegistry, kingjoeSkinBuilders } from "./registry";

const registry = makeKingJoeSkinRegistry();
const model = buildModel(registry, { builders: kingjoeSkinBuilders, warnMissingLayout: false });

const isAddedDetail = (id: string) => /grille_|visor|eye|mouth/.test(id);

describe("kingjoeskin real-mesh parts", () => {
  it("四段飞船注册表通过契约校验，分件数接近计划", () => {
    const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
    expect(errors).toEqual([]);
    expect(registry.assemblies.map((a) => a.id)).toEqual(["legs", "stomach", "chest", "ship"]);
    expect(registry.parts.length).toBe(599);
    expect(model.parts.length).toBe(615);
    expect(registry.parts.filter((p) => p.id.includes(".src_")).length).toBe(578);
  });

  it("部位件与手指逐件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    for (const id of [
      "kingjoeskin.legs.src_thigh_l",
      "kingjoeskin.legs.src_calf_l",
      "kingjoeskin.legs.src_foot_l",
      "kingjoeskin.legs.src_hip_pod_l",
      "kingjoeskin.stomach.src_pelvis",
      "kingjoeskin.stomach.src_abdomen_l",
      "kingjoeskin.chest.src_torso_l",
      "kingjoeskin.chest.src_shoulder_pod_l",
      "kingjoeskin.chest.src_clavicle_l",
      "kingjoeskin.chest.src_upperarm_l",
      "kingjoeskin.chest.src_forearm_l",
      "kingjoeskin.chest.src_hand_l",
      "kingjoeskin.chest.src_finger0_l",
      "kingjoeskin.chest.src_finger0_2_l",
      "kingjoeskin.ship.src_head",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("四段模块节点齐全，真实网格整体尺寸不变", () => {
    for (const name of ["KJModelRoot", "KJLegsModule", "KJStomachModule", "KJChestModule", "KJShipModule"]) {
      expect(model.nodes.has(name)).toBe(true);
    }
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.618, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
  });

  it("新增细节无穿模，且装配态零悬空", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const reports = detectStatic(model, { minDepthM: 0.0005 });
    const detailClips = reports.filter((r) => isAddedDetail(r.a) || isAddedDetail(r.b));
    expect(detailClips).toEqual([]);
    expect(detectUnsupportedParts(model)).toEqual([]);
  }, 180_000);

  it("真实网格源内互嵌只存在于 src_ 件之间（源资产已知限制）", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const reports = detectStatic(model, { minDepthM: 0.0005 });
    const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
    // 源网格是多片壳体互嵌的游戏低模：源内报告全部按白名单豁免（anyForm），
    // 未豁免报告必须为 0，新增彩虹胸/眼带也不得参与。
    expect(split.active).toEqual([]);
    // 构造性接触白名单不能退化成空表。
    expect(split.expected.length).toBeGreaterThan(300);
  }, 180_000);
});
