import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStageStore } from "../state/stageStore";
import { CAT_NOSE_ENGAGE, carrierWalkOverlay, clearCarrierWalkOverlay } from "@/three/parts/models/carrier/motion";
import { AIRCRAFT_SCALE_Z } from "@/three/parts/models/carrier/aircraft";
import { setCarrierCanopyOpen } from "@/three/parts/models/carrier/j20Mount";
import { AirCombat, type AircraftPose, type CombatSnapshot } from "./airCombat";
import { CAT_TRACKS, CV, catPoint } from "@/three/parts/models/carrier/constants";
import type { AssembledModel } from "@/three/parts";
import {
  areaFloorAt,
  insideDeck,
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
const WALK_SPEED = 0.62;
const RUN_SPEED = 2.6;
const GRAVITY = 1.15;
const JUMP_SPEED = 0.52;

// 座舱弹射体验：固定用 2 号舰艏弹射器，滑梭在轨道起点。
const PLAY_TRACK = CAT_TRACKS[1]!;
const PLAY_TRACK_YAW = (PLAY_TRACK.yawDeg * Math.PI) / 180;
const PLAY_TARGET = catPoint(PLAY_TRACK, -CAT_NOSE_ENGAGE);
const DECK_TOP = CV.DECK_Y + CV.DECK_T;
const TAXI_MAX_SPEED = 0.55;
const TAXI_ACCEL = 0.5;
const TAXI_BRAKE = 0.9;
// J20 源模型站姿眼位 (0, 3.16m, 2.62m)，换算到 CV_Aircraft 节点局部：
// 源根节点 scale 为 1/8，节点自身又带 AIRCRAFT_SCALE_Z 的 z 缩比，故 z 要除掉它。
const COCKPIT_EYE = new THREE.Vector3(0, 3.16 / 8, 2.62 / (8 * AIRCRAFT_SCALE_Z));

interface WalkPickCandidate {
  object: THREE.Mesh | THREE.InstancedMesh;
  center: THREE.Vector3;
  radius: number;
  always: boolean;
}
const pickCandidateCache = new WeakMap<AssembledModel, WalkPickCandidate[]>();

/**
 * 准星拾取候选：用几何包围球先把 1 万件缩到射线附近的几十件。
 * 原先每 0.12s 对整棵 carrier 递归 raycast，是步行模式里最大的一笔纯 CPU 开销。
 */
function pickCandidatesOf(assembled: AssembledModel): WalkPickCandidate[] {
  const cached = pickCandidateCache.get(assembled);
  if (cached) return cached;
  assembled.root.updateMatrixWorld(true);
  const entries: WalkPickCandidate[] = [];
  for (const handle of assembled.parts) {
    const object = handle.object as THREE.Mesh | THREE.InstancedMesh;
    if (!object.isMesh) continue;
    const geometry = handle.geometry;
    if (!geometry) continue;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) continue;
    entries.push({
      object,
      center: sphere.center.clone().applyMatrix4(object.matrixWorld),
      radius: sphere.radius * object.matrixWorld.getMaxScaleOnAxis(),
      // 实例件的几何包围球不覆盖所有停放位，直接保留，由 raycast 自己判断。
      always: Boolean(handle.instanced),
    });
  }
  pickCandidateCache.set(assembled, entries);
  return entries;
}

type CockpitPhase = "taxi" | "arming" | "launch" | "airborne" | "combat" | "complete";
interface CockpitRuntime {
  active: boolean;
  phase: CockpitPhase;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  targetX: number;
  targetZ: number;
  ready: boolean;
  elapsed: number;
  countdown: number;
  message: string;
  shake: number;
  canopy: number;
  weapon: "GUN" | "AIM9";
  gunAmmo: number;
  aim9: number;
  flares: number;
  autopilot: boolean;
  fuel: number;
}

function cockpitRuntime(): CockpitRuntime {
  return {
    active: false,
    phase: "taxi",
    x: CV.AIRCRAFT_PARK[0],
    y: DECK_TOP,
    z: CV.AIRCRAFT_PARK[1],
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    targetX: PLAY_TARGET.x,
    targetZ: PLAY_TARGET.z,
    ready: false,
    elapsed: 0,
    countdown: 0,
    message: "",
    shake: 0,
    canopy: 0,
    weapon: "AIM9",
    gunAmmo: 510,
    aim9: 4,
    flares: 30,
    autopilot: true,
    fuel: 100,
  };
}

function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

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
  const setWalkHover = useStageStore((state) => state.setWalkHover);
  const setCockpit = useStageStore((state) => state.setCockpit);
  const selectPart = useStageStore((state) => state.selectPart);
  const walkTravel = useStageStore((state) => state.walkTravel);
  const clearWalkTravel = useStageStore((state) => state.clearWalkTravel);
  const walkCockpitEntry = useStageStore((state) => state.walkCockpitEntry);
  const travelOpen = useStageStore((state) => state.walkTravelOpen);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
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
  const cockpit = useRef<CockpitRuntime>(cockpitRuntime());
  const combat = useRef<AirCombat | null>(null);
  const combatSnapshot = useRef<CombatSnapshot | null>(null);
  const lockPressed = useRef(false);
  const firePressed = useRef(false);
  const flarePressed = useRef(false);
  const cockpitLook = useRef({ yaw: 0, pitch: -0.22 });
  const rideIntro = useRef({
    active: false,
    t: 0,
    from: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    seatEye: new THREE.Vector3(),
    seatLook: new THREE.Vector3(),
  });
  const cockStateClock = useRef(0);
  const hover = useRef<{ object: THREE.Mesh | THREE.InstancedMesh; material: THREE.Material | THREE.Material[] } | null>(null);
  const hoverClock = useRef(0);
  const ePressed = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const hoverPart = useRef<string | null>(null);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const restoreHover = () => {
    const currentHover = hover.current;
    if (!currentHover) return;
    currentHover.object.material = currentHover.material;
    hover.current = null;
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

  const publishCockpit = (message?: string) => {
    const c = cockpit.current;
    if (!c.active) return;
    if (message !== undefined) c.message = message;
    const distance = Math.hypot(c.targetX - c.x, c.targetZ - c.z);
    const snapshot = combatSnapshot.current;
    const lock = snapshot?.lock ?? false;
    const lockScreen: [number, number] | null = snapshot?.lockScreen ?? null;
    setCockpit({
      active: true,
      phase: c.phase,
      message: c.message,
      speed: c.phase === "taxi" ? Math.round(c.speed * 7.9 * 3.6) : Math.round(c.speed * 3.6),
      heading: Math.round(((c.yaw * 180) / Math.PI + 360) % 360),
      pitch: Math.round((c.pitch * 180) / Math.PI),
      roll: Math.round((c.roll * 180) / Math.PI),
      altitude: Math.round(c.y * 7.9),
      verticalSpeed: Math.round(-Math.sin(c.pitch) * c.speed),
      target: [c.targetX, c.targetZ],
      distance,
      aligned: c.ready,
      countdown: c.countdown,
      weapon: c.weapon,
      gunAmmo: c.gunAmmo,
      aim9: c.aim9,
      flares: c.flares,
      lock: lock !== null,
      lockScreen,
      targetCount: snapshot?.targetCount ?? 0,
      targetRange: snapshot?.targetRange ?? 0,
      closure: snapshot?.closure ?? 0,
      wezMax: snapshot?.wezMax ?? 0,
      wezMin: snapshot?.wezMin ?? 0,
      nez: snapshot?.nez ?? 0,
      missileCount: snapshot?.missiles ?? 0,
      radarContacts: snapshot?.contacts ?? [],
      throttle: c.phase === "combat" ? Math.round(((c.speed - 70) / 110) * 100) : c.phase === "taxi" ? 0 : 100,
      fuel: Math.round(c.fuel),
      gLoad: Math.round((1 / Math.max(0.55, Math.cos(c.roll))) * 10) / 10,
      engineRpm: c.phase === "taxi" ? 62 : 96,
      gearDown: c.phase === "taxi" || c.phase === "arming" || c.phase === "launch",
      autopilot: c.autopilot,
      rwr: snapshot?.rwr ?? false,
      pullUp: (c.phase === "airborne" || c.phase === "combat") && c.y * 7.9 < 75 && -Math.sin(c.pitch) < -0.05,
    });
  };

  const aircraftWorldPose = (c: CockpitRuntime): AircraftPose => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(c.x, c.y, c.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(c.pitch, c.yaw, c.roll, "YXZ")),
      new THREE.Vector3(1, 1, AIRCRAFT_SCALE_Z),
    );
    local.premultiply(assembled!.root.matrixWorld);
    const position = new THREE.Vector3().setFromMatrixPosition(local);
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(local).normalize();
    const up = new THREE.Vector3(0, 1, 0).transformDirection(local).normalize();
    return { position, forward, up, speed: c.speed };
  };

  const startCockpitEntry = () => {
    if (!assembled || !isCarrier || rideIntro.current.active || cockpit.current.active) return;
    const intro = rideIntro.current;
    const c = cockpit.current;
    Object.assign(c, cockpitRuntime());
    intro.active = true;
    intro.t = 0;
    intro.from.copy(camera.position);
    intro.fromLook.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
    const modelMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(c.x, c.y, c.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, "YXZ")),
      new THREE.Vector3(1, 1, AIRCRAFT_SCALE_Z),
    );
    modelMatrix.premultiply(assembled.root.matrixWorld);
    intro.seatEye.copy(COCKPIT_EYE).applyMatrix4(modelMatrix);
    const look = new THREE.Vector3(0, Math.sin(-0.22), Math.cos(-0.22));
    intro.seatLook.copy(intro.seatEye).add(look);
    setCarrierCanopyOpen(assembled, 0);
    keys.current.clear();
    setWalkPrompt(null);
    setWalkHover(null);
    restoreHover();
  };

  const enterCockpit = () => {
    if (!assembled || !isCarrier) return;
    const c = cockpit.current;
    Object.assign(c, cockpitRuntime(), {
      active: true,
      message: "塔台：福建舰，2 号弹射位已清空。沿黄线滑行至滑梭，保持舰艏方向。",
    });
    cockpitLook.current = { yaw: 0, pitch: -0.22 };
    combat.current?.dispose();
    combat.current = null;
    combatSnapshot.current = null;
    hover.current = null;
    setWalkHover(null);
    setWalkPrompt(null);
    keys.current.clear();
    const overlay = carrierWalkOverlay(assembled);
    overlay.aircraft = {
      x: c.x,
      y: DECK_TOP,
      z: c.z,
      yaw: c.yaw,
      pitch: 0,
      roll: 0,
      wingFold: 0,
      hook: 0,
      shuttleZ: catPoint(PLAY_TRACK, 0).z,
    };
    jbdTarget.current[1] = 0;
    publishCockpit();
  };

  const exitCockpit = () => {
    const overlay = assembled && isCarrier ? carrierWalkOverlay(assembled) : null;
    if (overlay) overlay.aircraft = null;
    if (assembled) setCarrierCanopyOpen(assembled, 0);
    combat.current?.dispose();
    combat.current = null;
    combatSnapshot.current = null;
    lockPressed.current = false;
    firePressed.current = false;
    flarePressed.current = false;
    cockpit.current = cockpitRuntime();
    setCockpit(null);
    setWalkHover(null);
    setWalkPrompt(null);
    restoreHover();
    jbdTarget.current[1] = 0;
    keys.current.clear();
    if (config?.areas.deck) {
      setArea(
        config.areas.deck,
        [CV.AIRCRAFT_PARK[0] + 0.85, DECK_TOP, CV.AIRCRAFT_PARK[1]],
        0,
      );
    }
  };

  const reportReady = () => {
    const c = cockpit.current;
    if (!c.active || c.phase !== "taxi") return;
    if (!c.ready) {
      publishCockpit("塔台：还不在 2 号弹射位，请继续滑行，用小地图对准滑梭。");
      return;
    }
    c.phase = "arming";
    c.elapsed = 0;
    c.countdown = 3;
    c.speed = 0;
    c.x = c.targetX;
    c.z = c.targetZ;
    c.yaw = PLAY_TRACK_YAW;
    jbdTarget.current[1] = 1;
    publishCockpit("你：塔台，飞行员准备就绪，请求弹射。");
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
    if (interaction.kind === "cockpit") {
      startCockpitEntry();
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

  // 一键登机：HUD 按钮写入 store，直接走座舱入场动画，不必先跑到飞机旁。
  useEffect(() => {
    if (walkCockpitEntry === null) return;
    useStageStore.getState().clearWalkCockpitEntry();
    if (!assembled || !isCarrier) return;
    startCockpitEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkCockpitEntry, assembled, isCarrier]);

  // 键盘/鼠标/指针锁。
  useEffect(() => {
    if (!config) return;
    const canvas = gl.domElement;
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape" && cockpit.current.active) {
        event.preventDefault();
        exitCockpit();
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (event.code === "KeyT") {
        if (cockpit.current.active) return;
        event.preventDefault();
        const state = useStageStore.getState();
        state.setWalkTravelOpen(!state.walkTravelOpen);
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (event.code === "KeyG" && !event.repeat) {
        event.preventDefault();
        if (!cockpit.current.active && !useStageStore.getState().walkTravelOpen) startCockpitEntry();
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
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyF", "KeyE", "KeyR", "KeyC", "KeyP", "Digit1", "Digit2"].includes(event.code)) {
        event.preventDefault();
      }      keys.current.add(event.code);
      if (event.code === "KeyF" && !event.repeat) fPressed.current = true;
      if (event.code === "KeyE" && !event.repeat) ePressed.current = true;
      if (cockpit.current.active && cockpit.current.phase === "combat") {
        if (event.code === "KeyR" && !event.repeat) lockPressed.current = true;
        if (event.code === "Space" && !event.repeat) firePressed.current = true;
        if (event.code === "KeyC" && !event.repeat) flarePressed.current = true;
        if (event.code === "Digit1" && !event.repeat) cockpit.current.weapon = "GUN";
        if (event.code === "Digit2" && !event.repeat) cockpit.current.weapon = "AIM9";
      }
      if (event.code === "KeyP" && !event.repeat && cockpit.current.active && cockpit.current.phase === "combat") {
        cockpit.current.autopilot = !cockpit.current.autopilot;
      }
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
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -(event.clientY / window.innerHeight) * 2 + 1,
      };
      if (cockpit.current.active) {
        const look = cockpitLook.current;
        if (pointerLocked.current) {
          look.yaw -= event.movementX * 0.0018;
          look.pitch = THREE.MathUtils.clamp(look.pitch - event.movementY * 0.0016, -1.35, 1.35);
        } else if (lookDrag.current.active) {
          const dx = event.clientX - lookDrag.current.x;
          const dy = event.clientY - lookDrag.current.y;
          lookDrag.current.x = event.clientX;
          lookDrag.current.y = event.clientY;
          look.yaw -= dx * 0.004;
          look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.0035, -1.35, 1.35);
        }
        pointer.current = { x: 0, y: 0 };
        return;
      }
      if (pointerLocked.current) {
        player.current.yaw -= event.movementX * 0.0021;
        player.current.pitch = THREE.MathUtils.clamp(player.current.pitch - event.movementY * 0.0019, -1.4, 1.4);
        pointer.current = { x: 0, y: 0 };
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
      setWalkHover(null);
      setCockpit(null);
      cockpit.current = cockpitRuntime();
      combat.current?.dispose();
      combat.current = null;
      combatSnapshot.current = null;
      restoreHover();
      if (model && model.registry.model === "carrier") clearCarrierWalkOverlay(model);
    };
    // restoreHover 只操作 ref，不参与依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembled, setWalkFading, setWalkPrompt, setWalkHover, setCockpit]);

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
      snapCockpit: () => {
        const c = cockpit.current;
        if (!c.active) return false;
        c.x = c.targetX;
        c.z = c.targetZ;
        c.yaw = PLAY_TRACK_YAW;
        c.ready = true;
        c.canopy = 0;
        return true;
      },
      combatDebug: () => combat.current?.debug() ?? null,
      startCombat: () => {
        const c = cockpit.current;
        if (!c.active) return false;
        c.phase = "combat";
        c.elapsed = 0;
        c.canopy = 0;
        c.speed = 120;
        c.pitch = 0;
        c.roll = 0;
        c.y = DECK_TOP + 5.7;
        c.z = 30;
        c.x = PLAY_TRACK.x0;
        combat.current?.dispose();
        combat.current = new AirCombat(scene);
        combat.current.spawn(aircraftWorldPose(c));
        combatSnapshot.current = null;
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

    // 登机过场：开舱盖 → 镜头抬升入座 → 再合盖（合盖阻尼在座舱状态里继续）。
    if (rideIntro.current.active) {
      const intro = rideIntro.current;
      intro.t += dt;
      const open = Math.min(1, intro.t / 0.9);
      const eased = open * open * (3 - 2 * open);
      setCarrierCanopyOpen(assembled, eased);
      if (intro.t < 0.65) {
        camera.position.copy(intro.from);
        camera.lookAt(intro.fromLook);
      } else if (intro.t < 1.9) {
        const u = Math.min(1, (intro.t - 0.65) / 1.25);
        const e = u * u * (3 - 2 * u);
        camera.position.lerpVectors(intro.from, intro.seatEye, e);
        camera.position.y += Math.sin(e * Math.PI) * 0.7;
        const look = intro.fromLook.clone().lerp(intro.seatLook, e);
        camera.lookAt(look);
      } else {
        intro.active = false;
        enterCockpit();
        cockpit.current.yaw = 0;
        cockpit.current.canopy = 1;
        setCarrierCanopyOpen(assembled, 1);
      }
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.fov = 78;
      perspective.updateProjectionMatrix();
      camera.up.set(0, 1, 0);
      if (ambient.current) ambient.current.intensity = 0.55;
      if (light.current) {
        light.current.position.copy(camera.position);
        light.current.intensity = 0.8;
      }
      ePressed.current = false;
      fPressed.current = false;
      return;
    }

    // 座舱弹射体验：接管摄像机、飞机位姿和塔台流程，普通漫游物理暂停。
    if (cockpit.current.active) {
      const c = cockpit.current;
      c.elapsed += dt;
      const command = useStageStore.getState().cockpitCommand;
      if (command) {
        useStageStore.getState().clearCockpitCommand();
        if (command.type === "lock" && c.phase === "combat") lockPressed.current = true;
        else if (command.type === "fire" && c.phase === "combat") firePressed.current = true;
        else if (command.type === "flare" && c.phase === "combat") flarePressed.current = true;
        else if (command.type === "autopilot" && c.phase === "combat") c.autopilot = !c.autopilot;
        else if (command.type === "weapon" && (command.value === "GUN" || command.value === "AIM9")) c.weapon = command.value;
        else if (command.type === "report" && c.phase === "taxi") reportReady();
        else if (command.type === "exit") {
          if (document.pointerLockElement) document.exitPointerLock();
          exitCockpit();
          return;
        }
      }
      const targetDist = Math.hypot(c.targetX - c.x, c.targetZ - c.z);
      if (c.phase === "taxi" && c.canopy > 0) {
        // 入座后先合盖：0→1.2s 阻尼关闭，期间油门/转向/F 都不响应。
        c.canopy = Math.max(0, c.canopy - dt / 1.2);
        setCarrierCanopyOpen(assembled, c.canopy * c.canopy * (3 - 2 * c.canopy));
        c.speed = 0;
        c.ready = false;
        if (c.canopy <= 0) c.message = "塔台：座舱盖锁定。沿黄线滑行至 2 号弹射位。";
        fPressed.current = false;
      } else if (c.phase === "taxi") {
        setCarrierCanopyOpen(assembled, 0);
        const throttle = keys.current.has("KeyW") ? 1 : keys.current.has("KeyS") ? -1 : 0;
        // 已对准后按住 W 不再继续往前拱，避免玩家还没按 F 就滑出弹射位。
        if (c.ready && throttle >= 0) c.speed = 0;
        else if (throttle > 0) c.speed = Math.min(TAXI_MAX_SPEED, c.speed + TAXI_ACCEL * dt);
        else if (throttle < 0) c.speed = Math.max(-0.22, c.speed - TAXI_ACCEL * dt);
        else c.speed = c.speed > 0 ? Math.max(0, c.speed - TAXI_BRAKE * dt) : Math.min(0, c.speed + TAXI_BRAKE * dt);
        // +Z 机头 +X 右舷是模型约定；正 yaw 的鼻轮转向在座舱画面里是向左，
        // 因此 A 给正、D 给负，保证“按 A 往左、按 D 往右”与屏幕一致。
        const steer = (keys.current.has("KeyA") ? 1 : 0) + (keys.current.has("KeyD") ? -1 : 0);
        if (steer !== 0) {
          c.yaw += steer * 0.62 * dt * Math.min(1, 0.3 + Math.abs(c.speed) / 0.3);
        } else if (throttle > 0 && targetDist < 2.4) {
          // 近距自动跟线：距离越近转得越急、速度越低，避免固定转弯半径绕着滑梭打转。
          const desired = Math.atan2(c.targetX - c.x, c.targetZ - c.z);
          const turnRate = targetDist < 1.8 ? 1.8 : 0.75;
          c.yaw += THREE.MathUtils.clamp(angleDelta(desired, c.yaw), -turnRate * dt, turnRate * dt);
          if (targetDist < 1.6) c.speed = Math.min(c.speed, 0.26);
          if (targetDist < 0.6) c.speed = 0;
        }
        const nx = c.x + Math.sin(c.yaw) * c.speed * dt;
        const nz = c.z + Math.cos(c.yaw) * c.speed * dt;
        if (Math.abs(c.speed) > 1e-4 && insideDeck(nx, nz, 0.5)) {
          c.x = nx;
          c.z = nz;
        } else if (Math.abs(c.speed) > 0.08) {
          c.speed = 0;
          c.message = "塔台：艏部甲板边线，停止滑行，退回中线。";
        }
        c.y = DECK_TOP;
        c.pitch = 0;
        c.roll = 0;
        const nextReady = Math.hypot(c.targetX - c.x, c.targetZ - c.z) < 0.55 && Math.abs(angleDelta(c.yaw, PLAY_TRACK_YAW)) < 0.22;
        if (nextReady) {
          c.x = c.targetX;
          c.z = c.targetZ;
          c.yaw = PLAY_TRACK_YAW;
          c.speed = 0;
          if (!c.ready) c.message = "塔台：已对准 2 号弹射位。按 F 报告准备就绪。";
        } else if (c.ready) {
          c.message = "塔台：偏离弹射位，继续修正。";
        }
        c.ready = nextReady;
        if (fPressed.current) {
          fPressed.current = false;
          reportReady();
        }
      } else if (c.phase === "arming") {
        c.speed = 0;
        c.x = c.targetX;
        c.z = c.targetZ;
        c.yaw = PLAY_TRACK_YAW;
        c.countdown = Math.max(0, 3 - Math.max(0, c.elapsed - 1.0));
        if (c.elapsed < 1.0) {
          c.message = "塔台：收到，2 号弹射位，挡焰板升起，储能充电。";
        } else if (c.elapsed < 2.0) {
          c.message = `塔台：${Math.ceil(c.countdown)}…准备弹射。`;
        } else {
          c.phase = "launch";
          c.elapsed = 0;
          c.countdown = 0;
          c.message = "塔台：弹射！";
        }
      } else if (c.phase === "launch") {
        const duration = 2.15;
        const u = Math.min(1, c.elapsed / duration);
        const stroke = PLAY_TRACK.length * Math.pow(u, 1.28);
        const p = catPoint(PLAY_TRACK, stroke - CAT_NOSE_ENGAGE);
        c.x = p.x;
        c.z = p.z;
        c.y = DECK_TOP + 0.02 * u;
        c.pitch = -0.12 * Math.max(0, (u - 0.62) / 0.38);
        c.speed = 8 + 72 * u;
        c.shake = 0.012 + 0.02 * u;
        overlay!.aircraft = {
          x: c.x,
          y: c.y,
          z: c.z,
          yaw: c.yaw,
          pitch: c.pitch,
          roll: 0,
          wingFold: 0,
          hook: 0,
          shuttleZ: catPoint(PLAY_TRACK, stroke).z,
        };
        if (u >= 1) {
          c.phase = "airborne";
          c.elapsed = 0;
          c.shake = 0;
          c.message = "塔台：离舰！收起落架，爬升。";
        }
      } else if (c.phase === "airborne") {
        const duration = 3.8;
        const u = Math.min(1, c.elapsed / duration);
        c.x = PLAY_TRACK.x0 + 0.9 * u;
        c.z = 19.2 + 11.5 * u;
        c.y = DECK_TOP + 0.08 + 5.6 * Math.pow(u, 1.35);
        c.pitch = -0.24;
        c.roll = 0.09 * Math.sin(u * Math.PI * 1.8);
        c.speed = 90 + 80 * u;
        overlay!.aircraft = {
          x: c.x,
          y: c.y,
          z: c.z,
          yaw: c.yaw,
          pitch: c.pitch,
          roll: c.roll,
          wingFold: 0,
          hook: 0,
          shuttleZ: catPoint(PLAY_TRACK, 0).z,
        };
        if (u >= 1) {
          c.phase = "combat";
          c.elapsed = 0;
          c.speed = 120;
          c.pitch = 0;
          c.roll = 0;
          c.message = "塔台：进入武器试射空域。R 锁定 / Space 发射，C 投放干扰弹。";
          combat.current?.dispose();
          combat.current = new AirCombat(scene);
          combat.current.spawn(aircraftWorldPose(c));
          combatSnapshot.current = null;
        }
      } else if (c.phase === "combat") {
        const throttle = keys.current.has("KeyW") ? 1 : keys.current.has("KeyS") ? -1 : 0;
        c.speed = THREE.MathUtils.clamp(c.speed + throttle * 22 * dt, 70, 180);
        const turn = (keys.current.has("KeyA") ? 1 : 0) + (keys.current.has("KeyD") ? -1 : 0);
        c.yaw += turn * 0.32 * dt;
        c.roll += (-turn * 0.5 - c.roll) * Math.min(1, dt * 2.5);
        const cruise = DECK_TOP + 7.2;
        if (c.autopilot) {
          c.y += (cruise - c.y) * Math.min(1, dt * 0.8);
          c.pitch = THREE.MathUtils.clamp((cruise - c.y) * 0.08, -0.12, 0.08);
          if (turn === 0) c.roll += (0 - c.roll) * Math.min(1, dt * 2.8);
          // 硬高度保护：自动驾驶永远不允许把机头带到海面以下。
          if (c.y < DECK_TOP + 2.2) {
            c.y = DECK_TOP + 2.2;
            c.pitch = -0.1;
            c.message = "A/P：低高度保护，自动拉起。";
          }
        } else {
          c.pitch = 0;
          c.y = Math.max(DECK_TOP + 2.2, c.y);
        }
        c.fuel = Math.max(8, c.fuel - dt * 0.08);
        c.x += Math.sin(c.yaw) * (c.speed / 7.9) * dt;
        c.z += Math.cos(c.yaw) * (c.speed / 7.9) * dt;
        overlay!.aircraft = {
          x: c.x,
          y: c.y,
          z: c.z,
          yaw: c.yaw,
          pitch: c.pitch,
          roll: c.roll,
          wingFold: 0,
          hook: 0,
          shuttleZ: catPoint(PLAY_TRACK, 0).z,
        };
        if (combat.current) {
          combat.current.setWeapon(c.weapon);
          const actions = {
            lock: lockPressed.current,
            fire: firePressed.current,
            flare: flarePressed.current,
          };
          lockPressed.current = false;
          firePressed.current = false;
          flarePressed.current = false;
          const snapshot = combat.current.update(aircraftWorldPose(c), camera, dt, keys.current, actions);
          combatSnapshot.current = snapshot;
          c.gunAmmo = combat.current.gunAmmo;
          c.aim9 = combat.current.aim9Ammo;
          c.flares = combat.current.flareAmmo;
          if (snapshot.message) c.message = snapshot.message;
        }
      } else if (c.phase === "complete") {
        if (c.elapsed > 1.0) setWalkFading(true);
        if (c.elapsed > 1.35) {
          exitCockpit();
          setWalkFading(false);
          return;
        }
      }
      if (c.phase !== "launch" && c.phase !== "airborne" && c.phase !== "combat" && c.phase !== "complete" && overlay) {
        overlay.aircraft = {
          x: c.x,
          y: DECK_TOP,
          z: c.z,
          yaw: c.yaw,
          pitch: 0,
          roll: 0,
          wingFold: 0,
          hook: 0,
          shuttleZ: catPoint(PLAY_TRACK, 0).z,
        };
      }
      // 座舱眼位：机体系（含 z 向缩比）× 舰体 root 矩阵；允许鼠标在舱内环视。
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.pitch, c.yaw, c.roll, "YXZ"));
      const modelMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(c.x, c.y, c.z),
        quat,
        new THREE.Vector3(1, 1, AIRCRAFT_SCALE_Z),
      );
      modelMatrix.premultiply(assembled.root.matrixWorld);
      const eyeWorld = COCKPIT_EYE.clone().applyMatrix4(modelMatrix);
      const lookYaw = c.yaw + cockpitLook.current.yaw;
      const lookPitch = c.pitch + cockpitLook.current.pitch;
      const look = new THREE.Vector3(
        Math.sin(lookYaw) * Math.cos(lookPitch),
        Math.sin(lookPitch),
        Math.cos(lookYaw) * Math.cos(lookPitch),
      );
      camera.position.copy(eyeWorld);
      if (c.phase === "launch" || c.phase === "airborne") {
        const shake = c.phase === "launch" ? c.shake : 0.004;
        camera.position.x += Math.sin(c.elapsed * 93) * shake;
        camera.position.y += Math.cos(c.elapsed * 77) * shake;
      }
      camera.up.set(0, 1, 0);
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.fov = 78;
      perspective.updateProjectionMatrix();
      camera.lookAt(eyeWorld.clone().add(look));
      if (light.current) {
        light.current.position.copy(eyeWorld);
        light.current.position.y += 0.12;
        light.current.intensity = 1.0;
      }
      if (ambient.current) ambient.current.intensity = 0.72;
      for (const roomLight of roomLights.current) if (roomLight) roomLight.intensity = 0;
      cockStateClock.current += dt;
      poseClock.current += dt;
      if (cockStateClock.current >= 0.08) {
        cockStateClock.current = 0;
        publishCockpit();
      }
      if (poseClock.current >= 0.08) {
        poseClock.current = 0;
        setWalkPose({ x: c.x, z: c.z, yaw: c.yaw });
      }
      current.current = null;
      if (lastPrompt.current !== null) {
        lastPrompt.current = null;
        setWalkPrompt(null);
      }
      ePressed.current = false;
      if (c.phase !== "taxi") fPressed.current = false;
      return;
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
        const substeps = Math.max(1, Math.ceil(step / 0.05));
        const subStep = step / substeps;
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
        // 冲刺一帧可达 1 米；拆成小步，避免穿过舱门/栏杆的碰撞体。
        for (let i = 0; i < substeps; i++) {
          tryAxis(move.x * subStep, 0);
          tryAxis(0, move.z * subStep);
        }
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

    // 准星悬停：第一人称里鼠标指到的零件轻微变色，E 打开左上角详情卡。
    hoverClock.current += dt;
    if (hoverClock.current >= 0.12 && !transitioning.current && !travelOpen) {
      hoverClock.current = 0;
      const ray = raycaster.current;
      ndc.current.set(pointerLocked.current ? 0 : pointer.current.x, pointerLocked.current ? 0 : pointer.current.y);
      ray.setFromCamera(ndc.current, camera);
      ray.far = 34;
      const candidates: Array<THREE.Mesh | THREE.InstancedMesh> = [];
      for (const entry of pickCandidatesOf(assembled)) {
        if (!entry.object.visible) continue;
        if (!entry.always) {
          if (entry.center.distanceToSquared(ray.ray.origin) > (ray.far + entry.radius) ** 2) continue;
          if (ray.ray.distanceSqToPoint(entry.center) > entry.radius * entry.radius) continue;
        }
        candidates.push(entry.object);
      }
      const hits = candidates.length > 0 ? ray.intersectObjects(candidates, false) : [];
      let picked: { object: THREE.Mesh | THREE.InstancedMesh; partId: string; instance: number | null; name: string } | null = null;
      for (const hit of hits) {
        const object = hit.object as THREE.Mesh | THREE.InstancedMesh;
        if (!object?.name) continue;
        const part = assembled.getPart(object.name);
        if (!part || part.def.tags?.includes("fx")) continue;
        let visible = object.visible;
        let parent = object.parent;
        while (visible && parent && parent !== assembled.root) {
          visible = parent.visible;
          parent = parent.parent;
        }
        if (!visible) continue;
        picked = {
          object,
          partId: part.partId,
          instance: typeof hit.instanceId === "number" ? hit.instanceId : null,
          name: part.def.name_cn,
        };
        break;
      }
      const key = picked ? `${picked.partId}#${picked.instance ?? ""}` : null;
      if (key !== hoverPart.current) {
        hoverPart.current = key;
        restoreHover();
        if (picked) {
          const tint = (source: THREE.Material): THREE.Material => {
            const material = source.clone();
            const standard = material as THREE.MeshStandardMaterial;
            if (standard.emissive) {
              standard.emissive.setHex(0x4f9aaa);
              standard.emissiveIntensity = Math.max(standard.emissiveIntensity ?? 0, 0.35);
            }
            if (standard.color) standard.color.lerp(new THREE.Color(0xbfe4ec), 0.12);
            material.needsUpdate = true;
            return material;
          };
          const source = picked.object.material;
          const original = source;
          picked.object.material = Array.isArray(source) ? source.map(tint) : tint(source);
          hover.current = { object: picked.object, material: original };
        }
        setWalkHover(picked ? { partId: picked.partId, name: picked.name, instance: picked.instance } : null);
      }
    } else if (transitioning.current || travelOpen) {
      if (hoverPart.current !== null) {
        hoverPart.current = null;
        restoreHover();
        setWalkHover(null);
      }
    }
    if (ePressed.current) {
      ePressed.current = false;
      const h = useStageStore.getState().walkHover;
      if (h) selectPart(h.partId, h.instance);
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
