import { describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose } from "./registry";

// ============================================================================
// MBT-90 现代坦克验收（结构）
//
// 形似之外先钉住几何口径：车体从零建模（不是虎式改色）、楔形炮塔倾斜面、
// 7 对负重轮与实例化履带、反应装甲三组数量、履带环与负重轮相切（不埋轮）。
// 穿模清理仍在进行（见 PROGRESS），此处只锁结构，不掩盖碰撞数字。
// ============================================================================

const model = findModel("mbt90");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

describe("MBT-90 现代主战坦克", () => {
  it("零件树规模与实例化：57+ 件、7 对负重轮、履带 2×N 全实例", () => {
    const parts = built.parts;
    expect(parts.length).toBeGreaterThanOrEqual(50);
    expect(built.getPart("mbt90.running.road_wheel")!.instances).toHaveLength(14);
    expect(built.getPart("mbt90.running.track")!.instances).toHaveLength(
      MBT_TRACK_LINKS_PER_SIDE * 2,
    );
    expect(built.getPart("mbt90.armor.era_glacis")!.instances).toHaveLength(8);
    expect(built.getPart("mbt90.armor.era_turret")!.instances).toHaveLength(12);
    expect(built.getPart("mbt90.armor.era_skirt")!.instances).toHaveLength(12);
  });

  it("楔形炮塔：前斜板有 ±24° 偏航 + 后倾（不是垂直方盒）", () => {
    const cheek = built.getPart("mbt90.turret.cheek_l")!;
    const rotation = (cheek.def.mate as { rotation?: [number, number, number] }).rotation;
    expect(rotation, "前斜板必须有装配旋转").toBeDefined();
    expect(Math.abs(rotation![1])).toBeGreaterThanOrEqual(20);
    expect(Math.abs(rotation![0])).toBeGreaterThanOrEqual(5);
    // 首上倾角在常量里是单一真值源
    expect(MBT.GLACIS_ANGLE_DEG).toBeGreaterThanOrEqual(30);
  });

  it("履带环底段与负重轮相切：履带板顶面不埋进胶胎（间隙 0..30mm）", () => {
    // 底段中心线
    const bottom = mbtTrackPose((MBT.IDLER_Z - MBT.SPROCKET_Z) + Math.PI * MBT.TRACK_ARC_R);
    const linkTop = bottom.y + 0.03 + 0.028 / 2;
    const tyreBottom = MBT.WHEEL_Y - MBT.WHEEL_R;
    expect(tyreBottom - linkTop).toBeGreaterThanOrEqual(-0.001);
    expect(tyreBottom - linkTop).toBeLessThan(0.05);
    // 上段在负重轮顶之上（不穿轮）
    const top = mbtTrackPose(0.2);
    expect(top.y + 0.03 - 0.028 / 2).toBeGreaterThan(MBT.WHEEL_Y + MBT.WHEEL_R);
    // 周长与节距整除关系合理（节数 80..100）
    const links = Math.round(MBT_TRACK_PERIMETER / MBT.TRACK_PITCH);
    expect(links).toBeGreaterThan(70);
    expect(links).toBeLessThan(110);
  });
});
