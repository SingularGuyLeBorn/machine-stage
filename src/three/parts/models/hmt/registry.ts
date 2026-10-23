import type {
  BuildLayer,
  Expr,
  GeometrySpec,
  KitParam,
  ModelRegistry,
  PartDefinition,
} from "../../registry/types";
import { Euler, Quaternion, Vector3 } from "three";

/**
 * HMT 双足机器人 · Vitaly Bulgarov 的 2-xm-robotdesign 方案。
 * 造型依据：用户指定的 15.jpg；13–18 正背面与小腿；robot3 中同前缀的白色版本。
 * 白色版本仅辅助读曲面、开窗和分件，颜色按用户指定的深灰 / 红色版本。
 * [OM-FREEPLAY] 图中没有标尺：2.4m 是展示归一化尺度，非真实规格；所有尺寸均为图像比例估算。
 * 肩宽约 .90m、胸宽 .63m、腰宽 .22m、头高 .25m、髋高 1.23m、膝高 .68m。
 * 不采用文章中另一台 Method-2 的四米尺寸，不包含制造公差或运动学承诺。
 */
export function makeHmtRegistry(): ModelRegistry {
  const constants: Record<string, Expr> = { HEIGHT: 2.4 };
  const parts: PartDefinition[] = [];
  let serial = 0;
  const source = "用户提供的 2-xm-robotdesign 同款图像；尺寸为比例估算";
  // 数据写入常量表：几何和装配共用同一来源，界面不保存第二套尺寸。
  function parameter(key: string, value: number): string {
    const dimensionless = /_G_SEGMENTS$|_G_PARAMS_(SLOPE|FOLD|TURNS)$|_[RE]_\d$/.test(key);
    constants[key] = dimensionless ? value.toFixed(9) : `(${value.toFixed(9)})*HEIGHT/2.4`;
    return key;
  }
  function parameters(key: string, value: unknown): KitParam {
    if (typeof value === "number") return parameter(key, value);
    if (Array.isArray(value)) return value.map((v, i) => parameters(`${key}_${i}`, v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, parameters(`${key}_${k.toUpperCase()}`, v)]),
      );
    return value as string | boolean;
  }
  function add(
    assembly: string,
    id: string,
    cn: string,
    layer: BuildLayer,
    geometry: GeometrySpec,
    position: number[],
    material: string,
    dual = false,
    rotation = [0, 0, 0],
    direction = [0, 0, 1],
  ): void {
    const key = `${assembly}_${id}`.toUpperCase();
    const geometryParams = parameters(`${key}_G`, geometry) as unknown as GeometrySpec;
    // segments 是构造器的整数配置，也由同一解析入口读取。
    parts.push({
      id: `hmt.${assembly}.${id}`,
      name_cn: cn,
      name_en: id.replaceAll("_", " "),
      assembly,
      build_layer: layer,
      build_order: ++serial + 100,
      geometry: geometryParams,
      material,
      dual,
      mate: {
        type: "absolute",
        position: parameters(`${key}_P`, position) as [Expr, Expr, Expr],
        rotation: parameters(`${key}_R`, rotation) as [Expr, Expr, Expr],
      },
      explode: {
        direction: parameters(`${key}_E`, direction) as [Expr, Expr, Expr],
        distance: parameter(`${key}_D`, layer <= 2 ? 0 : 0.11 + layer * 0.045),
      },
      source,
    });
  }
  function panel(
    assembly: string,
    id: string,
    cn: string,
    outline: number[][],
    pos: number[],
    options: {
      dual?: boolean;
      holes?: number[][][];
      material?: string;
      rise?: number;
      slope?: number;
      fold?: number;
      ridgeWidth?: number;
      rotation?: number[];
      layer?: BuildLayer;
      thickness?: number;
      direction?: number[];
    } = {},
  ): void {
    add(
      assembly,
      id,
      cn,
      options.layer ?? 4,
      {
        type: "kit",
        kit: "hmt_panel",
        params: {
          outline,
          holes: options.holes ?? [],
          thickness: options.thickness ?? 0.009,
          bevel: 0.0012,
          rise: options.rise ?? 0.012,
          slope: options.slope ?? 0,
          fold: options.fold ?? 0,
          width: options.ridgeWidth ?? Math.max(...outline.map(([x]) => Math.abs(x))),
        },
      },
      pos,
      options.material ?? "armor",
      options.dual,
      options.rotation,
      options.direction,
    );
    // [OM-FREEPLAY] 图中紧固点密度可见但数量不能逐个量定；每块大护板取三个边缘点。
    // 位姿由护甲同一折面函数求出，避免悬空螺钉或用穿模把螺钉压进护板。
    if ((options.layer ?? 4) >= 4) {
      const rotation = new Euler(
        ...((options.rotation ?? [0, 0, 0]).map((v) => (v * Math.PI) / 180) as [number, number, number]),
      );
      const q = new Quaternion().setFromEuler(rotation);
      const width = options.ridgeWidth ?? Math.max(...outline.map(([x]) => Math.abs(x)));
      const inside = (x: number, y: number, loop: number[][]) => {
        let yes = false;
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
          const a = loop[i],
            b = loop[j];
          if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
        }
        return yes;
      };
      for (const [index, vertex] of [
        outline[0],
        outline[Math.floor(outline.length / 3)],
        outline[Math.floor((outline.length * 2) / 3)],
      ].entries()) {
        const [x, y] = vertex.map((v) => v * 0.82);
        if (!inside(x, y, outline) || (options.holes ?? []).some((h) => inside(x, y, h))) continue;
        const rise = options.rise ?? 0.012,
          slope = options.slope ?? 0,
          fold = options.fold ?? 0;
        const normal = new Vector3(
          (Math.sign(x) * rise) / width,
          -slope - Math.sign(y) * fold,
          1,
        ).normalize();
        const surface = new Vector3(
          x,
          y,
          (options.thickness ?? 0.009) + rise * (1 - Math.abs(x) / width) + y * slope + Math.abs(y) * fold,
        );
        surface
          .addScaledVector(normal, 0.00115)
          .applyQuaternion(q)
          .add(new Vector3(...(pos as [number, number, number])));
        normal.applyQuaternion(q);
        const e = new Euler().setFromQuaternion(
          new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
        );
        cylinder(
          assembly,
          `${id}_stud_${index}`,
          "护板表面紧固件",
          surface.toArray(),
          0.0026,
          0.002,
          "fastener",
          options.dual,
          [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI),
          5,
        );
      }
    }
  }
  function link(
    assembly: string,
    id: string,
    cn: string,
    from: number[],
    to: number[],
    radius: number,
    material = "steel",
    dual = false,
    layer: BuildLayer = 2,
  ): void {
    add(
      assembly,
      id,
      cn,
      layer,
      { type: "kit", kit: "hmt_link", params: { from, to, radius } },
      [0, 0, 0],
      material,
      dual,
    );
  }
  function cylinder(
    assembly: string,
    id: string,
    cn: string,
    pos: number[],
    radius: number,
    height: number,
    material: string,
    dual = false,
    rotation = [0, 0, 90],
    layer: BuildLayer = 2,
  ): void {
    add(
      assembly,
      id,
      cn,
      layer,
      {
        type: "cylinder",
        r: radius,
        h: height,
        segments: layer === 5 ? 16 : 32,
        bevel: layer === 5 ? 0 : 0.001,
      },
      pos,
      material,
      dual,
      rotation,
    );
  }
  function spring(assembly: string, id: string, pos: number[], height: number, dual = true): void {
    add(
      assembly,
      id,
      "窗口内减振弹簧",
      3,
      { type: "kit", kit: "hmt_spring", params: { height, radius: 0.013, wire: 0.0024, turns: 18 } },
      pos,
      "red",
      dual,
    );
  }
  function piston(
    assembly: string,
    id: string,
    from: number[],
    to: number[],
    radius = 0.013,
    dual = true,
  ): void {
    const mid = from.map((v, i) => v + (to[i] - v) * 0.55);
    const rodStart = from.map((v, i) => v + (to[i] - v) * 0.552);
    link(assembly, `${id}_body`, "作动筒缸体", from, mid, radius, "red", dual);
    link(assembly, `${id}_rod`, "作动筒镀铬杆", rodStart, to, radius * 0.53, "chrome", dual);
  }

  // L1：承力主轴与各关节中心。主轴和护甲之间保留看得见的空域。
  link("torso", "spine", "脊柱承力主轴", [0, 1.29, -0.035], [0, 2.08, -0.035], 0.035, "dark", false, 1);
  link(
    "torso",
    "clavicle",
    "肩部横向承力轴",
    [0.038, 1.99, -0.025],
    [0.32, 1.99, -0.025],
    0.027,
    "steel",
    true,
    1,
  );
  add(
    "shoulder",
    "bearing",
    "肩关节轴承",
    1,
    { type: "tube", rOuter: 0.059, rInner: 0.029, h: 0.065, segments: 32 },
    [0.355, 1.99, -0.025],
    "dark",
    true,
    [0, 0, 90],
  );
  cylinder("arms", "elbow", "肘关节", [0.432, 1.655, 0], 0.043, 0.073, "dark", true, [0, 0, 90], 1);
  cylinder("pelvis", "hip", "髋关节", [0.179, 1.235, -0.012], 0.063, 0.075, "dark", true, [0, 0, 90], 1);
  cylinder("legs", "knee", "膝关节", [0.229, 0.681, 0.018], 0.046, 0.091, "dark", true, [0, 0, 90], 1);
  cylinder("feet", "ankle", "踝关节", [0.279, 0.159, -0.007], 0.036, 0.082, "dark", true, [0, 0, 90], 1);

  // L2：骨架、关节环、活塞。闭合车削件与护板分别可选。
  link(
    "torso",
    "abdominal_bridge",
    "胸腰斜向承力支架",
    [0.045, 1.62, -0.061],
    [0.125, 1.735, -0.061],
    0.015,
    "dark",
    true,
  );
  link("arms", "humerus", "上臂骨架", [0.375, 1.925, -0.025], [0.427, 1.703, 0], 0.024, "dark", true);
  link("arms", "radius", "前臂承力杆", [0.437, 1.608, -0.015], [0.44, 1.24, 0.035], 0.018, "dark", true);
  link("legs", "femur", "大腿承力杆", [0.19, 1.17, -0.012], [0.225, 0.731, 0.018], 0.026, "dark", true);
  link("legs", "tibia", "胫骨承力杆", [0.235, 0.631, -0.018], [0.275, 0.2, -0.012], 0.022, "dark", true);
  cylinder("arms", "wrist", "腕部轴套", [0.441, 1.211, 0.035], 0.027, 0.048, "steel", true, [0, 0, 0]);
  cylinder("shoulder", "cap", "肩轴端盖", [0.392, 1.99, -0.025], 0.044, 0.008, "steel", true);
  cylinder("arms", "elbow_cap", "肘轴端盖", [0.473, 1.655, 0], 0.03, 0.006, "chrome", true);
  cylinder("legs", "knee_cap", "膝轴端盖", [0.278, 0.681, 0.018], 0.031, 0.006, "steel", true);
  cylinder("feet", "ankle_cap", "踝轴端盖", [0.324, 0.159, -0.007], 0.025, 0.006, "steel", true);
  piston("shoulder", "diagonal", [0.19, 1.95, 0.055], [0.31, 2.027, 0.044]);
  piston("arms", "upper_actuator", [0.454, 1.905, -0.012], [0.46, 1.717, -0.012], 0.011);
  piston("arms", "fore_actuator", [0.405, 1.584, 0.025], [0.405, 1.36, 0.025], 0.01);
  piston("legs", "thigh_actuator", [0.145, 1.123, 0.018], [0.17, 0.773, 0.018], 0.016);
  piston("legs", "knee_rear", [0.248, 0.805, -0.048], [0.258, 0.606, -0.053], 0.01);
  piston("torso", "waist_actuator", [0.105, 1.36, -0.015], [0.095, 1.663, -0.015], 0.014);
  piston("pelvis", "hip_tie", [0.065, 1.31, 0.022], [0.144, 1.211, 0.06], 0.012);
  piston("head", "neck_tie", [0.051, 2.072, -0.005], [0.038, 2.187, -0.008], 0.009);

  // 三节脊椎是独立腹部模块，后方也保留关节，不填成整块腹甲。
  // [OM-FREEPLAY] 背部腰椎作动筒的安装耳被护板遮挡，补成与下节腰椎相接的短支座。
  link(
    "waist",
    "actuator_mount",
    "腰部作动筒安装支座",
    [0.0615, 1.393, -0.015],
    [0.089, 1.393, -0.015],
    0.004,
    "steel",
    true,
  );
  for (let i = 0; i < 3; i++) {
    const y = 1.393 + i * 0.09;
    add(
      "waist",
      `vertebra_${i}`,
      "腰椎节段轴承",
      2,
      { type: "tube", rOuter: 0.061, rInner: 0.036, h: 0.052, segments: 32 },
      [0, y, -0.035],
      "steel",
    );
    panel(
      "waist",
      `shield_${i}`,
      "腹部独立节甲",
      [
        [-0.065, -0.031],
        [-0.074, 0.019],
        [-0.044, 0.038],
        [0.044, 0.038],
        [0.074, 0.019],
        [0.065, -0.031],
        [0, -0.044],
      ],
      [0, y, 0.035],
      {
        material: "darkArmor",
        rise: 0.018,
        holes: [
          [
            [-0.042, -0.014],
            [-0.045, 0.012],
            [-0.025, 0.017],
            [-0.03, -0.013],
          ],
          [
            [0.042, -0.014],
            [0.045, 0.012],
            [0.025, 0.017],
            [0.03, -0.013],
          ],
        ],
      },
    );
  }

  // 胸部：中央脊甲 + 两翼带孔胸甲 + 腋下斜肋。窗口有厚度和内壁。
  const chestSurface = { rise: 0.055, slope: 0.035, fold: -0.19, ridgeWidth: 0.291 };
  panel(
    "chest",
    "sternum",
    "中央胸骨护甲",
    [
      [-0.048, 0.175],
      [0.048, 0.175],
      [0.045, 0.063],
      [0.071, -0.011],
      [0.035, -0.13],
      [0, -0.155],
      [-0.035, -0.13],
      [-0.071, -0.011],
      [-0.045, 0.063],
    ],
    [0, 1.875, 0.102],
    chestSurface,
  );
  panel(
    "chest",
    "pectoral",
    "胸部开窗侧翼",
    [
      [0.052, 0.17],
      [0.067, 0.175],
      [0.091, 0.119],
      [0.241, 0.056],
      [0.291, 0.004],
      [0.262, -0.049],
      [0.205, -0.105],
      [0.085, -0.08],
      [0.075, -0.012],
      [0.05, 0.062],
    ],
    [0, 1.875, 0.102],
    {
      ...chestSurface,
      dual: true,
      holes: [
        [
          [0.103, 0.092],
          [0.204, 0.045],
          [0.154, -0.002],
          [0.095, 0.026],
        ],
      ],
    },
  );
  panel(
    "chest",
    "lower_shell",
    "胸廓下缘护甲",
    [
      [-0.084, -0.085],
      [-0.195, -0.11],
      [-0.19, -0.166],
      [-0.087, -0.218],
      [0, -0.224],
      [0.087, -0.218],
      [0.19, -0.166],
      [0.195, -0.11],
      [0.084, -0.085],
      [0.04, -0.137],
      [0, -0.163],
      [-0.04, -0.137],
    ],
    [0, 1.875, 0.102],
    chestSurface,
  );
  panel(
    "chest",
    "under_rib",
    "腋下黑色支架",
    [
      [-0.04, 0.1],
      [0.044, 0.07],
      [0.025, -0.075],
      [-0.021, -0.09],
    ],
    [0.208, 1.816, 0.008],
    { dual: true, material: "dark", rise: 0.012, rotation: [0, 52, -16], layer: 2 },
  );
  panel(
    "chest",
    "collar",
    "颈部开窗领甲",
    [
      [-0.054, 0.082],
      [0.006, 0.117],
      [0.049, 0.016],
      [0.101, -0.038],
      [0.042, -0.063],
      [-0.033, -0.013],
    ],
    [0.103, 2.018, 0.045],
    {
      dual: true,
      rise: 0.018,
      rotation: [0, 23, -8],
      holes: [
        [
          [-0.018, 0.033],
          [0.014, 0.055],
          [0.039, 0.002],
          [0.002, -0.014],
        ],
      ],
    },
  );
  panel(
    "back",
    "scapula",
    "背部肩胛护板",
    [
      [-0.068, 0.143],
      [0.091, 0.119],
      [0.153, 0.042],
      [0.129, -0.047],
      [0.035, -0.116],
      [-0.042, -0.09],
    ],
    [0.18, 1.891, -0.1],
    {
      dual: true,
      rotation: [0, 180, 0],
      rise: 0.039,
      holes: [
        [
          [-0.013, 0.09],
          [0.064, 0.079],
          [0.051, 0.03],
          [0.007, 0.035],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  panel(
    "back",
    "spinal_cover",
    "背部中央龙骨护板",
    [
      [-0.058, 0.095],
      [0.058, 0.095],
      [0.076, -0.029],
      [0.026, -0.143],
      [0, -0.175],
      [-0.026, -0.143],
      [-0.076, -0.029],
    ],
    [0, 1.827, -0.14],
    {
      rotation: [0, 180, 0],
      rise: 0.028,
      holes: [
        [
          [-0.019, -0.056],
          [0.019, -0.056],
          [0.014, -0.105],
          [-0.014, -0.105],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  for (let i = 0; i < 3; i++) {
    link(
      "torso",
      `rib_${i}`,
      "胸廓斜支撑",
      [0.057, 1.715 + i * 0.069, -0.031],
      [0.223, 1.79 + i * 0.062, -0.035],
      0.009,
      "steel",
      true,
    );
  }
  // 肩甲是中间高、外侧落的罩壳，与胸翼和上臂之间留关节窗口。
  panel(
    "chest",
    "flank",
    "胸腔侧面包覆",
    [
      [-0.08, 0.12],
      [0.053, 0.115],
      [0.073, 0.032],
      [0.04, -0.13],
      [-0.027, -0.153],
      [-0.062, -0.045],
    ],
    [0.253, 1.826, -0.026],
    {
      dual: true,
      rotation: [0, 90, -13],
      rise: 0.022,
      holes: [
        [
          [-0.032, 0.055],
          [0.028, 0.055],
          [0.019, -0.018],
          [-0.019, -0.055],
        ],
      ],
      direction: [1, 0, 0],
    },
  );
  panel(
    "shoulder",
    "pauldron",
    "肩部折面罩甲",
    [
      [-0.096, 0.033],
      [-0.043, 0.074],
      [0.045, 0.057],
      [0.095, -0.054],
      [0.042, -0.065],
      [-0.069, -0.017],
    ],
    [0.361, 2.057, 0.048],
    {
      dual: true,
      rise: 0.052,
      slope: 0.26,
      holes: [
        [
          [-0.045, 0.032],
          [0.018, 0.028],
          [0.045, 0.006],
          [-0.015, 0.012],
        ],
      ],
      direction: [0, 1, 0.4],
    },
  );
  panel(
    "shoulder",
    "rear_shell",
    "肩后罩甲",
    [
      [-0.075, 0.034],
      [-0.03, 0.064],
      [0.052, 0.044],
      [0.084, -0.055],
      [0.024, -0.065],
      [-0.066, -0.018],
    ],
    [0.366, 2.05, -0.087],
    { dual: true, rise: 0.031, rotation: [0, 180, 0], direction: [0, 1, -0.5] },
  );
  link(
    "shoulder",
    "red_brace",
    "肩下红色拉杆",
    [0.29, 1.932, 0.039],
    [0.405, 1.932, 0.045],
    0.008,
    "red",
    true,
  );
  panel(
    "shoulder",
    "outer_shell",
    "肩外侧包边",
    [
      [-0.063, 0.025],
      [-0.035, 0.075],
      [0.042, 0.055],
      [0.065, -0.031],
      [0.035, -0.059],
      [-0.044, -0.051],
    ],
    [0.435, 2.037, -0.015],
    { dual: true, rotation: [0, 90, 0], rise: 0.013, direction: [1, 1, 0] },
  );

  // 上臂及前臂：长开窗看见内部活塞，侧壁与背罩独立。
  panel(
    "arms",
    "upper_shell",
    "上臂前罩",
    [
      [-0.035, 0.122],
      [0.032, 0.105],
      [0.059, 0.024],
      [0.03, -0.111],
      [-0.031, -0.129],
      [-0.054, -0.038],
    ],
    [0.413, 1.803, 0.052],
    {
      dual: true,
      rise: 0.019,
      holes: [
        [
          [-0.021, 0.056],
          [0.012, 0.043],
          [0.027, -0.051],
          [-0.012, -0.069],
        ],
      ],
    },
  );
  panel(
    "arms",
    "upper_rear",
    "上臂后罩",
    [
      [-0.03, 0.116],
      [0.03, 0.1],
      [0.043, 0.005],
      [0.022, -0.11],
      [-0.028, -0.115],
      [-0.04, -0.02],
    ],
    [0.412, 1.803, -0.066],
    { dual: true, rise: 0.017, rotation: [0, 180, 0], direction: [0, 0, -1] },
  );
  panel(
    "arms",
    "fore_shell",
    "前臂开窗框架",
    [
      [-0.045, 0.166],
      [0.035, 0.15],
      [0.056, 0.065],
      [0.029, -0.178],
      [-0.026, -0.187],
      [-0.053, -0.065],
    ],
    [0.441, 1.421, 0.061],
    {
      dual: true,
      rise: 0.018,
      holes: [
        [
          [-0.029, 0.111],
          [0.024, 0.09],
          [0.02, -0.045],
          [-0.016, -0.011],
        ],
        [
          [-0.009, -0.064],
          [0.015, -0.08],
          [0.012, -0.148],
          [-0.015, -0.153],
        ],
      ],
    },
  );
  panel(
    "arms",
    "fore_back",
    "前臂背罩",
    [
      [-0.035, 0.152],
      [0.031, 0.13],
      [0.044, 0.045],
      [0.022, -0.177],
      [-0.025, -0.176],
      [-0.043, -0.025],
    ],
    [0.446, 1.421, -0.05],
    {
      dual: true,
      rise: 0.018,
      rotation: [0, 180, 0],
      holes: [
        [
          [-0.018, 0.07],
          [0.022, 0.048],
          [0.014, -0.061],
          [-0.015, -0.091],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  spring("arms", "upper_spring", [0.413, 1.803, 0.047], 0.129);
  panel(
    "arms",
    "upper_side",
    "上臂外侧护板",
    [
      [-0.042, 0.108],
      [0.038, 0.108],
      [0.05, 0.034],
      [0.027, -0.113],
      [-0.025, -0.113],
      [-0.044, -0.027],
    ],
    [0.469, 1.808, -0.004],
    {
      dual: true,
      rotation: [0, 90, -7],
      rise: 0.008,
      holes: [
        [
          [-0.016, 0.057],
          [0.022, 0.047],
          [0.013, -0.055],
          [-0.014, -0.064],
        ],
      ],
      direction: [1, 0, 0],
    },
  );
  panel(
    "arms",
    "fore_side",
    "前臂外侧纵梁",
    [
      [-0.038, 0.137],
      [0.039, 0.126],
      [0.046, 0.048],
      [0.024, -0.16],
      [-0.026, -0.168],
      [-0.04, -0.02],
    ],
    [0.483, 1.425, 0.013],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.006,
      holes: [
        [
          [-0.017, 0.08],
          [0.02, 0.067],
          [0.009, -0.081],
          [-0.013, -0.107],
        ],
      ],
      direction: [1, 0, 0],
    },
  );
  // 骨盆在腰下向两侧挑起，裆甲与髋关节分开。
  panel(
    "pelvis",
    "iliac",
    "髂骨开窗护框",
    [
      [-0.07, 0.026],
      [0.035, 0.069],
      [0.091, 0.026],
      [0.071, -0.053],
      [-0.015, -0.031],
      [-0.066, -0.013],
    ],
    [0.109, 1.324, 0.057],
    {
      dual: true,
      rise: 0.022,
      holes: [
        [
          [-0.031, 0.014],
          [0.027, 0.044],
          [0.051, 0.012],
          [0.01, -0.012],
        ],
      ],
    },
  );
  panel(
    "pelvis",
    "codpiece",
    "中央盆骨护甲",
    [
      [-0.065, 0.048],
      [0, 0.021],
      [0.065, 0.048],
      [0.044, -0.077],
      [0, -0.106],
      [-0.044, -0.077],
    ],
    [0, 1.267, 0.092],
    { rise: 0.035 },
  );
  panel(
    "pelvis",
    "rear_bridge",
    "后骨盆开窗框架",
    [
      [-0.166, 0.016],
      [-0.119, 0.064],
      [0, 0.02],
      [0.119, 0.064],
      [0.166, 0.016],
      [0.112, -0.041],
      [0.025, -0.027],
      [0, -0.084],
      [-0.025, -0.027],
      [-0.112, -0.041],
    ],
    [0, 1.304, -0.085],
    {
      rotation: [0, 180, 0],
      rise: 0.013,
      holes: [
        [
          [-0.109, 0.027],
          [-0.048, 0.006],
          [-0.113, -0.014],
        ],
        [
          [0.109, 0.027],
          [0.048, 0.006],
          [0.113, -0.014],
        ],
      ],
      direction: [0, 0, -1],
    },
  );

  // 大腿外侧是承重斜面，前方长窗与上部梯形窗不连成一块黑贴纸。
  panel(
    "legs",
    "thigh_front",
    "大腿开窗前甲",
    [
      [-0.067, 0.228],
      [-0.035, 0.253],
      [0.021, 0.229],
      [0.064, 0.107],
      [0.055, -0.065],
      [0.022, -0.237],
      [-0.031, -0.228],
      [-0.055, -0.118],
      [-0.081, 0.067],
    ],
    [0.216, 0.981, 0.052],
    {
      dual: true,
      rise: 0.033,
      holes: [
        [
          [-0.034, 0.201],
          [-0.007, 0.192],
          [0.009, 0.116],
          [-0.025, 0.108],
        ],
        [
          [-0.035, 0.023],
          [0.018, -0.011],
          [0.008, -0.154],
          [-0.022, -0.176],
        ],
      ],
    },
  );
  panel(
    "legs",
    "thigh_side",
    "大腿外侧包覆甲",
    [
      [-0.047, 0.205],
      [0.018, 0.22],
      [0.06, 0.101],
      [0.037, -0.186],
      [-0.025, -0.218],
      [-0.049, -0.032],
    ],
    [0.284, 0.988, -0.006],
    { dual: true, rotation: [0, 88, 0], rise: 0.018 },
  );
  panel(
    "legs",
    "thigh_back",
    "大腿后侧分件",
    [
      [-0.049, 0.209],
      [0.032, 0.221],
      [0.058, 0.058],
      [0.022, -0.186],
      [-0.033, -0.205],
      [-0.061, 0.034],
    ],
    [0.213, 0.986, -0.074],
    {
      dual: true,
      rotation: [0, 180, 0],
      rise: 0.021,
      holes: [
        [
          [-0.025, 0.094],
          [0.023, 0.092],
          [0.015, -0.098],
          [-0.018, -0.136],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  panel(
    "legs",
    "patella",
    "独立膝部护甲",
    [
      [-0.051, 0.04],
      [0.034, 0.044],
      [0.045, -0.012],
      [0.019, -0.049],
      [-0.032, -0.038],
    ],
    [0.228, 0.694, 0.067],
    { dual: true, rise: 0.02 },
  );
  // 小腿下窄、上段外鼓；窗口露出红簧；踝部三角口贯通。
  panel(
    "legs",
    "shin_front",
    "小腿前甲与弹簧窗",
    [
      [-0.04, 0.229],
      [0.028, 0.228],
      [0.059, 0.115],
      [0.046, 0.015],
      [0.014, -0.214],
      [-0.027, -0.229],
      [-0.055, -0.065],
      [-0.065, 0.1],
    ],
    [0.258, 0.403, 0.056],
    {
      dual: true,
      rise: 0.027,
      holes: [
        [
          [-0.026, 0.114],
          [0.02, 0.077],
          [0.014, -0.068],
          [-0.007, -0.108],
          [-0.028, -0.044],
        ],
        [
          [-0.019, -0.163],
          [0.007, -0.147],
          [0.008, -0.194],
          [-0.014, -0.202],
        ],
      ],
    },
  );
  panel(
    "legs",
    "calf_back",
    "小腿后罩",
    [
      [-0.041, 0.217],
      [0.031, 0.221],
      [0.058, 0.103],
      [0.035, -0.067],
      [0.018, -0.216],
      [-0.028, -0.224],
      [-0.052, -0.024],
    ],
    [0.256, 0.425, -0.068],
    {
      dual: true,
      rise: 0.024,
      rotation: [0, 180, 0],
      holes: [
        [
          [-0.027, 0.1],
          [0.022, 0.071],
          [0.01, -0.088],
          [-0.014, -0.121],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  spring("legs", "calf_spring", [0.258, 0.43, 0.035], 0.179);
  spring("legs", "thigh_spring", [0.202, 0.92, 0.06], 0.19);
  // 脚跟 + 三根独立脚趾；每趾有承力骨、趾面和红色回位机构。
  panel(
    "feet",
    "heel",
    "脚跟承重壳",
    [
      [-0.06, -0.025],
      [-0.05, 0.055],
      [0, 0.079],
      [0.052, 0.049],
      [0.065, -0.022],
    ],
    [0.279, 0.04, -0.061],
    { dual: true, rise: 0.013, thickness: 0.045 },
  );
  for (let i = 0; i < 3; i++) {
    const x = 0.279 + (i - 1) * 0.048;
    const length = i === 1 ? 0.208 : 0.185;
    link("feet", `toe_core_${i}`, "脚趾承力梁", [x, 0.054, 0.002], [x, 0.037, length], 0.011, "dark", true);
    // 旋转后原面板 y 轴成为脚掌纵向，表面朝上。
    panel(
      "feet",
      `toe_${i}`,
      "分趾上护板",
      [
        [-0.017, -0.082],
        [-0.021, 0.049],
        [-0.013, 0.102],
        [0.013, 0.102],
        [0.021, 0.049],
        [0.017, -0.082],
      ],
      [x, 0.078, 0.1],
      {
        dual: true,
        rotation: [-90, 0, 0],
        rise: 0.008,
        holes: [
          [
            [-0.007, -0.047],
            [0.007, -0.047],
            [0.007, 0.035],
            [-0.007, 0.047],
          ],
        ],
        direction: [0, 1, 0.3],
      },
    );
    piston("feet", `toe_return_${i}`, [x, 0.071, 0.018], [x, 0.071, 0.145], 0.005);
  }
  // 手掌、拇指和四指各有独立指骨；不把手做成拳头块。
  panel(
    "hands",
    "palm",
    "机械掌背",
    [
      [-0.039, 0.047],
      [0.035, 0.048],
      [0.044, -0.014],
      [0.026, -0.049],
      [-0.034, -0.044],
      [-0.047, 0.008],
    ],
    [0.445, 1.132, 0.059],
    {
      dual: true,
      rise: 0.013,
      holes: [
        [
          [-0.02, 0.022],
          [0.019, 0.025],
          [0.024, -0.018],
          [-0.018, -0.022],
        ],
      ],
    },
  );
  panel(
    "hands",
    "palm_back",
    "掌心支承",
    [
      [-0.035, 0.036],
      [0.033, 0.035],
      [0.033, -0.036],
      [-0.031, -0.033],
    ],
    [0.445, 1.14, 0.004],
    { dual: true, material: "dark", rise: 0.006, rotation: [0, 180, 0], layer: 2 },
  );
  for (let finger = 0; finger < 4; finger++) {
    const x = 0.412 + finger * 0.022;
    const y = 1.095 - Math.abs(finger - 1.5) * 0.008;
    const points = [
      [x, y, 0.032],
      [x, y - 0.038, 0.046],
      [x, y - 0.064, 0.068],
      [x, y - 0.068, 0.092],
    ];
    for (let j = 0; j < 3; j++) {
      const a = points[j],
        b = points[j + 1];
      const length = Math.hypot(...b.map((v, k) => v - a[k]));
      const from = a.map((v, k) => v + ((b[k] - v) * 0.0095) / length);
      const to = b.map((v, k) => v - ((v - a[k]) * (j === 2 ? 0.001 : 0.0095)) / length);
      link("hands", `finger_${finger}_${j}`, "独立指节", from, to, 0.0075, "steel", true, 3);
      cylinder(
        "hands",
        `knuckle_${finger}_${j}`,
        "指节转轴",
        points[j],
        0.009,
        0.018,
        "dark",
        true,
        [0, 0, 90],
        3,
      );
    }
    link(
      "hands",
      `tendon_${finger}`,
      "掌背指伸肌杆",
      [x, 1.165, 0.084],
      [x, y + 0.009, 0.084],
      0.003,
      "chrome",
      true,
      3,
    );
  }
  link(
    "hands",
    "thumb_base",
    "拇指基节",
    [0.399, 1.147, 0.033],
    [0.382, 1.131, 0.05],
    0.011,
    "steel",
    true,
    3,
  );
  link(
    "hands",
    "thumb_tip",
    "拇指末节",
    [0.382, 1.124, 0.06],
    [0.389, 1.088, 0.083],
    0.009,
    "steel",
    true,
    3,
  );

  // 头部依据白模近景：后脑体积、前额下切、两颊独立、尖下颌和颈部空隙。
  cylinder("head", "neck", "颈部中心轴", [0, 2.136, -0.025], 0.027, 0.1, "dark", false, [0, 0, 0], 1);
  add(
    "head",
    "cranium",
    "后脑与顶壳",
    4,
    {
      type: "kit",
      kit: "hmt_loft",
      params: {
        sections: [
          [2.245, 0.059, 0.056, -0.026],
          [2.3, 0.082, 0.066, -0.026],
          [2.355, 0.086, 0.067, -0.024],
          [2.389, 0.052, 0.049, -0.018],
          [2.4, 0.016, 0.022, -0.01],
        ],
      },
    },
    [0, 0, 0],
    "armor",
    false,
    [0, 0, 0],
    [0, 1, -0.5],
  );
  panel(
    "head",
    "brow",
    "中央面甲与眉脊",
    [
      [-0.071, 0.076],
      [-0.037, 0.099],
      [0.037, 0.099],
      [0.071, 0.076],
      [0.082, 0.011],
      [0.049, -0.027],
      [0.019, -0.049],
      [0, -0.075],
      [-0.019, -0.049],
      [-0.049, -0.027],
      [-0.082, 0.011],
    ],
    [0, 2.285, 0.044],
    {
      rise: 0.041,
      holes: [
        [
          [-0.052, 0.062],
          [-0.03, 0.072],
          [-0.02, 0.047],
          [-0.044, 0.033],
        ],
        [
          [0.052, 0.062],
          [0.03, 0.072],
          [0.02, 0.047],
          [0.044, 0.033],
        ],
      ],
      slope: -0.04,
    },
  );
  panel(
    "head",
    "cheek",
    "独立颊甲",
    [
      [-0.017, 0.034],
      [0.023, 0.016],
      [0.019, -0.039],
      [-0.013, -0.05],
      [-0.03, -0.019],
    ],
    [0.061, 2.213, 0.042],
    {
      dual: true,
      rise: 0.01,
      rotation: [0, 25, 0],
      holes: [
        [
          [-0.009, 0.011],
          [0.01, 0.001],
          [0.008, -0.02],
          [-0.007, -0.021],
        ],
      ],
    },
  );
  panel(
    "head",
    "jaw",
    "下颌中央护板",
    [
      [-0.015, 0.044],
      [0.015, 0.044],
      [0.019, 0.002],
      [0.051, -0.02],
      [0.032, -0.052],
      [0, -0.063],
      [-0.032, -0.052],
      [-0.051, -0.02],
      [-0.019, 0.002],
    ],
    [0, 2.198, 0.091],
    { rise: 0.025 },
  );
  cylinder("head", "jaw_hinge", "下颌侧轴", [0.065, 2.218, -0.006], 0.014, 0.014, "red", true);
  link(
    "head",
    "jaw_tendon",
    "颊部外露连杆",
    [0.077, 2.258, 0.007],
    [0.078, 2.19, 0.012],
    0.004,
    "red",
    true,
    3,
  );
  add(
    "head",
    "optic",
    "暖白视觉传感器",
    5,
    { type: "box", w: 0.015, h: 0.006, d: 0.005, bevel: 0.001 },
    [0.061, 2.272, 0.082],
    "optic",
    true,
    [0, 15, -12],
  );
  for (let i = 0; i < 4; i++) {
    add(
      "head",
      `crown_vent_${i}`,
      "头顶散热缝",
      5,
      { type: "box", w: 0.032, h: 0.002, d: 0.004, bevel: 0.0005 },
      [0, 2.395 - i * 0.003, -0.025 + i * 0.012],
      "dark",
    );
  }
  // 自内向外排序，所有实例沿用展示台的构建、隔离和拆解管道。
  parts.sort((a, b) => a.build_layer - b.build_layer || a.build_order - b.build_order);
  parts.forEach((p, i) => {
    p.build_order = i + 100;
  });
  const names: Record<string, string> = {
    torso: "胸廓承力骨架",
    waist: "三节腰椎",
    chest: "前胸护甲",
    back: "背部护甲",
    shoulder: "肩部关节与罩甲",
    arms: "双臂",
    hands: "机械手",
    pelvis: "骨盆",
    legs: "双腿",
    feet: "踝与分趾脚",
    head: "头颈",
  };
  return {
    model: "hmt",
    title: "HMT · 双足机器人",
    source_notes: source + "；2.4m 仅为展示尺度。",
    constants,
    assemblies: Object.entries(names).map(([id, name_cn]) => ({
      id,
      name_cn,
      name_en: id,
      explode: [0, 0, 1],
    })),
    nodes: [],
    parts,
    materials: {
      armor: {
        base: "#464d50",
        metalness: 0.62,
        roughness: 0.4,
        preset: "none",
        clearcoat: 0.25,
        clearcoatRoughness: 0.3,
      },
      darkArmor: { base: "#22272a", metalness: 0.72, roughness: 0.42, preset: "none" },
      dark: { base: "#14191c", metalness: 0.72, roughness: 0.43, preset: "none" },
      steel: { base: "#687174", metalness: 0.88, roughness: 0.32, preset: "none" },
      chrome: { base: "#bec7ca", metalness: 0.96, roughness: 0.21, preset: "none" },
      red: { base: "#80252c", metalness: 0.75, roughness: 0.35, preset: "none", clearcoat: 0.25 },
      fastener: { base: "#939da0", metalness: 0.94, roughness: 0.22, preset: "none" },
      optic: {
        base: "#ffe9cf",
        metalness: 0.2,
        roughness: 0.2,
        emissive: "#ffd5ab",
        emissiveIntensity: 1.8,
        preset: "none",
      },
    },
  };
}
