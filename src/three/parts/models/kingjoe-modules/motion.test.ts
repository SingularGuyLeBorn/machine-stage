import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { MeshBVH } from "three-mesh-bvh";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import {
  animateKingJoeModules,
  combineOpenness,
  separationOpenness,
  moduleMotionBounds,
  modulePose,
  MODULE_KEYS,
  DOCK_DELAYS,
} from "./motion";
import { CONTACT_PAIRS, contactTriangles, randomSurfacePoint, getModuleEffects } from "./effects";
import skin from "../kingjoe-skin/segments.generated.json";
import { exteriorGeometry } from "./test-geometry";

const create = () => buildModel(makeKingJoeModuleRegistry(), { builders: kingjoeModuleBuilders });
describe("分体、吸合和接触面电弧", () => {
  it("头肩近场开始小幅抬臂，合体后连续抬到肩高且肘部在手掌下方", () => {
    const model = create();
    animateKingJoeModules(model, 0, "idle");
    animateKingJoeModules(model, 0, "combining");
    const fore = model.getNode("Joint_fore_l")!;
    animateKingJoeModules(model, 18, "combining");
    expect(fore.rotation.x).toBeLessThan(-0.05);
    expect(fore.rotation.x).toBeGreaterThan(-0.4);
    let previous = fore.rotation.x;
    for (let t = 18.01; t <= 24; t += 0.01) {
      animateKingJoeModules(model, t, "combining");
      expect(Math.abs(fore.rotation.x - previous)).toBeLessThan(0.025);
      previous = fore.rotation.x;
    }
    model.syncInstances();
    const elbow = fore.getWorldPosition(new THREE.Vector3());
    const hand = new THREE.Vector3(-1.3, 2.8, 0.12).applyMatrix4(
      model.instanceMatrix(model.getPart("kingjoemodules.head_arms.fore_l")!, 0, new THREE.Matrix4()),
    );
    expect(hand.y).toBeGreaterThan(elbow.y + 0.3);
    expect(hand.y).toBeGreaterThan(4.6);
    expect(hand.y).toBeLessThan(5.3);
    model.dispose();
  }, 20000);
  it("四个分体都从双天线同时发射红色折线束，整机先抬手后前送发射黄色束", () => {
    const model = create();
    for (const [i, key] of MODULE_KEYS.entries()) {
      const start = i * 5;
      animateKingJoeModules(model, start, `ray_${key}`);
      animateKingJoeModules(model, start + 2.9, `ray_${key}`);
      expect(model.root.getObjectByName("kingjoe-pedan-z-rays")!.visible).toBe(false);
      animateKingJoeModules(model, start + 3.5, `ray_${key}`);
      const rays = model.root.getObjectByName("kingjoe-pedan-z-rays")!;
      expect(rays.visible).toBe(true);
      expect(rays.children).toHaveLength(24);
      const origins = rays.children.map((child) => {
        const p = (child as THREE.Mesh).geometry.getAttribute("position");
        return new THREE.Vector3(
          (p.getX(0) + p.getX(1)) / 2,
          (p.getY(0) + p.getY(1)) / 2,
          (p.getZ(0) + p.getZ(1)) / 2,
        );
      });
      expect(origins[0].distanceTo(origins[1])).toBeGreaterThan(0.1);
      origins.forEach((point, i) => expect(point.distanceTo(origins[i % 2])).toBeLessThan(1e-5));
      const p = (rays.children[0] as THREE.Mesh).geometry.getAttribute("position");
      const bends = Array.from({ length: 10 }, (_, j) => p.getX((j + 5) * 2) - p.getX((j + 4) * 2));
      expect(bends.filter((n) => n > 0).length).toBeGreaterThan(2);
      expect(bends.filter((n) => n < 0).length).toBeGreaterThan(2);
    }
    animateKingJoeModules(model, 30, "closed");
    animateKingJoeModules(model, 32, "closed");
    animateKingJoeModules(model, 32, "beam");
    animateKingJoeModules(model, 33, "beam");
    const rays = model.root.getObjectByName("kingjoe-pedan-z-rays")!;
    expect(rays.visible).toBe(false);
    const bent = model.getNode("Joint_fore_l")!.rotation.x;
    animateKingJoeModules(model, 34.1, "beam");
    expect(rays.visible).toBe(true);
    expect(model.getNode("Joint_fore_l")!.rotation.x).toBeGreaterThan(bent);
    animateKingJoeModules(model, 38, "beam");
    expect(rays.visible).toBe(false);
    model.dispose();
  }, 20000);
  it("待对接模块持续悬浮、预靠近且带倾角，近场恢复直立", () => {
    const model = create();
    animateKingJoeModules(model, 0, "idle");
    animateKingJoeModules(model, 0, "combining");
    const start = model.getNode("Module_head_arms")!.position.clone();
    animateKingJoeModules(model, 3, "combining");
    const first = model.getNode("Module_head_arms")!.position.clone();
    const rotation = model.getNode("Module_head_arms")!.quaternion.clone();
    animateKingJoeModules(model, 4, "combining");
    const node = model.getNode("Module_head_arms")!;
    expect(node.position.distanceTo(first)).toBeGreaterThan(0.02);
    const heights = [4, 4.3, 4.6, 4.9].map((time) => {
      animateKingJoeModules(model, time, "combining");
      return node.position.y;
    });
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.015);
    expect(rotation.angleTo(node.quaternion)).toBeGreaterThan(0.01);
    expect(node.position.distanceTo(start)).toBeGreaterThan(0.04);
    animateKingJoeModules(model, 17.8, "combining");
    expect(node.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-8);
    const fx = getModuleEffects(model);
    expect(fx.rigs[2]!.rings.every((ring) => ring.visible)).toBe(true);
    expect(fx.rigs[2]!.rings[0]!.position.y).not.toBe(fx.rigs[2]!.center.y);
    animateKingJoeModules(model, 22, "combining");
    expect(node.position.length()).toBe(0);
    expect(fx.group.visible).toBe(false);
    model.dispose();
  }, 20000);
  it("近距速度近似匀减速，末段加速吸合，回弹不侵入另一实体", () => {
    const speed = (t: number) => (combineOpenness(t - 0.001) - combineOpenness(t + 0.001)) / 0.002;
    const speeds = [2.6, 3.2, 3.8, 4.4, 5].map(speed);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]!);
    const changes = speeds.slice(1).map((s, i) => s - speeds[i]!);
    changes.forEach((d) => expect(d).toBeCloseTo(changes[0]!, 5));
    expect(speed(5.85)).toBeGreaterThan(speed(5.5) * 2);
    expect(combineOpenness(5.9)).toBeCloseTo(0, 8);
    expect(combineOpenness(6.04)).toBeGreaterThan(0.002);
    for (let t = 0; t <= 8; t += 0.01) expect(combineOpenness(t)).toBeGreaterThanOrEqual(-1e-10);
    expect(combineOpenness(8)).toBe(0);
    expect(separationOpenness(5)).toBe(1);
  }, 20000);
  it("中途反向连续，分体伸出天线，合体收回且停稳", () => {
    const model = create();
    animateKingJoeModules(model, 0, "idle");
    expect(model.getNode("Antenna_chest_l")!.scale.y).toBe(1);
    animateKingJoeModules(model, 1, "combining");
    animateKingJoeModules(model, 4, "combining");
    expect(model.getNode("Antenna_legs_l")!.visible).toBe(false);
    expect(model.getNode("Antenna_head_arms_l")!.visible).toBe(true);
    const positions = MODULE_KEYS.map((k) => model.getNode(`Module_${k}`)!.position.clone());
    animateKingJoeModules(model, 4, "separation");
    MODULE_KEYS.forEach((k, i) =>
      expect(model.getNode(`Module_${k}`)!.position.distanceTo(positions[i]!)).toBeLessThan(1e-5),
    );
    animateKingJoeModules(model, 10, "separation");
    expect(model.getNode("Antenna_legs_l")!.visible).toBe(true);
    expect(Math.abs(model.getNode("LegVane_l")!.rotation.z)).toBeGreaterThan(0.4);
    animateKingJoeModules(model, 10, "combining");
    animateKingJoeModules(model, 32, "combining");
    MODULE_KEYS.forEach((k) => expect(model.getNode(`Module_${k}`)!.position.length()).toBe(0));
    expect(model.getNode("Antenna_chest_l")!.visible).toBe(false);
    model.dispose();
  }, 20000);
  it("随机电弧落点来自实际配对接触面，前后两侧都有分布", () => {
    const model = create();
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (const [lower, upper] of CONTACT_PAIRS) {
      const a = model.getPart(`kingjoemodules.${lower}.body`)!.geometry;
      const b = model.getPart(`kingjoemodules.${upper}.body`)!.geometry.clone();
      const tree = new MeshBVH(b),
        faces = contactTriangles(a, b);
      expect(faces.length).toBeGreaterThan(10);
      const points = Array.from({ length: 160 }, () => randomSurfacePoint(faces, random));
      for (const point of points) expect(tree.closestPointToPoint(point)!.distance).toBeLessThan(2e-5);
      expect(Math.min(...points.map((p) => p.z))).toBeLessThan(-0.1);
      expect(Math.max(...points.map((p) => p.z))).toBeGreaterThan(0.1);
      b.dispose();
    }
    animateKingJoeModules(model, 0, "idle");
    animateKingJoeModules(model, 0, "combining");
    const fx = getModuleEffects(model);
    for (const [i, [, upper]] of CONTACT_PAIRS.entries()) {
      animateKingJoeModules(model, DOCK_DELAYS[upper] + 3.8, "combining");
      expect(fx.group.visible).toBe(true);
      expect(
        fx.rigs[i]!.chains.some((c) => c.core.visible),
        upper,
      ).toBe(true);
      expect(fx.rigs.filter((r) => r.chains.some((c) => c.core.visible))).toHaveLength(1);
    }
    animateKingJoeModules(model, DOCK_DELAYS.pelvis + 3.8, "combining");
    const before = fx.rigs[0]!.chains.map((c) => Array.from(c.core.geometry.getAttribute("position").array));
    animateKingJoeModules(model, DOCK_DELAYS.pelvis + 3.9, "combining");
    expect(
      fx.rigs[0]!.chains.some(
        (c, i) =>
          JSON.stringify(before[i]) !==
          JSON.stringify(Array.from(c.core.geometry.getAttribute("position").array)),
      ),
    ).toBe(true);
    const dispose = vi.spyOn(fx.rigs[0]!.chains[0]!.core.geometry, "dispose");
    animateKingJoeModules(model, 22, "combining");
    expect(fx.group.visible).toBe(false);
    model.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  }, 20000);
  it("取景范围覆盖脱榫行程，原髋鼓上沿完整留在腿部", () => {
    const model = create(),
      bounds = moduleMotionBounds(model);
    for (let u = 0; u <= 1; u += 0.025) {
      const pose = modulePose(u);
      for (const key of MODULE_KEYS) {
        const g = model.getPart(`kingjoemodules.${key}.body`)!.geometry;
        g.computeBoundingBox();
        expect(bounds.containsBox(g.boundingBox!.clone().translate(new THREE.Vector3(...pose[key])))).toBe(
          true,
        );
      }
    }
    const geometry = exteriorGeometry(model.getPart("kingjoemodules.legs.body")!.geometry),
      tree = new MeshBVH(geometry);
    for (const part of skin.parts.filter((p) => p.semantic.startsWith("hip_pod"))) {
      const bytes = Buffer.from(part.position, "base64"),
        pos = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      for (let i = 0; i < pos.length; i += 3) {
        const point = new THREE.Vector3(-pos[i]!, pos[i + 1]!, -pos[i + 2]!);
        if (point.y < 3.5) continue;
        const nearest = tree.closestPointToPoint(point)!;
        const hits = tree.raycast(
          new THREE.Ray(point, new THREE.Vector3(0.829, 0.337, 0.447).normalize()),
          THREE.DoubleSide,
        );
        expect(
          nearest.distance < 1e-4 || new Set(hits.map((h) => Math.round(h.distance * 1e6))).size % 2 === 1,
        ).toBe(true);
      }
    }
    geometry.dispose();
    model.dispose();
  }, 20000);
  it("八根天线根部埋入所属本体，腿部沿原圆盖中心轴伸出", () => {
    const model = create();
    for (const key of MODULE_KEYS) {
      const geometry = exteriorGeometry(model.getPart(`kingjoemodules.${key}.body`)!.geometry),
        tree = new MeshBVH(geometry);
      for (const side of [-1, 1]) {
        const suffix = side < 0 ? "l" : "r",
          mount = model.getNode(`Mount_${key}_${suffix}`)!;
        expect(tree.closestPointToPoint(mount.position)!.distance).toBeLessThan(2e-5);
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(mount.quaternion);
        const root = mount.position.clone().addScaledVector(axis, -0.035);
        const hits = tree.raycast(
          new THREE.Ray(root, new THREE.Vector3(0.829, 0.337, 0.447).normalize()),
          THREE.DoubleSide,
        );
        expect(new Set(hits.map((h) => Math.round(h.distance * 1e6))).size % 2).toBe(1);
        if (key === "legs") {
          expect(axis.dot(new THREE.Vector3(side * 0.718, -0.048, 0.694).normalize())).toBeGreaterThan(
            0.9999,
          );
          expect(mount.position.distanceTo(new THREE.Vector3(side * 0.9043, 3.2765, 0.8636))).toBeLessThan(
            0.005,
          );
        }
      }
      geometry.dispose();
    }
    model.dispose();
  }, 20000);
  it("先收臂并腿再沿空间曲线分离，合体按模块依次落位", () => {
    const model = create();
    animateKingJoeModules(model, 0, "closed");
    animateKingJoeModules(model, 0, "separation");
    animateKingJoeModules(model, 0.15, "separation");
    for (const key of MODULE_KEYS) expect(model.getNode(`Module_${key}`)!.position.length()).toBe(0);
    animateKingJoeModules(model, 1.35, "separation");
    for (const key of MODULE_KEYS) {
      const p = model.getNode(`Module_${key}`)!.position;
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0.001);
      expect(p.length()).toBeGreaterThan(0.001);
    }
    animateKingJoeModules(model, 0, "idle");
    animateKingJoeModules(model, 0, "combining");
    for (const [t, closed, next] of [
      [1.2, "legs", "pelvis"],
      [8, "pelvis", "chest"],
      [14.4, "chest", "head_arms"],
    ] as const) {
      animateKingJoeModules(model, t, "combining");
      expect(model.getNode(`Module_${closed}`)!.position.length()).toBeLessThan(0.001);
      expect(model.getNode(`Module_${next}`)!.position.length()).toBeGreaterThan(1);
    }
    model.dispose();
  }, 20000);
});
