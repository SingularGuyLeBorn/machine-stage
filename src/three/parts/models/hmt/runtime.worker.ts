import type { HmtRuntimeData } from "./runtimeTypes";
import { fetchHmtChunk } from "./runtimeAsset";

// 下载、校验与必要时的解压在 worker 完成；转移所有权，避免主线程复制整机几何。
self.onmessage = async (event: MessageEvent<HmtRuntimeData["chunks"]>) => {
  try {
    const chunks = event.data;
    for (let index = 0; index < chunks.length; index++) {
      const buffer = await fetchHmtChunk(chunks[index]);
      self.postMessage({ index, buffer, progress: (index + 1) / chunks.length }, { transfer: [buffer] });
    }
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
