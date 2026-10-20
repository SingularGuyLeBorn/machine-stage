import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel, detectStatic, validateRegistry } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { animateTigerFiring } from "../motion";

// ============================================================================
// 主炮闩 / 炮架验收（P0 + P3 引信）
//
// 1. 注册表契约：新增 8 件炮闩机构 + 3 件车长塔枪座无校验错误。
// 2. 炮管是通的：整个回转体没有落在轴线上的顶点（旧版两端有 r≈0 的中心点 = 实心）。
// 3. 后坐 + 开闩是「可动画的」：把 GunRecoil 推 450mm、闩体下落 160mm、击针前冲 8mm，
//    炮塔 + 内饰子集静态检测必须 0 报告（座席/吊篮/摇架/复进机都让开了）。
// 4. 主炮击发全循环的 15 个时间点同样零干涉（含阻尼复进的前向过冲与闩体下落重叠段）。
// 5. 人机工程：对空 MG34 枪尾落在车长塔口范围内（枪座到塔心 < 0.5m），防盾在枪前方。
// ============================================================================

const model = findModel("tiger");

const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

describe("tiger/turret 主炮闩验收", () => {
  it("注册表契约：新增炮闩/枪座零件通过校验", () => {
    const issues = validateRegistry(model.registry!);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    const ids = new Set(model.registry!.parts.map((part) => part.id));
    for (const id of [
      "tiger.turret.gun_cradle",
      "tiger.turret.recoil_brake",
      "tiger.turret.recuperator",
      "tiger.turret.breech_ring",
      "tiger.turret.breech_block",
      "tiger.turret.firing_pin",
      "tiger.turret.breech_extractor",
      "tiger.turret.breech_safety",
      "tiger.turret.aa_ring_mount",
      "tiger.turret.aa_mg",
      "tiger.turret.aa_shield",
    ]) {
      expect(ids.has(id), `缺少零件 ${id}`).toBe(true);
    }
  });

  it("炮管中空：炮膛从炮口通到尾端，回转体没有贴轴心的实心顶点", () => {
    const built = build();
    const barrel = built.getPart("tiger.turret.gun_barrel");
    expect(barrel).toBeDefined();
    const position = barrel!.geometry.getAttribute("position");
    let minRadius = Infinity;
    let muzzleMinRadius = Infinity;
    const length = built.constants.TR_BARREL_L ?? 3.34;
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const radius = Math.hypot(point.y, point.z);
      minRadius = Math.min(minRadius, radius);
      if (Math.abs(point.x + length) < 0.003) muzzleMinRadius = Math.min(muzzleMinRadius, radius);
    }
    // 炮口环：最内圈就是膛线直径 ⌀88（旧版此处有 r≈0.0005 的封口顶点）
    expect(muzzleMinRadius).toBeGreaterThan(0.04);
    expect(muzzleMinRadius).toBeLessThan(0.05);
    // 整根炮管没有任何实心轴心顶点（含尾段）
    expect(minRadius).toBeGreaterThan(0.04);
    const worldBox = built.partBounds(barrel!, new THREE.Box3());
    expect(worldBox.min.x).toBeLessThan(-6.4);
    expect(worldBox.max.x).toBeGreaterThan(-2.8);
    built.dispose();
  });

  it("后坐 450mm + 开闩落体 + 击针前冲：炮塔/内饰子集零干涉", () => {
    const built = build();
    const recoil = built.getNode("GunRecoil");
    const block = built.getNode("BreechBlock");
    const pin = built.getNode("FiringPin");
    expect(recoil).toBeDefined();
    expect(block).toBeDefined();
    expect(pin).toBeDefined();

    // 击发循环末段：炮身后坐到底、闩体全开、击针复位前冲
    recoil!.position.x = 0.45;
    block!.position.y = -(built.constants.TR_BLOCK_DROP ?? 0.16);
    pin!.position.x = -0.008;
    built.root.updateMatrixWorld(true);
    built.syncInstances();

    const reports = detectStatic(built, {
      filter: (handle) => handle.assembly === "turret" || handle.assembly === "interior",
    });
    expect(
      reports.map((report) => `${report.a} ↔ ${report.b} @${report.depth_mm}mm [${report.form}]`),
    ).toEqual([]);
    built.dispose();
  }, 120_000);

  it("主炮击发全循环：15 个时间点炮塔/内饰零干涉", () => {
    const built = build();
    const samples = [0, 0.45, 0.7, 0.95, 1.1, 1.2, 1.25, 1.3, 1.45, 1.7, 2.1, 2.4, 3.0, 4.0, 5.5];
    const failures: string[] = [];
    for (const t of samples) {
      built.resetNodes();
      animateTigerFiring(built, t);
      built.root.updateMatrixWorld(true);
      built.syncInstances();
      const reports = detectStatic(built, {
        filter: (handle) => handle.assembly === "turret" || handle.assembly === "interior",
      });
      for (const report of reports) {
        failures.push(`t=${t}s ${report.a} ↔ ${report.b} @${report.depth_mm}mm [${report.form}]`);
      }
    }
    expect(failures).toEqual([]);
    built.dispose();
  }, 180_000);

  it("人机工程：MG34 枪尾落在车长塔口上方，防盾在枪前方且高于顶盖", () => {
    const built = build();
    const gun = built.getPart("tiger.turret.aa_mg")!;
    const shield = built.getPart("tiger.turret.aa_shield")!;
    const gunBox = built.partBounds(gun, new THREE.Box3());
    const shieldBox = built.partBounds(shield, new THREE.Box3());
    const cupolaX = built.constants.TR_CUPOLA_X!;
    const cupolaZ = built.constants.TR_CUPOLA_Z!;
    const roofTop =
      built.constants.TR_RING_TOP! +
      built.constants.TR_JOINT! +
      built.constants.TR_WALL_H! +
      built.constants.TR_ROOF_T!;

    // 枪尾（+X 端）不早于塔心，横向偏距 ≤ 0.2m——车长探身可及
    expect(gunBox.max.x).toBeGreaterThan(cupolaX - 0.1);
    expect(Math.abs((gunBox.min.z + gunBox.max.z) / 2 - cupolaZ)).toBeLessThan(0.2);
    const nearest = new THREE.Vector3(
      THREE.MathUtils.clamp(cupolaX, gunBox.min.x, gunBox.max.x),
      0,
      THREE.MathUtils.clamp(cupolaZ, gunBox.min.z, gunBox.max.z),
    );
    expect(Math.hypot(nearest.x - cupolaX, nearest.z - cupolaZ)).toBeLessThan(0.5);

    // 防盾位于枪座耳轴前、高于顶盖（探出的上半身有遮挡）
    expect(shieldBox.max.x).toBeLessThan(-1.76);
    expect(shieldBox.min.y).toBeGreaterThan(roofTop);
    built.dispose();
  });
});
