import type {
  BuildLayer,
  Expr,
  GeometrySpec,
  KitParam,
  ModelRegistry,
  PartDefinition,
} from "../../registry/types";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { createHmtRestPose } from "./restPose";
import { shellPoint, shellNormal } from "./geometry";
import { machinedIds } from "./machined";
import { resolveSpec } from "../../assembler/geometry";
import { resolveConstants } from "../../registry/expression";
type V3 = [number, number, number];
type Loop = number[][];
interface ShellOptions {
  dual?: boolean;
  rotation?: V3;
  material?: string;
  holes?: Loop[];
  thickness?: number;
  rise?: number;
  slope?: number;
  fold?: number;
  width?: number;
  bulges?: number[][];
  corner?: number;
  bevel?: number;
  pins?: Loop;
  latches?: Loop;
  rim?: number;
  liner?: boolean;
  direction?: V3;
  layer?: BuildLayer;
  form?: string;
  edge?: number;
  relief?: string;
  segmented?: boolean;
}
/**
 * Vitaly Bulgarov / HMT 2-xm-robotdesign，用户指定深灰红色版本。
 * 直接形体依据：22 正面、23–28 深灰全身，2/4/5/6 头部白模，10/11 胸背，
 * 12–17 腰腿、19–21 手部；尺寸以这些视图的比例重建。
 * [OM-FREEPLAY] 2.4m 仅为无标尺图片的归一化展示尺度，内部被遮挡的走线沿可见接口连接。
 */
export function makeHmtRegistry(options: { machined?: boolean } = {}): ModelRegistry {
  const constants: Record<string, Expr> = { HEIGHT: 2.4 },
    parts: PartDefinition[] = [];
  let order = 0;
  const restPose = createHmtRestPose();
  const shellSurfaces = new Map<
    string,
    {
      params: Record<string, unknown>;
      position: V3;
      rotation: V3;
    }
  >();
  const source = "Vitaly Bulgarov / HMT，用户提供 2-xm-robotdesign 同款多视图；比例测绘";
  function param(key: string, value: unknown): KitParam {
    if (typeof value === "number") {
      const dimensionless = /_SEGMENTS$|_(SLOPE|FOLD|TURNS)$|_[RE]_\d$/.test(key);
      constants[key] = dimensionless ? value.toFixed(9) : "(" + value.toFixed(9) + ")*HEIGHT/2.4";
      return key;
    }
    if (Array.isArray(value)) return value.map((v, i) => param(key + "_" + i, v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, param(key + "_" + k.toUpperCase(), v)]),
      );
    return value as string | boolean;
  }
  function add(
    assembly: string,
    id: string,
    name: string,
    geometry: GeometrySpec,
    pos: V3,
    material = "armor",
    dual = false,
    rotation: V3 = [0, 0, 0],
    layer: BuildLayer = 4,
    direction: V3 = [0, 0, 1],
    alreadyPosed = false,
  ) {
    const originalId = id;
    id = id.replaceAll("-", "neg").replaceAll(".", "p");
    const key = (assembly + "_" + id).toUpperCase();
    if (geometry.type === "cylinder") {
      geometry = {
        type: "kit",
        kit: "hmt_turn",
        params: {
          r: geometry.r,
          h: geometry.h,
          segments: geometry.segments ?? 96,
          bevel: geometry.bevel ?? 0,
        },
      };
    }
    const shape = param(key + "_G", geometry) as unknown as GeometrySpec;
    for (const side of dual ? [1, -1] : [1]) {
      const suffix = dual ? (side === 1 ? "_l" : "_r") : "";
      const partKey = key + suffix.toUpperCase();
      const position = new Vector3(pos[0] * side, pos[1], pos[2]);
      const q = new Quaternion().setFromEuler(
        new Euler(
          (rotation[0] * Math.PI) / 180,
          (rotation[1] * side * Math.PI) / 180,
          (rotation[2] * side * Math.PI) / 180,
        ),
      );
      const matrix = alreadyPosed ? new Matrix4() : restPose.matrix(assembly, originalId, side, pos[1]);
      const placed = matrix.clone().multiply(new Matrix4().compose(position, q, new Vector3(1, 1, 1)));
      placed.decompose(position, q, new Vector3());
      const angles = new Euler().setFromQuaternion(q);
      const outward = new Vector3(direction[0] * side, direction[1], direction[2]).transformDirection(matrix);
      parts.push({
        id: "hmt." + assembly + "." + id + suffix,
        name_cn: name,
        name_en: id.replaceAll("_", " "),
        assembly,
        build_layer: layer,
        build_order: ++order,
        geometry: side === -1 ? { ...shape, mirror: "x" } : shape,
        material,
        mate: {
          type: "absolute",
          position: param(partKey + "_P", position.toArray()) as [Expr, Expr, Expr],
          rotation: param(
            partKey + "_R",
            [angles.x, angles.y, angles.z].map((v) => (v * 180) / Math.PI),
          ) as [Expr, Expr, Expr],
        },
        explode: {
          direction: param(partKey + "_E", outward.toArray()) as [Expr, Expr, Expr],
          distance: param(partKey + "_D", layer <= 2 ? 0.035 : 0.15 + layer * 0.038) as Expr,
        },
        source,
      });
    }
  }

  // 接线和斜撑从承接壳的实际曲面取锚点，避免收腰、抬颌后仍使用旧的空间端点。
  function shellAnchor(key: string, x: number, y: number, depth: number): V3 {
    const surface = shellSurfaces.get(key);
    if (!surface) throw new Error("缺少承接壳：" + key);
    return shellPoint(surface.params, x, y, depth)
      .applyEuler(new Euler(...(surface.rotation.map((v) => (v * Math.PI) / 180) as V3)))
      .add(new Vector3(...surface.position))
      .toArray() as V3;
  }
  function bolt(a: string, id: string, pos: V3, rotation: V3 = [0, 0, 0], dual = false, r = 0.0032) {
    add(
      a,
      id,
      "内六角沉孔紧固件",
      { type: "kit", kit: "hmt_bolt", params: { radius: r } },
      pos,
      "fastener",
      dual,
      rotation,
      5,
    );
  }
  function shell(a: string, id: string, name: string, outline: Loop, pos: V3, o: ShellOptions = {}) {
    // 分缝落在两组窗口之间的实心梁上，保留各窗口完整孔壁；两块各自可拆。
    if (!o.segmented && ((a === "arms" && id === "fore_shell") || (a === "legs" && id === "thigh"))) {
      const cut = a === "arms" ? -0.095 : 0.04;
      // 分缝还需容纳两侧向外扩出的倒角，防止名义分开但实体仍互相叠入。
      const gap = 2 * ((o.bevel ?? 0.0024) + (o.rim ?? 0)) + 0.003;
      const clip = (loop: Loop, sign: number) => {
        const level = cut + (sign * gap) / 2;
        const result: Loop = [];
        for (let i = 0; i < loop.length; i++) {
          const p = loop[i],
            q = loop[(i + 1) % loop.length];
          const insideP = sign * (p[1] - level) >= 0;
          const insideQ = sign * (q[1] - level) >= 0;
          if (insideP) result.push(p);
          if (insideP !== insideQ) {
            const t = (level - p[1]) / (q[1] - p[1]);
            result.push([p[0] + t * (q[0] - p[0]), level]);
          }
        }
        return result;
      };
      for (const sign of [1, -1]) {
        const keep = (p: number[]) => sign * (p[1] - cut) > 0;
        const holes = (o.holes ?? []).filter((loop) => loop.every(keep));
        if ((o.holes ?? []).some((loop) => loop.some(keep) && !loop.every(keep)))
          throw new Error(id + " 分缝切过窗口");
        shell(
          a,
          sign === 1 ? id : id + "_distal",
          name + (sign === 1 ? "·近端分片" : "·远端分片"),
          clip(outline, sign),
          pos,
          {
            ...o,
            segmented: true,
            holes,
            pins: o.pins?.filter(keep),
            latches: o.latches?.filter(keep),
            width: o.width ?? Math.max(...outline.map(([x]) => Math.abs(x))),
            rotation: [o.rotation?.[0] ?? 0, (o.rotation?.[1] ?? 0) + 6, o.rotation?.[2] ?? 0],
          },
        );
      }
      return;
    }
    const relief =
      a === "back"
        ? "scapula"
        : a === "pelvis"
          ? "pelvis"
          : a === "waist" && id.startsWith("rear_link_")
            ? "vertebra"
            : a === "chest" && id === "pectoral_plate"
              ? "pectoral"
              : a === "chest" && id.includes("collar")
                ? "collar"
                : a === "hands" && id === "palm"
                  ? "palm"
                  : a === "head" && id === "occipital"
                    ? "occipital"
                    : ["arms", "legs"].includes(a) && !id.includes("latch")
                      ? "limb"
                      : undefined;
    o = { ...o, relief: o.relief ?? relief };
    // 腰骨保持确认姿态，只错开三片外甲，使弯腰后的下两片不互相遮住，顶片露出缸体前方。
    if (a === "waist" && id === "vertebra_0") pos = [pos[0], pos[1], pos[2] + 0.014];
    if (a === "waist" && id === "vertebra_1") pos = [pos[0], pos[1] + 0.04, pos[2] + 0.035];
    if (a === "waist" && id === "vertebra_2") pos = [pos[0], pos[1] + 0.055, pos[2] + 0.065];
    if (a === "waist" && id === "rear_link_0") pos = [pos[0], pos[1] + 0.024, pos[2] + 0.025];
    if (a === "legs" && id === "thigh_side") pos = [pos[0] + 0.015, pos[1] + 0.125, pos[2]];
    if (a === "chest" && id === "carapace") {
      // 收短胸骨上下端，给锁骨层与下肋层留出真实台阶，而非一块竖长面板。
      const chestProfile = (loop: Loop) =>
        loop.map(([x, y]) => [
          x,
          y > 0.05 ? 0.05 + (y - 0.05) * 0.95 : y < -0.09 ? -0.09 + (y + 0.09) * 0.5 : y,
        ]);
      outline = chestProfile(outline);
      o = { ...o, holes: o.holes?.map(chestProfile), pins: o.pins ? chestProfile(o.pins) : undefined };
    }
    if (a === "back" && ["carapace", "scapular_plate"].includes(id)) o = { ...o, form: "back" };
    // 白模的下半脸短于额颅；下颌、颊框和鼻梁连同孔与螺钉一起收短。
    if (a === "head" && ["jaw", "cheek", "face_bridge"].includes(id)) {
      const lowerFace = (loop: Loop) => loop.map(([x, y]) => [x, y * 0.75]);
      outline = lowerFace(outline);
      o = { ...o, holes: o.holes?.map(lowerFace), pins: o.pins ? lowerFace(o.pins) : undefined };
    }
    // 腰椎外壳、开窗和紧固件一起收窄，保留三节独立结构。
    if (a === "waist") {
      const narrow = (loop: Loop) => loop.map(([x, y]) => [x * 0.7, y * 0.66]);
      outline = narrow(outline);
      pos = [pos[0] * 0.7, pos[1], pos[2]];
      o = {
        ...o,
        width: o.width === undefined ? undefined : o.width * 0.7,
        holes: o.holes?.map(narrow),
        pins: o.pins ? narrow(o.pins) : undefined,
      };
    }
    if (a === "shoulder" && id === "outer_shell") {
      const taper = (loop: Loop) => loop.map(([x, y]) => [x * 0.82, y * 0.85]);
      outline = taper(outline);
      o = { ...o, holes: o.holes?.map(taper), pins: o.pins ? taper(o.pins) : undefined };
    }
    if (a === "arms" && ["upper_shell", "upper_rear"].includes(id)) {
      // 肩甲不加宽；上臂近端连同孔、安装点加厚展开，向肘端收束。
      const shoulderVolume = (loop: Loop) =>
        loop.map(([x, y]) => [
          x * (1.08 + 0.12 * Math.max(0, Math.min(1, (y + 0.14) / 0.275))),
          y > 0 ? y * 1.1 : y,
        ]);
      outline = shoulderVolume(outline);
      o = {
        ...o,
        form: "limb",
        edge: 0.003,
        holes: o.holes?.map(shoulderVolume),
        pins: o.pins ? shoulderVolume(o.pins) : undefined,
        latches: o.latches ? shoulderVolume(o.latches) : undefined,
      };
    }
    if (a === "legs" && ["thigh", "thigh_distal", "thigh_back"].includes(id)) {
      // 大腿中上段收敛，膝上端保持宽度，避免壳体与膝轴之间突然变细。
      const thighVolume = (loop: Loop) =>
        loop.map(([x, y]) => [x * (0.88 + 0.12 * Math.max(0, Math.min(1, (-y - 0.08) / 0.14))), y]);
      outline = thighVolume(outline);
      o = {
        ...o,
        rise: (o.rise ?? 0.035) * 0.84,
        holes: o.holes?.map(thighVolume),
        pins: o.pins ? thighVolume(o.pins) : undefined,
        latches: o.latches ? thighVolume(o.latches) : undefined,
      };
    }
    const width = o.width ?? Math.max(...outline.map((p) => Math.abs(p[0])));
    const p = {
      outline,
      holes: o.holes ?? [],
      thickness: o.thickness ?? 0.014,
      bevel: o.bevel ?? 0.0024,
      corner: o.corner ?? 0.009,
      rise: o.rise ?? 0.025,
      slope: o.slope ?? 0,
      fold: o.fold ?? 0,
      width,
      round: 0.007,
      bulges: o.bulges ?? [],
      edge: o.edge ?? 0.006,
      form: o.form ?? "cast",
      relief: o.relief ?? "none",
      reliefScale: 0.1,
      rim: o.rim ?? 0,
    };
    shellSurfaces.set(a + "." + id, { params: p, position: pos, rotation: o.rotation ?? [0, 0, 0] });
    add(
      a,
      id,
      name,
      { type: "kit", kit: "hmt_shell", params: p },
      pos,
      o.material ?? "armor",
      o.dual,
      o.rotation,
      o.layer ?? 4,
      o.direction,
    );
    // 内衬沿同一壳体曲率退后一层，边缘露出红色金属接缝。
    if (o.liner) {
      const q = new Quaternion().setFromEuler(
        new Euler(...((o.rotation ?? [0, 0, 0]).map((v) => (v * Math.PI) / 180) as V3)),
      );
      const shift = new Vector3(0, 0, -0.006).applyQuaternion(q).add(new Vector3(...pos));
      add(
        a,
        id + "_lining",
        name + "红色内衬",
        {
          type: "kit",
          kit: "hmt_shell",
          params: {
            ...p,
            outline:
              a === "arms" && id === "fore_shell"
                ? outline.map(([x, y]) => [x * 0.94, y > 0.16 ? 0.16 + (y - 0.16) * 0.25 : y])
                : a === "chest" && id === "collar"
                  ? outline.map(([x, y]) => [x, Math.min(y, 0.054)])
                  : outline,
            thickness: 0.004,
            bevel: 0.0008,
            edge: 0.008,
          },
        },
        shift.toArray(),
        "redLining",
        o.dual,
        o.rotation,
        3,
        o.direction,
      );
    }
    const q = new Quaternion().setFromEuler(
      new Euler(...((o.rotation ?? [0, 0, 0]).map((v) => (v * Math.PI) / 180) as V3)),
    );
    for (const [i, [x, y]] of (o.pins ?? []).entries()) {
      const n = shellNormal(p, x, y);
      const pt = shellPoint(p, x, y, p.thickness)
        .addScaledVector(n, 0.00055)
        .applyQuaternion(q)
        .add(new Vector3(...pos));
      n.applyQuaternion(q);
      const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n));
      bolt(
        a,
        id + "_screw_" + i,
        pt.toArray(),
        [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3,
        o.dual,
      );
    }
    // 白模上的长孔锁扣随母壳法线安装，孔壁、底座与两端螺钉都是真实分件。
    for (const [i, [x, y]] of (o.latches ?? []).entries()) {
      const n = shellNormal(p, x, y);
      const pt = shellPoint(p, x, y, p.thickness)
        .addScaledVector(n, 0.0007)
        .applyQuaternion(q)
        .add(new Vector3(...pos));
      const mount = q.clone().multiply(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n));
      const e = new Euler().setFromQuaternion(mount);
      shell(
        a,
        id + "_latch_" + i,
        "长孔检修锁扣",
        [
          [-0.012, -0.004],
          [-0.009, -0.007],
          [0.009, -0.007],
          [0.012, -0.004],
          [0.012, 0.004],
          [0.009, 0.007],
          [-0.009, 0.007],
          [-0.012, 0.004],
        ],
        pt.toArray(),
        {
          dual: o.dual,
          rotation: [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3,
          rise: 0,
          thickness: 0.0024,
          bevel: 0.0005,
          corner: 0.001,
          material: "armor",
          holes: [
            [
              [-0.005, -0.002],
              [-0.002, -0.002],
              [-0.001, -0.0035],
              [0.002, -0.0035],
              [0.003, -0.002],
              [0.006, -0.002],
              [0.006, 0.002],
              [0.003, 0.002],
              [0.002, 0.0035],
              [-0.001, 0.0035],
              [-0.002, 0.002],
              [-0.005, 0.002],
            ],
          ],
        },
      );
      for (const sign of [-1, 1]) {
        const screw = new Vector3(sign * 0.009, 0, 0.0026).applyQuaternion(mount).add(pt);
        bolt(
          a,
          id + "_latch_" + i + "_bolt_" + sign,
          screw.toArray(),
          [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3,
          o.dual,
          0.0012,
        );
      }
    }
  }
  function link(
    a: string,
    id: string,
    from: V3,
    to: V3,
    r = 0.008,
    mat = "steel",
    dual = true,
    layer: BuildLayer = 2,
    endpointFrames?: [Matrix4, Matrix4],
  ) {
    for (const side of dual ? [1, -1] : [1]) {
      const suffix = dual ? (side === 1 ? "_l" : "_r") : "";
      add(
        a,
        id + suffix,
        "机械承力连杆",
        {
          type: "kit",
          kit: "hmt_link",
          params: {
            from: endpointFrames
              ? new Vector3(from[0] * side, from[1], from[2]).applyMatrix4(endpointFrames[0]).toArray()
              : restPose.point(a, id, from, side).toArray(),
            to: endpointFrames
              ? new Vector3(to[0] * side, to[1], to[2]).applyMatrix4(endpointFrames[1]).toArray()
              : restPose.point(a, id, to, side).toArray(),
            radius: r,
          },
        },
        [0, 0, 0],
        mat,
        false,
        [0, 0, 0],
        layer,
        [0, 0, 1],
        true,
      );
    }
  }
  function cyl(
    a: string,
    id: string,
    pos: V3,
    r: number,
    h: number,
    mat = "steel",
    dual = true,
    rot: V3 = [0, 0, 90],
    layer: BuildLayer = 2,
  ) {
    add(
      a,
      id,
      "车削轴套",
      { type: "cylinder", r, h, segments: 96, bevel: Math.min(0.0015, h * 0.12) },
      pos,
      mat,
      dual,
      rot,
      layer,
    );
  }
  function ring(
    a: string,
    id: string,
    pos: V3,
    r: number,
    inner: number,
    h: number,
    mat = "steel",
    dual = true,
    rot: V3 = [0, 0, 90],
  ) {
    add(
      a,
      id,
      "轴承与密封环",
      { type: "tube", rOuter: r, rInner: inner, h, segments: 128 },
      pos,
      mat,
      dual,
      rot,
      2,
    );
  }
  function joint(a: string, id: string, pos: V3, r: number, h: number, dual = true) {
    const axial = a === "hands" ? 0.36 : a === "feet" && id.startsWith("toe") ? 0.6 : 1;
    h *= axial;
    if (a === "shoulder" && id === "bearing")
      ring(a, id + "_rotor", pos, r * 0.82, r * 0.5, h - 0.0006, "dark", dual);
    else cyl(a, id + "_rotor", pos, r * 0.82, h - 0.0003, "dark", dual);
    for (const side of [-1, 1]) {
      const x = pos[0] + side * (h * 0.5 + 0.0025 * axial);
      ring(a, id + "_race_" + side, [x, pos[1], pos[2]], r, r * 0.69, 0.005 * axial, "steel", dual);
      if (a === "shoulder" && id === "bearing")
        ring(
          a,
          id + "_cap_" + side,
          [x + side * (0.005 * axial), pos[1], pos[2]],
          r * 0.65,
          r * 0.5,
          0.005 * axial,
          "darkArmor",
          dual,
        );
      else
        cyl(
          a,
          id + "_cap_" + side,
          [x + side * (0.005 * axial), pos[1], pos[2]],
          r * 0.65,
          0.005 * axial,
          "darkArmor",
          dual,
        );
      ring(
        a,
        id + "_polished_" + side,
        [x + side * (0.0085 * axial + 0.00025), pos[1], pos[2]],
        r * 0.57,
        r * 0.51,
        0.0015 * axial,
        "chrome",
        dual,
      );
      for (let j = 0; j < 6; j++) {
        const t = (j / 6) * Math.PI * 2;
        bolt(
          a,
          id + "_bolt_" + side + "_" + j,
          [x + side * (0.009 * axial), pos[1] + Math.sin(t) * r * 0.84, pos[2] + Math.cos(t) * r * 0.84],
          [0, side * 90, 0],
          dual,
          r * 0.07,
        );
      }
    }
  }
  function piston(a: string, id: string, from: V3, to: V3, r = 0.014, dual = true) {
    for (const side of dual ? [1, -1] : [1]) {
      const suffix = dual ? (side === 1 ? "_l" : "_r") : "";
      const poseId = id.startsWith("knee_drive") ? "knee_drive" : id;
      const start = restPose.point(a, poseId, from, side),
        end = restPose.point(a, poseId, to, side);
      const delta = end.clone().sub(start),
        length = delta.length(),
        axis = delta.clone().normalize();
      const at = (t: number) =>
        start
          .clone()
          .addScaledVector(axis, t * length)
          .toArray() as V3;
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis);
      const e = new Euler().setFromQuaternion(q);
      const angles = [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3;
      const emit = (
        tail: string,
        name: string,
        geometry: GeometrySpec,
        position: V3,
        material: string,
        rotation: V3 = [0, 0, 0],
        layer: BuildLayer = 2,
      ) =>
        add(
          a,
          id + "_" + tail + suffix,
          name,
          geometry,
          position,
          material,
          false,
          rotation,
          layer,
          [0, 0, 1],
          true,
        );
      const margin = (r * 0.94) / length;
      emit(
        "barrel",
        "液压缸筒",
        {
          type: "kit",
          kit: "hmt_link",
          params: {
            from: at(margin),
            to: at(0.59),
            radius: r,
            innerRadius: r * 0.48 + 0.00022,
          },
        },
        [0, 0, 0],
        "darkArmor",
      );
      emit(
        "shaft",
        "抛光活塞杆",
        { type: "kit", kit: "hmt_link", params: { from: at(0.49), to: at(1 - margin), radius: r * 0.48 } },
        [0, 0, 0],
        "chrome",
      );
      if (a === "waist" && id === "lateral_drive") {
        // 护壳直接沿缸筒轴线布置，端部止于抱箍之间，不覆盖活塞行程。
        const half = length * 0.19;
        for (const sign of [-1, 1]) {
          const offset = new Vector3(sign * (r + 0.008), 0, 0).applyQuaternion(q);
          const mount = new Vector3(...at(0.34)).add(offset);
          const panelQ = q
            .clone()
            .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (sign * Math.PI) / 2));
          const e = new Euler().setFromQuaternion(panelQ);
          emit(
            "guard_" + sign,
            "腰部液压缸筒棱面护甲",
            {
              type: "kit",
              kit: "hmt_shell",
              params: {
                outline: [
                  [-0.016, -half],
                  [-0.019, half * 0.65],
                  [-0.01, half],
                  [0.013, half * 0.9],
                  [0.019, -half * 0.6],
                  [0.01, -half],
                ],
                holes: [],
                width: 0.02,
                rise: 0.004,
                thickness: 0.004,
                bevel: 0.0008,
                corner: 0.002,
                edge: 0.003,
                round: 0.002,
                form: "cast",
                fold: -0.04,
              },
            },
            mount.toArray(),
            "armor",
            [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as V3,
            4,
          );
        }
      }
      for (const t of [Math.max(margin + 0.025, 0.12), 0.24, 0.51, 0.58])
        emit(
          "collar_" + t.toFixed(4),
          "缸筒开孔抱箍",
          { type: "tube", rOuter: r * 1.17, rInner: r + 0.0001, h: 0.004, segments: 96 },
          at(t),
          "steel",
          angles,
        );
      for (const [j, t] of [0, 1].entries()) {
        const center = new Vector3(...at(t));
        const neutral = j === 0 ? from : to;
        const axisX = new Vector3(side, 0, 0).transformDirection(
          restPose.matrix(a, poseId, side, neutral[1]),
        );
        const eyeQ = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axisX);
        const eyeE = new Euler().setFromQuaternion(eyeQ);
        const eyeR = [eyeE.x, eyeE.y, eyeE.z].map((v) => (v * 180) / Math.PI) as V3;
        emit(
          "eye_" + j + "_pin",
          "活塞端铰轴",
          { type: "cylinder", r: r * 0.43, h: r * 1.78, segments: 64, bevel: r * 0.04 },
          center.toArray(),
          "dark",
          eyeR,
        );
        emit(
          "eye_" + j + "_race",
          "活塞端轴承",
          { type: "tube", rOuter: r * 0.92, rInner: r * 0.44, h: r * 1.5, segments: 96 },
          center.toArray(),
          "steel",
          eyeR,
        );
        for (const sign of [-1, 1]) {
          const cap = center.clone().addScaledVector(axisX, sign * r * 0.81);
          const boltQ = new Quaternion().setFromUnitVectors(
            new Vector3(0, 0, 1),
            axisX.clone().multiplyScalar(sign),
          );
          const boltE = new Euler().setFromQuaternion(boltQ);
          emit(
            "eye_" + j + "_bolt_" + sign,
            "端铰紧固螺钉",
            { type: "kit", kit: "hmt_bolt", params: { radius: r * 0.33 } },
            cap.toArray(),
            "fastener",
            [boltE.x, boltE.y, boltE.z].map((v) => (v * 180) / Math.PI) as V3,
            5,
          );
        }
      }
    }
  }
  function spring(a: string, id: string, pos: V3, height: number, r = 0.014, turns = 22) {
    add(
      a,
      id,
      "精密螺旋回位弹簧",
      { type: "kit", kit: "hmt_spring", params: { height, radius: r, wire: 0.0018, turns } },
      pos,
      "red",
      true,
      [0, 0, 0],
      3,
    );
  }
  function loft(a: string, id: string, rows: number[][], material = "dark", dual = false) {
    add(
      a,
      id,
      "连续截面包覆壳体",
      { type: "kit", kit: "hmt_loft", params: { sections: rows } },
      [0, 0, 0],
      material,
      dual,
      [0, 0, 0],
      2,
    );
  }
  link("torso", "clavicle", [0.035, 1.99, -0.025], [0.343, 1.985, -0.012], 0.026, "dark", true, 1);
  joint("shoulder", "bearing", [0.355, 1.985, -0.012], 0.066, 0.074);
  joint("arms", "elbow", [0.434, 1.644, 0.002], 0.043, 0.075);
  joint("pelvis", "hip", [0.166, 1.221, -0.014], 0.065, 0.084);
  joint("legs", "knee", [0.218, 0.679, 0.008], 0.048, 0.088);
  joint("feet", "ankle", [0.265, 0.156, -0.017], 0.036, 0.074);
  link("arms", "humerus", [0.369, 1.91, -0.018], [0.429, 1.69, 0], 0.029, "dark", true, 1);
  link("arms", "radius", [0.438, 1.6, 0], [0.455, 1.231, 0.023], 0.02, "dark", true, 1);
  link("legs", "femur", [0.17, 1.17, -0.023], [0.214, 0.731, 0.008], 0.027, "dark", true, 1);
  link("legs", "tibia", [0.223, 0.628, -0.01], [0.262, 0.201, -0.02], 0.024, "dark", true, 1);
  for (let i = 0; i < 4; i++) {
    link(
      "torso",
      "rib_" + i,
      [0.037, 1.708 + i * 0.065, -0.045],
      [0.235, 1.77 + i * 0.06, -0.02],
      0.012,
      "darkArmor",
    );
    link(
      "torso",
      "rear_rib_" + i,
      [0.037, 1.708 + i * 0.065, -0.055],
      [0.229, 1.77 + i * 0.06, -0.091],
      0.009,
      "steel",
    );
  }
  piston("shoulder", "diagonal", [0.167, 1.941, 0.05], [0.302, 2.025, 0.02], 0.013);
  // 侧背参考中的第二组肩带执行器，沿肩胛后方布置，不侵占胸前开窗。
  piston("shoulder", "scapular_return", [0.25, 1.986, -0.073], [0.365, 1.918, -0.12], 0.008);
  // [OM-FREEPLAY] 遮挡处的肋架检修座按可见肋骨走向布置；孔、螺钉与线束端子分别成件。
  for (let level = 0; level < 4; level++) {
    const y = 1.766 + level * 0.052;
    const x = 0.125 + level * 0.014;
    shell(
      "torso",
      "rib_bracket_" + level,
      "肋架开窗检修座",
      [
        [-0.018, -0.02],
        [0.019, -0.014],
        [0.024, 0.018],
        [-0.012, 0.024],
      ],
      [x, y, 0.039],
      {
        dual: true,
        layer: 2,
        rise: 0.003,
        thickness: 0.004,
        bevel: 0.0007,
        corner: 0.0015,
        material: "darkArmor",
        holes: [
          [
            [-0.007, -0.008],
            [0.009, -0.006],
            [0.012, 0.01],
            [-0.006, 0.013],
          ],
        ],
        pins: [
          [-0.011, -0.013],
          [0.014, -0.008],
          [0.017, 0.015],
          [-0.008, 0.018],
        ],
      },
    );
    for (let strand = 0; strand < 3; strand++) {
      const offsetY = strand * 0.006 - (level === 3 ? 0.028 : 0);
      // 三根信号线分层绕过斜肋，端部直接进入端子，避免回钩截断相邻线束。
      const behindRib = level === 3 && strand < 2;
      const wireZ = 0.045 + strand * 0.004 - (behindRib ? 0.018 : 0);
      cyl(
        "torso",
        "rib_terminal_" + level + "_" + strand,
        [x + 0.021, y + 0.011 + offsetY, wireZ + (behindRib ? -0.007 : 0.007)],
        0.0026,
        0.014,
        "steel",
        true,
        [90, 0, 0],
        3,
      );
    }
  }
  piston("arms", "upper_drive", [0.463, 1.904, -0.025], [0.47, 1.697, -0.02], 0.013);
  piston("arms", "fore_drive", [0.405, 1.589, 0.029], [0.426, 1.302, 0.035], 0.012);
  piston("legs", "hip_drive", [0.119, 1.187, -0.012], [0.162, 0.904, 0.013], 0.019);
  piston("legs", "knee_drive", [0.197, 0.854, -0.125], [0.211, 0.598, -0.121], 0.01);
  piston("legs", "knee_drive_outer", [0.259, 0.854, -0.125], [0.273, 0.598, -0.121], 0.01);
  piston("waist", "lateral_drive", [0.074, 1.365, -0.014], [0.065, 1.656, -0.016], 0.0125);
  piston("pelvis", "hip_oblique", [0.052, 1.298, 0.023], [0.137, 1.207, 0.047], 0.014);
  // 三节腹部呈柔性机械椎体，前罩、轴承、后部连接耳分别成件。
  for (let i = 0; i < 3; i++) {
    const y = 1.39 + i * 0.091;
    // 中腰环下端避开下节倾斜端面；上端承接面与确认的腰节轴心保持不变。
    ring(
      "waist",
      "disc_" + i,
      [0, y + (i === 1 ? 0.003 : 0), -0.037],
      0.0504,
      0.034,
      i === 1 ? 0.062 : 0.068,
      "dark",
      false,
      [0, 0, 0],
    );
    ring("waist", "disc_rim_" + i, [0, y + 0.035, -0.037], 0.0504, 0.034, 0.005, "steel", false, [0, 0, 0]);
    shell(
      "waist",
      "vertebra_" + i,
      "独立腰椎铸造壳",
      [
        [-0.064, -0.033],
        [-0.077, 0.014],
        [-0.053, 0.039],
        [0.053, 0.039],
        [0.077, 0.014],
        [0.064, -0.033],
        [0.02, -0.043],
        [-0.02, -0.043],
      ],
      [0, y, 0.015],
      {
        rise: 0.025,
        width: 0.08,
        corner: 0.012,
        bulges: [[0, 0, 0.026, 0.03, -0.013]],
        material: "darkArmor",
        holes: [
          [
            [-0.052, -0.018],
            [-0.05, 0.016],
            [-0.033, 0.024],
            [-0.027, 0],
            [-0.035, -0.021],
          ],
          [
            [0.052, -0.018],
            [0.05, 0.016],
            [0.033, 0.024],
            [0.027, 0],
            [0.035, -0.021],
          ],
        ],
        pins: [
          [-0.019, 0.021],
          [0.019, 0.021],
          [-0.018, -0.019],
          [0.018, -0.019],
        ],
      },
    );
    shell(
      "waist",
      "rear_link_" + i,
      "腰椎背侧耳板",
      [
        [-0.034, -0.027],
        [-0.069, -0.032],
        [-0.086, -0.016],
        [-0.083, 0.015],
        [-0.066, 0.036],
        [-0.032, 0.022],
        [0, 0.015],
        [0.032, 0.022],
        [0.066, 0.036],
        [0.083, 0.015],
        [0.086, -0.016],
        [0.069, -0.032],
        [0.034, -0.027],
        [0, -0.014],
      ],
      // 中节向后错开、上下节少量过渡；用背甲轮廓显出已有腰弧，不再增加关节转角。
      [0, y, -0.096 - [0.002, 0.012, 0.003][i]],
      {
        rise: 0.022,
        rotation: [0, 180, 0],
        material: "armor",
        holes: [
          [
            [-0.02, -0.012],
            [0.02, -0.012],
            [0.02, 0.012],
            [-0.02, 0.012],
          ],
        ],
        direction: [0, 0, -1],
      },
    );
  }
  // 参考 12/14 的腹部：窄腰由分节铰耳、双侧斜撑与后侧线束组成，空处仍然透空。
  // [OM-FREEPLAY] 被护甲遮挡的导线端子按可见连接方向补齐，数量为重建选择。
  for (let i = 0; i < 3; i++) {
    const y = 1.39 + i * 0.091;
    joint("waist", "vertebra_" + i + "_hinge", [0.069, y - 0.008, -0.047], 0.013, 0.012);
    shell(
      "waist",
      "vertebra_" + i + "_clevis",
      "腰椎侧向开槽铰耳",
      [
        [-0.016, -0.036],
        [-0.022, 0.026],
        [-0.011, 0.038],
        [0.014, 0.03],
        [0.02, -0.028],
        [0.008, -0.038],
      ],
      [0.06, y, -0.035],
      {
        dual: true,
        rotation: [0, 90, -5],
        rise: 0.005,
        thickness: 0.005,
        bevel: 0.0009,
        holes: [
          [
            [-0.006, -0.02],
            [-0.008, 0.018],
            [0.007, 0.02],
            [0.008, -0.018],
          ],
        ],
        material: "darkArmor",
        layer: 2,
      },
    );
    for (let j = 0; j < 4; j++) {
      const z = -0.068 - j * 0.006;
      link(
        "waist",
        "vertebra_" + i + "_rear_web_" + j,
        [0.028, y - 0.026, z],
        [0.046, y + 0.025, z],
        0.0028,
        "darkArmor",
      );
      bolt(
        "waist",
        "vertebra_" + i + "_terminal_" + j,
        [0.038, y - 0.02 + j * 0.013, -0.118],
        [0, 180, 0],
        true,
        0.0018,
      );
    }
    if (i < 2) {
      piston(
        "waist",
        "intervertebral_" + i,
        [i === 0 ? 0.077 : 0.059, y + 0.022, -0.078],
        [i === 0 ? 0.077 : 0.061, y + 0.071, -0.079],
        0.0045,
      );
      link(
        "waist",
        "oblique_front_" + i,
        shellAnchor("waist.vertebra_" + i, 0.032, 0.018, 0.006),
        shellAnchor("waist.vertebra_" + (i + 1), 0.03, -0.02, 0.006),
        0.006,
        "darkArmor",
        true,
        2,
        [restPose.waist(y), restPose.waist(y + 0.091)],
      );
      link(
        "waist",
        "oblique_back_" + i,
        shellAnchor("waist.rear_link_" + i, -0.029, 0.016, 0.016),
        shellAnchor("waist.rear_link_" + (i + 1), -0.029, -0.016, 0.016),
        0.005,
        "darkArmor",
        true,
        2,
        [restPose.waist(y), restPose.waist(y + 0.091)],
      );
    }
  }
  // 胸廓开窗内有斜向肋、执行器和接线端，避免只有一根中央柱。
  for (let i = 0; i < 5; i++) {
    const y = 1.741 + i * 0.043;
    link(
      "torso",
      "diagonal_web_" + i,
      [0.058, y - 0.024, 0.005],
      [0.197, y + 0.041, 0.065],
      0.0058,
      "darkArmor",
    );
    link(
      "torso",
      "rib_lower_" + i,
      [0.071, y - 0.035, -0.056],
      [0.21, y + 0.019, -0.041],
      0.0045,
      "darkArmor",
    );
    cyl("torso", "rib_pin_" + i, [0.197, y + 0.041, 0.065], 0.008, 0.014, "steel");
    bolt("torso", "rib_lock_" + i, [0.206, y + 0.041, 0.065], [0, 90, 0], true, 0.0028);
  }
  piston("torso", "scapula_actuator", [0.072, 1.784, -0.075], [0.221, 1.959, -0.065], 0.009);
  piston("torso", "pectoral_actuator", [0.062, 1.811, 0.009], [0.185, 1.967, -0.044], 0.008);
  // [OM-FREEPLAY] 胸背空腔内的驱动模块按相邻两根后肋之间的空间布置，散热片与支座分别成件。
  for (let level = 0; level < 3; level++) {
    const y = 1.774 + level * 0.0621875;
    add(
      "torso",
      "driver_body_" + level,
      "肋间驱动模块",
      { type: "box", w: 0.028, h: 0.036, d: 0.009, bevel: 0.001 },
      [0.145, y, -0.093],
      "darkArmor",
      true,
      [0, 0, 0],
      2,
    );
    link(
      "torso",
      "driver_mount_" + level,
      [0.145, y - 0.014, -0.091],
      [0.145, 1.742875 + level * 0.0621875, -0.07525],
      0.003,
      "steel",
      true,
      2,
    );
    for (let socket = 0; socket < 4; socket++) {
      const x = 0.135 + socket * 0.0066;
      cyl(
        "torso",
        "driver_socket_" + level + "_" + socket,
        [x, y + 0.02, -0.093],
        0.0023,
        0.006,
        "steel",
        true,
        [0, 0, 0],
        3,
      );
      ring(
        "torso",
        "driver_socket_seal_" + level + "_" + socket,
        [x, y + 0.023, -0.093],
        0.0028,
        0.0024,
        0.0012,
        "red",
        true,
        [0, 0, 0],
      );
    }
    add(
      "torso",
      "driver_clamp_" + level,
      "驱动模块压线盖",
      { type: "box", w: 0.025, h: 0.002, d: 0.004, bevel: 0.0003 },
      [0.145, y + 0.0175, -0.0997],
      "darkArmor",
      true,
      [0, 0, 0],
      3,
    );
    for (let fin = 0; fin < 10; fin++) {
      add(
        "torso",
        "driver_fin_" + level + "_" + fin,
        "独立散热鳍片",
        { type: "box", w: 0.025, h: 0.0012, d: 0.009, bevel: 0.0002 },
        [0.145, y + (fin - 4.5) * 0.0034, -0.1015],
        "steel",
        true,
        [0, 0, 0],
        3,
      );
    }
    for (const side of [-1, 1]) {
      bolt(
        "torso",
        "driver_fastener_" + level + "_" + side,
        [0.145 + side * 0.009, y - 0.015, -0.098],
        [0, 180, 0],
        true,
        0.0016,
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    ring(
      "shoulder",
      "servo_lamination_" + i,
      [0.273 + i * 0.0045, 1.989, -0.012],
      0.035,
      0.0265,
      0.002,
      "darkArmor",
    );
  }
  // 胸骨底壳承接领甲；左右主胸板另设安装层，横向展开并向下收束。
  shell(
    "chest",
    "carapace",
    "连续胸骨与双翼胸甲",
    [
      [0, 0.153],
      [0.05, 0.178],
      [0.09, 0.189],
      [0.095, 0.124],
      [0.165, 0.095],
      [0.213, 0.054],
      [0.243, 0.015],
      [0.254, -0.018],
      [0.235, -0.066],
      [0.182, -0.084],
      [0.125, -0.11],
      [0.088, -0.149],
      [0.07, -0.16],
      [0, -0.17],
      [-0.07, -0.16],
      [-0.088, -0.149],
      [-0.125, -0.11],
      [-0.182, -0.084],
      [-0.235, -0.066],
      [-0.254, -0.018],
      [-0.243, 0.015],
      [-0.213, 0.054],
      [-0.165, 0.095],
      [-0.095, 0.124],
      [-0.09, 0.189],
      [-0.05, 0.178],
    ],
    [0, 1.863, 0.062],
    {
      rise: 0.097,
      form: "chest",
      rim: 0.003,
      width: 0.26,
      fold: -0.14,
      slope: 0.11,
      thickness: 0.019,
      bevel: 0.0038,
      corner: 0.006,
      liner: true,
      bulges: [
        [0.17, -0.025, 0.11, 0.055, 0.043],
        [-0.17, -0.025, 0.11, 0.055, 0.043],
        [0, -0.09, 0.045, 0.12, 0.027],
      ],
      holes: [
        [
          [0.067, 0.14],
          [0.075, 0.15],
          [0.077, 0.111],
          [0.18, 0.05],
          [0.1, 0.012],
          [0.062, 0.029],
        ],
        [
          [-0.067, 0.14],
          [-0.075, 0.15],
          [-0.077, 0.111],
          [-0.18, 0.05],
          [-0.1, 0.012],
          [-0.062, 0.029],
        ],
        [
          [0.08, -0.075],
          [0.104, -0.045],
          [0.14, -0.059],
          [0.105, -0.095],
        ],
        [
          [-0.08, -0.075],
          [-0.104, -0.045],
          [-0.14, -0.059],
          [-0.105, -0.095],
        ],
      ],
      pins: [
        [-0.039, 0.151],
        [0.039, 0.151],
        [-0.038, 0.102],
        [0.038, 0.102],
        [-0.033, -0.111],
        [0.033, -0.111],
      ],
    },
  );
  shell(
    "chest",
    "pectoral_plate",
    "左右主胸板与下缘翻边",
    [
      [0.062, 0.008],
      [0.183, 0.045],
      [0.238, 0.011],
      [0.248, -0.019],
      [0.23, -0.06],
      [0.178, -0.079],
      [0.123, -0.105],
      [0.076, -0.139],
      [0.058, -0.111],
      [0.052, -0.035],
    ],
    [0, 1.863, 0.117],
    {
      dual: true,
      form: "chest",
      width: 0.26,
      rise: 0.097,
      thickness: 0.008,
      bevel: 0.0015,
      corner: 0.003,
      edge: 0.003,
      pins: [[0.209, -0.052]],
    },
  );
  shell(
    "chest",
    "lower_sternum",
    "胸廓下缘收束护甲",
    [
      [-0.073, 0.06],
      [-0.12, 0.019],
      [-0.068, -0.045],
      [0, -0.067],
      [0.068, -0.045],
      [0.12, 0.019],
      [0.073, 0.06],
      [0, 0.038],
    ],
    [0, 1.735, 0.075],
    {
      rise: 0.033,
      fold: -0.23,
      corner: 0.008,
      latches: [
        [-0.058, 0.026],
        [0.058, 0.026],
      ],
      pins: [
        [-0.08, -0.025],
        [0.08, -0.025],
      ],
      liner: true,
    },
  );
  shell(
    "chest",
    "flank",
    "胸廓侧面回包",
    [
      [-0.074, 0.125],
      [0.04, 0.12],
      [0.074, 0.032],
      [0.052, -0.099],
      [-0.005, -0.15],
      [-0.065, -0.04],
    ],
    [0.225, 1.815, -0.01],
    {
      dual: true,
      rotation: [0, 64, -16],
      rise: 0.034,
      holes: [
        [
          [-0.03, 0.056],
          [0.028, 0.05],
          [0.022, -0.02],
          [-0.019, -0.05],
        ],
      ],
      pins: [
        [-0.045, 0.084],
        [0.038, -0.064],
      ],
      liner: true,
      direction: [1, 0, 0],
    },
  );
  shell(
    "chest",
    "collar",
    "颈根开窗领甲",
    [
      [-0.041, 0.063],
      [-0.005, 0.093],
      [0.052, 0.043],
      [0.118, -0.014],
      [0.117, -0.051],
      [0.055, -0.071],
      [-0.022, -0.018],
    ],
    [0.095, 2.027, 0.023],
    {
      dual: true,
      form: "collar",
      rim: 0.0025,
      rise: 0.033,
      rotation: [0, 27, 0],
      fold: -0.18,
      holes: [
        [
          [-0.014, 0.022],
          [0.016, 0.035],
          [0.063, -0.003],
          [0.027, -0.034],
          [-0.009, -0.018],
        ],
      ],
      pins: [[0.076, -0.026]],
      latches: [[0.004, 0.058]],
      liner: true,
    },
  );
  shell(
    "chest",
    "neck_front",
    "中央锁骨六边窗",
    [
      [-0.063, -0.022],
      [-0.063, 0.019],
      [0, 0.05],
      [0.063, 0.019],
      [0.063, -0.022],
      [0, -0.05],
    ],
    [0, 2.038, 0.054],
    {
      rise: 0.009,
      holes: [
        [
          [-0.035, 0.007],
          [0, 0.024],
          [0.035, 0.007],
          [0.03, -0.018],
          [0, -0.03],
          [-0.03, -0.018],
        ],
      ],
      bevel: 0.0015,
    },
  );
  shell(
    "back",
    "carapace",
    "肩胛与背部中央复合壳",
    [
      [0, 0.196],
      [0.1, 0.155],
      [0.223, 0.106],
      [0.275, 0.041],
      [0.26, -0.06],
      [0.205, -0.14],
      [0.096, -0.203],
      [0, -0.232],
      [-0.096, -0.203],
      [-0.205, -0.14],
      [-0.26, -0.06],
      [-0.275, 0.041],
      [-0.223, 0.106],
      [-0.1, 0.155],
    ],
    [0, 1.86, -0.095],
    {
      rotation: [0, 180, 0],
      rise: 0.065,
      fold: -0.12,
      liner: true,
      direction: [0, 0, -1],
      bulges: [
        [0.15, 0.025, 0.1, 0.056, 0.034],
        [-0.15, 0.025, 0.1, 0.056, 0.034],
      ],
      holes: [
        [
          [0.048, 0.156],
          [0.096, 0.136],
          [0.139, 0.08],
          [0.063, 0.074],
        ],
        [
          [-0.048, 0.156],
          [-0.096, 0.136],
          [-0.139, 0.08],
          [-0.063, 0.074],
        ],
        [
          [0.151, -0.038],
          [0.206, -0.018],
          [0.191, -0.08],
          [0.142, -0.102],
        ],
        [
          [-0.151, -0.038],
          [-0.206, -0.018],
          [-0.191, -0.08],
          [-0.142, -0.102],
        ],
        [
          [-0.028, -0.144],
          [0.028, -0.144],
          [0.016, -0.19],
          [-0.016, -0.19],
        ],
      ],
      pins: [
        [-0.1, 0.029],
        [0.1, 0.029],
        [-0.043, -0.075],
        [0.043, -0.075],
      ],
    },
  );
  shell(
    "back",
    "scapular_plate",
    "肩胛独立叠板",
    [
      [0.044, 0.061],
      [0.15, 0.098],
      [0.242, 0.041],
      [0.241, -0.018],
      [0.185, -0.04],
      [0.084, -0.016],
      [0.038, 0.014],
    ],
    [0, 1.86, -0.118],
    {
      dual: true,
      rotation: [0, 180, 0],
      width: 0.275,
      rise: 0.065,
      fold: -0.12,
      thickness: 0.008,
      bevel: 0.0015,
      corner: 0.003,
      edge: 0.003,
      bulges: [
        [0.15, 0.025, 0.1, 0.056, 0.034],
        [-0.15, 0.025, 0.1, 0.056, 0.034],
      ],
      direction: [0, 0, -1],
    },
  );
  shell(
    "back",
    "lumbar_transition",
    "背甲下缘脊柱过渡板",
    [
      [-0.085, 0.028],
      [-0.055, 0.065],
      [0, 0.04],
      [0.055, 0.065],
      [0.085, 0.028],
      [0.047, -0.033],
      [0, -0.071],
      [-0.047, -0.033],
    ],
    [0, 1.664, -0.09],
    {
      rotation: [0, 180, 0],
      rise: 0.019,
      fold: -0.12,
      thickness: 0.009,
      bevel: 0.0015,
      corner: 0.004,
      direction: [0, 0, -1],
    },
  );
  // 参考 02/10：内侧尖端、前部隆起、顶孔和后缘属于同一个连续肩罩。
  shell(
    "shoulder",
    "pauldron",
    "连续回包肩罩",
    [
      [-0.118, -0.043],
      [-0.078, -0.128],
      [-0.027, -0.181],
      [0.075, -0.18],
      [0.111, -0.235],
      [0.114, 0.235],
      [0.074, 0.208],
      [-0.027, 0.178],
      [-0.082, 0.111],
      [-0.118, 0.04],
    ],
    [0.36, 2.015, -0.009],
    {
      dual: true,
      form: "shoulder",
      width: 0.118,
      thickness: 0.013,
      bevel: 0.0022,
      corner: 0.012,
      latches: [[-0.005, 0.097]],
      holes: [
        [
          [-0.055, 0.025],
          [0.035, 0.025],
          [0.061, 0.058],
          [-0.004, 0.05],
        ],
        [
          [-0.069, 0.113],
          [-0.015, 0.129],
          [0.034, 0.15],
          [-0.023, 0.154],
        ],
        [
          [-0.036, -0.037],
          [0.036, -0.035],
          [0.052, -0.064],
          [-0.012, -0.066],
        ],
      ],
      pins: [
        [0.082, 0.205],
        [0.055, 0.181],
        [0.082, -0.136],
        [0.04, 0.12],
        [-0.04, 0.1],
        [0.09, 0.17],
      ],
      direction: [1, 1, 0.4],
    },
  );
  shell(
    "shoulder",
    "outer_shell",
    "肩罩外侧收口",
    [
      [-0.066, -0.055],
      [-0.078, 0.021],
      [-0.04, 0.073],
      [0.034, 0.075],
      [0.082, 0.018],
      [0.055, -0.072],
      [0.009, -0.091],
    ],
    [0.476, 1.967, -0.009],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.004,
      thickness: 0.008,
      bevel: 0.0014,
      liner: true,
      holes: [
        [
          [-0.049, 0.022],
          [-0.028, 0.052],
          [0.027, 0.055],
          [0.057, 0.011],
          [0.034, -0.048],
          [-0.004, -0.055],
        ],
      ],
      pins: [
        [0.045, -0.025],
        [-0.049, -0.019],
      ],
      direction: [1, 0, 0],
    },
  );
  // 手臂护甲：不规则骨架窗口与起伏的实体边梁。
  const upper = [
    [-0.041, 0.135],
    [0.027, 0.115],
    [0.064, 0.052],
    [0.061, 0.003],
    [0.033, -0.131],
    [-0.037, -0.14],
    [-0.065, -0.048],
    [-0.067, 0.027],
  ];
  shell("arms", "upper_shell", "上臂起伏开窗壳", upper, [0.412, 1.799, 0.022], {
    dual: true,
    rim: 0.002,
    rise: 0.039,
    fold: -0.09,
    corner: 0.011,
    bulges: [[-0.023, 0.059, 0.036, 0.051, 0.022]],
    latches: [[-0.043, -0.092]],
    liner: true,
    holes: [
      [
        [-0.008, 0.07],
        [0.037, 0.024],
        [0.019, -0.064],
        [-0.026, -0.09],
        [-0.036, -0.052],
      ],
      [
        [-0.032, -0.102],
        [-0.01, -0.097],
        [-0.013, -0.119],
        [-0.034, -0.12],
      ],
    ],
    pins: [
      [-0.041, 0.06],
      [0.039, -0.084],
    ],
  });
  shell("arms", "upper_rear", "上臂背侧护甲", upper, [0.412, 1.799, -0.075], {
    dual: true,
    rotation: [0, 180, 0],
    rise: 0.029,
    liner: true,
    holes: [
      [
        [-0.02, 0.062],
        [0.024, 0.039],
        [0.023, -0.056],
        [-0.023, -0.086],
      ],
    ],
    direction: [0, 0, -1],
  });
  const fore = [
    [-0.044, 0.18],
    [0.027, 0.162],
    [0.063, 0.087],
    [0.048, 0.002],
    [0.026, -0.183],
    [-0.025, -0.195],
    [-0.047, -0.159],
    [-0.067, -0.04],
    [-0.07, 0.064],
  ];
  const foreHoles = [
    [
      [-0.037, 0.102],
      [-0.015, 0.073],
      [-0.02, -0.021],
      [-0.043, -0.061],
      [-0.051, -0.019],
    ],
    [
      [0.012, 0.073],
      [0.043, 0.065],
      [0.032, -0.062],
      [0.004, -0.021],
    ],
    [
      [-0.009, -0.121],
      [0.012, -0.133],
      [0.012, -0.164],
      [-0.012, -0.165],
    ],
  ];
  shell("arms", "fore_shell", "前臂交叉开窗壳", fore, [0.445, 1.418, 0.036], {
    dual: true,
    rim: 0.002,
    rise: 0.032,
    fold: -0.07,
    latches: [[0.013, 0.118]],
    bulges: [
      [-0.01, 0.118, 0.04, 0.04, 0.02],
      [0, -0.08, 0.03, 0.04, 0.014],
    ],
    liner: true,
    holes: foreHoles,
    pins: [
      [-0.014, 0.143],
      [0.013, 0.125],
      [-0.011, -0.092],
      [-0.012, -0.178],
    ],
  });
  shell("arms", "fore_back", "前臂后部回包壳", fore, [0.446, 1.418, -0.045], {
    dual: true,
    rotation: [0, 180, 0],
    rise: 0.029,
    holes: foreHoles,
    liner: true,
    direction: [0, 0, -1],
  });
  shell(
    "arms",
    "fore_side",
    "前臂外侧空间梁",
    [
      [-0.045, 0.145],
      [0.039, 0.118],
      [0.051, 0.043],
      [0.028, -0.153],
      [-0.026, -0.175],
      [-0.048, -0.023],
    ],
    [0.486, 1.424, -0.004],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.015,
      holes: [
        [
          [-0.022, 0.079],
          [0.019, 0.068],
          [0.014, -0.071],
          [-0.02, -0.11],
        ],
      ],
      direction: [1, 0, 0],
    },
  );
  spring("arms", "upper_spring", [0.427, 1.794, 0.037], 0.142, 0.012, 25);
  // 腰胯外轮廓：上挑髂骨、横向开窗支架、中央长裆壳。
  shell(
    "pelvis",
    "girdle",
    "骨盆开窗横梁与中央下护甲一体壳",
    [
      [-0.212, -0.016],
      [-0.204, 0.055],
      [-0.135, 0.078],
      [-0.061, 0.025],
      [0, 0.003],
      [0.061, 0.025],
      [0.135, 0.078],
      [0.204, 0.055],
      [0.212, -0.016],
      [0.145, -0.043],
      [0.068, -0.085],
      [0.041, -0.194],
      [0, -0.217],
      [-0.041, -0.194],
      [-0.068, -0.085],
      [-0.145, -0.043],
    ],
    [0, 1.307, 0.035],
    {
      rise: 0.055,
      width: 0.22,
      fold: -0.09,
      liner: true,
      holes: [
        [
          [0.087, 0.02],
          [0.143, 0.046],
          [0.177, 0.012],
          [0.125, -0.018],
        ],
        [
          [-0.087, 0.02],
          [-0.143, 0.046],
          [-0.177, 0.012],
          [-0.125, -0.018],
        ],
        [
          [0.026, -0.032],
          [0.063, -0.013],
          [0.074, -0.034],
          [0.032, -0.067],
        ],
        [
          [-0.026, -0.032],
          [-0.063, -0.013],
          [-0.074, -0.034],
          [-0.032, -0.067],
        ],
      ],
      pins: [
        [-0.176, 0.031],
        [0.176, 0.031],
        [-0.106, -0.022],
        [0.106, -0.022],
      ],
    },
  );
  shell(
    "pelvis",
    "iliac_spur",
    "髂骨上挑侧翼",
    [
      [-0.061, -0.012],
      [-0.037, 0.095],
      [0, 0.047],
      [0.056, 0.004],
      [0.049, -0.021],
    ],
    [0.147, 1.31, -0.015],
    {
      dual: true,
      rotation: [0, 44, 0],
      rise: 0.024,
      liner: true,
      holes: [
        [
          [-0.023, 0.045],
          [0.003, 0.016],
          [0.018, 0.004],
          [-0.02, 0.009],
        ],
      ],
      direction: [1, 0, 0],
    },
  );
  shell(
    "pelvis",
    "rear",
    "骨盆背面框架",
    [
      [-0.218, 0.043],
      [-0.188, 0.119],
      [-0.063, 0.049],
      [0, 0.073],
      [0.063, 0.049],
      [0.188, 0.119],
      [0.218, 0.043],
      [0.14, -0.038],
      [0.04, -0.083],
      [0, -0.11],
      [-0.04, -0.083],
      [-0.14, -0.038],
    ],
    [0, 1.298, -0.098],
    {
      rise: 0.035,
      rotation: [0, 180, 0],
      liner: true,
      holes: [
        [
          [-0.14, 0.026],
          [-0.07, 0.003],
          [-0.112, -0.023],
        ],
        [
          [0.14, 0.026],
          [0.07, 0.003],
          [0.112, -0.023],
        ],
      ],
      direction: [0, 0, -1],
    },
  );
  // 大腿具有宽实心外侧肌腹、上端窗口及内侧细长缝，不是细长平框。
  const thigh = [
    [-0.047, 0.239],
    [0.002, 0.268],
    [0.057, 0.245],
    [0.099, 0.142],
    [0.1, 0.038],
    [0.071, -0.075],
    [0.04, -0.218],
    [0.012, -0.249],
    [-0.046, -0.224],
    [-0.069, -0.173],
    [-0.06, -0.064],
    [-0.103, 0.06],
    [-0.097, 0.156],
  ];
  const thighHoles = [
    [
      [0.008, 0.225],
      [0.044, 0.206],
      [0.052, 0.158],
      [0.022, 0.116],
      [-0.009, 0.146],
    ],
    [
      [-0.046, 0.014],
      [-0.008, -0.031],
      [-0.013, -0.159],
      [-0.041, -0.183],
      [-0.049, -0.1],
    ],
  ];
  thighHoles.push([
    [-0.079, 0.154],
    [-0.047, 0.145],
    [-0.052, 0.065],
    [-0.071, 0.094],
  ]);
  shell("legs", "thigh", "大腿扭转铸造护甲", thigh, [0.197, 0.946, 0.038], {
    dual: true,
    rim: 0.0025,
    form: "limb",
    rise: 0.044,
    fold: -0.045,
    slope: 0.017,
    liner: true,
    latches: [[0.006, -0.024]],
    bulges: [
      [0.037, 0.06, 0.057, 0.1, 0.033],
      [-0.028, -0.196, 0.045, 0.029, 0.02],
    ],
    holes: thighHoles,
    pins: [
      [0.073, 0.09],
      [0.055, 0.006],
      [-0.047, -0.202],
      [0.026, -0.209],
    ],
    direction: [0.5, 0, 1],
  });
  shell("legs", "thigh_back", "大腿后部肌腹罩壳", thigh, [0.198, 0.946, -0.074], {
    dual: true,
    form: "limb",
    rise: 0.035,
    rotation: [0, 180, 0],
    holes: thighHoles,
    liner: true,
    direction: [0, 0, -1],
  });
  shell(
    "legs",
    "thigh_side",
    "大腿外侧连体壳",
    [
      [-0.061, 0.21],
      [0.044, 0.206],
      [0.071, 0.108],
      [0.06, -0.037],
      [0.031, -0.201],
      [-0.039, -0.204],
      [-0.069, -0.048],
    ],
    [0.258, 0.952, -0.018],
    {
      dual: true,
      rotation: [0, 76, -8],
      rise: 0.026,
      holes: [
        [
          [-0.019, -0.041],
          [0.022, -0.063],
          [0.014, -0.15],
          [-0.023, -0.174],
        ],
      ],
      liner: true,
      direction: [1, 0, 0],
    },
  );
  shell(
    "legs",
    "knee_shield",
    "膝部多面护罩",
    [
      [-0.061, 0.071],
      [0.057, 0.071],
      [0.068, 0.009],
      [0.04, -0.055],
      [0, -0.07],
      [-0.044, -0.056],
      [-0.068, 0.009],
    ],
    [0.219, 0.699, 0.042],
    {
      dual: true,
      rise: 0.042,
      fold: -0.19,
      holes: [
        [
          [-0.017, -0.025],
          [0.017, -0.025],
          [0, -0.048],
        ],
      ],
      pins: [
        [-0.041, 0.016],
        [0.04, 0.016],
      ],
    },
  );
  const calf = [
    [-0.036, 0.233],
    [0.03, 0.233],
    [0.057, 0.157],
    [0.069, 0.066],
    [0.046, -0.031],
    [0.028, -0.164],
    [0.046, -0.225],
    [0.015, -0.249],
    [-0.034, -0.236],
    [-0.049, -0.177],
    [-0.069, -0.058],
    [-0.074, 0.064],
    [-0.061, 0.154],
  ];
  const calfHoles = [
    [
      [0.006, 0.142],
      [0.04, 0.071],
      [0.027, -0.033],
      [-0.009, -0.117],
      [-0.028, -0.073],
      [-0.023, 0.032],
    ],
    [
      [-0.028, 0.151],
      [-0.006, 0.19],
      [0.008, 0.147],
      [-0.013, 0.103],
    ],
    [
      [-0.009, -0.176],
      [0.019, -0.185],
      [0.023, -0.216],
      [-0.015, -0.214],
    ],
  ];
  calfHoles[0] = calfHoles[0].map(([x, y]) => [0.013 + (x - 0.006) * 0.88, y]);
  shell("legs", "shin", "胫骨扭转开窗护甲", calf, [0.247, 0.416, 0.023], {
    dual: true,
    rim: 0.002,
    form: "shin",
    rise: 0.035,
    slope: 0.03,
    fold: -0.06,
    liner: true,
    bulges: [[-0.031, 0.043, 0.032, 0.087, 0.024]],
    holes: calfHoles,
    pins: [
      [-0.043, 0.067],
      [-0.03, -0.146],
      [0.017, -0.229],
    ],
  });
  shell("legs", "calf_back", "小腿后部回包壳", calf, [0.248, 0.416, -0.067], {
    dual: true,
    form: "shin",
    rise: 0.03,
    rotation: [0, 180, 0],
    holes: calfHoles,
    liner: true,
    direction: [0, 0, -1],
  });
  shell(
    "legs",
    "shin_side",
    "胫骨外侧包边",
    [
      [-0.044, 0.2],
      [0.04, 0.176],
      [0.057, 0.067],
      [0.025, -0.193],
      [-0.029, -0.217],
      [-0.055, -0.031],
    ],
    [0.283, 0.417, -0.019],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.018,
      holes: [
        [
          [-0.024, 0.084],
          [0.028, 0.039],
          [0.012, -0.098],
          [-0.018, -0.133],
        ],
      ],
      liner: true,
      direction: [1, 0, 0],
    },
  );
  spring("legs", "thigh_spring", [0.199, 0.925, 0.048], 0.19, 0.013, 28);
  spring("legs", "calf_spring", [0.248, 0.43, 0.033], 0.19, 0.013, 28);
  // 足背为向踝部上升的楔形壳；三趾有独立关节、侧梁、趾尖及底部承重垫。
  shell(
    "feet",
    "instep",
    "脚背空间框架",
    [
      [-0.069, -0.06],
      [-0.062, 0.015],
      [-0.041, 0.069],
      [-0.04, 0.005],
      [0.039, 0.005],
      [0.043, 0.069],
      [0.068, 0.016],
      [0.078, -0.053],
      [0.043, -0.089],
      [-0.038, -0.084],
    ],
    [0.265, 0.083, 0.032],
    {
      dual: true,
      rise: 0.03,
      rotation: [-55, 0, 0],
      holes: [
        [
          [-0.029, -0.02],
          [-0.023, -0.006],
          [0.019, -0.006],
          [0.034, -0.018],
        ],
      ],
      pins: [
        [-0.045, -0.046],
        [0.049, -0.043],
      ],
      liner: true,
    },
  );
  shell(
    "feet",
    "heel",
    "后跟承重壳",
    [
      [-0.061, -0.034],
      [-0.059, 0.043],
      [-0.026, 0.07],
      [0.035, 0.064],
      [0.065, 0.013],
      [0.059, -0.038],
    ],
    [0.265, 0.047, -0.059],
    {
      dual: true,
      rise: 0.019,
      thickness: 0.028,
      rotation: [0, 180, 0],
      direction: [0, 0, -1],
      pins: [
        [-0.04, 0.011],
        [0.035, 0.011],
      ],
    },
  );
  for (const offset of [-0.043, 0.043]) {
    shell(
      "feet",
      "heel_fork_" + offset,
      "踝后跟连接叉板",
      [
        [-0.052, -0.039],
        [-0.048, 0.064],
        [-0.022, 0.091],
        [0.016, 0.088],
        [0.046, -0.01],
        [0.022, -0.043],
      ],
      [0.265 + offset, 0.064, -0.031],
      {
        dual: true,
        rotation: [0, 90, 0],
        thickness: 0.012,
        rise: 0.006,
        corner: 0.004,
        material: "darkArmor",
        holes: [
          [
            [-0.023, -0.017],
            [-0.019, 0.046],
            [0.004, 0.055],
            [0.021, -0.014],
          ],
        ],
        pins: [
          [-0.035, -0.026],
          [0.003, 0.074],
        ],
        direction: [Math.sign(offset), 0, 0],
      },
    );
  }
  shell(
    "feet",
    "side_arch",
    "脚部外侧承力三角框",
    [
      [-0.173, -0.048],
      [-0.139, -0.018],
      [-0.02, 0.084],
      [0.043, 0.047],
      [0.071, -0.047],
      [0.045, -0.058],
    ],
    [0.326, 0.065, 0],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.002,
      thickness: 0.007,
      bevel: 0.0012,
      corner: 0.004,
      holes: [
        [
          [-0.13, -0.032],
          [-0.022, 0.055],
          [0.027, 0.028],
          [0.044, -0.032],
        ],
      ],
      pins: [
        [-0.139, -0.036],
        [0.048, -0.032],
      ],
      direction: [1, 0, 0],
    },
  );
  for (let i = 0; i < 3; i++) {
    const x = 0.265 + (i - 1) * 0.043,
      end = 0.18 - (i === 1 ? 0 : 0.018);
    joint("feet", "toe_joint_" + i, [x, 0.043, 0.065], 0.018, 0.032);
    link("feet", "toe_rear_core_" + i, [x, 0.039, 0.02], [x, 0.041, 0.0465], 0.009, "dark", true);
    link("feet", "toe_core_" + i, [x, 0.041, 0.0835], [x, 0.018, end], 0.007, "dark", true);
    shell(
      "feet",
      "toe_" + i,
      "独立趾甲与承力楔",
      [
        [-0.018, -0.066],
        [-0.022, 0.023],
        [-0.012, 0.073],
        [0.012, 0.073],
        [0.021, 0.023],
        [0.018, -0.066],
      ],
      [x, 0.022, 0.117],
      {
        dual: true,
        rotation: [-90, 0, 0],
        rise: 0.014,
        slope: 0.1,
        thickness: 0.009,
        corner: 0.004,
        bevel: 0.0013,
        holes: [
          [
            [-0.007, -0.033],
            [0.007, -0.033],
            [0.007, 0.017],
            [-0.007, 0.034],
          ],
        ],
        pins: [[0, 0.052]],
        direction: [0, 1, 0.5],
      },
    );
    add(
      "feet",
      "toe_pad_" + i,
      "脚趾下部承重垫",
      { type: "box", w: 0.036, h: 0.012, d: 0.098, bevel: 0.002 },
      [x, 0.006, 0.135],
      "dark",
      true,
      [0, 0, 0],
      2,
    );
    piston("feet", "toe_tendon_" + i, [x, 0.09, 0.014], [x, 0.035, 0.143], 0.0048);
  }
  add(
    "feet",
    "heel_pad",
    "后跟承重底面",
    { type: "box", w: 0.118, h: 0.012, d: 0.055, bevel: 0.002 },
    [0.265, 0.006, -0.067],
    "dark",
    true,
    [0, 0, 0],
    2,
  );
  // 手指三节骨架和独立侧护板，指尖自然内卷；掌背三角大窗。
  cyl("hands", "wrist", [0.452, 1.207, 0.021], 0.03, 0.045, "dark", true, [0, 0, 0]);
  ring("hands", "wrist_rim", [0.452, 1.23, 0.021], 0.031, 0.021, 0.005, "chrome", true, [0, 0, 0]);
  // 掌背窗口能看到腕部两根倾斜液压杆，与指骨牵引分开。
  piston("hands", "wrist_ulnar", [0.425, 1.217, 0.033], [0.413, 1.159, 0.026], 0.0038);
  piston("hands", "wrist_radial", [0.486, 1.213, 0.032], [0.492, 1.164, 0.025], 0.0038);
  shell(
    "hands",
    "palm",
    "掌背双窗与斜向中梁",
    [
      [-0.049, 0.055],
      [-0.024, 0.063],
      [0.005, 0.044],
      [0.033, 0.051],
      [0.054, 0.018],
      [0.05, -0.032],
      [0.012, -0.062],
      [-0.036, -0.044],
      [-0.059, 0.004],
    ],
    [0.452, 1.141, 0.043],
    {
      dual: true,
      form: "palm",
      rim: 0.002,
      rise: 0.022,
      slope: 0.04,
      fold: -0.1,
      thickness: 0.009,
      bevel: 0.0015,
      corner: 0.004,
      holes: [
        [
          [-0.031, 0.039],
          [-0.015, 0.036],
          [0.004, -0.036],
          [-0.027, -0.018],
          [-0.039, 0.004],
        ],
        [
          [0.009, 0.019],
          [0.034, 0.023],
          [0.036, -0.021],
          [0.016, -0.039],
        ],
      ],
      pins: [
        [-0.044, 0.007],
        [0.036, -0.03],
      ],
      liner: true,
    },
  );
  shell(
    "hands",
    "palm_back",
    "掌心机构基座",
    [
      [-0.037, 0.039],
      [0.034, 0.037],
      [0.034, -0.037],
      [-0.031, -0.043],
    ],
    [0.452, 1.139, -0.004],
    {
      dual: true,
      rotation: [0, 180, 0],
      rise: 0.012,
      material: "darkArmor",
      layer: 2,
    },
  );
  // 参考 20：指节向掌心（局部负 Z）逐节内卷，指背仍保持连续长轮廓。
  for (let finger = 0; finger < 4; finger++) {
    const x = 0.416 + finger * 0.023,
      y = 1.099 - Math.abs(finger - 1.5) * 0.007;
    const fingerLength = [0.95, 1, 0.97, 0.82][finger];
    const fingerCurl = [0.85, 1, 1.08, 1.13][finger];
    const pts: V3[] = [
      [x, y, 0.026],
      [x, y - 0.047 * fingerLength, 0.026 - 0.007 * fingerLength * fingerCurl],
      [x, y - 0.084 * fingerLength, 0.026 - 0.03 * fingerLength * fingerCurl],
      [x, y - 0.108 * fingerLength, 0.026 - 0.06 * fingerLength * fingerCurl],
    ];
    for (let j = 0; j < 3; j++) {
      const a = pts[j],
        b = pts[j + 1],
        delta = new Vector3(...b).sub(new Vector3(...a));
      const axis = delta.clone().normalize();
      const coreA = new Vector3(...a).addScaledVector(axis, 0.0088).toArray() as V3;
      const coreB = new Vector3(...b).addScaledVector(axis, -0.0088).toArray() as V3;
      link("hands", "finger_core_" + finger + "_" + j, coreA, coreB, 0.0063, "dark", true, 3);
      joint("hands", "knuckle_" + finger + "_" + j, a, 0.0088, 0.017);
      const orientation = new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        delta.clone().normalize(),
      );
      const center = new Vector3(...a).add(new Vector3(...b)).multiplyScalar(0.5);
      const half = delta.length() * 0.5 - 0.006;
      for (const face of [-1, 1]) {
        const offset = new Vector3(0, 0, face * 0.0095).applyQuaternion(orientation).add(center);
        const rotation = new Euler().setFromQuaternion(
          orientation
            .clone()
            .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), face < 0 ? Math.PI : 0)),
        );
        shell(
          "hands",
          "finger_plate_" + finger + "_" + j + "_" + face,
          "指节盒形开槽护壳",
          [
            [-0.009, -half],
            [-0.0105, half - 0.004],
            [-0.007, half],
            [0.007, half],
            [0.0105, half - 0.004],
            [0.009, -half],
          ],
          offset.toArray(),
          {
            dual: true,
            rotation: [rotation.x, rotation.y, rotation.z].map((v) => (v * 180) / Math.PI) as V3,
            rise: 0.0015,
            width: 0.01,
            corner: 0.001,
            bevel: 0.0005,
            thickness: 0.0025,
            holes: [
              [
                [-0.004, -half + 0.005],
                [0.004, -half + 0.005],
                [0.004, half - 0.004],
                [-0.004, half - 0.004],
              ],
            ],
            material: "darkArmor",
            layer: 3,
          },
        );
      }
      for (const side of [-1, 1]) {
        const offset = new Vector3(side * 0.009, 0, 0).applyQuaternion(orientation).add(center);
        const rotation = new Euler().setFromQuaternion(
          orientation
            .clone()
            .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (side * Math.PI) / 2)),
        );
        shell(
          "hands",
          "finger_web_" + finger + "_" + j + "_" + side,
          "指骨侧面承力耳板",
          [
            [-0.008, -half],
            [-0.009, half],
            [0.009, half],
            [0.008, -half],
          ],
          offset.toArray(),
          {
            dual: true,
            rotation: [rotation.x, rotation.y, rotation.z].map((v) => (v * 180) / Math.PI) as V3,
            rise: 0,
            corner: 0.001,
            bevel: 0.00035,
            thickness: 0.002,
            holes: [
              [
                [-0.003, -half + 0.004],
                [0.003, -half + 0.004],
                [0.003, half - 0.004],
                [-0.003, half - 0.004],
              ],
            ],
            material: "darkArmor",
            layer: 3,
          },
        );
      }
    }
    piston("hands", "finger_drive_" + finger, [x, 1.177, 0.031], [x, y + 0.008, 0.032], 0.0038);
  }
  piston("hands", "thumb_drive", [0.412, 1.157, -0.008], [0.39, 1.104, 0.008], 0.006);
  joint("hands", "thumb_hinge", [0.397, 1.135, 0.028], 0.012, 0.019);
  link("hands", "thumb_tip", [0.386, 1.115, 0.011], [0.392, 1.083, -0.009], 0.01, "darkArmor", true, 3);
  shell(
    "hands",
    "thumb_plate",
    "拇指外侧甲",
    [
      [-0.013, 0.031],
      [0.012, 0.024],
      [0.011, -0.029],
      [-0.01, -0.029],
    ],
    [0.388, 1.104, 0.019],
    { dual: true, rise: 0.007, corner: 0.004, thickness: 0.006, bevel: 0.001, pins: [[0, 0.01]] },
  );

  joint("hands", "thumb_hinge_distal", [0.394, 1.074, -0.015], 0.009, 0.014);
  link("hands", "thumb_distal_core", [0.398, 1.069, -0.022], [0.405, 1.061, -0.035], 0.006, "dark", true, 3);
  const thumbAxis = new Vector3(0.013, -0.015, -0.023).normalize();
  const thumbQ = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), thumbAxis);
  for (const face of [-1, 1]) {
    const center = new Vector3(0.401, 1.066, -0.027).add(
      new Vector3(0, 0, face * 0.008).applyQuaternion(thumbQ),
    );
    const angles = new Euler().setFromQuaternion(
      thumbQ
        .clone()
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), face < 0 ? Math.PI : 0)),
    );
    shell(
      "hands",
      "thumb_distal_plate_" + face,
      "拇指末节开窗护壳",
      [
        [-0.01, -0.014],
        [-0.012, 0.014],
        [0.012, 0.014],
        [0.01, -0.014],
      ],
      center.toArray(),
      {
        dual: true,
        rotation: [angles.x, angles.y, angles.z].map((v) => (v * 180) / Math.PI) as V3,
        rise: 0.002,
        thickness: 0.003,
        bevel: 0.0006,
        corner: 0.0015,
        holes: [
          [
            [-0.004, -0.008],
            [0.004, -0.008],
            [0.004, 0.007],
            [-0.004, 0.007],
          ],
        ],
        material: "darkArmor",
        layer: 3,
      },
    );
  }

  // 头部：头顶通风、额骨中央凹口、眉骨、眼窝、独立颊颌与侧面耳轴。
  cyl("head", "neck", [0, 2.129, -0.031], 0.032, 0.13, "dark", false, [0, 0, 0], 1);
  ring("head", "neck_seal", [0, 2.183, -0.031], 0.036, 0.0323, 0.012, "chrome", false, [0, 0, 0]);
  piston("head", "neck_strut", [0.023, 2.075, 0.025], [0.028, 2.199, 0.024], 0.0075);
  // 支撑杆移到领甲内侧后，两端通过独立支座接回颈柱，保留固定环完整外缘。
  link(
    "head",
    "neck_strut_mount_lower",
    [0.023, 2.078, 0.019],
    [0.023, 2.082, -0.008],
    0.005,
    "steel",
    true,
    2,
  );
  link(
    "head",
    "neck_strut_mount_upper",
    [0.028, 2.196, 0.018],
    [0.027, 2.191, -0.01],
    0.0045,
    "steel",
    true,
    2,
  );

  shell(
    "head",
    "neck_side",
    "颈部外侧筋板",
    [
      [-0.028, -0.06],
      [-0.023, 0.063],
      [0.01, 0.052],
      [0.028, -0.061],
    ],
    [0.044, 2.125, -0.011],
    {
      dual: true,
      rotation: [0, 65, 0],
      rise: 0.009,
      holes: [
        [
          [-0.012, -0.027],
          [-0.009, 0.036],
          [0.006, 0.022],
          [0.012, -0.031],
        ],
      ],
      material: "darkArmor",
      layer: 2,
    },
  );
  loft(
    "head",
    "cranium",
    [
      [2.24, 0.06, 0.054, -0.032],
      [2.28, 0.081, 0.065, -0.03],
      [2.335, 0.087, 0.068, -0.029],
      [2.365, 0.065, 0.055, -0.024],
      [2.376, 0.028, 0.034, -0.018],
    ],
    "armor",
  );
  shell(
    "head",
    "forehead",
    "额骨鼻梁连续面甲",
    [
      [-0.075, 0.067],
      [-0.043, 0.097],
      [0, 0.104],
      [0.043, 0.097],
      [0.075, 0.067],
      [0.087, 0.012],
      [0.073, -0.014],
      [0.057, -0.026],
      [0.073, -0.038],
      [0.041, -0.05],
      [0.023, -0.058],
      [0.012, -0.041],
      [-0.012, -0.041],
      [-0.023, -0.058],
      [-0.041, -0.05],
      [-0.073, -0.038],
      [-0.057, -0.026],
      [-0.073, -0.014],
      [-0.087, 0.012],
    ],
    [0, 2.289, 0.036],
    {
      form: "face",
      rim: 0.0015,
      rise: 0.03,
      width: 0.087,
      thickness: 0.008,
      bevel: 0.0012,
      corner: 0.004,
      holes: [
        [
          [-0.016, 0.043],
          [-0.022, 0.061],
          [0, 0.077],
          [0.022, 0.061],
          [0.016, 0.043],
        ],
        [
          [0.031, 0.079],
          [0.063, 0.07],
          [0.075, 0.046],
          [0.058, 0.055],
        ],
        [
          [-0.031, 0.079],
          [-0.063, 0.07],
          [-0.075, 0.046],
          [-0.058, 0.055],
        ],
      ],
      pins: [
        [-0.065, 0.027],
        [0.065, 0.027],
        [-0.066, 0.002],
        [0.066, 0.002],
      ],
      liner: true,
    },
  );
  shell(
    "head",
    "face_bridge",
    "面部折面鼻梁",
    [
      [-0.027, 0.022],
      [-0.015, 0.04],
      [0.015, 0.04],
      [0.027, 0.022],
      [0.022, -0.027],
      [0, -0.055],
      [-0.022, -0.027],
    ],
    [0, 2.268, 0.045],
    {
      rise: 0.012,
      fold: -0.18,
      corner: 0.002,
      thickness: 0.007,
      bevel: 0.001,
      material: "darkArmor",
      pins: [[0, -0.027]],
    },
  );
  shell(
    "head",
    "brow",
    "眼窝上沿独立眉骨",
    [
      [-0.025, 0.006],
      [-0.013, 0.014],
      [0.023, 0.016],
      [0.034, 0.003],
      [0.021, -0.008],
      [-0.014, -0.007],
    ],
    [0.044, 2.26, 0.067],
    {
      dual: true,
      rotation: [0, 18, 0],
      rise: 0.012,
      slope: 0.08,
      corner: 0.0018,
      thickness: 0.006,
      bevel: 0.0008,
      material: "darkArmor",
    },
  );
  shell(
    "head",
    "malar",
    "眼下颧骨折板",
    [
      [-0.025, 0.011],
      [0.019, 0.012],
      [0.025, -0.002],
      [0.002, -0.041],
      [-0.019, -0.026],
    ],
    [0.044, 2.247, 0.076],
    {
      dual: true,
      rotation: [0, 24, -6],
      rise: 0.014,
      fold: -0.19,
      corner: 0.002,
      thickness: 0.007,
      bevel: 0.001,
      material: "armor",
      pins: [[0.012, -0.005]],
    },
  );
  const foreheadSurface = shellSurfaces.get("head.forehead")!;
  const insetNormal = shellNormal(foreheadSurface.params, 0.035, 0.056);
  const insetPosition = shellPoint(
    foreheadSurface.params,
    0.035,
    0.056,
    Number(foreheadSurface.params.thickness),
  )
    .addScaledVector(insetNormal, 0.0007)
    .add(new Vector3(...foreheadSurface.position));
  const insetRotation = new Euler().setFromQuaternion(
    new Quaternion()
      .setFromUnitVectors(new Vector3(0, 0, 1), insetNormal)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (-28 * Math.PI) / 180)),
  );
  shell(
    "head",
    "forehead_inset",
    "额角斜置检修盖",
    [
      [-0.012, -0.017],
      [-0.016, 0.01],
      [-0.008, 0.018],
      [0.012, 0.018],
      [0.014, -0.012],
    ],
    insetPosition.toArray(),
    {
      dual: true,
      rotation: [insetRotation.x, insetRotation.y, insetRotation.z].map((v) => (v * 180) / Math.PI) as V3,
      rise: 0.003,
      corner: 0.001,
      thickness: 0.004,
      bevel: 0.0007,
      material: "darkArmor",
      holes: [
        [
          [-0.003, -0.011],
          [0.003, -0.011],
          [0.005, -0.008],
          [0.005, -0.004],
          [0.002, -0.002],
          [0.002, 0.002],
          [0.005, 0.004],
          [0.005, 0.008],
          [0.003, 0.011],
          [-0.003, 0.011],
          [-0.005, 0.008],
          [-0.005, 0.004],
          [-0.002, 0.002],
          [-0.002, -0.002],
          [-0.005, -0.004],
          [-0.005, -0.008],
        ],
      ],
      pins: [[0.009, 0.013]],
    },
  );
  shell(
    "head",
    "temple",
    "颞骨侧面分区壳",
    [
      [-0.035, 0.043],
      [0.008, 0.056],
      [0.041, 0.027],
      [0.035, -0.02],
      [0.004, -0.043],
      [-0.036, -0.019],
    ],
    [0.074, 2.313, -0.019],
    {
      dual: true,
      rotation: [0, 75, 0],
      rise: 0.012,
      fold: -0.14,
      corner: 0.003,
      thickness: 0.006,
      bevel: 0.001,
      pins: [
        [-0.022, 0.026],
        [0.022, 0.013],
        [-0.009, -0.027],
      ],
      direction: [1, 0, 0],
    },
  );
  // 参考 04 的两枚侧颅传感器嵌在颞甲上，安装方向从母壳曲面求取。
  const templeSurface = shellSurfaces.get("head.temple")!;
  const templeRotation = new Quaternion().setFromEuler(
    new Euler(...(templeSurface.rotation.map((v) => (v * Math.PI) / 180) as V3)),
  );
  for (const [sensor, [x, y]] of [
    [-0.014, 0.006],
    [0.018, -0.015],
  ].entries()) {
    const normal = shellNormal(templeSurface.params, x, y);
    const position = shellPoint(templeSurface.params, x, y, Number(templeSurface.params.thickness))
      .addScaledVector(normal, 0.0008)
      .applyQuaternion(templeRotation)
      .add(new Vector3(...templeSurface.position));
    const mount = templeRotation
      .clone()
      .multiply(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal));
    const angles = new Euler().setFromQuaternion(mount);
    const rotation = [angles.x, angles.y, angles.z].map((v) => (v * 180) / Math.PI) as V3;
    shell(
      "head",
      "temple_sensor_" + sensor,
      "侧颅传感器嵌框",
      [
        [-0.013, -0.013],
        [-0.015, 0.006],
        [-0.004, 0.015],
        [0.012, 0.009],
        [0.014, -0.008],
        [0.003, -0.015],
      ],
      position.toArray(),
      {
        dual: true,
        rotation,
        rise: 0,
        thickness: 0.0028,
        bevel: 0.0006,
        corner: 0.0013,
        material: "darkArmor",
        holes: [
          [
            [-0.006, -0.007],
            [0.006, -0.007],
            [0.008, 0],
            [0.005, 0.007],
            [-0.005, 0.007],
            [-0.008, 0],
          ],
        ],
        pins: [
          [-0.01, 0.006],
          [0.009, -0.009],
        ],
      },
    );
    const axisAngles = new Euler().setFromQuaternion(
      mount.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)),
    );
    const axisRotation = [axisAngles.x, axisAngles.y, axisAngles.z].map((v) => (v * 180) / Math.PI) as V3;
    for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
      const center = new Vector3(0, 0, 0.001 + ringIndex * 0.0014).applyQuaternion(mount).add(position);
      ring(
        "head",
        "temple_optics_ring_" + sensor + "_" + ringIndex,
        center.toArray(),
        0.0067 - ringIndex * 0.0012,
        0.0054 - ringIndex * 0.0012,
        0.0011,
        ringIndex === 1 ? "steel" : "dark",
        true,
        axisRotation,
      );
    }
    const center = new Vector3(0, 0, 0.004).applyQuaternion(mount).add(position);
    cyl(
      "head",
      "temple_optics_core_" + sensor,
      center.toArray(),
      0.0027,
      0.0012,
      "dark",
      true,
      axisRotation,
      3,
    );
  }
  shell(
    "head",
    "jaw",
    "下颌尖形护甲",
    [
      [-0.012, 0.041],
      [0.012, 0.041],
      [0.021, 0.004],
      [0.055, 0.035],
      [0.063, 0.013],
      [0.035, -0.05],
      [0, -0.069],
      [-0.035, -0.05],
      [-0.063, 0.013],
      [-0.055, 0.035],
      [-0.021, 0.004],
    ],
    [0, 2.232, 0.071],
    {
      form: "jaw",
      rise: 0.027,
      slope: 0.02,
      fold: -0.12,
      thickness: 0.009,
      bevel: 0.0017,
      corner: 0.004,
      holes: [
        [
          [0.027, -0.005],
          [0.044, 0.013],
          [0.035, -0.022],
          [0.023, -0.035],
        ],
        [
          [-0.027, -0.005],
          [-0.044, 0.013],
          [-0.035, -0.022],
          [-0.023, -0.035],
        ],
      ],
      pins: [
        [-0.019, -0.049],
        [0.019, -0.049],
      ],
      liner: true,
    },
  );
  shell(
    "head",
    "cheek",
    "颊骨独立框架",
    [
      [-0.018, 0.036],
      [0.022, 0.018],
      [0.027, -0.026],
      [0.002, -0.052],
      [-0.023, -0.039],
      [-0.033, 0.003],
    ],
    [0.065, 2.24, 0.025],
    {
      dual: true,
      rotation: [0, 65, 0],
      rise: 0.015,
      thickness: 0.008,
      bevel: 0.0013,
      corner: 0.004,
      holes: [
        [
          [-0.013, 0.011],
          [0.009, 0.003],
          [0.008, -0.024],
          [-0.011, -0.027],
        ],
      ],
      liner: true,
      pins: [[0.012, -0.036]],
    },
  );
  joint("head", "ear", [0.069, 2.264, -0.025], 0.015, 0.014);
  shell(
    "head",
    "occipital",
    "后脑分区装甲",
    [
      [-0.063, 0.059],
      [0, 0.084],
      [0.063, 0.059],
      [0.078, 0.003],
      [0.044, -0.058],
      [0, -0.081],
      [-0.044, -0.058],
      [-0.078, 0.003],
    ],
    [0, 2.307, -0.076],
    {
      form: "occipital",
      rotation: [0, 180, 0],
      rise: 0.02,
      holes: [
        [
          [-0.046, 0.011],
          [-0.025, 0.028],
          [-0.009, 0.011],
          [-0.021, -0.007],
        ],
        [
          [0.046, 0.011],
          [0.025, 0.028],
          [0.009, 0.011],
          [0.021, -0.007],
        ],
      ],
      pins: [[0, -0.033]],
      direction: [0, 0, -1],
    },
  );
  for (const side of [-1, 1]) {
    add(
      "head",
      "optic_" + side,
      "暖色眼部传感器",
      { type: "box", w: 0.013, h: 0.0055, d: 0.005, bevel: 0.001 },
      [side * 0.055, 2.279, 0.072],
      "optic",
      false,
      [0, side * 18, side * 12],
      5,
    );
    for (let i = 0; i < 3; i++)
      add(
        "head",
        "optic_lens_" + side + "_" + i,
        "独立视觉光学单元",
        { type: "box", w: 0.002, h: 0.0036, d: 0.001, bevel: 0.0003 },
        [side * 0.055 + (i - 1) * 0.003, 2.279, 0.076],
        "opticCore",
        false,
        [0, side * 18, side * 12],
        5,
      );
    for (let i = 0; i < 11; i++) {
      add(
        "head",
        "cheek_vent_" + side + "_" + i,
        "面甲微型散热孔",
        { type: "box", w: 0.004, h: 0.0008, d: 0.001, bevel: 0.0002 },
        [side * (0.053 - i * 0.00045), 2.274 + i * 0.0028, 0.043 - i * 0.0007],
        "dark",
        false,
        [0, side * 19, side * 12],
        5,
      );
    }
  }
  // 白模顶壳为三列狭缝，不是贴在表面的深色条纹。
  const crownSlots: Loop[] = [];
  for (let row = 0; row < 10; row++)
    for (let column = 0; column < 3; column++) {
      const x = (column - 1) * 0.014,
        y = -0.022 + row * 0.0045;
      crownSlots.push([
        [x - 0.0048, y - 0.001],
        [x + 0.0048, y - 0.001],
        [x + 0.0048, y + 0.001],
        [x - 0.0048, y + 0.001],
      ]);
    }
  shell(
    "head",
    "crown",
    "头顶三列实体通风孔",
    [
      [-0.071, -0.032],
      [-0.077, -0.018],
      [-0.062, 0.051],
      [-0.026, 0.064],
      [0.026, 0.064],
      [0.062, 0.051],
      [0.077, -0.018],
      [0.071, -0.032],
    ],
    [0, 2.382, -0.025],
    {
      form: "crown",
      width: 0.08,
      rotation: [-90, 0, 0],
      rise: 0.016,
      thickness: 0.004,
      bevel: 0.0003,
      corner: 0.001,
      holes: crownSlots,
      material: "armor",
      direction: [0, 1, 0],
    },
  );

  // 按用户要求移除沿机构线束，也移除其专用分线座和悬空接头。
  // 颈根环绕领甲：每片向外折出，前片承接胸骨，侧后片包住颈根，保留抬头间隙。
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    shell(
      "chest",
      "collar_ring_" + i,
      "环绕颈根的分瓣立领",
      [
        [-0.025, -0.039],
        [-0.024, 0.049],
        [-0.012, 0.058],
        [0.021, 0.049],
        [0.025, -0.029],
        [0.012, -0.048],
      ],
      [Math.sin(angle) * 0.064, 2.145, -0.031 + Math.cos(angle) * 0.064],
      {
        rotation: [0, i * 45, 0],
        rise: 0.007,
        fold: -0.08,
        thickness: 0.006,
        bevel: 0.001,
        corner: 0.003,
        edge: 0.003,
        relief: "collar",
        direction: [Math.sin(angle), 0, Math.cos(angle)],
      },
    );
  }
  shell(
    "back",
    "flank_bridge",
    "肩背与肋侧之间的折面回包甲",
    [
      [-0.042, 0.11],
      [0.025, 0.096],
      [0.044, 0.023],
      [0.031, -0.069],
      [-0.013, -0.122],
      [-0.038, -0.029],
    ],
    [0.235, 1.829, -0.079],
    {
      dual: true,
      rotation: [0, 126, -9],
      rise: 0.015,
      width: 0.055,
      thickness: 0.008,
      corner: 0.004,
      edge: 0.003,
      relief: "limb",
      direction: [1, 0, -1],
    },
  );
  shell(
    "pelvis",
    "iliac_bridge",
    "骨盆前后横梁上沿连接鞍甲",
    [
      [-0.104, 0.021],
      [-0.081, 0.043],
      [0.077, 0.041],
      [0.103, 0.006],
      [0.078, -0.009],
      [0.027, -0.017],
      [-0.069, -0.012],
    ],
    [0.189, 1.324, -0.018],
    {
      dual: true,
      rotation: [0, 90, 0],
      rise: 0.011,
      fold: -0.12,
      width: 0.11,
      thickness: 0.008,
      corner: 0.004,
      relief: "pelvis",
      direction: [1, 1, 0],
    },
  );
  link(
    "waist",
    "vertebra_2_front_mount",
    [0.025, 1.572, 0.018],
    shellAnchor("waist.vertebra_2", 0.025, -0.01, 0),
    0.0045,
    "darkArmor",
    true,
    2,
  );

  // 内外侧护甲与前后壳围成有层次的包覆，关节轴和活塞行程仍留空。
  const sidePlate = (
    assembly: string,
    id: string,
    name: string,
    pos: V3,
    height: number,
    width: number,
    outward: number,
  ) => {
    shell(
      assembly,
      id,
      name,
      [
        [-width * 0.7, height],
        [width * 0.42, height * 0.92],
        [width, height * 0.36],
        [width * 0.7, -height * 0.49],
        [width * 0.24, -height],
        [-width * 0.51, -height * 0.91],
        [-width, -height * 0.22],
      ],
      pos,
      {
        dual: true,
        rotation: [0, outward * 90, 0],
        rise: 0.009,
        width,
        thickness: 0.007,
        bevel: 0.0012,
        corner: 0.004,
        edge: 0.003,
        relief: "limb",
        direction: [outward, 0, 0],
      },
    );
  };
  sidePlate("arms", "upper_outer_guard", "上臂外侧折面护甲", [0.478, 1.8, -0.018], 0.121, 0.039, 1);
  sidePlate("arms", "upper_inner_guard", "上臂内侧折面护甲", [0.349, 1.8, -0.02], 0.117, 0.036, -1);
  sidePlate("arms", "fore_inner_guard", "前臂内侧折面护甲", [0.39, 1.423, -0.008], 0.148, 0.034, -1);
  sidePlate("legs", "thigh_inner_guard", "大腿内侧分层护甲", [0.113, 0.95, -0.025], 0.202, 0.046, -1);
  sidePlate("legs", "calf_inner_guard", "小腿内侧棱面护甲", [0.195, 0.42, -0.025], 0.191, 0.037, -1);
  const fork: Loop = [
    [-0.05, 0.044],
    [0.044, 0.046],
    [0.055, -0.023],
    [0.035, -0.063],
    [0.031, -0.059],
    [0.029, -0.012],
    [-0.026, -0.009],
    [-0.034, -0.056],
    [-0.043, -0.063],
    [-0.057, -0.023],
  ];
  for (const back of [false, true]) {
    shell(
      "arms",
      "upper_elbow_fork" + (back ? "_back" : ""),
      "肘部凹形双叉护甲",
      fork,
      [0.434, 1.662, back ? -0.063 : 0.07],
      {
        dual: true,
        rotation: [0, back ? 180 : 0, 0],
        rise: 0.01,
        thickness: 0.007,
        corner: 0.003,
        edge: 0.003,
        relief: "limb",
        direction: [0, 0, back ? -1 : 1],
      },
    );
    shell(
      "arms",
      "fore_elbow_tongue" + (back ? "_back" : ""),
      "肘部凸形嵌接护甲",
      [
        [-0.017, 0.055],
        [0.015, 0.061],
        [0.021, 0.012],
        [0.042, -0.008],
        [0.032, -0.044],
        [-0.035, -0.039],
        [-0.039, -0.002],
        [-0.02, 0.014],
      ],
      [0.434, 1.613, back ? -0.06 : 0.048],
      {
        dual: true,
        rotation: [0, back ? 180 : 0, 0],
        rise: 0.009,
        thickness: 0.006,
        corner: 0.003,
        edge: 0.003,
        relief: "limb",
        direction: [0, 0, back ? -1 : 1],
      },
    );
  }
  shell(
    "hands",
    "thumb_root_guard",
    "拇指根独立棱面护甲",
    [
      [-0.014, 0.018],
      [0.009, 0.021],
      [0.018, 0.004],
      [0.011, -0.021],
      [-0.008, -0.019],
      [-0.019, -0.004],
    ],
    [0.399, 1.137, 0.039],
    {
      dual: true,
      rise: 0.006,
      fold: -0.12,
      thickness: 0.004,
      corner: 0.002,
      bevel: 0.0007,
      rotation: [0, -20, -13],
    },
  );
  shell(
    "hands",
    "thumb_side_guard",
    "拇指近节侧面回包护甲",
    [
      [-0.012, 0.026],
      [0.01, 0.024],
      [0.014, -0.015],
      [0.005, -0.031],
      [-0.011, -0.025],
    ],
    [0.375, 1.108, 0.006],
    {
      dual: true,
      rotation: [0, -90, -12],
      rise: 0.004,
      thickness: 0.004,
      corner: 0.002,
      bevel: 0.0007,
      direction: [-1, 0, 0],
    },
  );
  parts.sort((a, b) => a.build_layer - b.build_layer || a.build_order - b.build_order);
  if (options.machined !== false) {
    const baselineConstants = resolveConstants({ ...constants, HEIGHT: 2.4 });
    for (const part of parts) {
      if (machinedIds.has(part.id))
        part.geometry = {
          type: "kit",
          kit: "hmt_machined",
          params: {
            id: part.id,
            scale: "HEIGHT/2.4",
            sourceJson: JSON.stringify(resolveSpec(part.geometry, baselineConstants)),
          },
        };
    }
  }
  parts.forEach((p, i) => (p.build_order = i + 100));
  const names: Record<string, string> = {
    head: "头颈",
    torso: "胸廓承力骨架",
    chest: "胸骨与胸翼",
    back: "背甲",
    shoulder: "肩关节与罩壳",
    waist: "三节机械腰椎",
    pelvis: "骨盆",
    arms: "双臂",
    hands: "机械手",
    legs: "双腿",
    feet: "踝与分趾脚",
  };
  return {
    model: "hmt",
    title: "HMT · 双足机器人",
    source_notes: source + "；2.4m 仅为展示尺度",
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
        base: "#454648",
        metalness: 1,
        roughness: 0.78,
        preset: "none",
        clearcoat: 0,
        pbr: "brushed",
        pbrColor: false,
        normalScale: 0.025,
        repeat: [24, 24],
      },
      darkArmor: {
        base: "#303234",
        metalness: 1,
        roughness: 0.72,
        preset: "none",
        pbr: "brushed",
        pbrColor: false,
        normalScale: 0.025,
        repeat: [24, 24],
      },
      dark: { base: "#1e2021", metalness: 0.92, roughness: 0.31, preset: "none" },
      steel: { base: "#626567", metalness: 1, roughness: 0.23, preset: "none" },
      chrome: { base: "#a0a5a8", metalness: 1, roughness: 0.15, preset: "none" },
      red: { base: "#b31b24", metalness: 0.94, roughness: 0.24, preset: "none" },
      redLining: { base: "#391114", metalness: 1, roughness: 0.32, preset: "none" },
      fastener: { base: "#888e94", metalness: 1, roughness: 0.19, preset: "none" },
      optic: {
        base: "#f53e19",
        metalness: 0.2,
        roughness: 0.2,
        emissive: "#ff3a15",
        emissiveIntensity: 1.8,
        preset: "none",
      },
      opticCore: {
        base: "#ffe7c3",
        metalness: 0.1,
        roughness: 0.12,
        emissive: "#fff3dd",
        emissiveIntensity: 3,
        preset: "none",
      },
    },
  };
}
