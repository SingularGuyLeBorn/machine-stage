# 把枪壳掀开：KRISS Vector 的半透明外壳下藏了多少层机械

- 作者: 下班看云
- 公众号: AnimationStudio
- 发布时间: 2026-08-31 07:39:00
- 原文: https://mp.weixin.qq.com/s/FPCrHbqLp7CUUtOEtufDmw


ANIMATIONSTUDIO

🎨 ART GALLERY

作品欣赏

Svyatoslav Lebedko 的第一个武器模型，选了一条不太轻松的路：给 KRISS Vector Gen 3 穿上半透明外壳，把内部所有机械结构都亮出来。整把枪 99k tris，8 套贴图集，包含全部内部机构和附件。

![image](images/01.jpg)

枪身分层很清楚，深红棕色的外壳压着底下一层半透明部件，光打上去以后内部结构的轮廓自己就交代了。

![image](images/02.jpg)

换个角度看，哑光金属灰和深红色块拼在一起，战术感和工业感同时到位。

![image](images/03.jpg)

接收器部分的透明度最能说明问题——内部齿轮和导轨的层次一目了然，厚重金属件和薄壳之间的张力全靠这层材质撑起来。

![image](images/04.jpg)

![image](images/05.jpg)

从侧面看，整把枪几乎被深红色半透明聚合物包裹，几何线条锐利，内部模块化结构全部暴露在视线里。

![image](images/06.jpg)

俯视构图，中性灰背景上散落着几颗弹壳，突然把这个精密模型拉进了一个有使用痕迹的场景里。

![image](images/07.jpg)

![image](images/08.jpg)

上部接收器换了个更戏剧性的打光，透明材质的折射效果和金属面的硬反射挤在一起，信息密度很高。

![image](images/09.jpg)

一把高科技武器搁在粗粝的木桩上，周围是枯叶和柔光。材质对比从枪本身延伸到了环境里。

![image](images/10.jpg)

![image](images/11.jpg)

岩石表面的颗粒质感和枪身的光滑聚合物差距拉得很开，废土氛围是这么来的。

![image](images/12.jpg)

纯黑背景，内部嵌入的琥珀色发光元件亮了起来。沉甸甸的红色金属包着一小块暖光，能量感很直接。

<video src="videos/01.mp4"></video>

这段带声音的动画演示，枪身在镜头里转起来以后，半透明材质随角度变化的折射才完全展开。

![image](images/13.jpg)

全家福，所有配件和附件在黑背景里一字排开，定向光把每个几何面都切得干净。

![image](images/14.jpg)

拆散了看——铆接痕迹、哑光金属、复杂的嵌套关系，零件数量比成品照片暗示的还要多。

![image](images/15.jpg)

近景怼到握把上，半透明深红色外壳和纹理化的深棕色握把紧贴在一起，品牌标识清晰可读。

![image](images/16.jpg)

![image](images/17.jpg)

![image](images/18.jpg)

在 Unreal 里，Lebedko 做了两套渲染方案。Quality Mode 保留物理上更复杂的透明塑料效果；Performance Mode 关掉透明度，材质成本大幅降低，但视觉上依然过得去。

![image](images/19.jpg)

实物参考。模型的比例和结构细节都能在这些照片里找到对应。

![image](images/20.jpg)

高模阶段的 Plasticity 视口截图，曲面建模的布线逻辑看得很清楚。

![image](images/21.jpg)

<video src="videos/02.mp4"></video>

Substance Painter 的绘制过程，材质层是怎么一步步叠上去的，这段录屏比截图说得明白。

![image](images/22.gif)

8 套贴图的 Maps 总览，通道分配一目了然。

![image](images/23.jpg)

进了 UE 视口以后的实际效果——引擎内的半透明渲染和 Painter 里的离线预览差距不大，说明材质参数对接做得比较到位。

<video src="videos/03.mp4"></video>

这段演示的是 Unreal 里 Quality 和 Performance 两套材质的实时切换，用蓝图控制。

![image](images/24.jpg)

蓝图节点的接线逻辑，一个开关控制两套 Master Material 的替换。

![image](images/25.jpg)

Opaque Master Material 的节点图，关掉透明以后的材质网络其实精简了不少。

![image](images/26.jpg)

Substrate Translucent Master Material 这边就复杂得多，折射、次表面、透明度混合全部接了进来。作为第一个武器模型，完成度已经很扎实。

✎ 编辑:下班看云

🤔 **你怎么看？** 欢迎在留言区聊聊你的想法

AnimationStudio

您的 CG · 3D · AIGC 私人精选杂志
![image](images/27.jpg)

长按识别二维码 · 关注我们

推荐阅读

[📌 6个月做出一整座阳光老城，细节太稳了](https://mp.weixin.qq.com/s?__biz=MzI0NDcyNzk5OA==&mid=2247505145&idx=1&sn=1baae9c1c3a7de4abb8038e6c2d600bc&scene=21#wechat_redirect)

[🔥 他给《星战》造了九个世界，从稻田木筏到末世废土](https://mp.weixin.qq.com/s?__biz=MzI0NDcyNzk5OA==&mid=2247508580&idx=1&sn=4bdc2bd2099bbe90070a5f58007ee2de&scene=21#wechat_redirect)

仅供学习请勿商用｜素材来源网络侵权请联系删除｜转载请注明出处
