import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export type HmtPoint = [number, number, number];
const radians = Math.PI / 180;
const unit = new Vector3(1, 1, 1);

function turn(pivot: HmtPoint, angles: HmtPoint): Matrix4 {
  return new Matrix4()
    .makeTranslation(...pivot)
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(...(angles.map((a) => a * radians) as HmtPoint))))
    .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
}

function align(a: Vector3, b: Vector3, targetA: Vector3, targetB: Vector3): Matrix4 {
  const q = new Quaternion().setFromUnitVectors(
    b.clone().sub(a).normalize(),
    targetB.clone().sub(targetA).normalize(),
  );
  return new Matrix4().compose(targetA, q, unit).multiply(new Matrix4().makeTranslation(-a.x, -a.y, -a.z));
}

/**
 * 从同款正、背、侧面共同建立静止承重姿态。
 * 所有刚性壳体与其螺钉共用骨段变换；腿用两段长度约束保持脚底接地。
 * [OM-FREEPLAY] 图片没有骨骼角度标尺，以下角度和微小重心偏移是多视图估计。
 */
export function createHmtRestPose() {
  // 骨盆前送，胸肩通过腰部分段反弯后收；不是把整个人向脚尖方向平移。
  const pelvis = new Matrix4()
    .makeTranslation(0.025, -0.028, 0.065)
    .multiply(turn([0, 1.3, -0.037], [-12, -3, -2]));
  const waist0 = pelvis.clone().multiply(turn([0, 1.33, -0.037], [-38, 1, 3]));
  const waist1 = waist0.clone().multiply(turn([0, 1.435, -0.037], [52, 1, -1]));
  const waist2 = waist1.clone().multiply(turn([0, 1.526, -0.037], [8, 1, -2]));
  const chest = waist2.clone().multiply(turn([0, 1.67, -0.037], [-15, 2, 0]));
  const head = chest.clone().multiply(turn([0, 2.13, -0.031], [1, 9, 2]));
  // 肩带保持后收，上臂从肩轴向外张开；消除胸廓微小侧倾带来的双臂高低差。
  const armPivot = new Vector3(0, 1.985, -0.012);
  const armCenter = armPivot.clone().applyMatrix4(chest);
  const chestUp = new Vector3(0, 1, 0).transformDirection(chest);
  const armFrame = new Matrix4()
    .makeTranslation(...armCenter.toArray())
    .multiply(new Matrix4().makeRotationX(Math.atan2(chestUp.z, chestUp.y)))
    .multiply(new Matrix4().makeTranslation(...armPivot.clone().negate().toArray()));
  const sides = new Map<
    number,
    {
      shoulder: Matrix4;
      upper: Matrix4;
      fore: Matrix4;
      hand: Matrix4;
      thigh: Matrix4;
      calf: Matrix4;
      foot: Matrix4;
    }
  >();
  for (const side of [1, -1]) {
    // 肩带、关节、上臂共用后收变换，保持锁骨到肩轴的真实连接。
    const shoulder = armFrame.clone().multiply(turn([side * 0.08, 1.99, -0.025], [0, side * 24, 0]));
    const upper = shoulder.clone().multiply(turn([side * 0.355, 1.985, -0.012], [8, side * -10, side * 18]));
    const foreBase = upper.clone().multiply(turn([side * 0.434, 1.644, 0.002], [-22, side * 7, side * -8]));
    const elbowSource = new Vector3(side * 0.434, 1.644, 0.002);
    const wristSource = new Vector3(side * 0.452, 1.207, 0.021);
    const elbow = elbowSource.clone().applyMatrix4(upper);
    const oldWrist = wristSource.clone().applyMatrix4(foreBase);
    const foreLength = oldWrist.distanceTo(elbow);
    const foreForward = 0.141;
    // 肘外张、腕部浅内收形成正面折线；手掌朝内，并在大腿外侧留出活动间隙。
    const targetWrist = elbow
      .clone()
      .add(
        new Vector3(-side * 0.025, -Math.sqrt(foreLength ** 2 - 0.025 ** 2 - foreForward ** 2), foreForward),
      );
    const fore = align(elbow, oldWrist, elbow, targetWrist).multiply(foreBase);
    // 锁定腕心，把掌根到掌心的方向直接接续前臂；不再叠加第二次腕部侧折。
    const palmSource = new Vector3(side * 0.452, 1.141, 0.043);
    const foreSource = wristSource.clone().sub(elbowSource);
    const alignedHand = fore
      .clone()
      .multiply(align(wristSource, palmSource, wristSource, wristSource.clone().add(foreSource)));
    // 自然垂手的掌心朝内且微向后、拇指朝前；旋转轴仍是前臂，腕心和中线不变。
    const hand = new Matrix4()
      .compose(
        targetWrist,
        new Quaternion().setFromAxisAngle(targetWrist.clone().sub(elbow).normalize(), side * -55 * radians),
        unit,
      )
      .multiply(new Matrix4().makeTranslation(...targetWrist.clone().negate().toArray()))
      .multiply(alignedHand);
    const hip = new Vector3(side * 0.166, 1.221, -0.014);
    const knee = new Vector3(side * 0.218, 0.679, 0.008);
    const ankle = new Vector3(side * 0.265, 0.156, -0.017);
    const targetHip = hip.clone().applyMatrix4(pelvis);
    const targetAnkle = new Vector3(side * 0.284, 0.156, side > 0 ? -0.015 : 0.045);
    const axis = targetAnkle.clone().sub(targetHip);
    const distance = axis.length();
    axis.normalize();
    const upperLength = hip.distanceTo(knee),
      lowerLength = knee.distanceTo(ankle);
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const forward = new Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    const kneeHeight = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const targetKnee = targetHip.clone().addScaledVector(axis, along).addScaledVector(forward, kneeHeight);
    const thigh = align(hip, knee, targetHip, targetKnee);
    const calf = align(knee, ankle, targetKnee, targetAnkle);
    const foot = new Matrix4()
      .makeTranslation(...targetAnkle.clone().sub(ankle).toArray())
      .multiply(turn(ankle.toArray(), [0, side * 11, 0]));
    sides.set(side, { shoulder, upper, fore, hand, thigh, calf, foot });
  }
  function waist(y: number): Matrix4 {
    return y < 1.435 ? waist0 : y < 1.526 ? waist1 : waist2;
  }
  function matrix(assembly: string, id: string, side: number, y: number): Matrix4 {
    const limb = sides.get(side)!;
    if (assembly === "pelvis") return pelvis;
    if (assembly === "waist") {
      const section = /^(?:disc_rim|disc|vertebra|rear_link)_(\d)/.exec(id);
      return waist(section ? 1.39 + Number(section[1]) * 0.091 : y);
    }
    if (assembly === "head") return head;
    if (assembly === "shoulder") return limb.shoulder;
    if (assembly === "hands") return limb.hand;
    if (assembly === "feet") return limb.foot;
    if (assembly === "arms") return /^(fore|radius)/.test(id) ? limb.fore : limb.upper;
    if (assembly === "legs")
      return /^(thigh|femur|hip_drive)/.test(id) || (id === "knee_drive" && y > 0.679)
        ? limb.thigh
        : limb.calf;
    return chest;
  }
  /** 柔性线束按每个控制点所在骨段随动，跨关节的活塞两端分别落在各自连接耳。 */
  function point(assembly: string, id: string, p: HmtPoint, side: number): Vector3 {
    let m = matrix(assembly, id, side, p[1]);
    if (assembly === "waist" && id === "spinal_bus_mount" && p[1] < 1.33) m = pelvis;
    if (assembly === "torso" && (id === "abdominal_harness" || id.startsWith("abdominal_harness_")))
      m = p[1] < 1.67 ? waist(p[1]) : chest;
    if (assembly === "torso" && id === "clavicle" && Math.abs(p[0]) > 0.08) m = sides.get(side)!.shoulder;
    if (assembly === "shoulder" && id.startsWith("harness")) {
      if (p[0] < 0.23) m = chest;
      else if (p[1] < 1.98 && p[0] > 0.36) m = sides.get(side)!.upper;
    }
    if (assembly === "legs" && id === "knee_drive")
      m = p[1] > 0.679 ? sides.get(side)!.thigh : sides.get(side)!.calf;
    return new Vector3(p[0] * side, p[1], p[2]).applyMatrix4(m);
  }
  return { matrix, point, pelvis, chest, head, waist, sides };
}
