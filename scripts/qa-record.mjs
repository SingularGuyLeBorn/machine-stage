// 临时 QA 工具：在页面内用 canvas.captureStream + MediaRecorder 录一段装填演示，
// 一次进程内完成「设机位 → 起状态 → 录 N 秒 → 落盘」，避免工具往返把动画跑过头。
// 用法：node scripts/qa-record.mjs --out docs/qa/loading-demo.webm --wait 6200
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = arg("out", "docs/qa/loading-demo.webm");
const recordMs = Number(arg("wait", "6200"));

const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = list.find((p) => p.type === "page" && p.url.includes("5173")) ?? list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
  else entry.resolve(msg.result);
});
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
await send("Runtime.enable");
await send("Page.enable");

const expression = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const s0 = window.__stage.store.getState();
  if (s0.modelId === 'test') s0.setModel('tiger');
  for (let i = 0; i < 200; i++) {
    const n = window.__stage.assembled?.parts?.length ?? 0;
    if (n > 250) break;
    await sleep(50);
  }
  const a = window.__stage;
  const st = a.store.getState();
  st.setBuildIndex(a.assembled.parts.length);
  st.setView('xray', false);
  st.setView('rain', false);
  // 剖视：只隐藏炮塔壳/顶盖/舱盖，保留炮闩、炮管、吊篮——能看清弹走闩口通道
  for (const id of [
    'tiger.turret.shell',
    'tiger.turret.cupola',
    'tiger.turret.loader_hatch',
    'tiger.turret.cupola_hatch',
    'tiger.hull.fighting_roof',
    'tiger.interior.turret_seat',
  ]) {
    const h = a.assembled.getPart(id);
    if (h) h.object.visible = false;
  }
  st.setDamage('intact');
  st.setMachineState('idle');
  st.setCameraMode('orbit');
  a.camera.position.set(-0.45, 1.78, -1.35);
  a.controls.target.set(-2.15, 1.33, 0.02);
  a.camera.fov = 46;
  a.controls.update();
  await sleep(600);

  const canvas = document.querySelector('canvas');
  const stream = canvas.captureStream(60);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
    window.MediaRecorder && MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(200);
  await sleep(250);
  window.__stage.store.getState().setMachineState('loading');
  await sleep(${recordMs});
  recorder.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: mime });
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  window.__stage.store.getState().setMachineState('idle');
  return { mime, size: blob.size, base64: btoa(binary) };
})()`;

const result = await send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
  timeout: 60000,
});
if (result.exceptionDetails) {
  console.error("JS error:", JSON.stringify(result.exceptionDetails).slice(0, 600));
  process.exit(1);
}
const value = result.result?.value;
if (!value?.base64) {
  console.error("no data", JSON.stringify(value)?.slice(0, 300));
  process.exit(1);
}
writeFileSync(out, Buffer.from(value.base64, "base64"));
console.log("saved", out, (value.size / 1024).toFixed(0), "KB", value.mime);
ws.close();
