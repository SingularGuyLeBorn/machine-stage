// 柔性护套的两端分别嵌入固定壳与活动壳；中间褶皱不能只绕铰轴堆在同一个断面。
import { CubicBezierCurve3, Quaternion, Vector3 } from "three";
import type { AssembledModel } from "../../assembler/assembler";

// 从 pedan.generated.json 的肩/肘切面实际顶点包围范围得到，坐标属于原模型静止空间。
// 肩切面中心 (±.848986,4.96,.032891)，肘切面中心 (±1.156165,4.02,.017714)。
export const CUFF = {
  layers: 13,
  halfThickness: 0.026,
  shoulder: { rx: 0.2, rz: 0.34, centerX: 0.8489861, centerZ: 0.032891 },
  elbow: { rx: 0.3, rz: 0.25, centerX: 1.1561649, centerZ: 0.0177143 },
};

export function updateJointCovers(model: AssembledModel): void {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r";
    const upper = model.getNode(`Joint_upper_${suffix}`)!;
    const fore = model.getNode(`Joint_fore_${suffix}`)!;
    upper.updateMatrix();
    fore.updateMatrix();
    for (const kind of ["upper", "fore"]) {
      const shoulder = kind === "upper",
        dimensions = shoulder ? CUFF.shoulder : CUFF.elbow;
      const relative = shoulder ? upper.quaternion : fore.quaternion;
      // 两端各嵌入壳体；肩固定端高于原切面 80mm，活动端低于切面 50mm。
      // [OM-FREEPLAY] 嵌入余量用于展示密封，不代表制造公差或材料真实变形能力。
      const start = shoulder
        ? new Vector3(side * dimensions.centerX, 5.04, dimensions.centerZ)
        : new Vector3(side * (dimensions.centerX - 1.03), -0.89, dimensions.centerZ - 0.34);
      const end = shoulder
        ? new Vector3(side * (dimensions.centerX - 1.03), -0.05, dimensions.centerZ - 0.34).applyMatrix4(
            upper.matrix,
          )
        : new Vector3(side * (dimensions.centerX - 1.25), -0.05, dimensions.centerZ - 0.28).applyMatrix4(
            fore.matrix,
          );
      const span = start.distanceTo(end);
      const curve = new CubicBezierCurve3(
        start,
        start.clone().add(new Vector3(0, -span / 3, 0)),
        end.clone().add(new Vector3(0, span / 3, 0).applyQuaternion(relative)),
        end,
      );
      const nodes = Array.from({ length: CUFF.layers }, (_, i) =>
        model.getNode(`Cuff_${kind}_${suffix}_${i}`)!,
      );
      for (const [i, node] of nodes.entries()) {
        const t = i / (CUFF.layers - 1),
          q = new Quaternion().slerp(relative, t);
        node.position.copy(curve.getPoint(t));
        node.quaternion.copy(q);
        if (!shoulder) {
          node.position.applyMatrix4(upper.matrix);
          node.quaternion.premultiply(upper.quaternion);
        }
        const taper = shoulder ? 0.85 + 0.15 * Math.sin(Math.PI * t) : 1;
        node.scale.set(taper, 1, taper);
      }
      // 由实际相邻中心距离与转角决定轴向重叠量，而非固定圈距。
      // 角差会拉开外弧：仅检查圆心距离仍会漏掉截图里的细长透光缝。
      for (const [i, node] of nodes.entries()) {
        let reach = 0;
        for (const j of [i - 1, i + 1]) {
          const neighbor = nodes[j];
          if (!neighbor) continue;
          const arc =
            2 *
            Math.max(dimensions.rx, dimensions.rz) *
            Math.sin(node.quaternion.angleTo(neighbor.quaternion) / 2);
          reach = Math.max(reach, node.position.distanceTo(neighbor.position) + arc);
        }
        node.scale.y = Math.max(1, reach / (CUFF.halfThickness * 1.5));
      }
    }
  }
}
