// ============================================================================
// t800/mesh/pose —— 源网格的姿态修正
//
// 源网格的绑定姿势是 **A 字张开**（手在 z = ±0.6 m，参考图里终结者内骨骼是
// 手臂垂下的站姿）。这里把两侧手臂（肩以下全部：上臂/前臂/手/五指）绕肩关节
// 转 40°，变成自然垂手。
//
// 关键：旋转必须**烘焙进几何**。只给节点加静止旋转是不行的——
// 零件的装配偏移是按静止矩阵算的，节点转了零件会被反向补偿回去，姿势不变。
// ============================================================================

/** 手臂从 A-pose 转到垂手的角度（度）。 */
export const ARM_POSE_DEG = 40;

/** 肩关节位置（模型坐标）：右（+Z）/ 左（−Z）。 */
export function shoulderPivot(side: 1 | -1): [number, number, number] {
  return [0, 1.53, side > 0 ? 0.2 : -0.22];
}

/** 绕 X 轴旋转点（pivot 为轴上一点，角度单位度）。 */
export function rotateAboutX(
  p: [number, number, number],
  pivot: [number, number, number],
  deg: number,
): [number, number, number] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const y = p[1] - pivot[1];
  const z = p[2] - pivot[2];
  return [p[0], pivot[1] + y * cos - z * sin, pivot[2] + y * sin + z * cos];
}

/**
 * 属于「手臂」的部位（肩以下）。判断依据是部位名里的关键字——
 * 源模型 helper 骨的左右前缀是反的，所以只看关键字不看 L/R。
 */
export function isArmSideJoint(name: string): boolean {
  return /upperArm|ArmRoll|ForeArm|Elbow|Bicep|hand|InHandPinky|thumb|index|middle|ring|pinky/i.test(
    name,
  );
}

/** 该部位所在侧：+1 = 右（+Z），−1 = 左（−Z）。用顶点 z 的重心判断。 */
export function sideOf(zCentroid: number): 1 | -1 {
  return zCentroid >= 0 ? 1 : -1;
}
