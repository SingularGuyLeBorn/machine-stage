import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 快速预览：加载 kingjoe 并拍正/侧/三视，供皮骨合并迭代。
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const BASE = "http://localhost:4174/?qa=1";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "qa");
const PROFILE = path.join(os.tmpdir(), "kingjoe-preview-profile");
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1600,1000",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression, awaitPromise = false) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const setState = (state) =>
  evaluate(`window.__stage.store.getState().setMachineState(${JSON.stringify(state)}); true`);
const shot = async (name, clip) => {
  const { data } = await send("Page.captureScreenshot", {
    format: "jpeg",
    quality: 88,
    fromSurface: true,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  const file = path.join(OUT, name.endsWith(".jpg") ? name : `${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log("screenshot", path.relative(ROOT, file));
};
const setCamera = (position, target) =>
  evaluate(`window.__stage.setCamera(${JSON.stringify(position)}, ${JSON.stringify(target)}); true`);
const waitFor = async (expression, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(`timeout ${expression}`);
};

async function main() {
  let wsUrl;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const page = pages.find((item) => item.type === "page");
        if (page) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  if (!wsUrl) throw new Error("chrome not ready");
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: BASE });
  await waitFor(`Boolean(window.__stage && window.__stage.store)`, 60000);
  await evaluate(`window.__stage.store.getState().setModel("kingjoe"); true`);
  await waitFor(
    `window.__stage.store.getState().modelId === "kingjoe" && Boolean(window.__stage.store.getState().assembled)`,
    90000,
  );
  await sleep(1500);
  const stats = await evaluate(`(() => {
    const s = window.__stage.store.getState(); const a = s.assembled;
    let instances = 0; for (const p of a.parts) instances += p.instances.length;
    const box = a.root ? null : null;
    return { parts: a.parts.length, instances, modelId: s.modelId, reports: s.reports?.length ?? null, state: s.machineState };
  })()`);
  console.log("loaded", JSON.stringify(stats));
  // 相机：正 / 侧 / 三视（模型高约 6.98）
  await evaluate(`window.__stage.store.getState().setMachineState("idle"); true`);
  await sleep(600);
  await setCamera([0.6, 4.0, 13.5], [0, 3.5, 0]);
  await sleep(500);
  await shot("kingjoe-real-front");
  await setCamera([13.5, 4.2, 0.8], [0, 3.5, 0]);
  await sleep(500);
  await shot("kingjoe-real-side");
  await setCamera([9.2, 6.6, 11.2], [0, 3.7, 0]);
  await sleep(500);
  await shot("kingjoe-real-threeq");
  await setCamera([0.4, 8.2, 9.8], [0, 5.3, 0]);
  await sleep(500);
  await shot("kingjoe-real-upper");

  // 四体编队（纵队 → 楔形）
  await setCamera([14.5, 10.5, 17.0], [0, 4.6, -1.2]);
  await setState("formation");
  await sleep(1400);
  await shot("kingjoe-real-formation");
  await sleep(4800);
  await shot("kingjoe-real-formation-wedge");

  // 阻尼合体：对接特写 / 中段 / 锁死
  await setState("idle");
  await sleep(300);
  await setCamera([3.6, 4.6, 5.2], [0, 3.7, 0]);
  await setState("combining");
  await sleep(2300);
  await shot("kingjoe-real-docking");
  await setCamera([10.8, 7.4, 13.4], [0, 4.5, -0.4]);
  await sleep(2700);
  await shot("kingjoe-real-combining");
  await sleep(2600);
  await shot("kingjoe-real-combined-lock");

  // 分离回避
  await setState("idle");
  await sleep(300);
  await setState("separation");
  await sleep(2400);
  await setCamera([13.2, 8.0, 16.0], [0, 4.6, -0.8]);
  await sleep(300);
  await shot("kingjoe-real-separation");

  // 怪光线
  await setState("idle");
  await sleep(300);
  await setCamera([0.6, 4.3, 9.6], [0, 4.2, 0]);
  await setState("firing");
  await sleep(1200);
  await shot("kingjoe-real-firing");

  // 干净画布裁剪，供与参考图并排
  await setState("idle");
  await sleep(400);
  await setCamera([0.4, 3.9, 12.2], [0, 3.5, 0]);
  await sleep(500);
  await shot("kingjoe-real-front-clean", { x: 302, y: 62, width: 962, height: 760 });

  const errors = await evaluate(`(window.__qaErrors ?? []).slice(0, 10)`);
  console.log("page errors", JSON.stringify(errors));
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  chrome.kill();
  process.exitCode = 1;
});
