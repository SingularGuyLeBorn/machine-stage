import * as THREE from "three";

// ============================================================================
// AirCombat —— AIM-9 / M61A1 / MJU-7A 的实时空战仿真
//
// AIM-9 是真正的 6-DoF 刚体：位置/速度 + 四元数姿态 + 角速度/转动惯量；
// 推力沿弹体轴、重力、大气阻力、气动舵面升力共同作用。导引头按弹体系万向架
// 跟踪目标，PN（比例导引）生成横向加速度指令，再由可用过载限制/舵面力矩
// 转成角加速度。发动机按助推/续航两段工作，推进剂质量实时减少，质量和惯量
// 随燃烧变化。近炸引信在 TTI/距离窗口触发，战斗部按脱靶量判定杀伤。
//
// 干扰：目标/玩家均可投放 MJU-7A（高红外强度、快速减速），导引头按
// 角度、距离和红外强度竞争目标；释放干扰弹可使来袭弹丢失目标或转锁诱饵。
// 6-DoF 子弹药/M61 实弹有重力和飞行时间，不是 hitscan。
// 所有坐标使用世界米制；渲染物体挂在 scene 上，不参与航母零件树/扫描。
// ============================================================================

export interface AircraftPose {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  speed: number;
  /** 玩家投放干扰弹/机炮发射点。 */
  up: THREE.Vector3;
}

export interface CombatActions {
  lock: boolean;
  fire: boolean;
  flare: boolean;
}

export interface CombatSnapshot {
  lock: boolean;
  lockScreen: [number, number] | null;
  targetCount: number;
  targetRange: number;
  closure: number;
  wezMax: number;
  wezMin: number;
  nez: number;
  missiles: number;
  contacts: Array<{ bearing: number; range: number; locked: boolean }>;
  rwr: boolean;
  message: string | null;
}

const G = 9.81;
const RHO0 = 1.225;
const AIM9 = {
  mass0: 86,
  propellant: 32,
  boostN: 13000,
  boostTime: 0.55,
  sustainN: 3200,
  sustainTime: 2.2,
  isp: 235,
  diameter: 0.127,
  cd0: 0.32,
  clMax: 14,
  maxG: 38,
  navigation: 3.7,
  seekerGimbal: (52 * Math.PI) / 180,
  lethalRadius: 11,
  fuzeRadius: 5.5,
  armTime: 0.45,
  maxLife: 22,
  launchSpeed: 45,
};

interface Target {
  id: number;
  group: THREE.Group;
  position: THREE.Vector3;
  home: THREE.Vector3;
  velocity: THREE.Vector3;
  alive: boolean;
  ir: number;
  flares: number;
  flareCooldown: number;
  phase: number;
  trail: THREE.Points | null;
}

interface Flare {
  mesh: THREE.Sprite;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  intensity: number;
  owner: "player" | "target";
}

interface Missile {
  mesh: THREE.Group;
  plume: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  mass: number;
  propellant: number;
  age: number;
  motorTime: number;
  target: Target | Flare | null;
  targetIsFlare: boolean;
  enemy: boolean;
  armed: boolean;
  alive: boolean;
  trail: THREE.Line;
  trailPoints: THREE.Vector3[];
  lastSeekerAngle: number;
}

interface Bullet {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

interface Burst {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

function rhoAt(altitude: number): number {
  return RHO0 * Math.exp(-Math.max(0, altitude) / 8500);
}

function quatFromForward(forward: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize());
}

function clampLength(vector: THREE.Vector3, max: number): THREE.Vector3 {
  const length = vector.length();
  if (length > max) vector.multiplyScalar(max / length);
  return vector;
}

export class AirCombat {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private targets: Target[] = [];
  private missiles: Missile[] = [];
  private flares: Flare[] = [];
  private bullets: Bullet[] = [];
  private bursts: Burst[] = [];
  private lock: Target | null = null;
  private audio: AudioContext | null = null;
  private rwr = false;
  private rwrCooldown = 0;
  private lastRwrBeep = 0;
  private lastGun = 0;
  private active = false;
  private message: string | null = null;
  private time = 0;
  private initialAircraft = new THREE.Vector3();
  private initialForward = new THREE.Vector3(0, 0, 1);
  private playerTarget: Target | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = "carrier-air-combat";
    scene.add(this.group);
  }

  get running(): boolean {
    return this.active;
  }

  get gunAmmo(): number {
    return this.gun;
  }
  get aim9Ammo(): number {
    return this.aim9;
  }
  get flareAmmo(): number {
    return this.flareCount;
  }
  get locked(): boolean {
    return this.lock !== null;
  }
  get rwrActive(): boolean {
    return this.rwr;
  }
  get targetCount(): number {
    return this.targets.filter((target) => target.alive).length;
  }
  get missileCount(): number {
    return this.missiles.filter((missile) => missile.alive).length;
  }

  debug(): unknown {
    return {
      targets: this.targets.map((target) => ({ alive: target.alive, flares: target.flares, range: target.position.length() })),
      missiles: this.missiles.map((missile) => ({
        age: Number(missile.age.toFixed(2)),
        y: Number(missile.position.y.toFixed(1)),
        speed: Number(missile.velocity.length().toFixed(1)),
        targetFlare: missile.targetIsFlare,
        targetAlive: missile.target ? ("alive" in missile.target ? (missile.target as Target).alive : (missile.target as Flare).life > 0) : null,
        seekers: Number(missile.lastSeekerAngle.toFixed(2)),
      })),
      flares: this.flares.length,
      lock: this.lock?.id ?? null,
    };
  }

  private gun = 510;
  private aim9 = 4;
  private flareCount = 30;
  private weapon: "GUN" | "AIM9" = "AIM9";

  spawn(aircraft: AircraftPose): void {
    if (this.active) return;
    this.active = true;
    this.time = 0;
    this.initialAircraft.copy(aircraft.position);
    this.initialForward.copy(aircraft.forward).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(aircraft.forward, new THREE.Vector3(0, 1, 0)).normalize();
    const layout: Array<[number, number, number, number]> = [
      [1300, -240, 90, 26],
      [2300, 160, 170, -18],
      [3300, 320, 60, 34],
    ];
    this.targets = layout.map(([range, lateral, up, speed], index) => {
      const position = aircraft.position.clone()
        .addScaledVector(aircraft.forward, range)
        .addScaledVector(right, lateral)
        .add(new THREE.Vector3(0, up, 0));
      return this.makeTarget(index, position, speed);
    });
    this.playerTarget = {
      id: -1,
      group: new THREE.Group(),
      position: aircraft.position.clone(),
      home: aircraft.position.clone(),
      velocity: aircraft.forward.clone().multiplyScalar(aircraft.speed),
      alive: true,
      ir: 6,
      flares: 0,
      flareCooldown: 0,
      phase: 0,
      trail: null,
    };
    this.message = "塔台：进入武器试射空域。3 个靶机，R 锁定 / Space 发射。";
  }

  setWeapon(weapon: "GUN" | "AIM9"): void {
    this.weapon = weapon;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material.dispose();
      }
    });
    if (this.audio) void this.audio.close().catch(() => {});
    this.group = new THREE.Group();
    this.targets = [];
    this.missiles = [];
    this.flares = [];
    this.bullets = [];
    this.bursts = [];
    this.lock = null;
    this.active = false;
    this.audio = null;
  }

  private ensureAudio(): AudioContext | null {
    if (this.audio) return this.audio;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.audio = new Ctor();
    } catch {
      this.audio = null;
    }
    return this.audio;
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }

  private noise(duration: number, volume: number): void {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  private makeTarget(index: number, position: THREE.Vector3, speed: number): Target {
    const group = new THREE.Group();
    group.position.copy(position);
    const skin = new THREE.MeshStandardMaterial({ color: 0xc84a36, emissive: 0x30100a, metalness: 0.5, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x171b1e, metalness: 0.65, roughness: 0.38 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.1, 10), skin);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 10), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 1.32;
    group.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.5), skin);
    wing.position.z = 0.18;
    group.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.3), skin);
    tail.position.z = -0.95;
    group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.44), skin);
    fin.position.set(0, 0.32, -0.92);
    group.add(fin);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dark);
    canopy.position.set(0, 0.16, 0.5);
    canopy.scale.set(0.8, 0.55, 1.4);
    group.add(canopy);
    group.scale.setScalar(3.2);
    this.group.add(group);
    return {
      id: index,
      group,
      position,
      home: position.clone(),
      velocity: new THREE.Vector3((index % 2 === 0 ? 1 : -1) * speed, 0, 0),
      alive: true,
      ir: 2.4,
      flares: 4,
      flareCooldown: 0,
      phase: index * 1.4,
      trail: null,
    };
  }

  private detonate(position: THREE.Vector3, scale = 1): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xffbd5e, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
    mesh.position.copy(position);
    mesh.scale.setScalar(scale);
    this.group.add(mesh);
    this.bursts.push({ mesh, life: 0.7, maxLife: 0.7 });
    this.noise(0.4, 0.07);
    this.tone(85, 0.35, "sawtooth", 0.03);
  }

  private killTarget(target: Target): void {
    if (!target.alive) return;
    target.alive = false;
    target.group.visible = false;
    if (this.lock === target) this.lock = null;
    this.detonate(target.position.clone(), 3.2);
    this.message = `武器：命中靶机 ${target.id + 1}，目标摧毁。`;
  }

  private makeFlare(position: THREE.Vector3, velocity: THREE.Vector3, owner: "player" | "target"): Flare {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,220,1)");
    gradient.addColorStop(0.25, "rgba(255,220,120,0.95)");
    gradient.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(5);
    sprite.position.copy(position);
    this.group.add(sprite);
    return { mesh: sprite, position: position.clone(), velocity: velocity.clone(), life: 3.2, intensity: 8, owner };
  }

  private deployTargetFlares(target: Target): void {
    if (target.flares <= 0 || target.flareCooldown > 0) return;
    target.flares = Math.max(0, target.flares - 4);
    target.flareCooldown = 2.8;
    for (let i = 0; i < 4; i++) {
      const velocity = target.velocity.clone().add(new THREE.Vector3((i - 1.5) * 8, -6 - i, (i % 2) * 5));
      this.flares.push(this.makeFlare(target.position.clone().add(new THREE.Vector3((i - 1.5) * 3, 0, 0)), velocity, "target"));
    }
  }

  private missileMesh(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xe9e3d1, metalness: 0.55, roughness: 0.32 }),
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.32, 10),
      new THREE.MeshStandardMaterial({ color: 0x3c3d3d, metalness: 0.4, roughness: 0.5 }),
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 1.36;
    group.add(nose);
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.32, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x4c4a45, metalness: 0.45, roughness: 0.45 }),
      );
      fin.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, -0.95);
      fin.rotation.z = angle;
      group.add(fin);
    }
    return group;
  }

  launchAim9(aircraft: AircraftPose, target: Target): boolean {
    if (this.aim9 <= 0) {
      this.message = "武器：AIM-9 挂架已空。";
      return false;
    }
    this.aim9 -= 1;
    const mesh = this.missileMesh();
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 1.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    plume.rotation.x = Math.PI / 2;
    plume.position.z = -1.8;
    mesh.add(plume);
    const position = aircraft.position.clone().addScaledVector(aircraft.forward, 3.2).addScaledVector(aircraft.up, -1.2);
    mesh.position.copy(position);
    const quaternion = quatFromForward(aircraft.forward.clone().add(new THREE.Vector3(0, 0.02, 0)));
    mesh.quaternion.copy(quaternion);
    this.group.add(mesh);
    const trailGeometry = new THREE.BufferGeometry().setFromPoints([position.clone(), position.clone()]);
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xdcebe8, transparent: true, opacity: 0.62 }),
    );
    this.group.add(trail);
    this.missiles.push({
      mesh,
      plume,
      position,
      velocity: aircraft.forward.clone().multiplyScalar(aircraft.speed + AIM9.launchSpeed),
      quaternion,
      angularVelocity: new THREE.Vector3(),
      mass: AIM9.mass0,
      propellant: AIM9.propellant,
      age: 0,
      motorTime: 0,
      target,
      targetIsFlare: false,
      enemy: false,
      armed: false,
      alive: true,
      trail,
      trailPoints: [position.clone()],
      lastSeekerAngle: 0,
    });
    this.tone(620, 0.22, "sawtooth", 0.035);
    this.noise(0.2, 0.03);
    this.message = "武器：AIM-9 发射，导引头跟踪目标。";
    return true;
  }

  private launchEnemyMissile(launcher: Target): boolean {
    // 靶机发射一枚红外弹追击玩家；玩家用 C 投放 MJU-7A 让来袭弹转锁诱饵。
    if (!this.playerTarget || this.playerTarget.alive === false) return false;
    if (this.missiles.some((missile) => missile.enemy)) return false;
    const direction = this.playerTarget.position.clone().sub(launcher.position).normalize();
    const mesh = this.missileMesh();
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 1.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    plume.rotation.x = Math.PI / 2;
    plume.position.z = -1.8;
    mesh.add(plume);
    const position = launcher.position.clone().addScaledVector(direction, 3);
    mesh.position.copy(position);
    mesh.quaternion.copy(quatFromForward(direction));
    this.group.add(mesh);
    const trailGeometry = new THREE.BufferGeometry().setFromPoints([position.clone(), position.clone()]);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffb0a0, transparent: true, opacity: 0.3 }));
    this.group.add(trail);
    this.missiles.push({
      mesh,
      plume,
      position,
      velocity: direction.clone().multiplyScalar(260),
      quaternion: quatFromForward(direction),
      angularVelocity: new THREE.Vector3(),
      mass: AIM9.mass0,
      propellant: AIM9.propellant,
      age: 0,
      motorTime: 0,
      target: this.playerTarget,
      targetIsFlare: false,
      enemy: true,
      armed: false,
      alive: true,
      trail,
      trailPoints: [position.clone()],
      lastSeekerAngle: 0,
    });
    this.rwr = true;
    this.rwrCooldown = 9;
    this.tone(1500, 0.14, "square", 0.035);
    this.message = "RWR：敌弹发射！按 C 投放 MJU-7A 干扰弹。";
    return true;
  }

  private fireGun(aircraft: AircraftPose, camera: THREE.Camera): void {
    if (this.gun <= 0) return;
    this.gun -= 1;
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const origin = aircraft.position.clone().addScaledVector(aircraft.forward, 4).addScaledVector(aircraft.up, -0.8);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 2.5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd47a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.group.add(mesh);
    this.bullets.push({ mesh, position: origin, velocity: direction.multiplyScalar(1030), life: 3.4 });
    this.noise(0.05, 0.035);
  }

  private deployPlayerFlares(aircraft: AircraftPose): void {
    if (this.flareCount <= 0) return;
    this.flareCount = Math.max(0, this.flareCount - 6);
    for (let i = 0; i < 6; i++) {
      const velocity = aircraft.forward.clone().multiplyScalar(aircraft.speed * 0.75)
        .add(new THREE.Vector3((i - 2.5) * 9, -8, 0));
      this.flares.push(this.makeFlare(aircraft.position.clone().add(new THREE.Vector3(0, -2, 0)), velocity, "player"));
    }
    this.rwr = false;
    this.rwrCooldown = 6;
    this.tone(820, 0.12, "triangle", 0.03);
    this.message = "对抗：MJU-7A 投放，红外诱饵正在燃烧。";
  }

  update(
    aircraft: AircraftPose,
    camera: THREE.Camera,
    dt: number,
    keys: Set<string>,
    actions: CombatActions,
  ): CombatSnapshot {
    this.time += dt;
    const now = performance.now() / 1000;
    if (this.playerTarget) {
      this.playerTarget.position.copy(aircraft.position);
      this.playerTarget.velocity.copy(aircraft.forward).multiplyScalar(aircraft.speed);
    }
    // 靶机按各自航向缓慢漂移，并带一点高度变化。
    for (const target of this.targets) {
      if (!target.alive) continue;
      target.position.addScaledVector(target.velocity, dt);
      target.position.y += Math.sin(this.time * 0.7 + target.phase) * dt * 1.2;
      target.group.position.copy(target.position);
      target.group.rotation.y = Math.atan2(target.velocity.x, target.velocity.z) + Math.PI / 2;
      target.flareCooldown = Math.max(0, target.flareCooldown - dt);
      // 射击画廊：飞过目标后把它重新摆到前方，避免只能打一轮就再也看不到靶机。
      const relative = target.position.clone().sub(aircraft.position);
      const ahead = relative.dot(aircraft.forward);
      if (ahead < -1600 || relative.length() > 9000) {
        const right = new THREE.Vector3().crossVectors(aircraft.forward, new THREE.Vector3(0, 1, 0)).normalize();
        target.position.copy(aircraft.position)
          .addScaledVector(aircraft.forward, 2200 + target.id * 650)
          .addScaledVector(right, (target.id - 1) * 380)
          .add(new THREE.Vector3(0, 80 + target.id * 40, 0));
        target.home.copy(target.position);
        target.group.position.copy(target.position);
        target.group.visible = true;
        target.velocity.set((target.id % 2 === 0 ? 1 : -1) * (22 + target.id * 4), 0, 0);
        target.flareCooldown = 0;
        target.flares = Math.max(target.flares, 4);
        if (this.lock === target) this.lock = null;
      }
    }
    // 锁定：R 循环目标；相机视轴内、8km、万向架内才可锁。
    if (actions.lock) this.cycleLock(aircraft, camera);
    if (!this.lock?.alive) this.lock = null;
    let targetRange = 0;
    let closure = 0;
    const lockedTarget = this.lock;
    if (lockedTarget) {
      const toTarget = lockedTarget.position.clone().sub(aircraft.position);
      targetRange = toTarget.length();
      const los = toTarget.clone().normalize();
      const look = camera.getWorldDirection(new THREE.Vector3());
      if (los.angleTo(look) > AIM9.seekerGimbal) this.lock = null;
      closure = -los.dot(lockedTarget.velocity.clone().sub(aircraft.forward.clone().multiplyScalar(aircraft.speed)));
    }
    if (actions.fire) {
      if (this.weapon === "AIM9") {
        if (this.lock) this.launchAim9(aircraft, this.lock);
        else {
          this.message = "武器：没有红外锁定，按 R 先锁定目标。";
          this.tone(280, 0.08, "square", 0.025);
        }
      } else {
        this.fireGun(aircraft, camera);
      }
    }
    if (this.weapon === "GUN" && keys.has("Space") && now - this.lastGun > 0.06) {
      this.lastGun = now;
      this.fireGun(aircraft, camera);
    }
    if (actions.flare) this.deployPlayerFlares(aircraft);
    // 敌方告警：试射进入 10s 后模拟一次 RWR，投放干扰弹解除。
    if (this.rwrCooldown > 0) this.rwrCooldown -= dt;
    else if (this.time > 10 && this.targets.some((target) => target.alive) && !this.rwr) {
      this.launchEnemyMissile(this.targets.find((target) => target.alive)!);
    }
    if (this.rwr && now - this.lastRwrBeep > 0.7) {
      this.lastRwrBeep = now;
      this.tone(1420, 0.07, "square", 0.02);
    }
    // 干扰弹寿命/阻力。
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const flare = this.flares[i]!;
      flare.life -= dt;
      flare.velocity.multiplyScalar(1 - dt * 2.6);
      flare.velocity.y -= G * dt;
      flare.position.addScaledVector(flare.velocity, dt);
      flare.mesh.position.copy(flare.position);
      (flare.mesh.material as THREE.SpriteMaterial).opacity = Math.max(0, flare.life / 3.2);
      if (flare.life <= 0) {
        this.group.remove(flare.mesh);
        (flare.mesh.material as THREE.SpriteMaterial).map?.dispose();
        (flare.mesh.material as THREE.SpriteMaterial).dispose();
        this.flares.splice(i, 1);
      }
    }
    // AIM-9 6-DoF 与导引头。
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const missile = this.missiles[i]!;
      this.stepMissile(missile, dt, now);
      if (!missile.alive) {
        this.group.remove(missile.mesh);
        this.group.remove(missile.trail);
        this.disposeObject(missile.mesh);
        missile.trail.geometry.dispose();
        (missile.trail.material as THREE.Material).dispose();
        this.missiles.splice(i, 1);
      }
    }
    // 机炮实弹：重力 + 目标球体相交。
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i]!;
      bullet.life -= dt;
      bullet.velocity.y -= G * dt;
      bullet.position.addScaledVector(bullet.velocity, dt);
      bullet.mesh.position.copy(bullet.position);
      bullet.mesh.lookAt(bullet.position.clone().add(bullet.velocity));
      let hit = false;
      for (const target of this.targets) {
        if (!target.alive) continue;
        if (bullet.position.distanceTo(target.position) < 9) {
          this.killTarget(target);
          hit = true;
          break;
        }
      }
      if (bullet.life <= 0 || hit) {
        this.group.remove(bullet.mesh);
        bullet.mesh.geometry.dispose();
        (bullet.mesh.material as THREE.Material).dispose();
        this.bullets.splice(i, 1);
      }
    }
    // 爆炸/曳光残影。
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!;
      burst.life -= dt;
      const progress = 1 - Math.max(0, burst.life / burst.maxLife);
      burst.mesh.scale.setScalar(1 + progress * 8);
      (burst.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress);
      if (burst.life <= 0) {
        this.group.remove(burst.mesh);
        burst.mesh.geometry.dispose();
        (burst.mesh.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    // WEZ（对当前锁定目标）：由导弹能量、目标速度和高度快速估算。
    const wezMax = this.estimateWezMax(aircraft, targetRange || 2500);
    const wezMin = 420;
    const nez = Math.round(wezMax * 0.52);
    const right = new THREE.Vector3().crossVectors(aircraft.up, aircraft.forward).normalize();
    const contacts = this.targets
      .filter((target) => target.alive)
      .map((target) => {
        const relative = target.position.clone().sub(aircraft.position);
        return {
          bearing: (Math.atan2(relative.dot(right), relative.dot(aircraft.forward)) * 180) / Math.PI,
          range: Math.round(relative.length()),
          locked: this.lock === target,
        };
      });
    let lockScreen: [number, number] | null = null;
    if (this.lock) {
      const ndc = this.lock.position.clone().project(camera);
      if (ndc.z > -1 && ndc.z < 1) lockScreen = [ndc.x, ndc.y];
    }
    return {
      lock: this.lock !== null,
      lockScreen,
      targetCount: this.targetCount,
      targetRange: Math.round(targetRange),
      closure: Math.round(closure),
      wezMax,
      wezMin,
      nez,
      missiles: this.missileCount,
      contacts,
      rwr: this.rwr,
      message: this.message,
    };
  }

  private cycleLock(aircraft: AircraftPose, camera: THREE.Camera): void {
    const look = camera.getWorldDirection(new THREE.Vector3());
    const candidates = this.targets
      .filter((target) => target.alive && target.position.distanceTo(aircraft.position) < 8500)
      .map((target) => {
        const los = target.position.clone().sub(aircraft.position).normalize();
        return { target, angle: los.angleTo(look), range: target.position.distanceTo(aircraft.position) };
      })
      .filter((candidate) => candidate.angle < AIM9.seekerGimbal)
      .sort((a, b) => a.angle - b.angle);
    const current = this.lock ? candidates.findIndex((candidate) => candidate.target === this.lock) : -1;
    const next = candidates[(current + 1) % candidates.length];
    this.lock = next?.target ?? null;
    if (this.lock) {
      this.tone(1180, 0.12, "square", 0.03);
      this.message = `锁定：目标 ${this.lock.id + 1}，距离 ${Math.round(this.lock.position.distanceTo(aircraft.position) / 1000)}km。`;
    } else {
      this.tone(320, 0.1, "square", 0.02);
      this.message = "雷达：视场内无红外目标。";
    }
  }

  private stepMissile(missile: Missile, dt: number, now: number): void {
    missile.age += dt;
    if (missile.age > AIM9.maxLife || missile.position.y < 2) {
      missile.alive = false;
      return;
    }
    if (!missile.armed && missile.age >= AIM9.armTime) missile.armed = true;
    // 导引头：选择真实目标或最近的诱饵，按红外强度和角度竞争。
    let seekerTarget: Target | Flare | null = missile.target;
    if (!missile.targetIsFlare && this.flares.length > 0) {
      const targetPos = missile.target && "alive" in missile.target && missile.target.alive ? missile.target.position : null;
      let bestFlare: Flare | null = null;
      let bestScore = 0;
      for (const flare of this.flares) {
        if (missile.enemy ? flare.owner !== "player" : flare.owner !== "target") continue;
        const angle = flare.position.clone().sub(missile.position).normalize().angleTo(missile.velocity.clone().normalize());
        if (angle > 0.28) continue;
        const range = missile.position.distanceTo(flare.position);
        const targetRange = targetPos ? missile.position.distanceTo(targetPos) : Infinity;
        const score = flare.intensity / Math.max(1, range / 500) * (range < targetRange * 1.4 ? 1 : 0.3);
        if (score > bestScore) {
          bestScore = score;
          bestFlare = flare;
        }
      }
      if (bestFlare && Math.random() < 0.52) {
        missile.target = bestFlare;
        missile.targetIsFlare = true;
        seekerTarget = bestFlare;
      }
    }
    const targetPos = seekerTarget && (missile.targetIsFlare ? (seekerTarget as Flare).life > 0 : (seekerTarget as Target).alive)
      ? (seekerTarget as Target | Flare).position
      : null;
    // 目标看到导弹逼近时自动投放 MJU-7A；导引头下一帧用红外竞争决定是否转锁诱饵。
    if (!missile.targetIsFlare && targetPos && missile.target && "alive" in missile.target) {
      const rangeToTarget = missile.position.distanceTo(targetPos);
      if (rangeToTarget < 1600) this.deployTargetFlares(missile.target as Target);
    }
    // 万向架：目标相对弹体轴的角度超限 → 丢失。
    const bodyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(missile.quaternion);
    if (targetPos) {
      const losAngle = targetPos.clone().sub(missile.position).normalize().angleTo(bodyForward);
      missile.lastSeekerAngle = losAngle;
      if (losAngle > AIM9.seekerGimbal + 0.08) {
        missile.target = null;
      }
    }
    // 质量/推力：助推 → 续航，推进剂按 Isp 消耗。
    const boost = missile.age < AIM9.boostTime;
    const sustain = missile.age >= AIM9.boostTime && missile.age < AIM9.boostTime + AIM9.sustainTime;
    let thrust = 0;
    if ((boost || sustain) && missile.propellant > 0) {
      thrust = boost ? AIM9.boostN : AIM9.sustainN;
      const mdot = thrust / (G * AIM9.isp);
      const burned = Math.min(missile.propellant, mdot * dt);
      missile.propellant -= burned;
      missile.mass -= burned;
      missile.motorTime += dt;
    }
    missile.plume.visible = thrust > 0;
    missile.plume.scale.z = thrust > 0 ? 1 + Math.sin(missile.age * 40) * 0.15 : 0;
    // PN 导引：LOS 角速度 × 接近速度 × N，限制可用过载。
    const accel = new THREE.Vector3(0, -G, 0);
    if (targetPos) {
      const rel = targetPos.clone().sub(missile.position);
      const range = rel.length();
      const los = rel.clone().normalize();
      const closing = missile.velocity.clone().sub(
        seekerTarget instanceof Object && "velocity" in seekerTarget ? (seekerTarget as Target | Flare).velocity : new THREE.Vector3(),
      ).dot(los);
      const targetVel = "velocity" in (seekerTarget as object) ? (seekerTarget as Target | Flare).velocity : new THREE.Vector3();
      const relative = targetVel.clone().sub(missile.velocity);
      const losRate = new THREE.Vector3().crossVectors(los, relative).divideScalar(Math.max(1, range));
      // LOS 旋转轴 × LOS = 应转向的横向加速度方向（比例导引）。
      // 反向会朝目标旋转相反方向偏航，几秒后丢锁坠海。
      const pn = new THREE.Vector3().crossVectors(losRate, los).multiplyScalar(AIM9.navigation * Math.max(100, Math.abs(closing)));
      // 转换为横向加速度（去掉视线方向分量），并补偿重力：导弹靠舵面升力维持弹道，
      // 不做重力补偿就会在助推后直接坠海。
      pn.addScaledVector(los, -pn.dot(los));
      pn.y += G;
      const q = 0.5 * rhoAt(missile.position.y) * missile.velocity.lengthSq() * Math.PI * (AIM9.diameter / 2) ** 2;
      const aMax = Math.min(AIM9.maxG * G, (q * AIM9.clMax) / Math.max(0.1, missile.mass));
      clampLength(pn, aMax);
      accel.add(pn);
      // 近炸引信：进入引信窗口后按距离引爆。
      if (missile.armed && range < AIM9.fuzeRadius && Math.abs(closing) > 20) {
        this.detonate(missile.position.clone(), 2.4);
        if (range < AIM9.lethalRadius) {
          if (missile.targetIsFlare) {
            // 命中诱饵，不伤真实目标。
          } else if (missile.target === this.playerTarget) {
            this.message = "命中：敌弹近炸，自动驾驶接管改出。";
            this.rwr = false;
            if (this.playerTarget) this.playerTarget.alive = false;
          } else if (missile.target && "alive" in missile.target) {
            this.killTarget(missile.target as Target);
          }
        }
        missile.alive = false;
        return;
      }
    }
    // 阻力 + 推力 + 重力。
    const speed = Math.max(1, missile.velocity.length());
    const rho = rhoAt(missile.position.y);
    const drag = 0.5 * rho * speed * speed * Math.PI * (AIM9.diameter / 2) ** 2 * AIM9.cd0;
    const dragAccel = missile.velocity.clone().normalize().multiplyScalar(-drag / Math.max(0.2, missile.mass));
    accel.add(dragAccel);
    accel.addScaledVector(bodyForward, thrust / Math.max(0.2, missile.mass));
    missile.velocity.addScaledVector(accel, dt);
    missile.position.addScaledVector(missile.velocity, dt);
    // 姿态 6-DoF：让弹体轴跟随速度方向，机翼过载产生角速度/阻尼。
    const desired = quatFromForward(missile.velocity.clone().normalize());
    const error = new THREE.Quaternion().copy(desired).multiply(missile.quaternion.clone().invert());
    const axis = new THREE.Vector3(error.x, error.y, error.z);
    if (axis.lengthSq() > 1e-8) {
      axis.normalize();
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(error.w, -1, 1));
      const rate = Math.min(3.8, angle * 7.5);
      missile.angularVelocity.lerp(axis.multiplyScalar(rate), Math.min(1, dt * 6));
    }
    missile.angularVelocity.multiplyScalar(1 - Math.min(0.95, dt * 0.7));
    const spin = new THREE.Quaternion().setFromAxisAngle(missile.angularVelocity.clone().normalize(), missile.angularVelocity.length() * dt);
    missile.quaternion.premultiply(spin).normalize();
    missile.mesh.position.copy(missile.position);
    missile.mesh.quaternion.copy(missile.quaternion);
    // 尾迹保留最近 18 个点。
    missile.trailPoints.push(missile.position.clone());
    if (missile.trailPoints.length > 48) missile.trailPoints.shift();
    missile.trail.geometry.setFromPoints(missile.trailPoints);
    if (now - (missile as unknown as { lastTrail?: number }).lastTrail! > 0.1) {
      (missile as unknown as { lastTrail?: number }).lastTrail = now;
    }
  }

  private estimateWezMax(aircraft: AircraftPose, fallbackRange: number): number {
    const altitude = Math.max(0, aircraft.position.y);
    const rho = rhoAt(altitude);
    const v0 = aircraft.speed + AIM9.launchSpeed;
    const dragDecel = 0.5 * rho * v0 * v0 * Math.PI * (AIM9.diameter / 2) ** 2 * AIM9.cd0 / AIM9.mass0;
    const boostDv = (AIM9.boostN * AIM9.boostTime + AIM9.sustainN * AIM9.sustainTime) / AIM9.mass0;
    const terminal = Math.max(250, v0 + boostDv - dragDecel * 8);
    const range = Math.max(3000, (terminal * terminal) / (2 * Math.max(0.3, dragDecel)) + 2500);
    return Math.round(Math.min(14000, range || fallbackRange));
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material.dispose();
    });
  }
}
