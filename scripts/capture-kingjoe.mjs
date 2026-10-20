import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============================================================================
// scripts/capture-kingjoe.mjs —— 金古桥浏览器验收采集
//   · 生产构建 + ?qa=1 只读场景钩子
//   · 四体纵队/楔形编队 / 合体对接特写 / 合体成品 / 重踏步特写 / 怪光线 / 残缺合体截图
//   · rAF 实测 FPS
//   · canvas.captureStream(60) + MediaRecorder 录制合体全程（画面 + Web Audio 音轨，随后 ffmpeg 转 MP4）
// ============================================================================

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const BASE = "http://127.0.0.1:4173/?qa=1";
const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "docs", "screenshots");
const RECS = path.join(ROOT, "docs", "recordings");
const PROFILE = path.join(os.tmpdir(), "kingjoe-qa-profile");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RECS, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    "--autoplay-policy=no-user-gesture-required",
    "--disable-dev-shm-usage",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
let nextId = 1;
const pending = new Map();
const pageErrors = [];
const consoleErrors = [];

async function waitServer() {
  for (let i = 0; i < 160; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("Chrome 远程调试端口未就绪");
}

async function connect() {
  await waitServer();
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = pages.find((item) => item.type === "page");
  if (!page) throw new Error("没有可用页面");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const type = message.params.type;
      if (type === "error" || type === "warning") {
        const text = message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
        if (!text.includes("ExtendedTriangle.intersectsTriangle")) consoleErrors.push(`${type}: ${text}`);
      }
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
}

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 88, fromSurface: true });
  const file = path.join(SHOTS, name.replace(/\.png$/, ".jpg"));
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log(
    `screenshot ${path.relative(ROOT, file)} (${(Buffer.from(data, "base64").length / 1024).toFixed(0)} KB)`,
  );
}

async function setState(state) {
  await evaluate(`window.__stage.store.getState().setMachineState(${JSON.stringify(state)}); true`);
}

async function setCamera(position, target) {
  await evaluate(`window.__stage.setCamera(${JSON.stringify(position)}, ${JSON.stringify(target)}); true`);
}

async function waitFor(expression, timeout = 30000, interval = 200) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(interval);
  }
  throw new Error(`等待超时: ${expression}`);
}

async function main() {
  await connect();
  await send("Page.navigate", { url: BASE });
  await waitFor(`Boolean(window.__stage && window.__stage.store)`, 45000);
  await evaluate(`window.__stage.store.getState().setModel("kingjoe"); true`);
  await waitFor(
    `window.__stage.store.getState().modelId === "kingjoe" && Boolean(window.__stage.store.getState().assembled)`,
    60000,
  );
  await sleep(1800);
  const stats = await evaluate(`(() => {
    const s = window.__stage.store.getState();
    const a = s.assembled;
    if (!a) return null;
    let instances = 0;
    for (const p of a.parts) instances += p.instances.length;
    return { parts: a.parts.length, instances, reports: s.reports.length, state: s.machineState, stats: s.stats };
  })()`);
  console.log("loaded", JSON.stringify(stats));

  // 1) 合体成品（默认待机 + UI）
  await setCamera([8.6, 6.6, 10.8], [0, 4.05, 0]);
  await setState("idle");
  await sleep(700);
  await shot("kingjoe-idle.png");

  // 2) 四体编队：纵队 → 楔形变换
  await setCamera([12.5, 9.2, 15.5], [0, 4.8, -1.1]);
  await setState("formation");
  await sleep(1100);
  await shot("kingjoe-formation.png");
  await sleep(4600);
  await setCamera([11.5, 13.5, 14.5], [0, 4.6, -1.2]);
  await sleep(250);
  await shot("kingjoe-formation-wedge.png");

  // 3) 合体对接特写（腹部→腿，电弧 + 锥销入槽）
  await setState("idle");
  await sleep(250);
  await setCamera([3.4, 4.7, 4.9], [0, 3.6, 0]);
  await setState("combining");
  await sleep(2400);
  await shot("kingjoe-docking-closeup.png");

  // 4) 锁环咬合特写（腹部锁死，咔哒）
  await setState("idle");
  await sleep(250);
  await setState("combining");
  await sleep(3150);
  await shot("kingjoe-lock-closeup.png");

  // 4.5) 合体中段（胸部下降，四体半合）
  await setCamera([12.6, 8.2, 16.2], [0, 5.0, -0.6]);
  await setState("idle");
  await sleep(200);
  await setState("combining");
  await sleep(4600);
  await shot("kingjoe-docking-wide.png");

  // 5) 合体完成（双臂展开、四体锁死）
  await setCamera([9.6, 7.2, 12.8], [0, 4.2, 0]);
  await setState("idle");
  await sleep(800);
  await shot("kingjoe-combined.png");

  // 5.5) 机器人步行 + 腰部转轴 + 3.0s 重踏步震环
  await setCamera([9.2, 5.5, 12.4], [0, 4.25, 0]);
  await setState("robot");
  await sleep(3100);
  await shot("kingjoe-robot.png");

  // 5.6) 重踏步特写：左足落地冲击环 + 扬尘
  await setState("idle");
  await sleep(200);
  await setCamera([4.6, 2.1, 5.6], [0, 0.7, 0.05]);
  await setState("robot");
  await sleep(3100);
  await shot("kingjoe-footstep.png");

  // 6) 怪光线
  await setCamera([9.2, 5.4, 12.4], [0, 4.3, 0]);
  await setState("firing");
  await sleep(1150);
  await shot("kingjoe-firing.png");

  // 7) 分离回避（绕侧翼再合体前的四散）
  await setCamera([12.5, 8.0, 15.5], [0, 4.4, -1.0]);
  await setState("idle");
  await sleep(200);
  await setState("separation");
  await sleep(2300);
  await shot("kingjoe-separation.png");

  // 8) 残缺合体（躯干落地、双臂撑地；显示网格定位）
  await evaluate(`window.__stage.store.getState().setView("grid", true); true`);
  await setCamera([9.2, 4.0, 11.0], [0, 1.5, 0.9]);
  await setState("crippled");
  await sleep(900);
  await shot("kingjoe-crippled.png");
  await evaluate(`window.__stage.store.getState().setView("grid", false); true`);

  // 8) FPS（编队持续动画）
  await setState("formation");
  await sleep(300);
  const fps = await evaluate(
    `new Promise((resolve) => { let frames = 0; const t0 = performance.now(); const tick = () => { frames++; const dt = performance.now() - t0; if (dt < 3000) requestAnimationFrame(tick); else resolve(Number((frames / (dt / 1000)).toFixed(1))); }; requestAnimationFrame(tick); })`,
    true,
  );
  console.log("measured rAF FPS", fps);

  // 9) 60fps 合体录屏
  await setCamera([14.5, 10.2, 18.5], [0, 5.4, -1.0]);
  await setState("formation");
  await sleep(600);
  // CDP 注入真实点击，给 AudioContext 一个可信用户手势；否则无头环境可能一直 suspended。
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 800,
    y: 500,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 800,
    y: 500,
    button: "left",
    clickCount: 1,
  });
  await sleep(200);
  await evaluate(
    `(async () => {
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("no canvas");
      const stream = canvas.captureStream(60);
      const audio = window.__kingjoeAudio;
      let audioState = "none";
      if (audio?.ensure) {
        const ctx = audio.ensure();
        if (ctx && ctx.state !== "running") {
          try { await ctx.resume(); } catch { /* 无音频设备时退回静音录屏 */ }
        }
        audioState = ctx?.state ?? "none";
        if (audioState === "running") {
          for (const track of audio.stream?.getAudioTracks?.() ?? []) stream.addTrack(track);
        }
      }
      window.__recAudioState = audioState;
      window.__recAudioTracks = stream.getAudioTracks().length;
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm;codecs=vp9";
      const rec = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 14000000,
        audioBitsPerSecond: 128000,
      });
      window.__recChunks = [];
      window.__recFrames = 0;
      window.__recErrors = [];
      rec.ondataavailable = (event) => { if (event.data.size) window.__recChunks.push(event.data); };
      rec.onerror = (event) => window.__recErrors.push(String(event.error ?? event));
      rec.start(200);
      window.__rec = rec;
      const tick = () => { window.__recFrames++; if (window.__rec && window.__rec.state === "recording") requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      return { audioState, audioTracks: window.__recAudioTracks };
    })()`,
    true,
  );
  await sleep(500);
  await setState("combining");
  await sleep(10200);
  const video = await evaluate(
    `new Promise((resolve, reject) => {
      const rec = window.__rec;
      if (!rec) { reject(new Error("no recorder")); return; }
      rec.onstop = async () => {
        const blob = new Blob(window.__recChunks, { type: "video/webm" });
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < buffer.length; i += chunk) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunk));
        resolve({
          base64: btoa(binary),
          frames: window.__recFrames,
          bytes: buffer.length,
          audioTracks: window.__recAudioTracks ?? 0,
          chunks: window.__recChunks.length,
          errors: window.__recErrors ?? [],
          mimeType: rec.mimeType,
          audioState: window.__recAudioState ?? "none",
        });
      };
      rec.stop();
    })`,
    true,
  );
  if (!video.bytes) {
    throw new Error(
      `录屏为空（frames=${video.frames} chunks=${video.chunks} errors=${JSON.stringify(video.errors)} audio=${video.audioState}）`,
    );
  }
  const webm = path.join(RECS, "kingjoe-combine-raw.webm");
  fs.writeFileSync(webm, Buffer.from(video.base64, "base64"));
  console.log(
    `recording raw ${path.relative(ROOT, webm)} bytes=${video.bytes} capturedFrames=${video.frames} audioTracks=${video.audioTracks} chunks=${video.chunks} mime=${video.mimeType} audio=${video.audioState}`,
  );

  // 10) 收尾：状态与错误
  await setState("idle");
  await sleep(300);
  const final = await evaluate(`(() => {
    const s = window.__stage.store.getState();
    return { reports: s.reports.length, modelId: s.modelId, machineState: s.machineState, buildIndex: s.buildIndex };
  })()`);
  console.log("final", JSON.stringify(final));
  fs.writeFileSync(
    path.join(RECS, "kingjoe-capture-report.json"),
    JSON.stringify(
      {
        stats,
        fps,
        recording: {
          bytes: video.bytes,
          frames: video.frames,
          audioTracks: video.audioTracks,
          chunks: video.chunks,
          mimeType: video.mimeType,
          audioState: video.audioState,
          errors: video.errors,
        },
        final,
        pageErrors,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  if (pageErrors.length) console.log("page errors", pageErrors.slice(0, 5));
  if (consoleErrors.length) console.log("console errors", consoleErrors.slice(0, 8));

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().catch(async (error) => {
  console.error("CAPTURE FAILED", error);
  try {
    const html = await evaluate("document.body.innerText.slice(0, 2000)");
    console.error("page text", html);
  } catch {
    /* ignore */
  }
  ws?.close();
  chrome.kill();
  process.exitCode = 1;
});
