import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  ApplyForce,
  BatchedRenderer,
  Bezier,
  ColorOverLife,
  ConstantColor,
  ConstantValue,
  Gradient,
  IntervalValue,
  ParticleSystem,
  PiecewiseBezier,
  RenderMode,
  SizeOverLife,
  SpeedOverLife,
  SphereEmitter,
  Vector3 as QVec3,
  Vector4 as QVec4,
} from "three.quarks";
import { TIGER_DETONATION_IMPACT, TIGER_PREHEAT_END } from "@/three/parts/models/tiger/motion";
import { useStageStore } from "@/app/state/stageStore";

// ============================================================================
// TigerVfx —— 虎式多相爆炸/燃烧（three.quarks 粒子 + 冲击波 + 焦痕 + 点光）
//
// 分相（docs/briefs/damage-and-ammo.md）：
//   初焰闪（加色 billboard + 点光）→ 火球（quarks 火粒子）→ 冲击波（扩散环）
//   → 火花/破片（quarks 拉伸 billboard / 网格碎片）→ 烟（quarks 大 billboard）
//   → 焦痕（贴花，留到状态结束）
// 弹种：轻击 = 穿甲（穿孔闪光 + 窄束火花 + 小孔焦痕）；重击 = 榴弹（全相）；
//       弹药殉爆 = 炮塔座圈处的更大全相 + 火势蔓延到发动机舱。
// 性能：粒子按材质批处理（BatchedRenderer），同屏多爆各自独立系统，结束后销毁。
// ============================================================================

const TIGER_ID = "tiger";
/** 命中点：炮塔右侧装甲外表面（炮塔壳体 z ±0.94，与默认 3/4 视角同侧）。 */
const IMPACT = new THREE.Vector3(-1.35, 1.52, 0.955);
/** 斜角命中：椭圆撕裂口 + 上游跳弹划痕。 */
const OBLIQUE = new THREE.Vector3(-1.75, 1.45, 0.955);
/** 跳弹未穿：只有犁沟/凹陷/崩落。 */
const RICOCHET = new THREE.Vector3(-1.3, 1.36, 0.955);
const IMPACT_NORMAL = new THREE.Vector3(0, 0, 1);
const RING = new THREE.Vector3(-1.65, 1.16, 0);
/** 炮塔顶部排烟风扇罩（泄压阀喷火位置）。 */
const VENT = new THREE.Vector3(-0.92, 1.9, -0.2);
/** 车长塔舱口（弹药架升温时冒烟）。 */
const CUPOLA = new THREE.Vector3(-1.3, 1.95, -0.42);
const ENGINE_DECK = new THREE.Vector3(0.52, 1.16, 0.34);

/** 确定性伪随机（贴图生成用，避免每次刷新纹理不同）。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface VfxAssets {
  fireMaterial: THREE.MeshBasicMaterial;
  smokeMaterial: THREE.MeshBasicMaterial;
  sparkMaterial: THREE.MeshBasicMaterial;
  flashTexture: THREE.Texture;
  shockTexture: THREE.Texture;
  scorchTexture: THREE.Texture;
  holeTexture: THREE.Texture;
  ricochetTexture: THREE.Texture;
  /** 静态破碎板的热影响/掉漆环（中心透明，叠在几何破口周围）。 */
  heatRingTexture: THREE.Texture;
  /** 凹陷坑缘的掉漆/磨损环（中心透明，叠在参数化凹陷周围）。 */
  dentRingTexture: THREE.Texture;
  debrisGeometry: THREE.BufferGeometry;
  debrisMaterial: THREE.MeshStandardMaterial;
  dispose(): void;
}

function makeAssets(): VfxAssets {
  const fireTexture = canvasTexture(128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255,255,240,1)");
    gradient.addColorStop(0.18, "rgba(255,224,140,0.98)");
    gradient.addColorStop(0.45, "rgba(255,146,36,0.82)");
    gradient.addColorStop(0.72, "rgba(220,60,4,0.42)");
    gradient.addColorStop(1, "rgba(80,10,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const rand = seeded(7);
    for (let i = 0; i < 8; i++) {
      const x = 40 + rand() * 48;
      const y = 40 + rand() * 48;
      const r = 8 + rand() * 18;
      const lobe = ctx.createRadialGradient(x, y, 0, x, y, r);
      lobe.addColorStop(0, "rgba(255,214,120,0.5)");
      lobe.addColorStop(1, "rgba(255,90,0,0)");
      ctx.fillStyle = lobe;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  const smokeTexture = canvasTexture(128, (ctx) => {
    const rand = seeded(13);
    for (let i = 0; i < 34; i++) {
      const x = 26 + rand() * 76;
      const y = 26 + rand() * 76;
      const r = 8 + rand() * 22;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, "rgba(190,188,182,0.16)");
      puff.addColorStop(0.65, "rgba(130,128,122,0.1)");
      puff.addColorStop(1, "rgba(90,88,84,0)");
      ctx.fillStyle = puff;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 边缘软遮罩，避免烟团出现方形边界
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(64, 64, 30, 64, 64, 63);
    mask.addColorStop(0, "rgba(255,255,255,1)");
    mask.addColorStop(0.75, "rgba(255,255,255,0.85)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, 128, 128);
  });

  const sparkTexture = canvasTexture(64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.22, "rgba(255,238,170,1)");
    gradient.addColorStop(0.55, "rgba(255,164,48,0.8)");
    gradient.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });

  const flashTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(31);
    const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.16, "rgba(255,246,210,1)");
    core.addColorStop(0.42, "rgba(255,190,90,0.7)");
    core.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + rand() * 0.2;
      const length = 55 + rand() * 68;
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate(angle);
      const ray = ctx.createLinearGradient(0, 0, length, 0);
      ray.addColorStop(0, "rgba(255,244,200,0.9)");
      ray.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

  const shockTexture = canvasTexture(256, (ctx) => {
    ctx.translate(128, 128);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 78 + i * 7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,${220 - i * 25},${170 - i * 30},${0.2 - i * 0.04})`;
      ctx.lineWidth = 5 - i;
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(0, 0, 56, 0, 0, 110);
    glow.addColorStop(0, "rgba(255,240,210,0)");
    glow.addColorStop(0.55, "rgba(255,230,190,0.24)");
    glow.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 112, 0, Math.PI * 2);
    ctx.fill();
  });

  const scorchTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(41);
    const core = ctx.createRadialGradient(128, 128, 4, 128, 128, 118);
    core.addColorStop(0, "rgba(14,12,10,0.95)");
    core.addColorStop(0.55, "rgba(26,21,17,0.86)");
    core.addColorStop(0.8, "rgba(42,32,24,0.45)");
    core.addColorStop(1, "rgba(40,30,22,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = 25 + rand() * 85;
      const x = 128 + Math.cos(angle) * distance;
      const y = 128 + Math.sin(angle) * distance;
      const r = 4 + rand() * 18;
      const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
      spot.addColorStop(0, "rgba(8,7,6,0.7)");
      spot.addColorStop(1, "rgba(8,7,6,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  // 弹孔：不规则撕裂孔（18 边形径向噪声 + 3 个尖角）+ 热影响蓝黑圈 +
  // 崩落掉漆 + 放射裂纹。绝不是正圆。
  const holeTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(59);
    const cx = 128;
    const cy = 128;
    const heat = ctx.createRadialGradient(cx, cy, 26, cx, cy, 120);
    heat.addColorStop(0, "rgba(12,10,8,0)");
    heat.addColorStop(0.3, "rgba(38,48,64,0.55)");
    heat.addColorStop(0.48, "rgba(104,66,30,0.42)");
    heat.addColorStop(0.72, "rgba(28,22,18,0.5)");
    heat.addColorStop(1, "rgba(18,14,11,0)");
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, 256, 256);

    // 崩落/掉漆：孔外一圈不规则浅色金属斑与暗斑
    for (let i = 0; i < 74; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = 48 + rand() * 74;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const r = 1.5 + rand() * 7;
      ctx.fillStyle =
        rand() < 0.55
          ? `rgba(${125 + Math.round(rand() * 40)},${112 + Math.round(rand() * 30)},${88 + Math.round(rand() * 25)},${0.18 + rand() * 0.3})`
          : `rgba(22,18,14,${0.18 + rand() * 0.3})`;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const rr = r * (0.55 + rand() * 0.75);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // 放射裂纹
    for (let i = 0; i < 11; i++) {
      const angle = (i / 11) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const start = 34 + rand() * 8;
      const length = 22 + rand() * 74;
      ctx.strokeStyle = `rgba(8,7,6,${0.35 + rand() * 0.5})`;
      ctx.lineWidth = 0.8 + rand() * 2.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
      const mid = start + length * 0.55;
      ctx.lineTo(
        cx + Math.cos(angle + 0.06) * mid,
        cy + Math.sin(angle + 0.06) * mid,
      );
      ctx.lineTo(cx + Math.cos(angle - 0.03) * (start + length), cy + Math.sin(angle - 0.03) * (start + length));
      ctx.stroke();
    }

    // 不规则孔：18 边形、3 个尖角、随机缺口
    const spikes = new Set<number>();
    while (spikes.size < 3) spikes.add(Math.floor(rand() * 18));
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + (rand() - 0.5) * 0.2;
      const spike = spikes.has(i);
      const notch = rand() < 0.22 ? 0.52 + rand() * 0.16 : 0.8 + rand() * 0.36;
      const r = 42 * (spike ? 1.28 + rand() * 0.38 : notch);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    const hole = ctx.createRadialGradient(cx, cy, 2, cx, cy, 42);
    hole.addColorStop(0, "rgba(2,2,2,1)");
    hole.addColorStop(0.55, "rgba(7,6,5,1)");
    hole.addColorStop(0.85, "rgba(24,19,15,0.98)");
    hole.addColorStop(1, "rgba(42,33,25,0.9)");
    ctx.fillStyle = hole;
    ctx.beginPath();
    points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
    // 撕裂边缘的金属亮边
    ctx.strokeStyle = "rgba(158,138,108,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // 热影响/掉漆环：中心透明（露出几何破口与内构），只保留蓝黑退火圈和崩落漆片
  const heatRingTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(83);
    const cx = 128;
    const cy = 128;
    const ring = ctx.createRadialGradient(cx, cy, 34, cx, cy, 124);
    ring.addColorStop(0, "rgba(0,0,0,0)");
    ring.addColorStop(0.24, "rgba(0,0,0,0)");
    ring.addColorStop(0.34, "rgba(44,58,82,0.22)");
    ring.addColorStop(0.44, "rgba(120,72,36,0.18)");
    ring.addColorStop(0.58, "rgba(34,26,20,0.16)");
    ring.addColorStop(0.78, "rgba(24,20,16,0.08)");
    ring.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, 256, 256);
    // 斑驳退火/掉漆：不画连续圆环，只撒不规则的蓝黑/棕/金属碎斑
    for (let i = 0; i < 150; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = 40 + rand() * 84;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const r = 1.2 + rand() * 7;
      const kind = rand();
      ctx.fillStyle =
        kind < 0.3
          ? `rgba(${40 + Math.round(rand() * 30)},${52 + Math.round(rand() * 34)},${76 + Math.round(rand() * 34)},${0.12 + rand() * 0.28})`
          : kind < 0.6
            ? `rgba(${110 + Math.round(rand() * 40)},${70 + Math.round(rand() * 30)},${36 + Math.round(rand() * 24)},${0.12 + rand() * 0.26})`
            : rand() < 0.5
              ? `rgba(${135 + Math.round(rand() * 45)},${120 + Math.round(rand() * 35)},${92 + Math.round(rand() * 30)},${0.16 + rand() * 0.3})`
              : `rgba(22,18,14,${0.14 + rand() * 0.24})`;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const rr = r * (0.55 + rand() * 0.7);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  });

  // 凹陷坑缘：掉漆/磨损环 + 细裂纹（中心透明，不遮凹坑）
  const dentRingTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(97);
    const cx = 128;
    const cy = 128;
    const ring = ctx.createRadialGradient(cx, cy, 26, cx, cy, 120);
    ring.addColorStop(0, "rgba(0,0,0,0)");
    ring.addColorStop(0.28, "rgba(0,0,0,0)");
    ring.addColorStop(0.4, "rgba(36,30,24,0.2)");
    ring.addColorStop(0.58, "rgba(80,68,52,0.16)");
    ring.addColorStop(0.8, "rgba(24,20,16,0.1)");
    ring.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = 38 + rand() * 76;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const r = 1 + rand() * 5.5;
      const kind = rand();
      ctx.fillStyle =
        kind < 0.55
          ? `rgba(${145 + Math.round(rand() * 45)},${132 + Math.round(rand() * 40)},${108 + Math.round(rand() * 32)},${0.16 + rand() * 0.32})`
          : `rgba(24,20,16,${0.14 + rand() * 0.26})`;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const rr = r * (0.55 + rand() * 0.65);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const start = 38 + rand() * 6;
      const length = 16 + rand() * 42;
      ctx.strokeStyle = `rgba(10,8,7,${0.3 + rand() * 0.4})`;
      ctx.lineWidth = 0.7 + rand() * 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
      ctx.lineTo(cx + Math.cos(angle + 0.05) * (start + length), cy + Math.sin(angle + 0.05) * (start + length));
      ctx.stroke();
    }
  });

  // 跳弹：长条犁沟 + 亮金属擦痕 + 端部掉漆；没有穿透孔
  const ricochetTexture = canvasTexture(256, (ctx) => {
    const rand = seeded(71);
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-0.08);
    const dent = ctx.createLinearGradient(0, -26, 0, 30);
    dent.addColorStop(0, "rgba(20,16,12,0)");
    dent.addColorStop(0.35, "rgba(18,15,12,0.55)");
    dent.addColorStop(0.55, "rgba(4,4,4,0.9)");
    dent.addColorStop(0.72, "rgba(105,92,70,0.5)");
    dent.addColorStop(1, "rgba(20,16,12,0)");
    ctx.fillStyle = dent;
    ctx.beginPath();
    ctx.moveTo(-118, 4);
    ctx.quadraticCurveTo(-20, -22, 118, -6);
    ctx.quadraticCurveTo(10, 24, -118, 16);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const offset = i * 4 - 8;
      ctx.strokeStyle = i < 2 ? "rgba(190,172,140,0.5)" : "rgba(8,7,6,0.75)";
      ctx.lineWidth = 1.2 + rand() * 1.8;
      ctx.beginPath();
      ctx.moveTo(-112, offset);
      ctx.quadraticCurveTo(-10, offset - 14, 112, offset - 8);
      ctx.stroke();
    }
    // 端部掉漆
    for (let i = 0; i < 40; i++) {
      const x = 60 + rand() * 80;
      const y = -24 + rand() * 48;
      const r = 1.5 + rand() * 5;
      ctx.fillStyle = `rgba(${160 + Math.round(rand() * 55)},${150 + Math.round(rand() * 45)},${120 + Math.round(rand() * 35)},${0.3 + rand() * 0.45})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  const fireMaterial = new THREE.MeshBasicMaterial({
    map: fireTexture,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const smokeMaterial = new THREE.MeshBasicMaterial({
    map: smokeTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
  });
  const sparkMaterial = new THREE.MeshBasicMaterial({
    map: sparkTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const debrisGeometry = new THREE.BoxGeometry(0.05, 0.04, 0.07);
  const debrisMaterial = new THREE.MeshStandardMaterial({
    color: "#3a3733",
    roughness: 0.72,
    metalness: 0.55,
  });

  return {
    fireMaterial,
    smokeMaterial,
    sparkMaterial,
    flashTexture,
    shockTexture,
    scorchTexture,
    holeTexture,
    ricochetTexture,
    heatRingTexture,
    dentRingTexture,
    debrisGeometry,
    debrisMaterial,
    dispose() {
      fireTexture.dispose();
      smokeTexture.dispose();
      sparkTexture.dispose();
      flashTexture.dispose();
      shockTexture.dispose();
      scorchTexture.dispose();
      holeTexture.dispose();
      ricochetTexture.dispose();
      heatRingTexture.dispose();
      dentRingTexture.dispose();
      fireMaterial.dispose();
      smokeMaterial.dispose();
      sparkMaterial.dispose();
      debrisGeometry.dispose();
      debrisMaterial.dispose();
    },
  };
}

// —— 颜色/尺寸曲线：火球先亮后暗，烟逐渐变淡，火花快速收缩 ——
const fireGradient = new Gradient(
  [
    [new QVec3(1, 0.96, 0.82), 0],
    [new QVec3(1, 0.6, 0.16), 0.3],
    [new QVec3(0.7, 0.16, 0.02), 0.7],
    [new QVec3(0.12, 0.02, 0), 1],
  ],
  [
    [1, 0],
    [1, 0.2],
    [0.55, 0.72],
    [0, 1],
  ],
);
const smokeGradient = new Gradient(
  [
    [new QVec3(0.42, 0.41, 0.39), 0],
    [new QVec3(0.62, 0.6, 0.56), 0.6],
    [new QVec3(0.7, 0.68, 0.64), 1],
  ],
  [
    [0, 0],
    [0.55, 0.2],
    [0.42, 0.55],
    [0, 1],
  ],
);
const sparkGradient = new Gradient(
  [
    [new QVec3(1, 1, 0.9), 0],
    [new QVec3(1, 0.82, 0.35), 0.4],
    [new QVec3(1, 0.42, 0.08), 0.8],
    [new QVec3(0.5, 0.12, 0), 1],
  ],
  [
    [1, 0],
    [1, 0.6],
    [0, 1],
  ],
);
const fireSize = new PiecewiseBezier([
  [new Bezier(0.35, 0.9, 0.9, 1), 0],
  [new Bezier(1, 1.05, 0.6, 0.1), 0.5],
]);
const smokeSize = new PiecewiseBezier([
  [new Bezier(0.55, 1, 1, 1.15), 0],
  [new Bezier(1.15, 1.2, 1.25, 1.3), 1],
]);
const sparkSize = new PiecewiseBezier([[new Bezier(1, 0.9, 0.5, 0), 0]]);
const sparkDrag = new PiecewiseBezier([[new Bezier(1, 0.85, 0.25, 0), 0]]);

function fireSystem(assets: VfxAssets, scale: number, delay = 0): ParticleSystem {
  return new ParticleSystem({
    duration: delay + 0.25,
    looping: false,
    autoDestroy: false,
    worldSpace: true,
    startLife: new IntervalValue(0.6, 1.2),
    startSpeed: new IntervalValue(0.8, 2.4 * scale),
    startSize: new IntervalValue(0.4 * scale, 0.95 * scale),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ConstantColor(new QVec4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [
      { time: delay, count: new ConstantValue(Math.round(30 * scale)), cycle: 1, interval: 0.01, probability: 1 },
    ],
    shape: new SphereEmitter({ radius: 0.22 * scale }),
    material: assets.fireMaterial,
    renderMode: RenderMode.BillBoard,
    behaviors: [
      new ColorOverLife(fireGradient),
      new SizeOverLife(fireSize),
      new SpeedOverLife(sparkDrag),
      new ApplyForce(new QVec3(0, 1, 0), new ConstantValue(0.7)),
    ],
  });
}

function smokeSystem(assets: VfxAssets, scale: number, duration: number): ParticleSystem {
  return new ParticleSystem({
    duration,
    looping: false,
    autoDestroy: false,
    worldSpace: true,
    startLife: new IntervalValue(2.2, 3.6),
    startSpeed: new IntervalValue(0.25, 1.1 * scale),
    startSize: new IntervalValue(0.7 * scale, 1.5 * scale),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ConstantColor(new QVec4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(9 * scale),
    shape: new SphereEmitter({ radius: 0.3 * scale }),
    material: assets.smokeMaterial,
    renderMode: RenderMode.BillBoard,
    behaviors: [
      new ColorOverLife(smokeGradient),
      new SizeOverLife(smokeSize),
      new SpeedOverLife(sparkDrag),
      new ApplyForce(new QVec3(0, 1, 0), new ConstantValue(0.55)),
    ],
  });
}

function sparkSystem(assets: VfxAssets, count: number, speed: number): ParticleSystem {
  return new ParticleSystem({
    duration: 0.12,
    looping: false,
    autoDestroy: false,
    worldSpace: true,
    startLife: new IntervalValue(0.45, 1.0),
    startSpeed: new IntervalValue(speed * 0.55, speed),
    startSize: new IntervalValue(0.05, 0.12),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ConstantColor(new QVec4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 }],
    shape: new SphereEmitter({ radius: 0.08 }),
    material: assets.sparkMaterial,
    renderMode: RenderMode.StretchedBillBoard,
    rendererEmitterSettings: { speedFactor: 1.6, lengthFactor: 0.06 },
    speedFactor: 1.6,
    behaviors: [
      new ColorOverLife(sparkGradient),
      new SizeOverLife(sparkSize),
      new ApplyForce(new QVec3(0, -1, 0), new ConstantValue(9.8)),
      new SpeedOverLife(sparkDrag),
    ],
  });
}

function debrisSystem(assets: VfxAssets, count: number): ParticleSystem {
  return new ParticleSystem({
    duration: 0.08,
    looping: false,
    autoDestroy: false,
    worldSpace: true,
    startLife: new IntervalValue(0.9, 1.6),
    startSpeed: new IntervalValue(2.2, 5.5),
    startSize: new IntervalValue(0.8, 1.5),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ConstantColor(new QVec4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 }],
    shape: new SphereEmitter({ radius: 0.15 }),
    material: assets.debrisMaterial,
    instancingGeometry: assets.debrisGeometry,
    renderMode: RenderMode.Mesh,
    behaviors: [
      new ApplyForce(new QVec3(0, -1, 0), new ConstantValue(9.8)),
      new SpeedOverLife(sparkDrag),
    ],
  });
}

/** 一条生命周期内的特效组：粒子系统 + 闪光盘/冲击波/点光。 */
class Burst {
  readonly group = new THREE.Group();
  age = 0;
  maxAge: number;
  private systems: ParticleSystem[] = [];
  private billboards: THREE.Object3D[] = [];
  private tweens: Array<{ life: number; update: (u: number, age: number) => void }> = [];
  private tick: ((age: number) => void) | null = null;

  constructor(maxAge: number) {
    this.maxAge = maxAge;
  }

  addSystem(batch: BatchedRenderer, system: ParticleSystem, position: THREE.Vector3): void {
    system.emitter.position.copy(position);
    this.group.add(system.emitter);
    batch.addSystem(system);
    this.systems.push(system);
  }

  addBillboard(object: THREE.Object3D): void {
    this.billboards.push(object);
    this.group.add(object);
  }

  addTween(life: number, update: (u: number, age: number) => void): void {
    this.tweens.push({ life, update });
  }

  setTick(tick: (age: number) => void): void {
    this.tick = tick;
  }

  update(delta: number, camera: THREE.Camera): void {
    this.age += delta;
    for (const object of this.billboards) object.quaternion.copy(camera.quaternion);
    for (const tween of this.tweens) {
      const u = Math.min(1, this.age / tween.life);
      tween.update(u, this.age);
    }
    this.tick?.(this.age);
  }

  dispose(batch: BatchedRenderer): void {
    for (const system of this.systems) {
      batch.deleteSystem(system);
      system.emitter.removeFromParent();
      system.dispose();
    }
    this.group.removeFromParent();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material?.dispose();
      }
    });
    this.group.clear();
  }
}

function makeFlash(assets: VfxAssets, position: THREE.Vector3, size: number): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const material = new THREE.MeshBasicMaterial({
    map: assets.flashTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.copy(position);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 30;
  return { mesh, material };
}

function makeShockwave(
  assets: VfxAssets,
  position: THREE.Vector3,
  size: number,
): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const material = new THREE.MeshBasicMaterial({
    map: assets.shockTexture,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.copy(position);
  mesh.scale.setScalar(0.4);
  mesh.renderOrder = 29;
  mesh.userData.targetSize = size;
  return { mesh, material };
}

function makeDecal(
  position: THREE.Vector3,
  normal: THREE.Vector3,
  size: [number, number],
  texture: THREE.Texture,
  opacity = 0.95,
  spin = 0,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.copy(position).addScaledVector(normal, 0.008);
  mesh.scale.set(size[0], size[1], 1);
  mesh.lookAt(position.clone().add(normal));
  if (spin) mesh.rotateZ(spin);
  mesh.renderOrder = 8;
  return mesh;
}

export function TigerVfx() {
  const modelId = useStageStore((state) => state.modelId);
  const machineState = useStageStore((state) => state.machineState);
  const damage = useStageStore((state) => state.damage);
  const rebuildToken = useStageStore((state) => state.rebuildToken);
  const { scene, camera } = useThree();
  const assets = useMemo(() => makeAssets(), []);
  const batch = useMemo(() => new BatchedRenderer(), []);
  const root = useMemo(() => new THREE.Group(), []);
  const bursts = useRef<Burst[]>([]);
  const scorches = useRef<THREE.Mesh[]>([]);
  const heatDecals = useRef<THREE.Mesh[]>([]);

  const clearHeatDecals = () => {
    for (const mesh of heatDecals.current) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    heatDecals.current = [];
  };
  const stateRef = useRef<string>("");
  const elapsed = useRef(0);
  const phase = useRef({ charge: false, vent: false, main: false, spread: false, preheat: false });

  useEffect(() => {
    batch.name = "tiger-vfx";
    root.name = "tiger-vfx-root";
    scene.add(batch);
    scene.add(root);
    return () => {
      for (const effect of bursts.current) effect.dispose(batch);
      bursts.current = [];
      for (const scorch of scorches.current) {
        scorch.removeFromParent();
        scorch.geometry.dispose();
        (scorch.material as THREE.Material).dispose();
      }
      scorches.current = [];
      clearHeatDecals();
      scene.remove(batch);
      scene.remove(root);
      // 不在这里 dispose assets：StrictMode 会 setup→cleanup→setup，提前释放会让第二遍用坏纹理
    };
  }, [scene, batch, root]);

  // 静态破碎板的热影响/掉漆环：只在 damage=broken 时贴在三个几何破口周围
  useEffect(() => {
    clearHeatDecals();
    if (modelId !== TIGER_ID || (damage !== "broken" && damage !== "damaged")) return;
    const texture = damage === "broken" ? assets.heatRingTexture : assets.dentRingTexture;
    const opacity = damage === "broken" ? 0.62 : 0.8;
    const scale = damage === "broken" ? 1 : 0.75;
    const decals = [
      makeDecal(
        new THREE.Vector3(-4.506, 0.47, 0.42),
        new THREE.Vector3(-1, 0, 0),
        [0.82 * scale, 0.82 * scale],
        texture,
        opacity,
      ),
      makeDecal(
        new THREE.Vector3(-3.99, 1.077, 0.15),
        new THREE.Vector3(0, 1, 0),
        [0.9 * scale, 0.9 * scale],
        texture,
        opacity,
      ),
      makeDecal(
        new THREE.Vector3(0.66, 1.106, 0.35),
        new THREE.Vector3(0, 1, 0),
        [0.8 * scale, 0.8 * scale],
        texture,
        opacity,
      ),
    ];
    for (const decal of decals) {
      root.add(decal);
      heatDecals.current.push(decal);
    }
  }, [damage, modelId, rebuildToken, assets, root]);

  useEffect(() => {
    // 重建/切模型时清掉旧特效（材质/几何随 burst 释放）
    for (const effect of bursts.current) effect.dispose(batch);
    bursts.current = [];
    for (const scorch of scorches.current) {
      scorch.removeFromParent();
      scorch.geometry.dispose();
      (scorch.material as THREE.Material).dispose();
    }
    scorches.current = [];
    clearHeatDecals();
    stateRef.current = "";
  }, [rebuildToken, modelId, batch]);

  useFrame((_, delta) => {
    if (modelId !== TIGER_ID) return;
    const dt = Math.min(delta, 0.05);
    if (stateRef.current !== machineState) {
      stateRef.current = machineState;
      elapsed.current = 0;
      phase.current = { charge: false, vent: false, main: false, spread: false, preheat: false };
      // 一次性爆炸允许播完（连续触发时可同屏叠加）；只有持续燃烧（maxAge=∞）随状态切走
      for (let i = bursts.current.length - 1; i >= 0; i--) {
        const effect = bursts.current[i]!;
        if (!Number.isFinite(effect.maxAge)) {
          effect.dispose(batch);
          bursts.current.splice(i, 1);
        }
      }
      for (const scorch of scorches.current) {
        scorch.removeFromParent();
        scorch.geometry.dispose();
        (scorch.material as THREE.Material).dispose();
      }
      scorches.current = [];
    }
    elapsed.current += dt;
    const t = elapsed.current;

    const addBurst = (effect: Burst) => {
      bursts.current.push(effect);
      root.add(effect.group);
    };
    const addScorch = (mesh: THREE.Mesh) => {
      scorches.current.push(mesh);
      root.add(mesh);
    };

    const impactBurst = (kind: "ap" | "he" | "ammo") => {
      const position = kind === "ammo" ? RING : IMPACT;
      const normal = kind === "ammo" ? new THREE.Vector3(0, 1, 0) : IMPACT_NORMAL;
      const scale = kind === "ammo" ? 1.35 : kind === "he" ? 0.85 : 0.3;
      const effect = new Burst(kind === "ammo" ? 6.5 : kind === "he" ? 4.5 : 1.6);

      // 初焰闪 + 点光
      const flash = makeFlash(assets, position, kind === "ammo" ? 7 : kind === "he" ? 4.2 : 1.3);
      effect.addBillboard(flash.mesh);
      effect.addTween(0.2, (u) => {
        flash.mesh.scale.setScalar((kind === "ammo" ? 7 : kind === "he" ? 4.2 : 1.3) * (1 + u * 0.6));
        flash.material.opacity = (1 - u) ** 1.4;
      });
      const light = new THREE.PointLight(0xffa055, 0, kind === "ammo" ? 28 : 14, 2);
      light.position.copy(position).add(new THREE.Vector3(0, 0.35, 0.35));
      effect.group.add(light);
      effect.addTween(kind === "ap" ? 0.3 : 0.7, (u) => {
        light.intensity = (kind === "ammo" ? 46 : kind === "he" ? 24 : 9) * (1 - u) ** 2;
      });

      if (kind !== "ap") {
        // 冲击波
        const shock = makeShockwave(assets, position, kind === "ammo" ? 10 : 6);
        effect.addBillboard(shock.mesh);
        effect.addTween(0.62, (u) => {
          const target = kind === "ammo" ? 10 : 6;
          shock.mesh.scale.setScalar(0.4 + (target - 0.4) * (1 - (1 - u) ** 3));
          shock.material.opacity = 0.75 * (1 - u) ** 1.6;
        });
        // 火球：首团 + 0.22s 后的二次膨胀（卷起的火球，不是一次性贴片）
        effect.addSystem(batch, fireSystem(assets, scale), position);
        effect.addSystem(batch, fireSystem(assets, scale * 1.2, 0.32), position);
        // 破片（网格粒子）
        effect.addSystem(batch, debrisSystem(assets, kind === "ammo" ? 36 : 20), position);
      }

      // 火花：穿甲更窄更快、榴弹/殉爆更多
      effect.addSystem(
        batch,
        sparkSystem(assets, kind === "ap" ? 55 : kind === "he" ? 110 : 160, kind === "ap" ? 15 : 10),
        position,
      );

      // 烟：穿甲只有小股白烟；榴弹/殉爆是大烟柱
      effect.addSystem(
        batch,
        smokeSystem(assets, kind === "ap" ? 0.35 : scale, kind === "ammo" ? 2.6 : kind === "he" ? 0.9 : 0.35),
        position,
      );

      // 焦痕/穿孔：留到状态切换；沿法线外推 7cm 避免埋进装甲面。
      // 穿甲弹孔用不规则撕裂孔贴花（热影响圈/崩落/放射裂纹），不是正圆。
      const decalPosition = position.clone().addScaledVector(normal, 0.07);
      const ap = kind === "ap";
      addScorch(
        makeDecal(
          decalPosition,
          normal,
          ap ? [0.55, 0.55] : kind === "he" ? [1.25, 1.25] : [2.8, 2.8],
          ap ? assets.holeTexture : assets.scorchTexture,
          ap ? 0.98 : 0.82,
        ),
      );
      addBurst(effect);
    };

    // 斜角命中 / 跳弹未穿：没有火球，只有闪光、定向火花和犁沟/椭圆撕裂口贴花
    const grazeBurst = (kind: "oblique" | "ricochet") => {
      const position = kind === "oblique" ? OBLIQUE : RICOCHET;
      const effect = new Burst(1.8);
      const flashSize = kind === "oblique" ? 1.5 : 1.05;
      const flash = makeFlash(assets, position, flashSize);
      effect.addBillboard(flash.mesh);
      effect.addTween(0.22, (u) => {
        flash.mesh.scale.setScalar(flashSize * (1 + u * 0.5));
        flash.material.opacity = (1 - u) ** 1.5;
      });
      const light = new THREE.PointLight(0xffa055, 0, 10, 2);
      light.position.copy(position).add(new THREE.Vector3(0, 0.15, 0.3));
      effect.group.add(light);
      effect.addTween(0.5, (u) => {
        light.intensity = (kind === "oblique" ? 16 : 9) * (1 - u) ** 2;
      });
      effect.addSystem(
        batch,
        sparkSystem(assets, kind === "oblique" ? 42 : 28, kind === "oblique" ? 9 : 6),
        position,
      );
      effect.addSystem(batch, smokeSystem(assets, 0.25, 0.4), position);
      const decalPosition = position.clone().addScaledVector(IMPACT_NORMAL, 0.07);
      if (kind === "oblique") {
        // 斜角：椭圆撕裂口 + 上游犁沟
        addScorch(
          makeDecal(decalPosition, IMPACT_NORMAL, [0.95, 0.48], assets.holeTexture, 0.98, 0.12),
        );
        addScorch(
          makeDecal(
            decalPosition.clone().add(new THREE.Vector3(0.42, 0.03, 0)),
            IMPACT_NORMAL,
            [0.9, 0.27],
            assets.ricochetTexture,
            0.95,
            0.16,
          ),
        );
      } else {
        // 跳弹：只有长条犁沟/凹陷/崩落，没有孔
        addScorch(
          makeDecal(decalPosition, IMPACT_NORMAL, [1.8, 0.5], assets.ricochetTexture, 0.96, 0.06),
        );
      }
      addBurst(effect);
    };

    if (machineState === "engine_start" && !phase.current.preheat) {
      phase.current.preheat = true;
      // 预热：发动机舱盖上方一团低强度橙色暖光（只亮 0–1.6s，曲轴仍未转）
      const effect = new Burst(TIGER_PREHEAT_END + 0.15);
      const glow = makeFlash(assets, ENGINE_DECK, 0.9);
      glow.material.color.set(0xff7a33);
      glow.material.opacity = 0;
      effect.addBillboard(glow.mesh);
      const light = new THREE.PointLight(0xff7a33, 0, 8, 2);
      light.position.copy(ENGINE_DECK).add(new THREE.Vector3(0, 0.32, 0.1));
      effect.group.add(light);
      effect.setTick((age) => {
        const pulse = 0.55 + 0.45 * Math.sin(age * 10) ** 2;
        const fade = age < TIGER_PREHEAT_END ? 1 : 0;
        light.intensity = 3.2 * pulse * fade;
        glow.material.opacity = 0.16 * pulse * fade;
      });
      addBurst(effect);
    }
    if (
      (machineState === "hit_light" ||
        machineState === "hit_oblique" ||
        machineState === "hit_ricochet") &&
      !phase.current.main &&
      t >= 0.12
    ) {
      phase.current.main = true;
      if (machineState === "hit_light") impactBurst("ap");
      else grazeBurst(machineState === "hit_oblique" ? "oblique" : "ricochet");
    }
    if (machineState === "hit_heavy" && !phase.current.main && t >= 0.12) {
      phase.current.main = true;
      impactBurst("he");
    }
    if (machineState === "detonation") {
      if (!phase.current.charge && t >= 0.15) {
        phase.current.charge = true;
        // 阶段 1：弹药架升温——座圈缝/车长塔口持续冒烟，内部橙色热光脉动
        const effect = new Burst(TIGER_DETONATION_IMPACT + 0.35);
        const smokeRing = smokeSystem(assets, 0.5, 2.3);
        smokeRing.emissionOverTime = new ConstantValue(6);
        effect.addSystem(batch, smokeRing, RING);
        const smokeCupola = smokeSystem(assets, 0.35, 2.3);
        smokeCupola.emissionOverTime = new ConstantValue(4);
        effect.addSystem(batch, smokeCupola, CUPOLA);
        const heatLight = new THREE.PointLight(0xff7a33, 0, 8, 2);
        heatLight.position.copy(RING).add(new THREE.Vector3(0, 0.22, 0));
        effect.group.add(heatLight);
        effect.setTick((age) => {
          heatLight.intensity =
            age < TIGER_DETONATION_IMPACT ? 2.4 + 1.5 * Math.sin(age * 9) : 0;
        });
        addBurst(effect);
      }
      if (!phase.current.vent && t >= 1.2) {
        phase.current.vent = true;
        // 阶段 2：泄压阀喷火——排烟风扇罩向上喷出火舌/火星/烟
        const effect = new Burst(1.8);
        const fire = fireSystem(assets, 0.55);
        fire.startLife = new IntervalValue(0.35, 0.7);
        fire.startSpeed = new IntervalValue(1.5, 4.5);
        fire.duration = 1.1;
        fire.looping = false;
        fire.emissionOverTime = new ConstantValue(36);
        fire.emissionBursts = [];
        effect.addSystem(batch, fire, VENT);
        effect.addSystem(batch, sparkSystem(assets, 22, 5.5), VENT);
        effect.addSystem(batch, smokeSystem(assets, 0.3, 1.2), VENT);
        const ventLight = new THREE.PointLight(0xff8a3a, 0, 7, 2);
        ventLight.position.copy(VENT).add(new THREE.Vector3(0, 0.25, 0));
        effect.group.add(ventLight);
        effect.addTween(1.1, (u) => {
          ventLight.intensity = 18 * (1 - u) ** 1.2;
        });
        addBurst(effect);
      }
      if (!phase.current.main && t >= TIGER_DETONATION_IMPACT) {
        phase.current.main = true;
        impactBurst("ammo");
      }
      if (!phase.current.spread && t >= TIGER_DETONATION_IMPACT + 1.2) {
        phase.current.spread = true;
        // 阶段 4：火势蔓延到发动机舱：一小段持续火 + 烟
        const effect = new Burst(5);
        const fire = fireSystem(assets, 0.4);
        fire.duration = 1.4;
        fire.looping = true;
        effect.addSystem(batch, fire, ENGINE_DECK);
        const smoke = smokeSystem(assets, 0.45, 2.4);
        effect.addSystem(batch, smoke, ENGINE_DECK);
        addBurst(effect);
      }
    }
    if (machineState === "burning" && !phase.current.main) {
      phase.current.main = true;
      // 持续燃烧：循环火 + 持续烟柱 + 闪烁点光
      const effect = new Burst(Number.POSITIVE_INFINITY);
      for (const side of [1, -1] as const) {
        const origin = ENGINE_DECK.clone().setZ(side * 0.34);
        const fire = fireSystem(assets, 0.5);
        fire.duration = 1.2;
        fire.looping = true;
        fire.emissionOverTime = new ConstantValue(24);
        fire.emissionBursts = [];
        effect.addSystem(batch, fire, origin);
        const smoke = smokeSystem(assets, 0.6, 2.2);
        smoke.looping = true;
        smoke.emissionOverTime = new ConstantValue(7);
        effect.addSystem(batch, smoke, origin);
      }
      const light = new THREE.PointLight(0xff7a33, 0, 12, 2);
      light.position.copy(ENGINE_DECK).add(new THREE.Vector3(0, 0.5, 0.15));
      effect.group.add(light);
      effect.setTick((age) => {
        light.intensity = 14 + 5 * Math.sin(age * 17) + 3 * Math.sin(age * 31);
      });
      addScorch(
        makeDecal(
          new THREE.Vector3(0.52, 1.106, 0.34),
          new THREE.Vector3(0, 1, 0),
          [1.1, 1.1],
          assets.scorchTexture,
          0.82,
        ),
      );
      addBurst(effect);
    }

    for (let i = bursts.current.length - 1; i >= 0; i--) {
      const effect = bursts.current[i];
      effect.update(dt, camera);
      if (effect.age > effect.maxAge) {
        effect.dispose(batch);
        bursts.current.splice(i, 1);
      }
    }
    batch.update(dt);
  });

  return null;
}
