import { A, B, C, M, type CarrierCtx } from "./common";

// ============================================================================
// 福建舰船员生活区（编辑尺度 1:8）
//
// 公开资料：福建舰满编约 2600–3300 人（舰员 + 航空人员），生活区约 1.5 万㎡；
// 住舱为可调三层铺/上下铺，每人有衣柜，舱内中央空调；全电厨房、6 个供餐时段、
// 分类冷库；医务中心有住院部、手术室（无影灯/手术床/麻醉机/远程会诊）；
// 还有餐厅、阅览/健身/洗衣等。这里建一条生活甲板走廊 + 两舷 9 个不同功能的
// 舱室，铺位数量/朝向/被褥颜色/家具均不同，不再是一个大通舱排排坐。
// ============================================================================

const P = "carrier.crew.";
const FLOOR = 1.34;
const CEIL = 1.66;
const H = CEIL - FLOOR;
const X0 = -0.9;
const X1 = 0.9;
const XC = 0.09;
const WT = 0.012;
const Z0 = 4.2;
const Z1 = 11.8;

export function addCarrierCrew(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const part = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ) =>
    add({
      id: `${P}${id}`,
      name_cn,
      name_en: id.replace(/_/g, " "),
      assembly: "crew",
      build_layer: 4,
      geometry,
      material,
      mate: A(at, rotation),
    });

  // ---- 外壳：地板/天花/四壁 ----
  part("shell", "生活甲板围壁/地板/天花", M(
    B(X1 - X0, 0.03, Z1 - Z0, [0, FLOOR, 8.0], 0.004),
    B(X1 - X0, 0.025, Z1 - Z0, [0, CEIL, 8.0], 0.004),
    B(0.025, H, Z1 - Z0, [X0, FLOOR + H / 2, 8.0], 0.004),
    B(0.025, H, Z1 - Z0, [X1, FLOOR + H / 2, 8.0], 0.004),
    // 后壁给维修车间留一道 0.3m 宽的门洞
    B(0.72, H, 0.025, [-0.51, FLOOR + H / 2, Z0], 0.004),
    B(0.72, H, 0.025, [0.51, FLOOR + H / 2, Z0], 0.004),
    B(0.3, H - 0.3, 0.025, [0, FLOOR + 0.3 + (H - 0.3) / 2, Z0], 0.004),
    B(X1 - X0, H, 0.025, [0, FLOOR + H / 2, Z1], 0.004),
  ), "cv_055_bulkhead");

  // ---- 舱壁 + 门洞 + 门扇 ----
  const doorSpecs = {
    port: [
      { z: 5.05, w: 0.13, tag: "berth_a" },
      { z: 6.17, w: 0.1, tag: "head_1" },
      { z: 7.3, w: 0.13, tag: "berth_b" },
      { z: 8.95, w: 0.13, tag: "nco" },
      { z: 10.55, w: 0.11, tag: "officer_1" },
      { z: 11.4, w: 0.11, tag: "officer_2" },
    ],
    star: [
      { z: 5.0, w: 0.13, tag: "mess" },
      { z: 6.95, w: 0.13, tag: "galley" },
      { z: 8.05, w: 0.1, tag: "head_2" },
      { z: 9.0, w: 0.13, tag: "medical" },
      { z: 10.75, w: 0.13, tag: "rec" },
    ],
  } as const;
  const wallGeos: Array<ReturnType<typeof B>> = [];
  const frameGeos: Array<ReturnType<typeof B>> = [];
  const leafGeos: Array<ReturnType<typeof B>> = [];
  const glassGeos: Array<ReturnType<typeof B>> = [];
  for (const [side, doors] of [[-1, doorSpecs.port], [1, doorSpecs.star]] as const) {
    const x = side * XC;
    const edges = [Z0, ...doors.flatMap((d) => [d.z - d.w / 2, d.z + d.w / 2]), Z1];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i]!;
      const b = edges[i + 1]!;
      if (b - a > 0.005) wallGeos.push(B(WT, H, b - a, [x, FLOOR + H / 2, (a + b) / 2], 0.002));
    }
    for (const d of doors) {
      // 门楣
      wallGeos.push(B(WT, H - 0.3, d.w + 0.03, [x, FLOOR + 0.3 + (H - 0.3) / 2, d.z], 0.002));
      frameGeos.push(B(0.022, 0.3, 0.018, [x, FLOOR + 0.15, d.z - d.w / 2 - 0.01], 0.002));
      frameGeos.push(B(0.022, 0.3, 0.018, [x, FLOOR + 0.15, d.z + d.w / 2 + 0.01], 0.002));
      frameGeos.push(B(0.022, 0.015, d.w + 0.04, [x, FLOOR + 0.3, d.z], 0.002));
      const leafX = side * (XC + 0.006);
      const leafZ = d.z - d.w - 0.002;
      leafGeos.push(B(0.004, 0.28, d.w - 0.01, [leafX, FLOOR + 0.145, leafZ], 0.0015));
      glassGeos.push(B(0.0015, 0.045, 0.04, [leafX + side * 0.003, FLOOR + 0.21, leafZ], 0.0008));
      frameGeos.push(C(0.003, 0.012, [leafX + side * 0.004, FLOOR + 0.14, leafZ + d.w / 2 - 0.012], 6));
    }
  }
  // 横向舱壁
  for (const [side, zs] of [
    [-1, [6.0, 6.35, 8.15, 9.9, 10.15, 11.0]],
    [1, [6.0, 7.8, 8.15, 9.9]],
  ] as const) {
    for (const z of zs) {
      wallGeos.push(B(Math.abs(side * XC - side * 0.9), H, WT, [side * 0.495, FLOOR + H / 2, z], 0.002));
    }
  }
  part("partition", "生活区舱壁/门洞", M(...wallGeos), "cv_055_bulkhead");
  part("door_frames", "生活区门框/把手", M(...frameGeos), "cv_steel");
  part("door_leaves", "生活区舱门（开启）", M(...leafGeos), "cv_055_ceiling");
  part("door_glass", "舱门观察窗", M(...glassGeos), "cv_clear_glass");

  // 门楣标识
  const signMats = ["cv_deck_red", "cv_deck_yellow", "cv_deck_line", "cv_055_seat", "cv_berth_olive"];
  [...doorSpecs.port, ...doorSpecs.star].forEach((d, i) => {
    part(
      `door_sign_${i + 1}`,
      `生活区舱室标识 ${d.tag}`,
      M(B(0.004, 0.025, 0.055, [0, 0, 0], 0.001)),
      signMats[i % signMats.length]!,
      [i < doorSpecs.port.length ? -(XC - 0.008) : XC - 0.008, FLOOR + 0.315, d.z],
    );
  });

  // 地板/天花/灯带
  part("corridor_floor", "生活区走廊地板", M(B(0.17, 0.006, 7.5, [0, FLOOR + 0.006, 8.0], 0.0015)), "cv_055_carpet");
  part("cabin_floors", "住舱/餐厅/医务室地板", M(
    B(0.8, 0.006, 1.75, [-0.495, FLOOR + 0.006, 5.1], 0.0015),
    B(0.8, 0.006, 1.75, [-0.495, FLOOR + 0.006, 7.25], 0.0015),
    B(0.8, 0.006, 1.7, [-0.495, FLOOR + 0.006, 9.0], 0.0015),
    B(0.8, 0.006, 1.75, [0.495, FLOOR + 0.006, 5.1], 0.0015),
    B(0.8, 0.006, 1.5, [0.495, FLOOR + 0.006, 6.9], 0.0015),
    B(0.8, 0.006, 1.55, [0.495, FLOOR + 0.006, 9.0], 0.0015),
    B(0.8, 0.006, 1.7, [0.495, FLOOR + 0.006, 10.85], 0.0015),
  ), "cv_deck_tile");
  part("wet_floors", "厨房/厕所/淋浴地砖", M(
    B(0.8, 0.006, 0.33, [-0.495, FLOOR + 0.006, 6.17], 0.0015),
    B(0.8, 0.006, 0.33, [0.495, FLOOR + 0.006, 8.0], 0.0015),
  ), "cv_deck_tile");
  part("ceiling_panels", "生活区白色吸音顶板", M(
    B(0.17, 0.006, 7.5, [0, CEIL - 0.004, 8.0], 0.001),
    B(0.8, 0.006, 7.5, [-0.495, CEIL - 0.004, 8.0], 0.001),
    B(0.8, 0.006, 7.5, [0.495, CEIL - 0.004, 8.0], 0.001),
  ), "cv_055_ceiling");
  const lightGeos: Array<ReturnType<typeof B>> = [];
  for (const z of [4.6, 5.6, 6.6, 7.6, 8.6, 9.6, 10.6, 11.4]) {
    lightGeos.push(B(0.025, 0.005, 0.12, [-0.3, CEIL - 0.014, z], 0.001));
    lightGeos.push(B(0.025, 0.005, 0.12, [0.3, CEIL - 0.014, z], 0.001));
    lightGeos.push(B(0.06, 0.005, 0.02, [0, CEIL - 0.014, z], 0.001));
  }
  part("lights", "生活区顶灯 ×24", M(...lightGeos), "cv_055_lamp");

  // ---- 铺位 ----
  const frame: Array<ReturnType<typeof B>> = [];
  const mattress: Array<ReturnType<typeof B>> = [];
  const curtains: Array<ReturnType<typeof B>> = [];
  const sheets: Array<ReturnType<typeof B>> = [];
  const personalPaper: Array<ReturnType<typeof B>> = [];
  const personalDark: Array<ReturnType<typeof B>> = [];
  const personalColor: Array<ReturnType<typeof B>> = [];
  const personalRed: Array<ReturnType<typeof B>> = [];
  const food: Array<ReturnType<typeof B>> = [];
  const foodGreen: Array<ReturnType<typeof B>> = [];
  const bedding: Record<"navy" | "grey" | "olive" | "tan", Array<ReturnType<typeof B>>> = {
    navy: [], grey: [], olive: [], tan: [],
  };
  const beddingMat = { navy: "cv_berth_navy", grey: "cv_berth_grey", olive: "cv_berth_olive", tan: "cv_berth_tan" } as const;
  const rack = (
    cx: number,
    cz: number,
    tiers: number,
    color: keyof typeof bedding,
    curtainSide: 1 | -1,
    len = 0.21,
    wid = 0.08,
  ) => {
    const tierY = tiers === 3 ? [0.07, 0.155, 0.24] : [0.08, 0.19];
    for (const y of tierY) {
      frame.push(B(wid, 0.008, len, [cx, FLOOR + y, cz], 0.0015));
      frame.push(B(0.004, 0.26, 0.004, [cx - wid / 2, FLOOR + 0.13, cz - len / 2], 0.001));
      frame.push(B(0.004, 0.26, 0.004, [cx - wid / 2, FLOOR + 0.13, cz + len / 2], 0.001));
      frame.push(B(0.004, 0.26, 0.004, [cx + wid / 2, FLOOR + 0.13, cz - len / 2], 0.001));
      frame.push(B(0.004, 0.26, 0.004, [cx + wid / 2, FLOOR + 0.13, cz + len / 2], 0.001));
      mattress.push(B(wid - 0.008, 0.014, len - 0.012, [cx, FLOOR + y + 0.012, cz], 0.004));
      // 铺好的床：白色床单包角 + 被子铺平 + 被子折边 + 枕头
      sheets.push(B(wid - 0.014, 0.0025, len - 0.016, [cx, FLOOR + y + 0.0215, cz], 0.001));
      bedding[color].push(B(0.045, 0.014, 0.032, [cx, FLOOR + y + 0.028, cz + len / 2 - 0.028], 0.003));
      bedding[color].push(B(wid - 0.012, 0.006, 0.13, [cx, FLOOR + y + 0.024, cz - 0.005], 0.002));
      bedding[color].push(B(wid - 0.018, 0.009, 0.013, [cx, FLOOR + y + 0.028, cz + 0.06], 0.0015));
      bedding[color].push(B(0.004, 0.008, 0.13, [cx - wid / 2 + 0.007, FLOOR + y + 0.023, cz - 0.005], 0.001));
      bedding[color].push(B(0.004, 0.008, 0.13, [cx + wid / 2 - 0.007, FLOOR + y + 0.023, cz - 0.005], 0.001));
      bedding[color].push(B(wid - 0.02, 0.012, 0.045, [cx, FLOOR + y + 0.028, cz - len / 2 + 0.04], 0.002));
      curtains.push(B(0.003, 0.075, len * 0.6, [cx + curtainSide * (wid / 2 + 0.005), FLOOR + y + 0.055, cz - 0.005], 0.001));
      frame.push(B(0.006, 0.006, 0.01, [cx + wid / 2 - 0.012, FLOOR + y + 0.055, cz + len / 2 - 0.015], 0.001));
      // 私人物品：不是每床都一样；有的放书/耳机，有的放照片/水杯，有的放背包/毛巾
      const seed = Math.round((cx * 1007 + cz * 1013 + y * 1019) * 10) % 7;
      if (seed === 0) {
        personalPaper.push(B(0.026, 0.005, 0.038, [cx + 0.018, FLOOR + y + 0.034, cz + 0.055], 0.001));
        personalRed.push(B(0.028, 0.002, 0.04, [cx + 0.018, FLOOR + y + 0.038, cz + 0.055], 0.001));
        personalDark.push(B(0.016, 0.006, 0.022, [cx - 0.018, FLOOR + y + 0.032, cz + 0.045], 0.001));
      } else if (seed === 2) {
        personalColor.push(B(0.004, 0.026, 0.02, [cx - 0.02, FLOOR + y + 0.04, cz + 0.06], 0.0008));
        personalPaper.push(C(0.009, 0.012, [cx + 0.024, FLOOR + y + 0.033, cz + 0.045], 6));
      } else if (seed === 4) {
        personalDark.push(B(0.03, 0.026, 0.018, [cx - 0.02, FLOOR + y + 0.03, cz - 0.05], 0.002));
        personalColor.push(B(0.003, 0.05, 0.018, [cx + curtainSide * (wid / 2 + 0.006), FLOOR + y + 0.02, cz + 0.02], 0.001));
      } else if (seed === 6) {
        personalDark.push(B(0.018, 0.016, 0.035, [cx, FLOOR + 0.016, cz + len / 2 - 0.02], 0.001));
        personalPaper.push(C(0.006, 0.01, [cx + 0.028, FLOOR + y + 0.032, cz - 0.04], 6));
      }
    }
    // 底部个人柜 + 爬梯
    frame.push(B(wid - 0.012, 0.045, len - 0.02, [cx, FLOOR + 0.028, cz], 0.002));
    for (let r = 0; r < 3; r++) frame.push(B(0.04, 0.004, 0.006, [cx + curtainSide * (wid / 2 + 0.012), FLOOR + 0.06 + r * 0.06, cz], 0.001));
  };
  // A 舱：24 铺（8 位 ×3 层，两排相对）
  for (const [rowX, side] of [[-0.79, 1], [-0.2, -1]] as const) {
    for (let i = 0; i < 4; i++) rack(rowX, 4.36 + i * 0.23, 3, i % 2 ? "grey" : "navy", side);
  }
  // B 舱：18 铺（6 位 ×3 层，两排；被褥橄榄/沙色）
  for (const [rowX, side] of [[-0.79, 1], [-0.2, -1]] as const) {
    for (let i = 0; i < 3; i++) rack(rowX, 6.52 + i * 0.24, 3, i % 2 ? "olive" : "tan", side);
  }
  // 士官舱：10 铺（2 层，3+2 位）
  for (let i = 0; i < 3; i++) rack(-0.79, 8.32 + i * 0.24, 2, "grey", 1);
  for (let i = 0; i < 2; i++) rack(-0.2, 8.55 + i * 0.24, 2, "navy", -1);
  // 军官 1：单人床
  frame.push(B(0.09, 0.006, 0.26, [-0.79, FLOOR + 0.09, 10.45], 0.002));
  frame.push(B(0.09, 0.006, 0.26, [-0.2, FLOOR + 0.09, 10.45], 0.002));
  mattress.push(B(0.082, 0.014, 0.25, [-0.79, FLOOR + 0.1, 10.45], 0.004));
  bedding.navy.push(B(0.04, 0.008, 0.03, [-0.79, FLOOR + 0.115, 10.33], 0.002));
  bedding.navy.push(B(0.075, 0.004, 0.1, [-0.79, FLOOR + 0.114, 10.47], 0.002));
  // 军官 2：稍宽铺
  frame.push(B(0.12, 0.006, 0.27, [-0.78, FLOOR + 0.09, 11.35], 0.002));
  mattress.push(B(0.11, 0.014, 0.26, [-0.78, FLOOR + 0.1, 11.35], 0.004));
  bedding.tan.push(B(0.05, 0.008, 0.03, [-0.78, FLOOR + 0.115, 11.22], 0.002));
  bedding.tan.push(B(0.1, 0.004, 0.11, [-0.78, FLOOR + 0.114, 11.38], 0.002));

  part("bunk_frames", "各住舱铺位/床架/爬梯/个人柜", M(...frame), "cv_055_console");
  part("bunk_mattresses", "各住舱床垫", M(...mattress), "cv_mattress");
  for (const c of Object.keys(bedding) as Array<keyof typeof bedding>) {
    if (bedding[c].length) part(`bedding_${c}`, `各住舱被褥/枕头（${c}）`, M(...bedding[c]), beddingMat[c]);
  }
  part("bunk_curtains", "铺位隐私帘", M(...curtains), "cv_berth_grey");
  part("bed_sheets", "铺位白色床单/包角", M(...sheets), "cv_deck_line");
  part("bed_personal_paper", "铺位书籍/水杯/纸张", M(...personalPaper), "cv_deck_line");
  part("bed_personal_dark", "铺位耳机/背包/鞋", M(...personalDark), "cv_055_console");
  part("bed_personal_color", "铺位照片/毛巾", M(...personalColor), "cv_055_seat_alt2");
  part("bed_personal_red", "铺位书皮/私人物品", M(...personalRed), "cv_deck_red");

  // ---- 家具（按舱室分组，材质/布局不同） ----
  const wood: Array<ReturnType<typeof B>> = [];
  const dark: Array<ReturnType<typeof B>> = [];
  const fabric: Array<ReturnType<typeof B>> = [];
  const white: Array<ReturnType<typeof B>> = [];
  const props: Array<Parameters<typeof M>[0]> = [];
  const screens: Array<Parameters<typeof M>[0]> = [];
  props.push(B(0.12, 0.08, 0.002, [-0.5, FLOOR + 0.27, 5.97], 0.001));
  props.push(B(0.14, 0.012, 0.01, [-0.5, FLOOR + 0.4, 5.9], 0.001));
  // A 舱：折叠桌/壁挂电视/储物架/风扇
  wood.push(B(0.22, 0.008, 0.3, [-0.45, FLOOR + 0.12, 5.55], 0.002));
  dark.push(B(0.006, 0.11, 0.006, [-0.45, FLOOR + 0.06, 5.45], 0.001));
  dark.push(B(0.006, 0.11, 0.006, [-0.45, FLOOR + 0.06, 5.65], 0.001));
  fabric.push(B(0.012, 0.02, 0.12, [-0.42, FLOOR + 0.08, 5.55], 0.002));
  dark.push(B(0.008, 0.09, 0.16, [-0.86, FLOOR + 0.16, 5.9], 0.001));
  screens.push(B(0.002, 0.075, 0.13, [-0.854, FLOOR + 0.16, 5.9], 0.001));
  for (let s = 0; s < 3; s++) wood.push(B(0.08, 0.004, 0.18, [-0.82, FLOOR + 0.08 + s * 0.07, 4.3], 0.001));
  props.push(C(0.015, 0.008, [-0.45, CEIL - 0.02, 5.2], 8));
  // B 舱：中央条桌/电视/吉他/水壶/挂衣杆
  wood.push(B(0.25, 0.008, 0.28, [-0.5, FLOOR + 0.13, 7.35], 0.002));
  dark.push(B(0.006, 0.12, 0.006, [-0.62, FLOOR + 0.065, 7.25], 0.001));
  dark.push(B(0.006, 0.12, 0.006, [-0.38, FLOOR + 0.065, 7.25], 0.001));
  fabric.push(B(0.05, 0.012, 0.08, [-0.5, FLOOR + 0.075, 7.25], 0.002));
  screens.push(B(0.002, 0.08, 0.14, [-0.854, FLOOR + 0.2, 7.9], 0.001));
  dark.push(B(0.008, 0.1, 0.15, [-0.86, FLOOR + 0.2, 7.9], 0.001));
  props.push(B(0.02, 0.09, 0.008, [-0.82, FLOOR + 0.2, 7.45], 0.002));
  props.push(C(0.012, 0.02, [-0.3, FLOOR + 0.15, 7.55], 8));
  props.push(B(0.18, 0.004, 0.006, [-0.5, FLOOR + 0.33, 7.85], 0.001));
  // 士官舱：书桌/2 椅/书架/咖啡机/衣柜
  wood.push(B(0.26, 0.007, 0.13, [-0.5, FLOOR + 0.12, 9.4], 0.002));
  dark.push(B(0.006, 0.11, 0.11, [-0.63, FLOOR + 0.06, 9.4], 0.001));
  dark.push(B(0.006, 0.11, 0.11, [-0.37, FLOOR + 0.06, 9.4], 0.001));
  fabric.push(B(0.05, 0.012, 0.05, [-0.55, FLOOR + 0.07, 9.27], 0.002));
  fabric.push(B(0.05, 0.04, 0.006, [-0.55, FLOOR + 0.09, 9.22], 0.002));
  fabric.push(B(0.05, 0.012, 0.05, [-0.45, FLOOR + 0.07, 9.53], 0.002));
  dark.push(B(0.05, 0.2, 0.04, [-0.35, FLOOR + 0.1, 8.3], 0.001));
  for (let s = 0; s < 3; s++) wood.push(B(0.12, 0.004, 0.03, [-0.6, FLOOR + 0.16 + s * 0.05, 8.25], 0.001));
  props.push(B(0.025, 0.035, 0.025, [-0.32, FLOOR + 0.15, 9.42], 0.002));
  props.push(B(0.012, 0.03, 0.012, [-0.62, FLOOR + 0.18, 9.3], 0.001));
  // 军官舱：写字台/椅/衣柜/洗手盆/沙发/保险柜
  for (const [z, mat] of [[10.55, "navy"], [11.35, "tan"]] as const) {
    wood.push(B(0.2, 0.006, 0.1, [-0.35, FLOOR + 0.12, z], 0.002));
    dark.push(B(0.006, 0.11, 0.09, [-0.45, FLOOR + 0.06, z], 0.001));
    dark.push(B(0.006, 0.11, 0.09, [-0.25, FLOOR + 0.06, z], 0.001));
    fabric.push(B(0.04, 0.012, 0.04, [-0.38, FLOOR + 0.07, z - 0.07], 0.002));
    fabric.push(B(0.04, 0.04, 0.006, [-0.38, FLOOR + 0.09, z - 0.1], 0.002));
    wood.push(B(0.06, 0.19, 0.04, [-0.84, FLOOR + 0.1, z + 0.15], 0.002));
    white.push(B(0.05, 0.02, 0.04, [-0.82, FLOOR + 0.1, z - 0.15], 0.003));
    props.push(B(0.035, 0.05, 0.004, [-0.87, FLOOR + 0.16, z], 0.001));
    void mat;
  }
  fabric.push(B(0.12, 0.035, 0.05, [-0.55, FLOOR + 0.04, 11.1], 0.003));
  fabric.push(B(0.12, 0.05, 0.006, [-0.55, FLOOR + 0.06, 11.06], 0.002));
  dark.push(B(0.04, 0.04, 0.04, [-0.82, FLOOR + 0.03, 10.3], 0.001));
  // 餐厅：5 张桌 + 长凳 + 配餐台 + 饮料站 + 菜单板
  for (const [tx, tz] of [[0.35, 4.6], [0.65, 4.6], [0.35, 5.05], [0.65, 5.05], [0.5, 5.5]] as const) {
    wood.push(B(0.24, 0.006, 0.12, [tx, FLOOR + 0.12, tz], 0.002));
    dark.push(B(0.006, 0.11, 0.1, [tx - 0.09, FLOOR + 0.06, tz], 0.001));
    dark.push(B(0.006, 0.11, 0.1, [tx + 0.09, FLOOR + 0.06, tz], 0.001));
    fabric.push(B(0.22, 0.012, 0.035, [tx, FLOOR + 0.075, tz - 0.09], 0.002));
    fabric.push(B(0.22, 0.012, 0.035, [tx, FLOOR + 0.075, tz + 0.09], 0.002));
    props.push(B(0.04, 0.008, 0.03, [tx - 0.04, FLOOR + 0.13, tz], 0.001));
    props.push(C(0.004, 0.008, [tx + 0.03, FLOOR + 0.135, tz], 6));
  }
  white.push(B(0.35, 0.008, 0.08, [0.5, FLOOR + 0.14, 5.9], 0.001));
  dark.push(B(0.35, 0.13, 0.07, [0.5, FLOOR + 0.07, 5.9], 0.001));
  for (let p = 0; p < 4; p++) props.push(B(0.07, 0.012, 0.055, [0.35 + p * 0.09, FLOOR + 0.155, 5.9], 0.001));
  props.push(B(0.02, 0.05, 0.02, [0.82, FLOOR + 0.06, 5.8], 0.002));
  screens.push(B(0.002, 0.07, 0.12, [0.86, FLOOR + 0.2, 4.6], 0.001));
  props.push(B(0.12, 0.008, 0.004, [0.5, FLOOR + 0.25, 5.88], 0.001));
  // 厨房：电磁灶/蒸锅/水槽/冷库/干货架/洗碗机
  white.push(B(0.12, 0.12, 0.6, [0.82, FLOOR + 0.07, 6.9], 0.002));
  for (let h = 0; h < 4; h++) {
    props.push(C(0.028, 0.003, [0.86, FLOOR + 0.135, 6.65 + h * 0.14], 12));
    props.push(C(0.02, 0.003, [0.86, FLOOR + 0.136, 6.65 + h * 0.14], 12));
  }
  props.push(C(0.045, 0.06, [0.82, FLOOR + 0.16, 6.3], 12));
  props.push(C(0.045, 0.06, [0.82, FLOOR + 0.16, 6.45], 12));
  props.push(B(0.13, 0.02, 0.5, [0.82, FLOOR + 0.26, 6.9], 0.002));
  dark.push(B(0.2, 0.3, 0.2, [0.3, FLOOR + 0.15, 6.15], 0.003));
  dark.push(B(0.2, 0.3, 0.2, [0.7, FLOOR + 0.15, 6.15], 0.003));
  props.push(B(0.16, 0.012, 0.16, [0.3, FLOOR + 0.2, 6.03], 0.001));
  props.push(B(0.16, 0.012, 0.16, [0.7, FLOOR + 0.2, 6.03], 0.001));
  for (let s = 0; s < 4; s++) {
    wood.push(B(0.25, 0.004, 0.05, [0.3, FLOOR + 0.08 + s * 0.06, 7.2], 0.001));
    for (let k = 0; k < 5; k++) props.push(B(0.035, 0.03, 0.035, [0.2 + k * 0.04, FLOOR + 0.1 + s * 0.06, 7.2], 0.001));
  }
  white.push(B(0.2, 0.12, 0.12, [0.72, FLOOR + 0.07, 7.55], 0.002));
  props.push(B(0.12, 0.06, 0.1, [0.72, FLOOR + 0.15, 7.55], 0.002));
  // 医务室：手术床/无影灯/麻醉机/监护仪/病床/药柜/洗手池/轮椅
  white.push(B(0.1, 0.06, 0.26, [0.5, FLOOR + 0.09, 9.3], 0.002));
  fabric.push(B(0.1, 0.015, 0.25, [0.5, FLOOR + 0.125, 9.3], 0.003));
  props.push(B(0.09, 0.02, 0.09, [0.5, FLOOR + 0.35, 9.3], 0.002));
  props.push(C(0.006, 0.14, [0.5, FLOOR + 0.27, 9.3], 6));
  for (let l = 0; l < 4; l++) {
    const a = (l / 4) * Math.PI * 2;
    props.push(C(0.008, 0.006, [0.5 + Math.cos(a) * 0.035, FLOOR + 0.345, 9.3 + Math.sin(a) * 0.035], 6));
  }
  white.push(B(0.08, 0.08, 0.1, [0.78, FLOOR + 0.1, 9.0], 0.002));
  props.push(B(0.05, 0.06, 0.005, [0.78, FLOOR + 0.14, 9.06], 0.001));
  props.push(B(0.06, 0.04, 0.06, [0.43, FLOOR + 0.16, 9.0], 0.002));
  props.push(C(0.005, 0.05, [0.43, FLOOR + 0.21, 9.0], 6));
  white.push(B(0.075, 0.024, 0.2, [0.3, FLOOR + 0.05, 8.55], 0.002));
  fabric.push(B(0.07, 0.012, 0.19, [0.3, FLOOR + 0.068, 8.55], 0.002));
  white.push(B(0.14, 0.17, 0.05, [0.84, FLOOR + 0.09, 8.45], 0.002));
  for (let s = 0; s < 3; s++) props.push(B(0.12, 0.003, 0.04, [0.84, FLOOR + 0.08 + s * 0.05, 8.42], 0.001));
  white.push(B(0.06, 0.02, 0.05, [0.15, FLOOR + 0.1, 9.3], 0.002));
  props.push(B(0.04, 0.006, 0.04, [0.15, FLOOR + 0.12, 9.3], 0.001));
  props.push(B(0.04, 0.04, 0.04, [0.25, FLOOR + 0.05, 9.6], 0.002));
  props.push({ type: "torus", radius: 0.025, tube: 0.004, radialSegments: 6, tubularSegments: 12, at: [0.3, FLOOR + 0.04, 9.6] });
  props.push({ type: "torus", radius: 0.025, tube: 0.004, radialSegments: 6, tubularSegments: 12, at: [0.2, FLOOR + 0.04, 9.6] });
  // 健身/洗衣/阅览：划船机/哑铃/长凳/电视/沙发/书架/洗烘衣机
  props.push(B(0.2, 0.012, 0.04, [0.5, FLOOR + 0.045, 10.25], 0.001));
  props.push(B(0.02, 0.014, 0.1, [0.4, FLOOR + 0.05, 10.25], 0.001));
  props.push({ type: "weld", from: [0.5, FLOOR + 0.06, 10.2], to: [0.5, FLOOR + 0.16, 10.45], radius: 0.004 });
  props.push(B(0.03, 0.03, 0.01, [0.5, FLOOR + 0.17, 10.46], 0.001));
  for (let d = 0; d < 3; d++) {
    props.push(C(0.016, 0.03, [0.78 + d * 0.025, FLOOR + 0.02, 10.8], 8));
    props.push(B(0.03, 0.03, 0.02, [0.78 + d * 0.025, FLOOR + 0.04, 10.8], 0.001));
  }
  fabric.push(B(0.12, 0.02, 0.04, [0.5, FLOOR + 0.03, 11.05], 0.002));
  fabric.push(B(0.12, 0.03, 0.005, [0.5, FLOOR + 0.045, 11.02], 0.001));
  screens.push(B(0.002, 0.09, 0.12, [0.86, FLOOR + 0.2, 10.9], 0.001));
  wood.push(B(0.08, 0.1, 0.02, [0.78, FLOOR + 0.08, 11.5], 0.001));
  for (let b = 0; b < 6; b++) props.push(B(0.006, 0.02, 0.01, [0.76 + b * 0.008, FLOOR + 0.08 + (b % 2) * 0.03, 11.5], 0.001));
  white.push(B(0.06, 0.11, 0.06, [0.25, FLOOR + 0.06, 11.4], 0.002));
  white.push(B(0.06, 0.11, 0.06, [0.25, FLOOR + 0.17, 11.4], 0.002));
  props.push(C(0.02, 0.004, [0.25, FLOOR + 0.08, 11.34], 12));
  props.push(C(0.02, 0.004, [0.25, FLOOR + 0.19, 11.34], 12));
  props.push(B(0.1, 0.006, 0.05, [0.45, FLOOR + 0.12, 11.4], 0.001));
  // 墙面/储物/个人物品：开放柜、照片板、挂衣、鞋、毛巾、洗衣袋、垃圾桶
  for (const [zWall, tone] of [[5.94, 0], [8.08, 1]] as const) {
    for (let l = 0; l < 3; l++) {
      const lx = -0.7 + l * 0.2;
      dark.push(B(0.17, 0.17, 0.035, [lx, FLOOR + 0.085, zWall], 0.002));
      dark.push(B(0.004, 0.15, 0.06, [lx - 0.086, FLOOR + 0.085, zWall - 0.03], 0.001));
      fabric.push(B(0.06, 0.08, 0.008, [lx, FLOOR + 0.1, zWall - 0.022], 0.001));
      fabric.push(B(0.06, 0.012, 0.025, [lx, FLOOR + 0.15, zWall - 0.02], 0.001));
      props.push(B(0.02, 0.012, 0.01, [lx + 0.045, FLOOR + 0.12, zWall - 0.03], 0.001));
    }
    wood.push(B(0.26, 0.07, 0.006, [-0.6, FLOOR + 0.27, zWall + 0.002], 0.001));
    for (let ph = 0; ph < 4; ph++) {
      white.push(B(0.018, 0.022, 0.002, [-0.7 + ph * 0.06, FLOOR + 0.27, zWall - 0.003], 0.001));
      fabric.push(B(0.014, 0.018, 0.002, [-0.68 + ph * 0.06, FLOOR + 0.3, zWall - 0.003], 0.001));
    }
    props.push(C(0.015, 0.008, [-0.28, FLOOR + 0.32, zWall], 10));
    props.push(C(0.006, 0.01, [-0.28, FLOOR + 0.32, zWall + 0.006], 8));
    props.push(B(0.012, 0.04, 0.004, [-0.28, FLOOR + 0.34, zWall + 0.006], 0.001));
    // 吊扇
    props.push(C(0.012, 0.012, [-0.45, CEIL - 0.04, zWall - 0.1], 8));
    for (let b = 0; b < 3; b++) {
      props.push(B(0.035, 0.002, 0.008, [-0.45 + Math.cos(b * 2.1) * 0.03, CEIL - 0.05, zWall - 0.1 + Math.sin(b * 2.1) * 0.03], 0.001));
    }
    fabric.push(B(0.004, 0.08, 0.03, [-0.86, FLOOR + 0.13, zWall - 0.16], 0.001));
    dark.push(B(0.02, 0.018, 0.045, [-0.58, FLOOR + 0.012, zWall - 0.07], 0.002));
    dark.push(B(0.02, 0.018, 0.045, [-0.54, FLOOR + 0.012, zWall - 0.07], 0.002));
    fabric.push(B(0.06, 0.075, 0.05, [-0.82, FLOOR + 0.045, zWall - 0.3], 0.002));
    props.push(C(0.028, 0.06, [-0.2, FLOOR + 0.04, zWall - 0.12], 10));
    void tone;
  }
  // 餐厅：托盘/餐盘/食物/调料/咖啡/饮水机/回收架/菜单
  for (const [tx, tz] of [[0.35, 4.6], [0.65, 4.6], [0.35, 5.05], [0.65, 5.05], [0.5, 5.5]] as const) {
    white.push(B(0.09, 0.003, 0.06, [tx - 0.035, FLOOR + 0.128, tz], 0.001));
    props.push(C(0.025, 0.004, [tx + 0.02, FLOOR + 0.132, tz], 10));
    food.push(B(0.03, 0.008, 0.022, [tx + 0.02, FLOOR + 0.137, tz], 0.002));
    foodGreen.push(B(0.012, 0.01, 0.015, [tx + 0.045, FLOOR + 0.138, tz + 0.015], 0.002));
    props.push(C(0.008, 0.012, [tx - 0.055, FLOOR + 0.135, tz + 0.025], 6));
    props.push(B(0.008, 0.018, 0.008, [tx + 0.06, FLOOR + 0.14, tz - 0.02], 0.001));
    props.push(B(0.026, 0.012, 0.02, [tx - 0.03, FLOOR + 0.137, tz - 0.025], 0.001));
  }
  // 配餐台：保温盖/夹子/雪挡/托盘轨
  for (let p = 0; p < 4; p++) {
    white.push(B(0.075, 0.006, 0.06, [0.35 + p * 0.09, FLOOR + 0.165, 5.89], 0.001));
    props.push(B(0.06, 0.006, 0.04, [0.35 + p * 0.09, FLOOR + 0.155, 5.89], 0.001));
  }
  props.push(B(0.36, 0.03, 0.03, [0.5, FLOOR + 0.17, 5.82], 0.001));
  props.push(B(0.36, 0.02, 0.02, [0.5, FLOOR + 0.18, 5.96], 0.001));
  props.push(B(0.28, 0.02, 0.005, [0.5, FLOOR + 0.2, 5.88], 0.001));
  // 咖啡桶/饮水机/托盘回收/垃圾桶
  props.push(C(0.045, 0.11, [0.82, FLOOR + 0.1, 5.65], 12));
  props.push(C(0.035, 0.04, [0.82, FLOOR + 0.17, 5.65], 12));
  white.push(B(0.09, 0.16, 0.08, [0.15, FLOOR + 0.08, 5.55], 0.002));
  props.push(C(0.025, 0.09, [0.15, FLOOR + 0.18, 5.55], 10));
  white.push(B(0.13, 0.006, 0.08, [0.15, FLOOR + 0.17, 5.55], 0.001));
  props.push(B(0.12, 0.04, 0.08, [0.7, FLOOR + 0.04, 5.7], 0.002));
  props.push(B(0.11, 0.02, 0.07, [0.7, FLOOR + 0.07, 5.7], 0.001));
  props.push(C(0.03, 0.07, [0.85, FLOOR + 0.04, 5.25], 10));
  // 菜单板 + 托盘 + 餐巾
  screens.push(B(0.002, 0.06, 0.1, [0.86, FLOOR + 0.27, 5.15], 0.001));
  props.push(B(0.05, 0.004, 0.035, [0.6, FLOOR + 0.13, 5.2], 0.001));
  white.push(B(0.04, 0.004, 0.03, [0.6, FLOOR + 0.135, 5.2], 0.001));
  // 厕所：隔间/马桶/水箱/扶手/洗手池/镜子/淋浴
  for (const [cx, cz, tag] of [[-0.5, 6.17, "p"], [0.5, 8.0, "s"]] as const) {
    for (let s = 0; s < 2; s++) {
      const sx = cx - 0.18 + s * 0.22;
      white.push(C(0.032, 0.045, [sx, FLOOR + 0.025, cz], 10));
      white.push(B(0.07, 0.09, 0.035, [sx, FLOOR + 0.075, cz + 0.05], 0.002));
      dark.push(B(0.004, 0.2, 0.13, [sx - 0.095, FLOOR + 0.1, cz], 0.001));
      dark.push(B(0.004, 0.2, 0.13, [sx + 0.095, FLOOR + 0.1, cz], 0.001));
      props.push(C(0.012, 0.018, [sx + 0.07, FLOOR + 0.12, cz + 0.065], 8));
      props.push(B(0.04, 0.006, 0.004, [sx, FLOOR + 0.17, cz + 0.08], 0.001));
    }
    white.push(B(0.22, 0.006, 0.06, [cx, FLOOR + 0.11, cz + 0.13], 0.001));
    props.push(C(0.026, 0.008, [cx - 0.06, FLOOR + 0.115, cz + 0.13], 10));
    props.push(C(0.026, 0.008, [cx + 0.06, FLOOR + 0.115, cz + 0.13], 10));
    props.push(C(0.006, 0.02, [cx - 0.06, FLOOR + 0.14, cz + 0.13], 6));
    props.push(B(0.16, 0.12, 0.003, [cx, FLOOR + 0.22, cz + 0.16], 0.001));
    props.push(B(0.02, 0.03, 0.02, [cx + 0.1, FLOOR + 0.14, cz + 0.13], 0.001));
    // 淋浴
    white.push(B(0.14, 0.004, 0.12, [cx, FLOOR + 0.005, cz - 0.14], 0.001));
    props.push(C(0.012, 0.18, [cx + 0.06, FLOOR + 0.19, cz - 0.14], 8));
    props.push(C(0.03, 0.012, [cx + 0.06, FLOOR + 0.28, cz - 0.14], 10));
    props.push(B(0.012, 0.012, 0.03, [cx + 0.06, FLOOR + 0.29, cz - 0.12], 0.001));
    void tag;
  }

  // 厕所/淋浴
  for (const [cx, cz] of [[-0.5, 6.17], [0.5, 8.0]] as const) {
    white.push(B(0.16, 0.004, 0.14, [cx, FLOOR + 0.004, cz], 0.001));
    white.push(C(0.03, 0.04, [cx, FLOOR + 0.02, cz], 8));
    props.push(B(0.04, 0.08, 0.004, [cx, FLOOR + 0.06, cz + 0.06], 0.001));
    props.push(B(0.003, 0.19, 0.12, [cx + 0.09, FLOOR + 0.1, cz], 0.001));
    props.push(C(0.01, 0.006, [cx - 0.05, CEIL - 0.03, cz], 8));
  }
  // 走廊：扶手/灭火器/损管柜/管束/标识
  const corr: Array<ReturnType<typeof B>> = [];
  corr.push(B(0.006, 0.006, 7.4, [-0.075, FLOOR + 0.12, 8.0], 0.001));
  corr.push(B(0.006, 0.006, 7.4, [0.075, FLOOR + 0.12, 8.0], 0.001));
  corr.push(B(0.04, 0.08, 0.04, [0.06, FLOOR + 0.04, 4.6], 0.002));
  corr.push(C(0.01, 0.04, [0.06, FLOOR + 0.07, 4.64], 8));
  corr.push(B(0.035, 0.05, 0.03, [-0.06, FLOOR + 0.03, 10.9], 0.002));
  part("corridor_props", "生活区走廊扶手/灭火器/损管柜", M(...corr), "cv_055_console");
  const pipes: Array<Parameters<typeof M>[0]> = [];
  for (const [dx, y] of [[-0.035, CEIL - 0.008], [0, CEIL - 0.008], [0.035, CEIL - 0.011]] as const) {
    pipes.push({ type: "weld", from: [dx, y, Z0 + 0.1], to: [dx, y, Z1 - 0.1], radius: 0.0018 });
  }
  part("corridor_pipes", "生活区走廊电缆/水管", M(...pipes), "cv_steel");

  part("wood_furniture", "生活区木纹家具/桌面/床板", M(...wood), "cv_055_wood");
  part("dark_furniture", "生活区金属家具/柜架/屏幕框", M(...dark), "cv_055_console");
  part("fabric_furniture", "生活区布艺/沙发/床垫/餐凳", M(...fabric), "cv_055_seat");
  part("white_furniture", "厨房/医务/卫生白色设备", M(...white), "cv_055_ceiling");
  part("screens", "生活区电视/医疗监护屏", M(...screens), "cv_scr_camera");
  part("props", "生活区餐具/书籍/器材/私人物品", M(...props), "cv_steel");
  part("food", "餐厅食物/配餐保温", M(...food), "cv_food");
  part("food_green", "餐厅蔬菜/配菜", M(...foodGreen), "cv_food_green");

  // 相机锚点
  const anchors: Array<[string, string, [number, number, number]]> = [
    ["corridor_eye", "生活区走廊视点", [0, FLOOR + 0.24, 9.7]],
    ["corridor_end", "生活区走廊尽头", [0, FLOOR + 0.2, 4.35]],
    ["berth_eye", "水兵住舱视点", [-0.5, FLOOR + 0.23, 4.27]],
    ["berth_target", "水兵住舱铺位目标", [-0.5, FLOOR + 0.16, 5.9]],
    ["mess_eye", "餐厅厨房视点", [0.45, FLOOR + 0.23, 4.78]],
    ["mess_target", "餐厅配餐台目标", [0.55, FLOOR + 0.15, 5.8]],
  ];
  for (const [tag, cn, at] of anchors) {
    part(tag, cn, M(B(0.002, 0.002, 0.002, [0, 0, 0], 0.0005)), "cv_055_console", at);
  }

  // ---- 维修车间（生活甲板后侧，轮机/机加工/备件/损管） ----
  // 位置：生活区后壁 z=4.2 外，z=1.0..4.2；编辑尺度 1:8，约 7m 宽 ×25m 长 ×2.5m 高。
  const WZ0 = 1.0;
  const WZ1 = Z0;
  const WF = FLOOR;
  const WC = CEIL;
  part("workshop_shell", "维修车间围壁/地板/天花", M(
    B(1.8, 0.03, WZ1 - WZ0, [0, WF, (WZ0 + WZ1) / 2], 0.004),
    B(1.8, 0.025, WZ1 - WZ0, [0, WC, (WZ0 + WZ1) / 2], 0.004),
    B(0.025, 0.32, WZ1 - WZ0, [-0.9, WF + 0.16, (WZ0 + WZ1) / 2], 0.004),
    B(0.025, 0.32, WZ1 - WZ0, [0.9, WF + 0.16, (WZ0 + WZ1) / 2], 0.004),
    B(1.8, 0.32, 0.025, [0, WF + 0.16, WZ0], 0.004),
    // 门框 + 敞开的门扇
    B(0.04, 0.3, 0.04, [-0.16, WF + 0.15, WZ1], 0.003),
    B(0.04, 0.3, 0.04, [0.16, WF + 0.15, WZ1], 0.003),
    B(0.36, 0.04, 0.04, [0, WF + 0.31, WZ1], 0.003),
    B(0.006, 0.28, 0.14, [-0.17, WF + 0.14, WZ1 - 0.09], 0.002),
  ), "cv_055_bulkhead");
  const wWood: Array<ReturnType<typeof B>> = [];
  const wDark: Array<ReturnType<typeof B>> = [];
  const wWhite: Array<ReturnType<typeof B>> = [];
  const wProps: Array<Parameters<typeof M>[0]> = [];
  const wScreens: Array<Parameters<typeof M>[0]> = [];
  // 工作台 + 台钳 + 工具板
  wWood.push(B(0.62, 0.045, 0.14, [-0.55, WF + 0.1, 2.15], 0.004));
  wDark.push(B(0.035, 0.1, 0.12, [-0.83, WF + 0.05, 2.15], 0.002));
  wDark.push(B(0.035, 0.1, 0.12, [-0.27, WF + 0.05, 2.15], 0.002));
  wDark.push(B(0.05, 0.05, 0.035, [-0.36, WF + 0.14, 2.15], 0.002));
  wProps.push(C(0.012, 0.06, [-0.36, WF + 0.17, 2.15], 10));
  wDark.push(B(0.45, 0.16, 0.01, [-0.55, WF + 0.26, 2.23], 0.002));
  for (let t = 0; t < 8; t++) wProps.push(B(0.012, 0.04, 0.006, [-0.74 + t * 0.05, WF + 0.24, 2.225], 0.001));
  // 工具柜（红）/ 零件架 / 手册
  wWhite.push(B(0.18, 0.13, 0.08, [-0.72, WF + 0.07, 1.35], 0.003));
  for (let d = 0; d < 3; d++) wDark.push(B(0.16, 0.025, 0.01, [-0.72, WF + 0.03 + d * 0.035, 1.31], 0.001));
  for (let sh = 0; sh < 3; sh++) {
    wWood.push(B(0.3, 0.008, 0.05, [0.55, WF + 0.08 + sh * 0.055, 1.45], 0.001));
    for (let b = 0; b < 5; b++) wProps.push(B(0.04, 0.03, 0.035, [0.44 + b * 0.045, WF + 0.1 + sh * 0.055, 1.45], 0.001));
  }
  wProps.push(B(0.08, 0.12, 0.012, [0.82, WF + 0.22, 1.3], 0.001));
  // 车床 / 钻床 / 砂轮机
  wDark.push(B(0.28, 0.06, 0.09, [0.55, WF + 0.07, 2.3], 0.002));
  wWhite.push(B(0.06, 0.07, 0.07, [0.42, WF + 0.1, 2.3], 0.002));
  wProps.push(C(0.025, 0.04, [0.48, WF + 0.12, 2.3], 10));
  wProps.push(C(0.008, 0.12, [0.7, WF + 0.14, 2.3], 8));
  wDark.push(C(0.025, 0.17, [0.78, WF + 0.12, 2.6], 10));
  wDark.push(B(0.07, 0.02, 0.07, [0.78, WF + 0.22, 2.6], 0.002));
  wProps.push(C(0.04, 0.012, [0.78, WF + 0.15, 2.54], 10));
  wDark.push(B(0.13, 0.06, 0.08, [0.55, WF + 0.06, 2.75], 0.002));
  // 焊机/气瓶/焊接屏
  wWhite.push(B(0.12, 0.12, 0.08, [0.25, WF + 0.06, 2.85], 0.003));
  wProps.push(C(0.025, 0.16, [0.1, WF + 0.08, 2.85], 10));
  wProps.push(C(0.025, 0.16, [0.2, WF + 0.08, 2.85], 10));
  wDark.push(B(0.005, 0.22, 0.2, [0.38, WF + 0.13, 2.85], 0.002));
  // 备用燃气轮机模块（轮式托架 + 转子 + 管线）
  wDark.push(B(0.3, 0.16, 0.14, [-0.35, WF + 0.11, 3.15], 0.006));
  wWhite.push(C(0.045, 0.28, [-0.35, WF + 0.13, 3.15], 12));
  wProps.push(C(0.02, 0.32, [-0.23, WF + 0.13, 3.15], 8));
  wProps.push(C(0.02, 0.02, [-0.35, WF + 0.2, 3.0], 8));
  wProps.push({ type: "torus", radius: 0.07, tube: 0.012, radialSegments: 8, tubularSegments: 16, at: [-0.35, WF + 0.06, 3.25] });
  for (const dz of [-0.18, 0.18]) wDark.push(C(0.035, 0.025, [-0.5, WF + 0.025, 3.15 + dz], 10));
  // 吊车轨道/吊钩/链条
  wDark.push(B(0.8, 0.015, 0.02, [0, WC - 0.03, 2.3], 0.001));
  wProps.push({ type: "weld", from: [-0.2, WC - 0.03, 2.3], to: [-0.2, WF + 0.24, 2.3], radius: 0.006 });
  wProps.push({ type: "torus", radius: 0.03, tube: 0.006, radialSegments: 6, tubularSegments: 12, at: [-0.2, WF + 0.22, 2.3] });
  // 备件/电缆盘/灭火器/损管柜
  wProps.push(C(0.06, 0.04, [0.75, WF + 0.02, 3.1], 12));
  wProps.push(C(0.02, 0.13, [0.75, WF + 0.09, 3.1], 10));
  wProps.push(C(0.035, 0.1, [-0.8, WF + 0.06, 3.55], 10));
  wWhite.push(B(0.15, 0.14, 0.07, [-0.7, WF + 0.08, 3.7], 0.003));
  wScreens.push(B(0.002, 0.06, 0.1, [-0.78, WF + 0.24, 3.0], 0.001));
  part("workshop_wood", "维修车间工作台/备件架", M(...wWood), "cv_055_wood");
  part("workshop_dark", "维修车间车床/工具柜/吊轨/托架", M(...wDark), "cv_055_console");
  part("workshop_white", "维修车间焊机/备件箱/控制盒", M(...wWhite), "cv_055_ceiling");
  part("workshop_props", "维修车间工具/气瓶/吊钩/备件", M(...wProps), "cv_steel");
  part("workshop_screen", "维修车间状态屏", M(...wScreens), "cv_scr_camera");
  part("workshop_view_post", "维修车间视点立柱", M(B(0.04, 0.17, 0.04, [0, 0.085, 0], 0.002), B(0.12, 0.02, 0.12, [0, 0.01, 0], 0.003)), "cv_steel_dark", [0, WF, 4.0]);
  part("workshop_eye", "维修车间视点", M(B(0.002, 0.002, 0.002, [0, 0, 0], 0.0005)), "cv_055_console", [0, WF + 0.17, 4.0]);
  part("workshop_target", "维修车间目标", M(B(0.002, 0.002, 0.002, [0, 0, 0], 0.0005)), "cv_055_console", [0, WF + 0.05, 1.3]);
}
