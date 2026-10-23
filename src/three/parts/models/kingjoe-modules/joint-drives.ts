// 肩肘内部驱动：齿轮响应真实关节角，双液压缸由两端安装点解算伸缩。
import * as THREE from "three";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import { CUFF } from "./joint-covers";
// 轴承与轮毂的相对尺寸也供端面耦合使用，运动和特效共用安装面。
export const JOINT_DRIVE = {
  upper: 0.14,
  fore: 0.16,
  bearingCenter: 0.9,
  bearingWire: 0.12,
  bearingRadius: 0.76,
  hubCenter: 0.55,
  hubThickness: 0.16,
} as const;
const UP = new THREE.Vector3(0, 1, 0);
export function addJointDrives(parts: PartDefinition[], nodes: ModelRegistry["nodes"]): void {
  for (const side of ["l", "r"]) {
    for (const kind of ["upper", "fore"] as const) {
      const key = `${kind}_${side}`,
        base = `JointDrive_${key}`,
        r = JOINT_DRIVE[kind];
      nodes.push({ name: base, parent: "Module_head_arms", motion: "rotate" });
      const rotor = `${base}_rotor`;
      nodes.push({ name: rotor, parent: base, motion: "rotate" });
      const add = (
        name: string,
        label: string,
        node: string,
        kit: string,
        params: Record<string, number>,
        material: string,
        position: [number, number, number] = [0, 0, 0],
        rotation: [number, number, number] = [0, 0, 0],
      ) => {
        parts.push({
          id: `kingjoemodules.head_arms.drive_${key}_${name}`,
          name_cn: label,
          name_en: name,
          assembly: "head_arms",
          node,
          build_layer: 2,
          build_order: 46000 + parts.length,
          geometry: { type: "kit", kit, params },
          material,
          mate: { type: "absolute", position, rotation },
          tags: ["internal", "joint-drive"],
          source: "原创肩肘齿轮与双缸驱动；安装端随真实父子关节解算",
        });
      };
      add(
        "axle",
        "贯通关节传动轴",
        base,
        "pedanCylinder",
        { r: r * 0.32, h: r * 2.3 },
        "pedan_chrome",
        [0, 0, 0],
        [0, 0, 90],
      );
      for (const sign of [-1, 1]) {
        add(
          `bearing_${sign < 0 ? "a" : "b"}`,
          "关节轴承外圈",
          base,
          "pedanRing",
          { r: r * JOINT_DRIVE.bearingRadius, wire: r * JOINT_DRIVE.bearingWire },
          "pedan_coil",
          [sign * r * JOINT_DRIVE.bearingCenter, 0, 0],
          [0, 90, 0],
        );
        add(
          `hub_${sign < 0 ? "a" : "b"}`,
          "差动齿轮轮毂",
          rotor,
          "pedanCylinder",
          { r: r * 0.88, h: r * JOINT_DRIVE.hubThickness },
          "pedan_titanium",
          [sign * r * JOINT_DRIVE.hubCenter, 0, 0],
          [0, 0, 90],
        );
      }
      const teeth: string[] = [];
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 9,
          node = `${base}_tooth_${i}`;
        teeth.push(node);
        nodes.push({
          name: node,
          parent: rotor,
          pivot: [0, Math.cos(a) * r, Math.sin(a) * r],
          rest_rotation: [i * 20, 0, 0],
        });
      }
      parts.push({
        id: `kingjoemodules.head_arms.drive_${key}_teeth`,
        name_cn: "关节差动齿圈",
        name_en: "joint gear teeth",
        assembly: "head_arms",
        node: rotor,
        instances: 18,
        indexed: true,
        instance_nodes: teeth,
        build_layer: 2,
        build_order: 46000 + parts.length,
        geometry: { type: "kit", kit: "pedanBox", params: { w: r * 0.9, h: r * 0.22, d: r * 0.17 } },
        material: "pedan_chrome",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["internal", "joint-drive"],
        source: "十八齿随关节实际转角旋转",
      });
      for (let lane = 0; lane < 2; lane++) {
        const ram = `${base}_ram_${lane}`;
        nodes.push({ name: ram, parent: "Module_head_arms", motion: "rotate" });
        for (const element of ["barrel", "rod", "gel"]) {
          const node = `${ram}_${element}`;
          nodes.push({ name: node, parent: ram, motion: "scalar" });
          add(
            `${lane}_${element}`,
            element === "barrel"
              ? "关节伸缩缸体"
              : element === "rod"
                ? "随抬臂伸出的活塞杆"
                : "活塞间虹彩柔性耦合",
            node,
            element === "gel" ? "pedanGel" : "pedanCylinder",
            element === "gel" ? {} : { r: element === "barrel" ? 0.048 : 0.023, h: 1 },
            element === "barrel" ? "pedan_red" : element === "rod" ? "pedan_chrome" : "pedan_gel",
          );
        }
        for (const end of ["a", "b"]) {
          const node = `${ram}_${end}`;
          nodes.push({ name: node, parent: ram, motion: "translate" });
          add(`${lane}_bearing_${end}`, "液压杆球铰安装座", node, "pedanBall", { r: 0.056 }, "pedan_coil");
        }
      }
    }
  }
}
function placeRam(model: AssembledModel, name: string, a: THREE.Vector3, b: THREE.Vector3): void {
  const node = model.getNode(name)!;
  const direction = b.clone().sub(a),
    length = direction.length();
  node.position.copy(a);
  node.quaternion.setFromUnitVectors(UP, direction.normalize());
  const barrel = model.getNode(`${name}_barrel`)!,
    rod = model.getNode(`${name}_rod`)!,
    gel = model.getNode(`${name}_gel`)!;
  barrel.position.y = length * 0.28;
  barrel.scale.y = length * 0.56;
  rod.position.y = length * 0.72;
  rod.scale.y = length * 0.56;
  // 中段以有起伏的透明胶桥包住杆件间隙，端部坐标保持稳定。
  gel.position.y = length * 0.58;
  gel.scale.set(0.065, length * 0.38, 0.065);
  model.getNode(`${name}_b`)!.position.y = length;
}
export function updateJointDrives(model: AssembledModel): void {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r",
      upper = model.getNode(`Joint_upper_${suffix}`)!,
      fore = model.getNode(`Joint_fore_${suffix}`)!;
    upper.updateMatrix();
    fore.updateMatrix();
    for (const kind of ["upper", "fore"] as const) {
      const key = `${kind}_${suffix}`,
        base = model.getNode(`JointDrive_${key}`)!;
      const first = model.getNode(`Cuff_${key}_0`)!,
        last = model.getNode(`Cuff_${key}_${CUFF.layers - 1}`)!;
      base.position.copy(first.position).lerp(last.position, 0.5);
      base.quaternion.copy(first.quaternion).slerp(last.quaternion, 0.5);
      // 齿轮传动相位来自关节角，不加与抬臂无关的时钟自转。
      model.getNode(`JointDrive_${key}_rotor`)!.rotation.x =
        (kind === "upper" ? upper.rotation.x : fore.rotation.x) * 2.4;
      for (let lane = 0; lane < 2; lane++) {
        const z = lane === 0 ? -0.12 : 0.15;
        // [OM-FREEPLAY] 双缸沿关节前后错列；端点取壳内安装区，随父子件独立运动。
        const a =
          kind === "upper"
            ? new THREE.Vector3(side * 0.86, 5.04, z)
            : new THREE.Vector3(side * 0.11, -0.65, z - 0.34).applyMatrix4(upper.matrix);
        const b =
          kind === "upper"
            ? new THREE.Vector3(-side * 0.07, -0.36, z - 0.34).applyMatrix4(upper.matrix)
            : new THREE.Vector3(-side * 0.08, -0.26, z - 0.28)
                .applyMatrix4(fore.matrix)
                .applyMatrix4(upper.matrix);
        placeRam(model, `JointDrive_${key}_ram_${lane}`, a, b);
      }
    }
  }
}
