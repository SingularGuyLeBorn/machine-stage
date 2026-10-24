import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime.generated.json", () => ({
  default: {
    registry: {},
    parts: [],
    chunks: [{ url: "/models/hmt/test.bin.gz", bytes: 12, hash: "fixture-packed", dataHash: "fixture-raw" }],
    triangles: 0,
  },
}));

class TestWorker {
  static last: TestWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    TestWorker.last = this;
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function setup() {
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("location", { href: "http://localhost:4183/" });
  return import("./runtime");
}
describe("完整模型加载生命周期", () => {
  it("取消切换立即终止工作线程，迟到消息不得发布缓存", async () => {
    const { prepareHmt } = await setup();
    const controller = new AbortController();
    const progress = vi.fn();
    const pending = prepareHmt(controller.signal, progress);
    const worker = TestWorker.last;
    controller.abort(new Error("切换模型"));
    worker.send({ index: 0, buffer: new ArrayBuffer(12), progress: 1 });
    worker.send({ done: true });
    await expect(pending).rejects.toThrow("切换模型");
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(progress).not.toHaveBeenCalled();
    const next = new AbortController();
    const retry = prepareHmt(next.signal, progress);
    expect(TestWorker.last).not.toBe(worker);
    next.abort(new Error("结束测试"));
    await expect(retry).rejects.toThrow("结束测试");
  });
  it("分块缺失时失败可见，不允许构建残缺模型", async () => {
    const { prepareHmt } = await setup();
    const pending = prepareHmt(new AbortController().signal, vi.fn());
    TestWorker.last.send({ done: true });
    await expect(pending).rejects.toThrow("模型文件不完整");
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("完整下载后复用同一缓存，失败后可以重新加载", async () => {
    const { prepareHmt } = await setup();
    const failed = prepareHmt(new AbortController().signal, vi.fn());
    const failedWorker = TestWorker.last;
    failedWorker.send({ error: "下载失败" });
    await expect(failed).rejects.toThrow("下载失败");
    failedWorker.send({ index: 0, buffer: new ArrayBuffer(12), progress: 1 });
    failedWorker.send({ done: true });
    const complete = prepareHmt(new AbortController().signal, vi.fn());
    const worker = TestWorker.last;
    expect(worker).not.toBe(failedWorker);
    worker.send({ index: 0, buffer: new ArrayBuffer(12), progress: 1 });
    worker.send({ done: true });
    await complete;
    await prepareHmt(new AbortController().signal, vi.fn());
    expect(TestWorker.last).toBe(worker);
  });
});
