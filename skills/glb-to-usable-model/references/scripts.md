# 脚本、输入输出与复现

## 先有要回答的问题，再选脚本

脚本把某个判断变成可复查的证据，不负责替人理解模型。运行前能说明“结果不同会让我改变什么决定”，通常就知道该不该运行。

| 当前不确定的事 | 可用证据 | 结果怎样影响下一步 |
|---|---|---|
| 能否恢复所谓原贴图 | inspect_glb 的图像与材质引用 | 确实有资源才谈恢复；没有则按参考重建，并如实命名 |
| 源件是否具备实体运算条件 | mesh_audit 的边、组件、绕序与体积 | 区分缺面、分离装饰和合法内腔，再选局部修复；不自动填所有孔 |
| 切分不闭合是基础算法问题还是复杂模具问题 | 在副本运行 split_plane | 简单样件也失败就先查输入与精度；通过只排除这一层，不证明复杂接口正确 |
| 实际动作在哪个区间干涉 | 播放函数导出的姿态加 audit_motion | 定位零件对和时间，再看路径、释放方向或结构；不优先放宽阈值 |
| 为什么看着不像 | 当前渲染、同机位参考、多视图 | 现有数值脚本回答不了；回到轮廓、遮挡和材质判断 |

需要新脚本时，围绕尚不能区分的原因编写。比如“大臂顶点没有删却看不见”，应测实际姿态的可见性；“眼带悬空”应测安装面与背面距离。不要因为已有体积检查，就把所有问题都说成体积问题。

## 环境

`inspect_glb.py` 只用 Python 标准库。其余分析脚本用 numpy，实体布尔/动画交集另用 manifold3d；`blender_export.py` 在 Blender 内运行，不在系统 Python 内运行。当前验证环境：Python 可导入 numpy、manifold3d 3.5.4；Blender 5.2。别把这些版本写成唯一可用版本，升级后重新运行 self_test 和真实资产样例。

缺依赖时优先使用项目现有环境。确需安装时用隔离环境，例如 `python -m venv .venv-glb`，再以该环境的 Python 安装 `numpy manifold3d`。不要改用户全局 Python 或默认包镜像来凑通命令。Blender 通常自带 numpy，不需要另装 manifold3d 来运行 exporter。

下述命令中的 `S` 代表技能 `scripts` 目录，`W` 代表本次输出目录；路径含空格要正确引用。示例使用 PowerShell，逐条执行。源文件只读；脚本默认拒绝覆盖输出，需要时明确 `--overwrite`。

```powershell
$skillScripts = 'C:/Users/Administrator/.codex/skills/glb-to-usable-model/scripts'
$outputDir = 'D:/Project/qa-out/glb-workbench'
$sourceGlb = 'E:/Downloads/model.glb'
python "$skillScripts/inspect_glb.py" "$sourceGlb" --out "$outputDir/inventory.json"
& 'D:/Tools/Blender/blender.exe' -b --python "$skillScripts/blender_export.py" -- "$sourceGlb" --out "$outputDir/world-scene.json"
python "$skillScripts/mesh_audit.py" "$outputDir/world-scene.json" --out "$outputDir/topology.json" --epsilon 0.000001
```

`mesh_audit` 返回 2 表示需要处理，不代表脚本坏了；不要吞掉退出码继续标绿。原 GLB 可能本来就含开壳、分离装饰或合法内腔，报告应指导下一步，而不是全自动修复。

## 各脚本做什么、不会做什么

| 脚本 | 产物 | 明确边界 |
|---|---|---|
| inspect_glb.py | SHA-256、完整结构元数据 | 不解压压缩 mesh，不下载外部 URI，不证明 accessor bounds 真实 |
| blender_export.py | 当前姿态世界坐标、逐角法线/UV、逐面材质编号、来源索引 | 仅独立后台进程；不是保留骨架动画的最终 GLB 导出器 |
| mesh_audit.py | 开放边、非流形、绕序、退化面、组件、体积、bounds | 位置量化只诊断；不证明没有几何自交，不自动删负壳 |
| split_plane.py | 同一平面的两个闭合几何分件和体积报告 | 必须显式 geometry-only；不保 UV/颜色/骨架，未切中的平面报错 |
| audit_motion.py | 每对实体在给定姿态中的最严重交集和时间 | 采样检查，非连续碰撞；输入完整世界矩阵 |
| self_test.py | 九类脚本行为验证 | 不验证用户模型外观，不替代 Blender/浏览器预览 |

## 通用 JSON 格式

```json
{
  "schema": "glb-workbench/v1",
  "units": "meter",
  "axis": "明确实际轴向",
  "parts": [{
    "name": "body",
    "positions": [[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
    "triangles": [[0,2,1],[0,1,3],[0,3,2],[1,2,3]],
    "source": {"object": "原对象名", "mesh": "原 mesh 名"}
  }]
}
```

上面是可审计的闭合四面体；`self_test.py` 另创建闭合立方体样件。positions/triangles 为 Nx3/Mx3，索引从 0 开始。Blender exporter 还提供 `attributes.normals`、`attributes.uv`（与 positions 等长）、`attributes.face_material`（与 triangles 等长）；逐角导出使用重复顶点保留 seam，audit 在副本上按位置检查。

## 平面原型

先从 inventory/export 找到唯一 part 名，不要猜第一个物体。

```powershell
python "$skillScripts/split_plane.py" "$outputDir/world-scene.json" --part 'Body' --normal 0 0 1 --offset 1.5 --geometry-only --out "$outputDir/plane-parts.json"
python "$skillScripts/mesh_audit.py" "$outputDir/plane-parts.json" --out "$outputDir/plane-audit.json"
```

方程是输入坐标空间的 `normal·position=offset`。脚本同步归一化 normal 与 offset。输出只有两个目标几何分件，不会把场景其他件一并复制，也不会篡改原文件。生产流程保留属性、材质、来源与其他件，不能直接拿原型替代源资产。

## 动画姿态导出

从真实应用计算节点世界矩阵后，写出所有主体的 row-major 4×4 矩阵。Three.js `Matrix4.elements` 是 column-major，转置存入这里的行列格式；如果几何已是世界坐标，只写后续相对变换，别重复烘焙 rest transform。

```json
[
  {"time": 0, "matrices": {
    "body_positive": [[1,0,0,0],[0,1,0,0],[0,0,1,0.2],[0,0,0,1]],
    "body_negative": [[1,0,0,0],[0,1,0,0],[0,0,1,-0.2],[0,0,0,1]]
  }}
]
```

```powershell
python "$skillScripts/audit_motion.py" "$outputDir/plane-parts.json" "$outputDir/poses.json" --volume-tolerance 0.0000001 --out "$outputDir/motion-audit.json"
python "$skillScripts/self_test.py"
```

所有部件每帧都有矩阵，名字必须唯一。体积阈值单位是长度单位的三次方；不是长度容差。报告列出 worst pair/time，定位后针对那个区间加密采样，不用不断降低报告精度掩盖穿插。

## 项目适配时应再准备什么

1. `semantic-map.json`：源对象/骨骼/组件到模块的归组，保护件清单，来源理由。
2. `interfaces.json`：共用模具参数、释放向量、前后退台、制造或展示间隙，明确已批准区域。
3. 生产生成器：保源三角、法线、UV、材质，新切面单独标记，输出前后守恒报告。
4. 真实应用姿态导出器：复用播放函数，输出完整矩阵和阶段时间；测试不另算路径。
5. 多机位渲染器：从当前产物渲染正侧背、接口分开/闭合、细节安装点；机位与灯光配置固定。
6. 回归测试：源保护件包含、每件闭合、接口配对、附属件轴、状态切换连续、资源释放。

这些适配器依资产和框架而异，不提供伪装成通用算法的金古桥硬编码。复制案例之前先改单位、坐标、语义和产品要求。
