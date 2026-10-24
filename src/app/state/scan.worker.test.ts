import { afterEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  prepare: vi.fn(),
  build: vi.fn(),
  detect: vi.fn(() => []),
  dispose: vi.fn(),
}));
vi.mock("@/three/parts", () => ({
  buildModel: f.build,
  detectStatic: f.detect,
  detectSweep: f.detect,
}));
vi.mock("@/three/parts/models/tiger/damage/plan", () => ({ setDamageSeed: vi.fn() }));
vi.mock("../catalog", () => ({
  findModel: () => ({ prepare: f.prepare, registry: { constants: {}, parts: [] } }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
async function setup() {
  const scope = {
    onmessage: null as null | ((event: { data: unknown }) => Promise<void>),
    postMessage: vi.fn(),
  };
  vi.stubGlobal("self", scope);
  f.build.mockReturnValue({ resetNodes: vi.fn(), dispose: f.dispose });
  await import("./scan.worker");
  return scope;
}
const data = {
  modelId: "hmt",
  variantId: "",
  overrides: {},
  kind: "static",
  state: "idle",
  buildIndex: 0,
  damageSeed: 0,
};
it("完整资产准备完毕后才装配并扫描", async () => {
  let ready!: () => void;
  f.prepare.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const scope = await setup();
  const task = scope.onmessage!({ data });
  expect(f.build).not.toHaveBeenCalled();
  ready();
  await task;
  expect(f.build).toHaveBeenCalledOnce();
  expect(f.detect).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ reports: [] }));
});
it("资产失败返回错误，不报告空扫描通过", async () => {
  f.prepare.mockRejectedValue(new Error("模型分块校验失败"));
  const scope = await setup();
  await scope.onmessage!({ data });
  expect(f.build).not.toHaveBeenCalled();
  expect(scope.postMessage).toHaveBeenCalledWith({ error: "模型分块校验失败" });
});
