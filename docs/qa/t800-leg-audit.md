# T-800 右腿 · 装配 / 悬空 / 液压行程审计

- 零件定义：410，实例：687
- 静态穿模：185；扫掠 24 帧：4502
- 悬空候选（真实表面间距 > 3mm，无支撑邻居）：41

## 悬空清单（人工审）

| 零件 | 最近邻居 | 间隙 |
|---|---|---|
| `t800.hydraulics.relief` | `t800.hydraulics.accumulator` | 3.6mm |
| `t800.torso.ribs_0[0]` | `t800.torso.ribs_0[1]` | 4.3mm |
| `t800.torso.ribs_0[1]` | `t800.torso.ribs_0[2]` | 4.0mm |
| `t800.torso.ribs_0[2]` | `t800.torso.ribs_1[0]` | 3.2mm |
| `t800.torso.ribs_1[0]` | `t800.torso.ribs_0[2]` | 3.2mm |
| `t800.torso.ribs_1[1]` | `t800.spine.vert_thoracic[10]` | 4.1mm |
| `t800.torso.ribs_1[2]` | `t800.spine.vert_thoracic[9]` | 4.5mm |
| `t800.torso.ribs_left_0[0]` | `t800.torso.ribs_left_0[1]` | 4.2mm |
| `t800.torso.ribs_left_0[1]` | `t800.torso.ribs_left_0[2]` | 3.8mm |
| `t800.torso.ribs_left_0[2]` | `t800.torso.ribs_left_1[0]` | 3.2mm |
| `t800.torso.ribs_left_1[0]` | `t800.torso.ribs_left_0[2]` | 3.2mm |
| `t800.torso.ribs_left_1[1]` | `t800.spine.vert_thoracic[10]` | 3.9mm |
| `t800.torso.ribs_left_1[2]` | `t800.spine.vert_thoracic[8]` | 4.6mm |
| `t800.torso.sternum` | `t800.torso.ribs_left_1[2]` | 13.8mm |
| `t800.arm_right.metacarpal[0]` | `t800.arm_right.metacarpal[1]` | 7.1mm |
| `t800.arm_right.metacarpal[3]` | `t800.arm_right.metacarpal[4]` | 3.1mm |
| `t800.arm_right.metacarpal[4]` | `t800.arm_right.metacarpal[3]` | 3.1mm |
| `t800.arm_left.metacarpal[0]` | `t800.arm_left.metacarpal[1]` | 7.1mm |
| `t800.arm_left.metacarpal[3]` | `t800.arm_left.metacarpal[4]` | 3.1mm |
| `t800.arm_left.metacarpal[4]` | `t800.arm_left.metacarpal[3]` | 3.1mm |
| `t800.head.jaw` | `t800.head.jaw_hinge[0]` | 13.5mm |
| `t800.arm_left.bracket_shoulder_flex` | `t800.arm_left.shoulder_socket` | 6.1mm |
| `t800.arm_left.bracket_shoulder_ext` | `t800.arm_left.shoulder_socket` | 9.4mm |
| `t800.arm_left.bracket_elbow` | `t800.arm_left.humerus_line` | 13.0mm |
| `t800.head.jaw_hinge[0]` | `t800.head.jaw` | 13.5mm |
| `t800.head.jaw_hinge[1]` | `t800.head.cranium` | 27.5mm |
| `t800.knee.guard_bracket_left[0]` | `t800.shin.tibia_left` | 3.3mm |
| `t800.torso.chest_lines[0]` | `t800.torso.chest_lines[1]` | 10.0mm |
| `t800.torso.chest_lines[1]` | `t800.torso.chest_lines[2]` | 10.0mm |
| `t800.torso.chest_lines[2]` | `t800.torso.chest_lines[3]` | 10.0mm |
| `t800.torso.chest_lines[3]` | `t800.torso.chest_lines[2]` | 10.0mm |
| `t800.torso.chest_lines[4]` | `t800.torso.chest_lines[3]` | 10.0mm |
| `t800.torso.chest_lines[5]` | `t800.torso.chest_lines[4]` | 10.0mm |
| `t800.arm_right.tendons[0]` | `t800.arm_right.tendons[1]` | 14.8mm |
| `t800.arm_right.tendons[3]` | `t800.arm_right.tendons[4]` | 10.8mm |
| `t800.arm_right.tendons[4]` | `t800.arm_right.tendons[3]` | 10.8mm |
| `t800.arm_left.tendons[0]` | `t800.arm_left.tendons[1]` | 14.8mm |
| `t800.arm_left.tendons[3]` | `t800.arm_left.tendons[4]` | 10.8mm |
| `t800.arm_left.tendons[4]` | `t800.arm_left.tendons[3]` | 10.8mm |
| `t800.hip.sensor` | `` | Infinitymm |
| `t800.hip.sensor_left` | `` | Infinitymm |

## 液压缸行程（几何解，非动画写死）

| 缸 | 静止 \|AB\| | 行程 | 缸长 | 杆长 | 露出范围 | 活塞余量 | 杆端余量 |
|---|---|---|---|---|---|---|---|
| 髋屈曲缸 | 303.2 | 50.9 | 136.4 | 142.5 | 69.3–120.2mm | 47.6mm | 26.3mm |
| 髋伸展缸 | 337.2 | 24.0 | 151.7 | 168.6 | 134.0–158.0mm | 105.5mm | 80.2mm |
| 膝后主液压缸 | 454.1 | 80.5 | 204.3 | 236.1 | 121.1–201.6mm | 87.7mm | 52.3mm |
| 膝前补偿缸 | 351.6 | 45.2 | 147.7 | 168.8 | 109.6–154.7mm | 76.8mm | 51.5mm |
| 踝左驱动缸 | 390.1 | 19.6 | 156.0 | 214.5 | 183.0–202.5mm | 119.6mm | 87.5mm |
| 踝右驱动缸 | 390.1 | 19.6 | 156.0 | 214.5 | 183.0–202.5mm | 119.6mm | 87.5mm |

液压行程判定：**PASS**
