import * as THREE from "three";
import { mulberry32 } from "./geometry";
import { applyArmourSurface } from "./armourSurface";

// ============================================================================
// kernel/textures —— 程序化表面材质（去塑料感的材质层）
//
// 规范见 docs/去塑料积木感-视觉真实感技术指南.md 第 3.1 节：
//   map          结构层：基色 + 板缝 + 磨损斑 + 竖直流痕（底色近白，最终色由材质 color 主导）
//   roughnessMap 粗糙度：漆面不均 + 板缝尘积 + 磨损更亮
//   normalMap    由高度图 Sobel 转换（替代 bumpMap：同时影响光照与反射）
// 预设（preset）按用途区分 seed / 密度 / 磨损强度；同一预设全局缓存，只生成一次。
// ============================================================================

export type TexturePreset =
  | "armor"
  | "armor_dark"
  | "cast"
  | "steel"
  | "steel_rough"
  | "rubber"
  | "wood"
  | "canvas"
  | "rust"
  | "primer"
  | "none";

export interface MaterialSpec {
  /** 基色（最终观感主色）。 */
  base: string;
  metalness: number;
  roughness: number;
  preset?: TexturePreset;
  repeat?: [number, number];
  opacity?: number;
  envMapIntensity?: number;
  /** > 0 时改用 MeshPhysicalMaterial 并开启清漆（漆面罩壳的「亮膜」层）。 */
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  doubleSided?: boolean;
  flatShading?: boolean;
  /** 战术编号 / 贴花：canvas 文字贴图（透明底，白字黑边）。 */
  decal?: string;
}

export interface TextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  repeat: [number, number];
}

interface PresetOptions {
  seed: number;
  size: number;
  base: string;
  roughness: number;
  seams: boolean;
  rivets: boolean;
  streak: number;
  mottle: number;
  grain: number;
  grooves?: number;
  normalStrength: number;
}

const PRESET_OPTIONS: Record<Exclude<TexturePreset, "none">, PresetOptions> = {
  armor: {
    seed: 20261018,
    size: 1024,
    base: "#f2efe9",
    roughness: 0.62,
    seams: true,
    rivets: true,
    streak: 18,
    mottle: 0.85,
    grain: 10,
    normalStrength: 1.1,
  },
  armor_dark: {
    seed: 70119,
    size: 1024,
    base: "#e8e4dc",
    roughness: 0.66,
    seams: true,
    rivets: true,
    streak: 24,
    mottle: 0.95,
    grain: 12,
    normalStrength: 1.15,
  },
  cast: {
    seed: 31415,
    size: 1024,
    base: "#efeeea",
    roughness: 0.78,
    seams: false,
    rivets: false,
    streak: 8,
    mottle: 1.35,
    grain: 20,
    normalStrength: 1.5,
  },
  steel: {
    seed: 9091,
    size: 512,
    base: "#f4f4f2",
    roughness: 0.42,
    seams: false,
    rivets: false,
    streak: 6,
    mottle: 0.4,
    grain: 8,
    grooves: 96,
    normalStrength: 0.5,
  },
  steel_rough: {
    seed: 5511,
    size: 512,
    base: "#efece6",
    roughness: 0.7,
    seams: false,
    rivets: false,
    streak: 14,
    mottle: 0.8,
    grain: 16,
    grooves: 48,
    normalStrength: 1.0,
  },
  rubber: {
    seed: 4242,
    size: 512,
    base: "#f0efec",
    roughness: 0.92,
    seams: false,
    rivets: false,
    streak: 0,
    mottle: 0.5,
    grain: 26,
    normalStrength: 0.7,
  },
  wood: {
    seed: 1357,
    size: 512,
    base: "#f3ead9",
    roughness: 0.7,
    seams: false,
    rivets: false,
    streak: 0,
    mottle: 0.7,
    grain: 12,
    grooves: 260,
    normalStrength: 1.2,
  },
  canvas: {
    seed: 2468,
    size: 512,
    base: "#f1efe8",
    roughness: 0.88,
    seams: false,
    rivets: false,
    streak: 4,
    mottle: 0.6,
    grain: 22,
    normalStrength: 0.9,
  },
  rust: {
    seed: 8765,
    size: 512,
    base: "#ece2d8",
    roughness: 0.86,
    seams: false,
    rivets: false,
    streak: 16,
    mottle: 1.5,
    grain: 24,
    normalStrength: 1.6,
  },
  primer: {
    seed: 6100,
    size: 512,
    base: "#f0e6df",
    roughness: 0.74,
    seams: true,
    rivets: false,
    streak: 10,
    mottle: 0.9,
    grain: 12,
    normalStrength: 1.0,
  },
};

export interface PanelTextureOptions {
  size?: number;
  base?: string;
  line?: string;
  roughness?: number;
  rivets?: boolean;
  streak?: boolean;
  seed?: number;
}

/** 通用三联贴图（板缝 / 铆钉 / 流痕），旧接口保留，供测试与自定义材质使用。 */
export function panelTextures(options: PanelTextureOptions = {}): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  setRepeat: (x: number, y: number) => void;
  dispose: () => void;
} {
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
  if (!colorCtx || !roughCtx || !bumpCtx) {
    throw new Error("kernel.panelTextures：Canvas 2D 上下文不可用（需要浏览器环境）");
  }

  colorCtx.fillStyle = base;
  colorCtx.fillRect(0, 0, size, size);
  const roughValue = Math.round(Math.min(Math.max(baseRough, 0), 1) * 255);
  const roughFill = `rgb(${roughValue},${roughValue},${roughValue})`;
  roughCtx.fillStyle = roughFill;
  roughCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = "#808080";
  bumpCtx.fillRect(0, 0, size, size);

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

/** 高度图 → 切线空间法线图（Sobel），替代 bumpMap。 */
export function heightToNormalMap(heightCanvas: HTMLCanvasElement, strength = 1): THREE.CanvasTexture {
  const size = heightCanvas.width;
  const ctx = heightCanvas.getContext("2d");
  if (!ctx) throw new Error("kernel.heightToNormalMap：Canvas 2D 上下文不可用");
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = ctx.createImageData(size, size);
  const dst = out.data;
  const lum = (x: number, y: number) => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    const i = (yi * size + xi) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = lum(x - 1, y - 1);
      const t = lum(x, y - 1);
      const tr = lum(x + 1, y - 1);
      const l = lum(x - 1, y);
      const r = lum(x + 1, y);
      const bl = lum(x - 1, y + 1);
      const b = lum(x, y + 1);
      const br = lum(x + 1, y + 1);
      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      dst[i] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[i + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
      dst[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(heightCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const textureCache = new Map<string, TextureSet>();

/** 按预设生成三联贴图（map + roughnessMap + normalMap），全局缓存。 */
export function presetTextures(preset: Exclude<TexturePreset, "none">, repeat: [number, number]): TextureSet {
  const key = preset;
  const cached = textureCache.get(key);
  if (cached) {
    cached.map.repeat.set(repeat[0], repeat[1]);
    cached.roughnessMap.repeat.set(repeat[0], repeat[1]);
    cached.normalMap.repeat.set(repeat[0], repeat[1]);
    return cached;
  }
  const opt = PRESET_OPTIONS[preset];
  const rand = mulberry32(opt.seed);
  const size = opt.size;
  const create = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return canvas;
  };
  const colorCanvas = create();
  const roughCanvas = create();
  const heightCanvas = create();
  const colorCtx = colorCanvas.getContext("2d")!;
  const roughCtx = roughCanvas.getContext("2d")!;
  const heightCtx = heightCanvas.getContext("2d")!;

  colorCtx.fillStyle = opt.base;
  colorCtx.fillRect(0, 0, size, size);
  const roughBase = Math.round(Math.min(Math.max(opt.roughness, 0), 1) * 255);
  roughCtx.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`;
  roughCtx.fillRect(0, 0, size, size);
  heightCtx.fillStyle = "#808080";
  heightCtx.fillRect(0, 0, size, size);

  // 低频斑驳：漆面不均
  const mottleCount = Math.round(54 * opt.mottle);
  for (let i = 0; i < mottleCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.06 + rand() * 0.2);
    const grad = colorCtx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.55;
    const alpha = (0.02 + rand() * 0.05 * opt.mottle).toFixed(3);
    grad.addColorStop(
      0,
      dark ? `rgba(74,66,52,${alpha})` : `rgba(255,252,242,${(Number(alpha) * 0.7).toFixed(3)})`,
    );
    grad.addColorStop(1, "rgba(0,0,0,0)");
    colorCtx.fillStyle = grad;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
  }

  // 中频磨损斑
  const wearCount = Math.round(110 * opt.mottle);
  for (let i = 0; i < wearCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = size * (0.008 + rand() * 0.05);
    const h = w * (0.4 + rand());
    colorCtx.save();
    colorCtx.translate(x, y);
    colorCtx.rotate(rand() * Math.PI);
    colorCtx.fillStyle = `rgba(${60 + ((rand() * 30) | 0)},${52 + ((rand() * 26) | 0)},${40 + ((rand() * 20) | 0)},${(0.015 + rand() * 0.04).toFixed(3)})`;
    colorCtx.beginPath();
    colorCtx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    colorCtx.fill();
    colorCtx.restore();
  }

  // 细颗粒（三张同相位）
  const grain = (ctx: CanvasRenderingContext2D, amp: number) => {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * amp;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  };
  grain(colorCtx, opt.grain);
  grain(roughCtx, opt.grain * 1.4);
  grain(heightCtx, opt.grain * 0.8);

  // 拉丝/木纹沟槽（各向异性纹理）
  if (opt.grooves) {
    for (let i = 0; i < opt.grooves; i++) {
      const y = rand() * size;
      const w = size * (0.2 + rand() * 0.8);
      const x = rand() * size;
      const alpha = (0.02 + rand() * 0.06).toFixed(3);
      colorCtx.fillStyle = `rgba(70,64,54,${alpha})`;
      colorCtx.fillRect(x, y, w, 0.6 + rand() * 1.2);
      heightCtx.fillStyle = `rgba(120,120,120,${alpha})`;
      heightCtx.fillRect(x, y, w, 0.6 + rand() * 1.2);
    }
  }

  // 板缝
  if (opt.seams) {
    const seamsX: number[] = [];
    const seamsY: number[] = [];
    let cx = size * (0.16 + rand() * 0.12);
    while (cx < size * 0.94) {
      seamsX.push(cx);
      cx += size * (0.18 + rand() * 0.3);
    }
    let cy = size * (0.14 + rand() * 0.14);
    while (cy < size * 0.94) {
      seamsY.push(cy);
      cy += size * (0.2 + rand() * 0.32);
    }
    const drawSeams = (ctx: CanvasRenderingContext2D, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (const gx of seamsX) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, size);
        ctx.stroke();
      }
      for (const gy of seamsY) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(size, gy);
        ctx.stroke();
      }
    };
    drawSeams(colorCtx, "rgba(40,38,32,0.32)", 1.2);
    drawSeams(roughCtx, "rgba(255,255,255,0.25)", 2);
    drawSeams(heightCtx, "#5a5a5a", 2);
    if (opt.rivets) {
      const rivet = (
        ctx: CanvasRenderingContext2D,
        color: string,
        radius: number,
        px: number,
        py: number,
      ) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const gx of seamsX) {
        if (rand() < 0.74) {
          for (let py = 6; py < size - 5; py += 8 + rand() * 5) {
            const px = gx + (rand() - 0.5) * 2;
            rivet(colorCtx, "rgba(0,0,0,0.22)", 0.8, px, py);
            rivet(heightCtx, "#c8c8c8", 1.1, px, py);
          }
        }
      }
    }
  }

  // 竖向流痕（雨水 / 油污），只做垂直方向
  for (let i = 0; i < opt.streak; i++) {
    const sx = rand() * size;
    const sy = rand() * size * 0.6;
    const sw = 1.5 + rand() * 5;
    const sh = size * (0.18 + rand() * 0.5);
    const alpha = (0.04 + rand() * 0.08).toFixed(3);
    const colorGradient = colorCtx.createLinearGradient(0, sy, 0, sy + sh);
    colorGradient.addColorStop(0, `rgba(18,20,22,${alpha})`);
    colorGradient.addColorStop(1, "rgba(18,20,22,0)");
    colorCtx.fillStyle = colorGradient;
    colorCtx.fillRect(sx, sy, sw, sh);
    const roughGradient = roughCtx.createLinearGradient(0, sy, 0, sy + sh);
    roughGradient.addColorStop(0, "rgba(255,255,255,0.2)");
    roughGradient.addColorStop(1, "rgba(255,255,255,0)");
    roughCtx.fillStyle = roughGradient;
    roughCtx.fillRect(sx, sy, sw, sh);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.repeat.set(repeat[0], repeat[1]);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;
  roughnessMap.repeat.set(repeat[0], repeat[1]);
  const normalMap = heightToNormalMap(heightCanvas, opt.normalStrength);
  const set = { map, roughnessMap, normalMap, repeat };
  textureCache.set(key, set);
  return set;
}

/** 战术编号贴花：透明底、白字黑描边；同一数字全局缓存。 */
const decalCache = new Map<string, THREE.CanvasTexture>();

function decalTexture(text: string): THREE.CanvasTexture | null {
  const cached = decalCache.get(text);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "bold 188px 'Arial Narrow', Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 16;
  context.strokeStyle = "rgba(16, 16, 14, 0.92)";
  context.strokeText(text, 256, 136);
  context.fillStyle = "#f3efe2";
  context.fillText(text, 256, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  decalCache.set(text, texture);
  return texture;
}

/** 由材质声明批量构建 THREE 材质库；返回 dispose 统一释放。
 *  金属三要素都在这里落地：metalness 分档 / roughness 不与全场一致 / envMapIntensity 让反射可见。 */
export function createMaterialLibrary(specs: Record<string, MaterialSpec>): {
  materials: Record<string, THREE.MeshStandardMaterial>;
  dispose: () => void;
} {
  const materials: Record<string, THREE.MeshStandardMaterial> = {};
  const usedTextures = new Set<THREE.Texture>();
  for (const [name, spec] of Object.entries(specs)) {
    const params: THREE.MeshStandardMaterialParameters = {
      color: new THREE.Color(spec.base),
      metalness: spec.metalness,
      roughness: spec.roughness,
      transparent: spec.opacity !== undefined && spec.opacity < 1,
      opacity: spec.opacity ?? 1,
      envMapIntensity: spec.envMapIntensity ?? 1,
      side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      flatShading: spec.flatShading ?? false,
    };
    // 漆面用 physical（clearcoat）：标准材质给不出清漆的二次高光。
    const material =
      spec.clearcoat && spec.clearcoat > 0
        ? new THREE.MeshPhysicalMaterial({
            ...params,
            clearcoat: spec.clearcoat,
            clearcoatRoughness: spec.clearcoatRoughness ?? 0.3,
          })
        : new THREE.MeshStandardMaterial(params);
    if (spec.emissive) {
      material.emissive = new THREE.Color(spec.emissive);
      material.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    const preset = spec.preset ?? "none";
    if (preset !== "none") {
      const set = presetTextures(preset, spec.repeat ?? [1, 1]);
      material.map = set.map;
      material.roughnessMap = set.roughnessMap;
      material.normalMap = set.normalMap;
      usedTextures.add(set.map);
      usedTextures.add(set.roughnessMap);
      usedTextures.add(set.normalMap);
    }
    material.name = name;
    if (spec.decal) {
      const decal = decalTexture(spec.decal);
      if (decal) {
        material.map = decal;
        material.transparent = true;
        material.alphaTest = 0.06;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        usedTextures.add(decal);
      }
    }
    // L5 表面层：防磁涂层 + 迷彩 + 战场痕迹（只作用于装甲漆面，不动几何）
    if (name === "armor_steel") {
      applyArmourSurface(material, { zimmerit: true, camo: true, grime: true });
    }
    materials[name] = material;
  }
  return {
    materials,
    dispose: () => {
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of usedTextures) texture.dispose();
      textureCache.clear();
      decalCache.clear();
    },
  };
}
