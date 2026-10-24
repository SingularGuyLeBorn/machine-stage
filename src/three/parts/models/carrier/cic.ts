import { CV } from "./constants";
import { A, B, C, M, type CarrierCtx } from "./common";

// ============================================================================
// 舰岛 1 层战斗情报中心（CIC）：战术显控墙 / 双排显控台 / 海图桌 / 通信机柜
// 显控墙上的雷达扫描线由 motion.ts 驱动；第一人称眼点从值更席靠背派生。
// ============================================================================

const ASSEMBLY = "island";
const P = "carrier.island.";
export const CIC_SWEEP_NODE = "CV_CicSweep";

export function addCicInterior(ctx: CarrierCtx): void {
  const fullId = (id: string) => (id.startsWith("cic_") ? `${P}${id}` : `${P}cic_${id}`);
  const add = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number],
    rotation?: [number, number, number],
  ) =>
    ctx.add({
      id: fullId(id),
      name_cn,
      name_en: id.split(".").pop()?.replace(/_/g, " ") ?? id,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry,
      material,
      mate: A(at, rotation),
    });

  const floorY = CV.DECK_Y + CV.DECK_T + 0.45;
  const floorTop = floorY + 0.03;
  const x = CV.ISLAND_X;
  const z = CV.ISLAND_Z;

  add("floor_carpet", "CIC 深色地毯", M(B(2.1, 0.006, 4.7, [0, 0, 0], 0.002)), "cv_055_carpet", [x, floorTop + 0.004, z]);

  // 战术显控墙：底座 → 机柜 → 屏框 → 三块主屏，屏框贴在机柜后侧。
  add("display_base", "CIC 显控墙底座", M(B(0.92, 0.04, 0.2, [0, 0, 0], 0.004)), "cv_055_console", [x, floorTop + 0.02, z + 2.65]);
  add("display_cabinet", "CIC 显控墙机柜", M(B(0.92, 0.52, 0.14, [0, 0, 0], 0.006)), "cv_055_console", [x, floorTop + 0.3, z + 2.66]);
  add("display_bezel", "CIC 主屏屏框", M(B(0.88, 0.42, 0.02, [0, 0, 0], 0.004)), "cv_gauge_face", [x, floorTop + 0.32, z + 2.58]);
  (["l", "c", "r"] as const).forEach((tag, index) => {
    add(`main_screen_${tag}`, `CIC 战术主屏 ${index + 1}`, M(B(0.26, 0.34, 0.008, [0, 0, 0], 0.002)), ["cv_scr_chart", "cv_scr_tactical", "cv_scr_radar"][index] ?? "cv_scr_tactical", [x + (index - 1) * 0.29, floorTop + 0.32, z + 2.564]);
  });
  ctx.node({ name: CIC_SWEEP_NODE, parent: "root", pivot: [x, floorTop + 0.32, z + 2.554], motion: "rotate", axis: "z", note: "CIC 主屏雷达扫描线" });
  ctx.add({
    id: `${P}cic_sweep`,
    name_cn: "CIC 雷达扫描线",
    name_en: "cic radar sweep",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.004, 0.16, 0.003, [0, 0.08, 0], 0.001)),
    material: "cv_gauge_mark",
    node: CIC_SWEEP_NODE,
    mate: A([0, 0, 0]),
  });

  // 通信/情报机柜，分列显控墙两侧。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "p" : "s";
    const rx = x + side * 0.6;
    add(`rack_${tag}`, `CIC 机柜 ${side === -1 ? "左" : "右"}`, M(B(0.24, 0.58, 0.34, [0, 0, 0], 0.006), B(0.26, 0.04, 0.36, [0, 0.29, 0], 0.004)), "cv_055_console", [rx, floorTop + 0.29, z + 2.55]);
    add(`rack_${tag}_screen`, `CIC 机柜显控 ${side === -1 ? "左" : "右"}`, M(B(0.008, 0.3, 0.26, [0, 0, 0], 0.002)), side === -1 ? "cv_scr_radar" : "cv_scr_comms", [rx - side * 0.124, floorTop + 0.36, z + 2.55]);
    for (let vent = 0; vent < 3; vent++) {
      add(`rack_${tag}_vent_${vent + 1}`, `CIC 机柜通风口 ${side === -1 ? "左" : "右"}-${vent + 1}`, M(B(0.006, 0.03, 0.2, [0, 0, 0], 0.001)), "cv_gauge_face", [rx - side * 0.123, floorTop + 0.12 + vent * 0.055, z + 2.55]);
    }
  }

  // 双排显控台：台体落在甲板上，屏架/键盘/显控屏逐层搭接。
  const rows = [
    { z: z + 1.45, prefix: "a" },
    { z: z + 0.25, prefix: "b" },
  ] as const;
  const cols = [-0.45, 0, 0.45] as const;
  for (const row of rows) {
    cols.forEach((col, index) => {
      const cx = x + col;
      add(`console_${row.prefix}_${index + 1}`, `CIC 显控台 ${row.prefix.toUpperCase()}-${index + 1}`, M(B(0.34, 0.16, 0.3, [0, 0, 0], 0.006)), "cv_055_console", [cx, floorTop + 0.08, row.z]);
      add(`console_${row.prefix}_${index + 1}_riser`, `CIC 显控台屏架 ${row.prefix.toUpperCase()}-${index + 1}`, M(B(0.34, 0.18, 0.04, [0, 0, 0], 0.004)), "cv_gauge_face", [cx, floorTop + 0.25, row.z - 0.12]);
      add(`console_${row.prefix}_${index + 1}_screen`, `CIC 显控屏 ${row.prefix.toUpperCase()}-${index + 1}`, M(B(0.28, 0.13, 0.006, [0, 0, 0], 0.002)), ["cv_scr_tactical", "cv_scr_sonar", "cv_scr_chart", "cv_scr_camera", "cv_scr_engine", "cv_scr_damage"][(row.prefix === "a" ? 0 : 3) + index] ?? "cv_scr_tactical", [cx, floorTop + 0.25, row.z - 0.143]);
      add(`console_${row.prefix}_${index + 1}_keyboard`, `CIC 键盘 ${row.prefix.toUpperCase()}-${index + 1}`, M(B(0.28, 0.02, 0.1, [0, 0, 0], 0.003)), "cv_gauge_face", [cx, floorTop + 0.17, row.z + 0.07]);
      addChair(ctx, add, `cic_seat_${row.prefix}_${index + 1}`, cx, floorTop, row.z - 0.42, 1);
    });
  }

  // 中央海图桌：柜体 → 桌面 → 海图 → 图钉，值更席在桌后。
  add("plot_base", "CIC 海图桌柜体", M(B(0.34, 0.16, 0.26, [0, 0, 0], 0.008)), "cv_055_console", [x, floorTop + 0.08, z - 1.35]);
  add("plot_top", "CIC 海图桌桌面", M(B(0.4, 0.05, 0.32, [0, 0, 0], 0.006)), "cv_055_console", [x, floorTop + 0.185, z - 1.35]);
  add("plot_chart", "CIC 海图", M(B(0.36, 0.006, 0.28, [0, 0, 0], 0.002)), "cv_chart", [x, floorTop + 0.213, z - 1.35]);
  for (let marker = 0; marker < 6; marker++) {
    add(`plot_marker_${marker + 1}`, `CIC 图钉 ${marker + 1}`, M(B(0.03, 0.006, 0.03, [0, 0, 0], 0.002)), "cv_deck_red", [x + ((marker % 3) - 1) * 0.1, floorTop + 0.219, z - 1.35 + (Math.floor(marker / 3) - 0.5) * 0.1]);
  }

  // 值更席（CIC 第一人称视点）。
  addChair(ctx, add, "cic_watch_seat", x, floorTop, z - 2.45, 1, `${P}cic_watch_seat_back`, true);

  // 两舷情报机柜：沿围壁布置，补足 CIC 侧区设备。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "p" : "s";
    for (const [index, zPos] of [-4.15, -6.15].entries()) {
      const rx = x + side * 0.69;
      add(`wall_rack_${tag}_${index + 1}`, `CIC 舷侧机柜 ${tag.toUpperCase()}-${index + 1}`, M(B(0.16, 0.55, 0.5, [0, 0, 0], 0.005), B(0.18, 0.035, 0.52, [0, 0.28, 0], 0.003)), "cv_055_console", [rx, floorTop + 0.275, zPos]);
      add(`wall_rack_${tag}_${index + 1}_screen`, `CIC 舷侧显控 ${tag.toUpperCase()}-${index + 1}`, M(B(0.008, 0.3, 0.34, [0, 0, 0], 0.002)), side === -1 ? "cv_scr_sonar" : "cv_scr_damage", [rx - side * 0.084, floorTop + 0.36, zPos]);
      for (let vent = 0; vent < 2; vent++) {
        add(`wall_rack_${tag}_${index + 1}_vent_${vent + 1}`, `CIC 舷侧机柜通风口 ${tag.toUpperCase()}-${index + 1}-${vent + 1}`, M(B(0.006, 0.028, 0.4, [0, 0, 0], 0.001)), "cv_gauge_face", [rx - side * 0.084, floorTop + 0.12 + vent * 0.05, zPos]);
      }
    }
  }

  // 舱顶灯带与后壁水密门。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "p" : "s";
    add(`ceiling_fixture_${tag}`, `CIC 顶灯灯槽 ${tag.toUpperCase()}`, M(B(0.14, 0.018, 3.7, [0, 0, 0], 0.003)), "cv_055_console", [x + side * 0.42, floorTop + 0.665, z]);
    add(`ceiling_light_${tag}`, `CIC 顶灯带 ${tag.toUpperCase()}`, M(B(0.05, 0.004, 3.6, [0, 0, 0], 0.001)), "cv_glow", [x + side * 0.42, floorTop + 0.653, z]);
  }
  add("door", "CIC 水密门", M(B(0.42, 0.55, 0.02, [0, 0, 0], 0.004)), "cv_055_console", [x, floorTop + 0.3, z - 2.908]);
  add("door_wheel", "CIC 门轮", M({ type: "torus", radius: 0.09, tube: 0.008, radialSegments: 8, tubularSegments: 20 }, B(0.006, 0.19, 0.006, [0, 0, 0], 0.001), B(0.19, 0.006, 0.006, [0, 0, 0], 0.001)), "cv_steel", [x, floorTop + 0.3, z - 2.896]);
}

type AddFn = (
  id: string,
  name_cn: string,
  geometry: Parameters<typeof M>[0],
  material: string,
  at: [number, number, number],
  rotation?: [number, number, number],
) => void;

function addChair(
  ctx: CarrierCtx,
  add: AddFn,
  prefix: string,
  sx: number,
  floorTop: number,
  sz: number,
  facing: 1 | -1,
  backId = `${prefix}_back`,
  armrests = false,
) {
  add(`${prefix}_pedestal`, "座椅立柱", M(C(0.026, 0.1, [0, 0, 0], 12)), "cv_steel", [sx, floorTop + 0.05, sz]);
  add(`${prefix}_cushion`, "座椅坐垫", M(B(0.15, 0.04, 0.14, [0, 0, 0], 0.006)), "cv_055_seat", [sx, floorTop + 0.12, sz]);
  ctx.add({
    id: backId.startsWith("carrier.") ? backId : backId.startsWith("cic_") ? `carrier.island.${backId}` : `carrier.island.cic_${backId}`,
    name_cn: "座椅靠背",
    name_en: "seat back",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.15, 0.14, 0.03, [0, 0, 0], 0.006)),
    material: "cv_055_seat",
    mate: A([sx, floorTop + 0.21, sz - facing * 0.07]),
  });
  add(`${prefix}_head`, "座椅头枕", M(B(0.08, 0.05, 0.03, [0, 0, 0], 0.005)), "cv_055_seat", [sx, floorTop + 0.305, sz - facing * 0.07]);
  if (armrests) {
    for (const ax of [-1, 1] as const) {
      add(`${prefix}_arm_${ax < 0 ? "p" : "s"}`, "座椅扶手", M(B(0.03, 0.02, 0.12, [0, 0, 0], 0.004)), "cv_055_console", [sx + ax * 0.09, floorTop + 0.2, sz - facing * 0.02]);
    }
  }
}
