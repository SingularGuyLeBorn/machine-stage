import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageStore } from "@/app/state/stageStore";

// ============================================================================
// CommandScreens —— 指挥舱显控屏内容 + 舰桥窗外海面
//
// 屏幕使用 8 张独立素材（海图/雷达 PPI/战术图/舰桥前视摄像头/声呐/
// 动力示意/损管/通信频谱），按零件材质名替换，不再用统一的青色发光片。
// 材质在注册表里只定义名字；这里在浏览器端一次性加载贴图并写入材质，
// 避免材质库（也会在测试环境执行）依赖 Image/DOM。
// ============================================================================

const SCREEN_FILES: Record<string, string> = {
  cv_scr_ocean: "/screens/ocean-horizon.jpg",
  cv_scr_chart: "/screens/chart.jpg",
  cv_scr_radar: "/screens/radar.jpg",
  cv_scr_tactical: "/screens/tactical.jpg",
  cv_scr_sonar: "/screens/sonar.jpg",
  cv_scr_camera: "/screens/camera.jpg",
  cv_scr_engine: "/screens/engine.jpg",
  cv_scr_damage: "/screens/damage.jpg",
  cv_scr_comms: "/screens/comms.jpg",
};

let cachedTextures: Map<string, THREE.Texture> | null = null;
let loading: Promise<Map<string, THREE.Texture>> | null = null;

function loadScreens(): Promise<Map<string, THREE.Texture>> {
  if (cachedTextures) return Promise.resolve(cachedTextures);
  if (loading) return loading;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  loading = Promise.all(
    Object.entries(SCREEN_FILES).map(async ([name, url]) => {
      const texture = await loader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return [name, texture] as const;
    }),
  )
    .then((entries) => {
      cachedTextures = new Map(entries);
      return cachedTextures;
    })
    .catch(() => {
      cachedTextures = new Map();
      return cachedTextures;
    });
  return loading;
}

export function CommandScreens() {
  const assembled = useStageStore((state) => state.assembled);
  const modelId = useStageStore((state) => state.modelId);

  useEffect(() => {
    let alive = true;
    loadScreens().then((textures) => {
      if (!alive || !assembled || textures.size === 0) return;
      const done = new Set<string>();
      assembled.root.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        const list = Array.isArray(material) ? material : material ? [material] : [];
        for (const item of list) {
          const texture = textures.get(item.name);
          if (!texture || done.has(item.name)) continue;
          done.add(item.name);
          const std = item as THREE.MeshStandardMaterial;
          std.map = texture;
          std.emissiveMap = texture;
          std.color.set(0xffffff);
          std.emissive.set(0xffffff);
          std.emissiveIntensity = 1.8;
          std.metalness = 0;
          std.roughness = 0.42;
          std.envMapIntensity = 0.18;
          std.needsUpdate = true;
        }
      });
    });
    return () => {
      alive = false;
    };
  }, [assembled, modelId]);

  return null;
}

/** 舰桥视景球：海天全景，跟随相机，保证两艘舰的舰桥玻璃都能看到外面。 */
export function BridgeSkybox() {
  const cameraMode = useStageStore((state) => state.cameraMode);
  const modelId = useStageStore((state) => state.modelId);
  const [sky, setSky] = useState<THREE.Texture | null>(null);
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load("/screens/ocean-horizon.jpg", (texture) => {
      if (!alive) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      setSky(texture);
    });
    return () => {
      alive = false;
    };
  }, []);

  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });

  if (!sky || cameraMode !== "bridge" || (modelId !== "type055" && modelId !== "carrier")) return null;
  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
      <meshBasicMaterial map={sky} side={THREE.BackSide} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

/** 舰桥窗外海面：055 固定海面；福建舰在海况关闭时补一层兜底海面。 */
export function CommandExterior() {
  const cameraMode = useStageStore((state) => state.cameraMode);
  const modelId = useStageStore((state) => state.modelId);
  const seaOn = useStageStore((state) => state.views.sea);
  if (cameraMode !== "bridge") return null;
  const seaY = modelId === "type055" ? 6.58 : modelId === "carrier" && !seaOn ? -0.02 : null;
  if (seaY === null) return null;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, seaY, 0]} renderOrder={-2}>
      <planeGeometry args={[7000, 7000]} />
      <meshStandardMaterial color="#1b4a57" metalness={0.08} roughness={0.55} envMapIntensity={0.4} />
    </mesh>
  );
}
