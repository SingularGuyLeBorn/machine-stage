import * as THREE from "three";
import { mergeGeometries as mergeGeometriesRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============================================================================
// detailKit —— 反积木细节工具箱（质量红线见 docs/MACHINE_STYLE.md 第 9 节）
//
// 用户退稿教训："组件数量太少、最小单元太大 = 乐高感"。
// 本工具箱供所有新模型与增密改造使用：
//   bevelBoxGeometry   微倒角盒体（消灭锐利 90° 大角）
//   plateGeometry      薄板件（蒙皮板 / 口盖 / 装甲板）
//   airfoilGeometry    NACA 翼型挤出（机翼 / 旋翼 / 桨叶 / 尾翼，尖后缘）
//   louverGeometry     散热百叶（真实斜槽阵列）
//   rivetStripGeometry 铆钉列（半球行）
//   mergeGeometries    几何合并（多小件 → 少 draw call）
//   panelTextures      程序化表面三联贴图：map + roughnessMap + bumpMap
//   place              设置位置与旋转的快捷函数（角度制）
// ============================================================================

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.max(Math.min(radius, halfW, halfH), 0.0005);
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(halfW, halfH - r);
  shape.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-halfW + r, halfH);
  shape.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfW, -halfH + r);
  shape.absarc(-halfW + r, -halfH + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

/** 微倒角盒体：整体尺寸 w×h×d，边缘倒角 bevel（默认 2 cm）。替代裸 BoxGeometry。 */
export function bevelBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.02,
  cornerSegments = 3,
): THREE.ExtrudeGeometry {
  const b = Math.max(Math.min(bevel, width / 3, height / 3, depth / 3), 0.0004);
  const shape = roundedRectShape(Math.max(width - 2 * b, 0.001), Math.max(height - 2 * b, 0.001), b * 1.15);
  const inner = Math.max(depth - 2 * b, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: cornerSegments,
    steps: 1,
  });
  geometry.translate(0, 0, -inner / 2);
  return geometry;
}

/** 薄板件：蒙皮板 / 口盖 / 装甲板（默认 12 mm 厚，四角圆润）。 */
export function plateGeometry(width: number, height: number, thickness = 0.012, bevel = 0.003): THREE.ExtrudeGeometry {
  return bevelBoxGeometry(width, height, thickness, Math.min(bevel, thickness * 0.45), 2);
}

/** NACA 对称翼型挤出：弦长 chord（沿 X，前缘在 x=0），展长 span（沿 Z），厚度比默认 12%，尖后缘。 */
export function airfoilGeometry(
  chord: number,
  span: number,
  thicknessRatio = 0.12,
  steps = 20,
  tipBevel = 0.006,
): THREE.ExtrudeGeometry {
  const yt = (x: number) =>
    5 * thicknessRatio * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const shape = new THREE.Shape();
  shape.moveTo(chord, 0);
  for (let i = steps - 1; i >= 1; i--) {
    const x = i / steps;
    shape.lineTo(x * chord, yt(x) * chord);
  }
  shape.lineTo(0, 0);
  for (let i = 1; i <= steps - 1; i++) {
    const x = i / steps;
    shape.lineTo(x * chord, -yt(x) * chord);
  }
  shape.closePath();
  const bevel = Math.min(tipBevel, chord * thicknessRatio * 0.35);
  const inner = Math.max(span - 2 * bevel, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -inner / 2);
  return geometry;
}

/** 散热百叶 / 格栅：count 片斜叶，总宽 width、总高 height，倾斜 slantDeg。叶片沿 X 拉长、在 Y 方向层叠。 */
export function louverGeometry(
  count: number,
  width: number,
  height: number,
  slantDeg = 38,
  thickness = 0.006,
): THREE.BufferGeometry {
  const step = height / Math.max(count, 1);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const slat = bevelBoxGeometry(width, Math.max(step * 0.7, 0.004), thickness, 0.0012, 1);
    slat.rotateX(THREE.MathUtils.degToRad(slantDeg));
    slat.translate(0, height / 2 - step * (i + 0.5), 0);
    list.push(slat);
  }
  const merged = mergeGeometries(list);
  for (const item of list) item.dispose();
  return merged;
}

/** 铆钉列：count 颗半球沿 X 排列，间距 spacing，半径 radius（默认 6 mm）。 */
export function rivetStripGeometry(count: number, spacing: number, radius = 0.006): THREE.BufferGeometry {
  const single = new THREE.SphereGeometry(radius, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const dot = single.clone();
    dot.translate((i - (count - 1) / 2) * spacing, 0, 0);
    list.push(dot);
  }
  single.dispose();
  const merged = mergeGeometries(list);
  for (const item of list) item.dispose();
  return merged;
}

/** 几何合并：统一为非索引、补齐 normal/uv 后合并；内部克隆会自动释放，传入的源几何不释放。 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  for (const geometry of prepared) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv")) {
      const count = geometry.getAttribute("position").count;
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
  }
  const merged = mergeGeometriesRaw(prepared, false);
  if (!merged) throw new Error("detailKit.mergeGeometries：几何属性不一致，合并失败");
  for (let i = 0; i < prepared.length; i++) {
    if (prepared[i] !== geometries[i]) prepared[i].dispose();
  }
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

export interface PanelTextureOptions {
  size?: number;
  base?: string;
  line?: string;
  roughness?: number;
  rivets?: boolean;
  streak?: boolean;
  seed?: number;
}

export interface PanelTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  setRepeat: (x: number, y: number) => void;
  dispose: () => void;
}

/** 程序化表面三联贴图：板缝网格 + 面板色差 + 铆钉 + 油渍/熏黑流痕。大面积涂装必须使用。 */
export function panelTextures(options: PanelTextureOptions = {}): PanelTextureSet {
  const size = options.size ?? 512;
  const base = options.base ?? "#8b9096";
  const line = options.line ?? "#2b3036";
  const baseRough = options.roughness ?? 0.55;
  const withRivets = options.rivets ?? true;
  const withStreak = options.streak ?? true;
  const rand = mulberry32(options.seed ?? 20261018);

  const createCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  };
  const colorCanvas = createCanvas();
  const roughCanvas = createCanvas();
  const bumpCanvas = createCanvas();
  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  if (!colorCtx || !roughCtx || !bumpCtx) throw new Error("detailKit.panelTextures：Canvas 2D 上下文不可用");

  colorCtx.fillStyle = base;
  colorCtx.fillRect(0, 0, size, size);
  const roughValue = Math.round(Math.min(Math.max(baseRough, 0), 1) * 255);
  const roughFill = `rgb(${roughValue},${roughValue},${roughValue})`;
  roughCtx.fillStyle = roughFill;
  roughCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = "#808080";
  bumpCtx.fillRect(0, 0, size, size);

  // 不规则板缝网格
  const xs: number[] = [0];
  let cursorX = 0;
  while (cursorX < size - 40) {
    cursorX += size * (0.09 + rand() * 0.2);
    xs.push(Math.min(cursorX, size - 2));
  }
  xs.push(size);
  const ys: number[] = [0];
  let cursorY = 0;
  while (cursorY < size - 40) {
    cursorY += size * (0.11 + rand() * 0.24);
    ys.push(Math.min(cursorY, size - 2));
  }
  ys.push(size);

  // 面板色差 / 粗糙度差异
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const tone = rand();
      const w = xs[i + 1] - xs[i];
      const h = ys[j + 1] - ys[j];
      if (tone < 0.32) {
        colorCtx.fillStyle = `rgba(12,14,16,${(0.03 + rand() * 0.05).toFixed(3)})`;
        colorCtx.fillRect(xs[i], ys[j], w, h);
      } else if (tone > 0.74) {
        colorCtx.fillStyle = `rgba(255,255,255,${(0.02 + rand() * 0.04).toFixed(3)})`;
        colorCtx.fillRect(xs[i], ys[j], w, h);
      }
      const shade = Math.round((rand() - 0.5) * 26);
      const value = Math.min(Math.max(roughValue + shade, 0), 255);
      roughCtx.fillStyle = `rgb(${value},${value},${value})`;
      roughCtx.fillRect(xs[i], ys[j], w, h);
    }
  }

  // 板缝线
  const drawSeams = (ctx: CanvasRenderingContext2D, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const gx of xs.slice(1, -1)) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, size);
      ctx.stroke();
    }
    for (const gy of ys.slice(1, -1)) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(size, gy);
      ctx.stroke();
    }
  };
  drawSeams(colorCtx, line, 1.4);
  const seamGray = Math.min(roughValue + 58, 255);
  drawSeams(roughCtx, `rgb(${seamGray},${seamGray},${seamGray})`, 2);
  drawSeams(bumpCtx, "#3c3c3c", 2);

  // 铆钉
  if (withRivets) {
    const rivet = (ctx: CanvasRenderingContext2D, color: string, radius: number, px: number, py: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const gx of xs.slice(1, -1)) {
      if (rand() < 0.72) {
        for (let py = 5; py < size - 4; py += 7 + rand() * 4.5) {
          const px = gx + (rand() - 0.5) * 2.2;
          rivet(colorCtx, "rgba(0,0,0,0.34)", 0.9, px, py);
          rivet(bumpCtx, "#b6b6b6", 1.1, px, py);
        }
      }
    }
    for (const gy of ys.slice(1, -1)) {
      if (rand() < 0.45) {
        for (let px = 5; px < size - 4; px += 9 + rand() * 5) {
          const py = gy + (rand() - 0.5) * 2.2;
          rivet(colorCtx, "rgba(0,0,0,0.3)", 0.8, px, py);
          rivet(bumpCtx, "#aeaeae", 1, px, py);
        }
      }
    }
  }

  // 油渍 / 排气流痕
  if (withStreak) {
    for (let i = 0; i < 26; i++) {
      const sx = rand() * size;
      const sy = rand() * size * 0.55;
      const sw = 1.5 + rand() * 5;
      const sh = size * (0.18 + rand() * 0.55);
      const alpha = (0.05 + rand() * 0.09).toFixed(3);
      const colorGradient = colorCtx.createLinearGradient(0, sy, 0, sy + sh);
      colorGradient.addColorStop(0, `rgba(18,20,22,${alpha})`);
      colorGradient.addColorStop(1, "rgba(18,20,22,0)");
      colorCtx.fillStyle = colorGradient;
      colorCtx.fillRect(sx, sy, sw, sh);
      const roughGradient = roughCtx.createLinearGradient(0, sy, 0, sy + sh);
      roughGradient.addColorStop(0, "rgba(255,255,255,0.22)");
      roughGradient.addColorStop(1, "rgba(255,255,255,0)");
      roughCtx.fillStyle = roughGradient;
      roughCtx.fillRect(sx, sy, sw, sh);
    }
  }

  const toTexture = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  const map = toTexture(colorCanvas, true);
  const roughnessMap = toTexture(roughCanvas, false);
  const bumpMap = toTexture(bumpCanvas, false);
  return {
    map,
    roughnessMap,
    bumpMap,
    setRepeat: (x: number, y: number) => {
      map.repeat.set(x, y);
      roughnessMap.repeat.set(x, y);
      bumpMap.repeat.set(x, y);
    },
    dispose: () => {
      map.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
    },
  };
}

/** 设置位置与欧拉角的快捷函数（角度制）。 */
export function place(
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rxDeg = 0,
  ryDeg = 0,
  rzDeg = 0,
): THREE.Object3D {
  mesh.position.set(x, y, z);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rxDeg),
    THREE.MathUtils.degToRad(ryDeg),
    THREE.MathUtils.degToRad(rzDeg),
  );
  return mesh;
}
