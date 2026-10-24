import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStageStore } from "../state/stageStore";
import { carrierWalkOverlay, clearCarrierWalkOverlay } from "@/three/parts/models/carrier/motion";
import {
  areaFloorAt,
  isInsideArea,
  walkConfigOf,
  walkLightsOf,
  walkObstacles,
  type WalkArea,
  type WalkInteraction,
  type WalkObstacle,
} from "./walk";

// ============================================================================
// WalkController —— 第一人称自由漫游（航母）
//
// 输入：点击画面锁定鼠标；WASD 移动、Shift 冲刺、空格跳、F 交互、Esc 放鼠标。
// 坐标：玩家位置保存为模型编辑坐标（1:8），渲染时乘 root 世界矩阵（presentationScale）。
// 碰撞：区域边界 + 进入区域时预计算的实体 AABB；门洞/舱口按矩形边界放行。
// ============================================================================

const PLAYER_RADIUS = 0.035;
const WALK_SPEED = 0.52;
const RUN_SPEED = 1.05;
const GRAVITY = 1.15;
const JUMP_SPEED = 0.52;

interface PlayerState {
  areaId: string;
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  yaw: number;
  pitch: number;
}

/** 仅在 walk 模式且有该模型漫游配置时挂载控制器（进入/退出即 setup/cleanup）。 */
export function WalkGate() {
  const mode = useStageStore((state) => state.cameraMode);
  const modelId = useStageStore((state) => state.modelId);
  if (mode !== "walk" || !walkConfigOf(modelId)) return null;
  return <WalkController />;
}

export function WalkController() {
  const modelId = useStageStore((state) => state.modelId);
  const config = walkConfigOf(modelId);
  const assembled = useStageStore((state) => state.assembled);
  const setCameraMode = useStageStore((state) => state.setCameraMode);
  const setWalkArea = useStageStore((state) => state.setWalkArea);
  const setWalkPrompt = useStageStore((state) => state.setWalkPrompt);
  const setWalkLocked = useStageStore((state) => state.setWalkLocked);
  const setWalkFading = useStageStore((state) => state.setWalkFading);
  const setWalkPose = useStageStore((state) => state.setWalkPose);
  const walkTravel = useStageStore((state) => state.walkTravel);
  const clearWalkTravel = useStageStore((state) => state.clearWalkTravel);
  const travelOpen = useStageStore((state) => state.walkTravelOpen);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const isCarrier = assembled?.registry.model === "carrier";
  const light = useRef<THREE.PointLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const roomLights = useRef<Array<THREE.PointLight | null>>([]);
  const lightWorld = useRef(new THREE.Vector3());

  const player = useRef<PlayerState>({ areaId: "", x: 0, y: 0, z: 0, vy: 0, grounded: true, yaw: 0, pitch: 0 });
  const area = useRef<WalkArea | null>(null);
  const obstacles = useRef<WalkObstacle[]>([]);
  const obstacleCache = useRef(new Map<string, WalkObstacle[]>());
  const keys = useRef(new Set<string>());
  const current = useRef<WalkInteraction | null>(null);
  const lastPrompt = useRef<string | null>(null);
  const fPressed = useRef(false);
  const transitioning = useRef(false);
  const timers = useRef<number[]>([]);
  const doorCurrent = useRef([0, 0, 0, 0, 0]);
  const doorTarget = useRef([0, 0, 0, 0, 0]);
  const jbdCurrent = useRef([0, 0, 0]);
  const jbdTarget = useRef([0, 0, 0]);
  const barrierCurrent = useRef(0);
  const barrierTarget = useRef(0);
  const walkDoorTarget = useRef(new Map<string, number>());
  const walkDoorCurrent = useRef(new Map<string, number>());
  const lookDrag = useRef({ active: false, x: 0, y: 0 });
  const pointerLocked = useRef(false);
  const poseClock = useRef(0);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const setArea = (nextArea: WalkArea, pos?: [number, number, number], yaw?: number) => {
    if (!assembled) return;
    area.current = nextArea;
    player.current.areaId = nextArea.id;
    if (pos) {
      player.current.x = pos[0];
      player.current.y = pos[1];
      player.current.z = pos[2];
    }
    if (yaw !== undefined) player.current.yaw = yaw;
    player.current.vy = 0;
    player.current.grounded = true;
    player.current.pitch = nextArea.spawn.pitch ?? 0;
    let list = nextArea.obstacleFree ? [] : obstacleCache.current.get(nextArea.id);
    if (!list) {
      list = walkObstacles(assembled, nextArea, config?.eyeHeight ?? 0.2);
      obstacleCache.current.set(nextArea.id, list);
    }
    obstacles.current = list;
    setWalkArea(nextArea.id);
    setWalkPose({ x: player.current.x, z: player.current.z, yaw: player.current.yaw });
    lastPrompt.current = null;
    setWalkPrompt(null);
  };

  const teleport = (targetAreaId: string, targetPos?: [number, number, number], targetYaw?: number) => {
    if (!config) return;
    const nextArea = config.areas[targetAreaId];
    if (!nextArea) return;
    if (transitioning.current) return;
    transitioning.current = true;
    setWalkFading(true);
    const timer = window.setTimeout(() => {
      setArea(nextArea, targetPos ?? nextArea.spawn.pos, targetYaw ?? nextArea.spawn.yaw);
      const timer2 = window.setTimeout(() => {
        transitioning.current = false;
        setWalkFading(false);
      }, 240);
      timers.current.push(timer2);
    }, 190);
    timers.current.push(timer);
  };

  const openWalkDoor = (node: string) => {
    if (!walkDoorTarget.current.has(node)) walkDoorCurrent.current.set(node, 0);
    walkDoorTarget.current.set(node, 1);
  };

  const execute = (interaction: WalkInteraction) => {
    if (transitioning.current) return;
    if (interaction.kind === "doors" && interaction.doorIndex) {
      const index = interaction.doorIndex - 1;
      doorTarget.current[index] = doorTarget.current[index]! > 0.5 ? 0 : 1;
      return;
    }
    if (interaction.kind === "barrier") {
      barrierTarget.current = barrierTarget.current > 0.5 ? 0 : 1;
      return;
    }
    if (interaction.kind === "jbd" && interaction.jbdIndex) {
      const index = interaction.jbdIndex - 1;
      jbdTarget.current[index] = jbdTarget.current[index]! > 0.5 ? 0 : 1;
      return;
    }
    if (interaction.targetArea) {
      if (interaction.doorNode) openWalkDoor(interaction.doorNode);
      teleport(interaction.targetArea, interaction.targetPos, interaction.targetYaw);
    }
  };

  // 初始化：放到配置的出生区域，切 idle（避免弹射/机库关门动画与漫游交互打架）。
  useEffect(() => {
    if (!config || !assembled) return;
    const spawn = config.areas[config.spawnArea]!;
    setArea(spawn, spawn.spawn.pos, spawn.spawn.yaw);
    const store = useStageStore.getState();
    if (store.machineState !== "idle" && store.machineState !== "scanning") store.setMachineState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, assembled]);

  // 快速前往请求：面板/快捷键写入 store，这里统一走与门户相同的淡入淡出传送。
  useEffect(() => {
    if (!walkTravel) return;
    const next = walkTravel;
    clearWalkTravel();
    if (!config?.areas[next.area]) return;
    teleport(next.area, next.pos, next.yaw);
    // teleport 依赖当前渲染的 config/assembled；walkTravel 变化时闭包就是最新的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTravel]);

  // 键盘/鼠标/指针锁。
  useEffect(() => {
    if (!config) return;
    const canvas = gl.domElement;
    const down = (event: KeyboardEvent) => {
      if (event.code === "KeyT") {
        event.preventDefault();
        const state = useStageStore.getState();
        state.setWalkTravelOpen(!state.walkTravelOpen);
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (event.code === "Escape") {
        const state = useStageStore.getState();
        if (state.walkTravelOpen) {
          state.setWalkTravelOpen(false);
          return;
        }
        if (!document.pointerLockElement) setCameraMode("orbit");
        return;
      }
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyF"].includes(event.code)) {
        event.preventDefault();
      }
      keys.current.add(event.code);
      if (event.code === "KeyF" && !event.repeat) fPressed.current = true;
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const click = () => {
      if (transitioning.current) return;
      if (document.pointerLockElement !== canvas) {
        const request = canvas.requestPointerLock?.bind(canvas) as (() => Promise<void> | void) | undefined;
        try {
          const value = request?.();
          if (value instanceof Promise) value.catch(() => {});
        } catch {
          // 浏览器拒绝指针锁时退化为拖拽环视。
        }
      }
    };
    const lockChange = () => {
      pointerLocked.current = document.pointerLockElement === canvas;
      setWalkLocked(pointerLocked.current);
    };
    const mouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      lookDrag.current = { active: true, x: event.clientX, y: event.clientY };
    };
    const mouseUp = () => {
      lookDrag.current.active = false;
    };
    const mouseMove = (event: MouseEvent) => {
      if (!config) return;
      if (pointerLocked.current) {
        player.current.yaw -= event.movementX * 0.0021;
        player.current.pitch = THREE.MathUtils.clamp(player.current.pitch - event.movementY * 0.0019, -1.4, 1.4);
        return;
      }
      if (!lookDrag.current.active) return;
      const dx = event.clientX - lookDrag.current.x;
      const dy = event.clientY - lookDrag.current.y;
      lookDrag.current.x = event.clientX;
      lookDrag.current.y = event.clientY;
      player.current.yaw -= dx * 0.005;
      player.current.pitch = THREE.MathUtils.clamp(player.current.pitch - dy * 0.0045, -1.4, 1.4);
    };
    const contextMenu = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    canvas.addEventListener("click", click);
    document.addEventListener("pointerlockchange", lockChange);
    canvas.addEventListener("mousedown", mouseDown);
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("mousemove", mouseMove);
    canvas.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("click", click);
      document.removeEventListener("pointerlockchange", lockChange);
      canvas.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("mousemove", mouseMove);
      canvas.removeEventListener("contextmenu", contextMenu);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      setWalkLocked(false);
    };
  }, [config, gl, setCameraMode, setWalkLocked]);

  // 退出漫游：清掉交互覆盖，恢复状态机对门/挡焰板/拦阻网的控制。
  useEffect(() => {
    const model = assembled;
    return () => {
      clearTimers();
      transitioning.current = false;
      setWalkFading(false);
      setWalkPrompt(null);
      if (model && model.registry.model === "carrier") clearCarrierWalkOverlay(model);
    };
  }, [assembled, setWalkFading, setWalkPrompt]);

  // QA 钩子：可传送到任意区域、指定机位、直接触发交互。
  useEffect(() => {
    if (!config || !assembled) return;
    const api = {
      state: () => {
        const p = player.current;
        return {
          area: p.areaId,
          pos: [p.x, p.y, p.z] as [number, number, number],
          yaw: p.yaw,
          pitch: p.pitch,
          prompt: lastPrompt.current,
          current: current.current?.id ?? null,
          fading: transitioning.current,
        };
      },
      teleport: (areaId: string) => {
        const next = config.areas[areaId];
        if (!next) return false;
        setArea(next, next.spawn.pos, next.spawn.yaw);
        return true;
      },
      pose: (x: number, z: number, yaw: number, pitch = 0) => {
        player.current.x = x;
        player.current.z = z;
        player.current.yaw = yaw;
        player.current.pitch = pitch;
        if (area.current) player.current.y = areaFloorAt(area.current, x, z);
      },
      trigger: (id: string) => {
        const interaction = config.interactions.find((item) => item.id === id);
        if (!interaction) return false;
        execute(interaction);
        return true;
      },
      press: (code: string, down = true) => {
        if (down) {
          keys.current.add(code);
          if (code === "KeyF") fPressed.current = true;
        } else {
          keys.current.delete(code);
        }
      },
      lock: () => {
        const canvas = gl.domElement;
        const request = canvas.requestPointerLock?.bind(canvas) as (() => Promise<void> | void) | undefined;
        try {
          const value = request?.();
          if (value instanceof Promise) value.catch(() => {});
        } catch {
          /* noop */
        }
      },
    };
    (window as unknown as { __walk?: unknown }).__walk = api;
    return () => {
      if ((window as unknown as { __walk?: unknown }).__walk === api) {
        delete (window as unknown as { __walk?: unknown }).__walk;
      }
    };
    // execute/setArea 只依赖 refs，不需要在依赖里重挂
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, assembled, gl]);

  useFrame((_state, delta) => {
    if (!config || !assembled || !area.current) return;
    const dt = Math.min(0.05, delta);
    const overlay = isCarrier ? carrierWalkOverlay(assembled) : null;

    // 交互件平滑：门/挡焰板/拦阻网/漫游水密门（仅航母有这些节点）。
    if (overlay) {
      const k = 1 - Math.exp(-8 * dt);
      for (let i = 0; i < doorCurrent.current.length; i++) {
        doorCurrent.current[i] = doorCurrent.current[i]! + (doorTarget.current[i]! - doorCurrent.current[i]!) * k;
        overlay.doors.set(i + 1, doorCurrent.current[i]!);
      }
      for (let i = 0; i < jbdCurrent.current.length; i++) {
        jbdCurrent.current[i] = jbdCurrent.current[i]! + (jbdTarget.current[i]! - jbdCurrent.current[i]!) * k;
        overlay.jbd.set(i + 1, jbdCurrent.current[i]!);
      }
      barrierCurrent.current = barrierCurrent.current + (barrierTarget.current - barrierCurrent.current) * k;
      overlay.barrier = barrierCurrent.current;
      for (const [node, target] of walkDoorTarget.current) {
        const value = (walkDoorCurrent.current.get(node) ?? 0) + (target - (walkDoorCurrent.current.get(node) ?? 0)) * k;
        walkDoorCurrent.current.set(node, value);
        overlay.walkDoors.set(node, value);
      }
    }

    // 移动（快速前往面板打开时暂停）。
    if (!transitioning.current && !travelOpen) {
      const p = player.current;
      const forward = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const move = new THREE.Vector3();
      if (keys.current.has("KeyW")) move.add(forward);
      if (keys.current.has("KeyS")) move.sub(forward);
      if (keys.current.has("KeyD")) move.add(right);
      if (keys.current.has("KeyA")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize();
        const speed = keys.current.has("ShiftLeft") || keys.current.has("ShiftRight") ? RUN_SPEED : WALK_SPEED;
        const step = speed * dt;
        const tryAxis = (dx: number, dz: number) => {
          const nx = p.x + dx;
          const nz = p.z + dz;
          if (!canStand(area.current!, nx, nz)) return;
          if (blocked(obstacles.current, nx, nz, p.y, area.current!.eyeHeight ?? config.eyeHeight)) return;
          const floor = areaFloorAt(area.current!, nx, nz);
          if (p.grounded && floor > p.y + 0.075) return;
          p.x = nx;
          p.z = nz;
          if (p.grounded) p.y = floor;
        };
        tryAxis(move.x * step, 0);
        tryAxis(0, move.z * step);
      }
      // 跳跃与重力。
      const floor = areaFloorAt(area.current, p.x, p.z);
      if (p.grounded) {
        p.y = floor;
        if (keys.current.has("Space")) {
          p.vy = JUMP_SPEED;
          p.grounded = false;
          p.y += p.vy * dt;
        }
      } else {
        p.vy -= GRAVITY * dt;
        p.y += p.vy * dt;
        if (p.y <= floor) {
          p.y = floor;
          p.vy = 0;
          p.grounded = true;
        }
      }
    }

    // 摄像机（世界空间 = root 矩阵 × 编辑坐标）。
    const p = player.current;
    const eyeHeight = area.current.eyeHeight ?? config.eyeHeight;
    const world = new THREE.Vector3(p.x, p.y + eyeHeight, p.z).applyMatrix4(assembled.root.matrixWorld);
    camera.position.copy(world);
    camera.rotation.order = "YXZ";
    camera.rotation.set(p.pitch, p.yaw, 0);
    const perspective = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspective.fov - 72) > 1e-3) {
      perspective.fov = 72;
      perspective.updateProjectionMatrix();
    }
    const interior = p.areaId !== "deck" && p.areaId !== "aircraft1";
    if (light.current) {
      light.current.position.copy(world);
      light.current.position.y += 0.15;
      // 手电只做近处补光；舱内主要靠均匀环境光，否则贴脸的控制台会被打爆成白板。
      light.current.intensity = interior ? 0.45 : 0.22;
    }
    if (ambient.current) ambient.current.intensity = interior ? 0.5 : 0.05;
    // 小地图 10Hz 位姿；只有 WalkMinimap 订阅 walkPose，不会拖 Viewport 重渲染。
    poseClock.current += dt;
    if (poseClock.current >= 0.08) {
      poseClock.current = 0;
      setWalkPose({ x: p.x, z: p.z, yaw: p.yaw });
    }
    // 舱室顶灯：按区域预设沿长轴布灯，让机库/机舱/舰桥真正可读。
    const specs = walkLightsOf(modelId)[p.areaId] ?? [];
    for (let i = 0; i < roomLights.current.length; i++) {
      const roomLight = roomLights.current[i];
      if (!roomLight) continue;
      const spec = specs[i];
      if (!spec) {
        roomLight.intensity = 0;
        continue;
      }
      lightWorld.current.set(...spec.pos).applyMatrix4(assembled.root.matrixWorld);
      roomLight.position.copy(lightWorld.current);
      roomLight.intensity = spec.intensity;
      roomLight.distance = spec.distance;
      roomLight.decay = 1.15;
      if (spec.color && roomLight.color.getHexString() !== new THREE.Color(spec.color).getHexString()) {
        roomLight.color.set(spec.color);
      }
    }

    // 最近可交互物与提示（快速前往面板打开时暂停 F）。
    if (!transitioning.current && !travelOpen) {
      let best: WalkInteraction | null = null;
      let bestDistance = Infinity;
      for (const interaction of config.interactions) {
        if (interaction.area !== p.areaId) continue;
        const distance = Math.hypot(interaction.pos[0] - p.x, interaction.pos[1] - p.z);
        if (distance > interaction.radius || distance >= bestDistance) continue;
        best = interaction;
        bestDistance = distance;
      }
      current.current = best;
      let prompt: string | null = null;
      if (best) {
        if (best.kind === "doors" && best.doorIndex) {
          prompt = doorTarget.current[best.doorIndex - 1]! > 0.5 ? (best.activeLabel ?? best.label) : best.label;
        } else if (best.kind === "barrier") {
          prompt = barrierTarget.current > 0.5 ? (best.activeLabel ?? best.label) : best.label;
        } else if (best.kind === "jbd" && best.jbdIndex) {
          prompt = jbdTarget.current[best.jbdIndex - 1]! > 0.5 ? (best.activeLabel ?? best.label) : best.label;
        } else {
          prompt = best.label;
        }
      }
      if (prompt !== lastPrompt.current) {
        lastPrompt.current = prompt;
        setWalkPrompt(prompt);
      }
      if (fPressed.current) {
        fPressed.current = false;
        if (best) execute(best);
      }
    } else {
      fPressed.current = false;
    }
  });

  if (!config) return null;
  return (
    <>
      <ambientLight ref={ambient} intensity={0.05} color="#e8f0f8" />
      <pointLight ref={light} intensity={0.3} distance={26} decay={1.4} color="#eaf2ff" />
      {[0, 1, 2, 3].map((index) => (
        <pointLight
          key={index}
          ref={(element) => {
            roomLights.current[index] = element;
          }}
          intensity={0}
          distance={20}
          decay={1.15}
          color="#eef4fb"
        />
      ))}
    </>
  );
}

function canStand(area: WalkArea, x: number, z: number): boolean {
  // rect 已经按人物半径内缩；甲板轮廓由 insideDeck 留出舷缘余量。
  return isInsideArea(area, x, z);
}

function blocked(obstacles: WalkObstacle[], x: number, z: number, y: number, bodyHeight = 0.22): boolean {
  const r = PLAYER_RADIUS;
  const head = y + bodyHeight;
  for (const box of obstacles) {
    if (box.maxY < y + 0.015 || box.minY > head) continue;
    if (x + r > box.minX && x - r < box.maxX && z + r > box.minZ && z - r < box.maxZ) return true;
  }
  return false;
}
