// 临时 QA 工具：一次进程内完成「跑一段 JS → 等 N ms → 截屏」，避免每步工具往返期间动画继续跑。
// 用法：node scripts/qa-shot.mjs --js "..." --wait 700 --out docs/qa/x.jpeg
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const js = arg("js", "null");
const wait = Number(arg("wait", "600"));
const out = arg("out", "docs/qa/shot.jpeg");

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
if (js !== "null") {
  const result = await send("Runtime.evaluate", {
    expression: js,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    console.error("JS error:", JSON.stringify(result.exceptionDetails).slice(0, 500));
    process.exit(1);
  }
  console.log("js:", JSON.stringify(result.result?.value)?.slice(0, 400));
}
await new Promise((resolve) => setTimeout(resolve, wait));
const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out, Math.round(Buffer.from(shot.data, "base64").length / 1024), "KB");
ws.close();
