import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ============================================================================
// 源码编码体检 —— 防止中文/UTF-8 被外部工具（PowerShell 重定向、错误的
// 编码转换）写坏后悄悄提交。写坏的表现是 esbuild 报「Unterminated string
// literal」或页面里冒出乱码，本测试把这类事故挡在 CI 之前。
//
// 判据：文本文件必须是合法 UTF-8，且不含 U+FFFD（替换字符 = 解码失败的痕迹）。
// ============================================================================

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".md", ".svg"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".vite"]);

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (TEXT_EXT.has(extname(entry))) out.push(full);
  }
  return out;
}

describe("源码 UTF-8 编码", () => {
  it("所有文本源文件都是合法 UTF-8 且无乱码替换字符", () => {
    const files = collect(ROOT);
    expect(files.length).toBeGreaterThan(20);
    const broken: string[] = [];
    for (const file of files) {
      const bytes = readFileSync(file);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (text.includes("\uFFFD")) broken.push(`${relative(ROOT, file)}（含 U+FFFD 替换字符）`);
    }
    expect(broken, `以下文件疑似编码损坏：\n${broken.join("\n")}`).toEqual([]);
  });

  it("T-800 模型的中文零件名可正常解码", () => {
    const file = join(ROOT, "src", "three", "parts", "models", "t800", "hydraulics.ts");
    const text = readFileSync(file, "utf8");
    expect(text).toContain("缸体");
    expect(text).toContain("活塞杆");
    expect(text).toContain("导向套");
  });
});
