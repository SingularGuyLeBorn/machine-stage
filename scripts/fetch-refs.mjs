// 下载 T-800 内骨骼参考图到 screenshots/ref/（用于与本实现对照）
// 用法：node scripts/fetch-refs.mjs
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "screenshots/ref";
mkdirSync(OUT, { recursive: true });

const REFS = [
  {
    name: "t800-endoskeleton-full.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/4/49/Terminator.jpg",
    credit: "Wikimedia Commons · Terminator.jpg · Daniel Oberhaus",
  },
  {
    name: "t800-endoskeleton-fire.jpg",
    url: "https://static.wikia.nocookie.net/terminator/images/1/16/T-800_in_the_fire.jpg/revision/latest?cb=20120311060631",
    credit: "Terminator Wiki · T-800 in the fire",
  },
];

for (const ref of REFS) {
  const dest = join(OUT, ref.name);
  if (existsSync(dest) && statSync(dest).size > 10_000) {
    console.log("skip (exists)", ref.name);
    continue;
  }
  try {
    const response = await fetch(ref.url, {
      headers: {
        "User-Agent": "t800-qa-fetch/1.0 (reference image download for local design reference)",
        Accept: "image/*,*/*",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      console.log("FAIL", ref.name, response.status, response.statusText);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 10_000) {
      console.log("SKIP (too small)", ref.name, buffer.length);
      continue;
    }
    writeFileSync(dest, buffer);
    console.log("saved", ref.name, buffer.length);
  } catch (error) {
    console.log("ERROR", ref.name, String(error));
  }
}

writeFileSync(
  join(OUT, "CREDITS.md"),
  `# 参考图出处\n\n${REFS.map((r) => `- \`${r.name}\` — ${r.credit}\n  ${r.url}`).join("\n")}\n\n` +
    `这些图只用于本地造型对照，不随代码分发时请自行删除。\n`,
  "utf8",
);
console.log("done");
