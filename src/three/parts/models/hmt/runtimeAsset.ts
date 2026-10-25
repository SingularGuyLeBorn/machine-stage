import type { HmtRuntimeData } from "./runtimeTypes";

type Chunk = HmtRuntimeData["chunks"][number];

/** 下载一个发布分块，并始终返回校验过的原始几何字节。 */
export async function fetchHmtChunk(chunk: Chunk): Promise<ArrayBuffer> {
  const response = await fetch(chunk.url);
  if (!response.ok) throw new Error(`模型文件加载失败：${response.status}`);
  const downloaded = await response.arrayBuffer();
  const signature = new Uint8Array(downloaded, 0, Math.min(2, downloaded.byteLength));
  const isGzip = signature[0] === 0x1f && signature[1] === 0x8b;
  let buffer = downloaded;
  // 带 Content-Encoding: gzip 的响应会被浏览器自动解压；以实际字节为准，避免二次解压。
  if (isGzip) {
    const stream = new Blob([downloaded]).stream().pipeThrough(new DecompressionStream("gzip"));
    buffer = await new Response(stream).arrayBuffer();
  }
  if (buffer.byteLength !== chunk.bytes) throw new Error("模型文件不完整，无法继续加载");
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const dataHash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
  if (dataHash !== chunk.dataHash) throw new Error("模型文件校验失败，无法继续加载");
  return buffer;
}
