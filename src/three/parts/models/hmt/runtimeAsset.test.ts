import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHmtChunk } from "./runtimeAsset";
import type { HmtRuntimeData } from "./runtimeTypes";

const unpacked = new TextEncoder().encode("HMT runtime chunk: browser decode compatibility").buffer as ArrayBuffer;
const packed = gzipSync(Buffer.from(unpacked));
const packedBuffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) as ArrayBuffer;
const digest = (buffer: ArrayBuffer) => createHash("sha256").update(Buffer.from(buffer)).digest("hex");
const chunk: HmtRuntimeData["chunks"][number] = {
  url: "/models/hmt/test.bin.gz",
  bytes: unpacked.byteLength,
  hash: digest(packedBuffer),
  dataHash: digest(unpacked),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HMT 分块下载与校验", () => {
  it("接受浏览器已自动解压的 gzip 响应，不再二次解压", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(unpacked.slice(0), { headers: { "Content-Encoding": "gzip" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchHmtChunk(chunk);
    expect(new Uint8Array(result)).toEqual(new Uint8Array(unpacked));
    expect(fetchMock).toHaveBeenCalledWith(chunk.url);
  });

  it("服务器原样返回 gzip 文件时手动解压并校验原始字节", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(packedBuffer.slice(0))));
    const result = await fetchHmtChunk(chunk);
    expect(new Uint8Array(result)).toEqual(new Uint8Array(unpacked));
  });

  it("原始几何哈希不符时拒绝发布残缺或损坏模型", async () => {
    const damaged = unpacked.slice(0);
    new Uint8Array(damaged)[0] ^= 0xff;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(damaged, { headers: { "Content-Encoding": "gzip" } })),
    );
    await expect(fetchHmtChunk(chunk)).rejects.toThrow("模型文件校验失败，无法继续加载");
  });
});
