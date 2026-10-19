# scripts/_attic —— 冻结的诊断脚本

这些脚本是 L1 几何核查阶段的取证工具（包围盒、穿透点、截面探针、孔洞残留、
三角形级交点、胎壁/壳体截面等）。**已冻结：不再新增、不再扩展。**

- 唯一保留在 `scripts/` 下的诊断入口是 `diag-clips.ts`（分层穿模报告），门禁只认它。
- 需要复现历史取证时按需运行，例如：

  ```powershell
  npx tsx scripts/_attic/diag-pair.ts bearing_support    # 按零件名看穿透点
  npx tsx scripts/_attic/diag-boxes.ts tiger.crankshaft.nose
  ```

- 脚本内的相对引用已改为 `../../src/...`，可以继续从仓库根目录运行。
- 后续"穿模"不再以"清零"为目标：构造性接触（轴承配合/贴面/分面/过盈压装）走
  白名单豁免，见 `src/three/parts/solver/whitelist.ts` 与
  `src/three/parts/models/tiger/engine/expectedContacts.ts`。
