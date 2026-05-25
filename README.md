# Candy Craft

> AI 驱动的可视化生图提示词优化工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Deployable on Cloudflare Pages](https://img.shields.io/badge/Deployable-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/pages/)

---

## 目录

- [项目简介](#项目简介)
- [目录结构](#目录结构)
- [架构关系](#架构关系)
- [模块说明](#模块说明)
  - [CSS 层](#css-层)
  - [JS 层](#js-层)
- [核心数据流](#核心数据流)
- [提示词管道](#提示词管道)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [版本历史](#版本历史)

---

## 项目简介

Candy Craft 是一个可视化生图提示词编辑工具，前端静态托管在 Cloudflare Pages，支持双模式 API 调用：
- `后台托管`：通过同源 `Pages Functions` 代理 `/api/chat` 调用单一 OpenAI 兼容上游，浏览器侧不暴露密钥。
- `用户自定义`：浏览器直连用户填写的 OpenAI 兼容端点（`Base URL + API Key + Model`）。

### 核心流程

```
用户输入提示词
    │
    ▼
[阶段1：分析]  →  AI 解析提示词维度 + 视觉元素 + 预设方案
    │
    ▼
[可视化编辑]
    ├── 画板：拖拽前景/后景元素，设置焦点，建立层级链接
    ├── 相机布光：三视图定位相机 + 4 盏灯独立配置
    └── 维度滑杆：调节细节/光影/氛围等参数
    │
    ▼
[阶段2：优化]  →  AI 将所有参数合并为专业英文生图 prompt
    │
    ▼
输出可直接用于 Midjourney / SD / Flux / DALL-E 的 prompt
```

---

## 目录结构

```
intelligent-hawking/
│
├── index.html              # 单页入口，所有 HTML 结构
│
├── assets/
│   └── favicon.svg         # 网站图标
│
├── css/                    # 样式系统（按功能分层）
│   ├── variables.css       # 设计 Token（颜色/间距/字体/暗色主题）
│   ├── base.css            # Reset + 全局基础样式 + 暗色模式覆盖
│   ├── layout.css          # 页面布局（Header/Main/Side Panel）
│   ├── components.css      # 通用组件（Button/Card/Slider/Toast 等）
│   ├── canvas.css          # 画板系统样式（元素框/图层面板/链接线）
│   ├── scene.css           # 相机布光模块样式（三视图/灯卡片）
│   └── animations.css      # 全局动画关键帧
│
├── functions/              # Cloudflare Pages Functions
│   └── api/
│       └── chat.js         # 同源 /api/chat 代理（SSE 透传 + 安全校验）
│
└── js/                     # ES Module 体系
    ├── app.js              # ★ 主入口，状态机，串联所有模块
    ├── prompt.js           # ★ 提示词引擎（分析/优化消息构建 + 响应解析）
    ├── scene.js            # ★ 相机布光（三视图/灯具系统/getSceneData）
    ├── canvas.js           # ★ 画板（元素拖拽/图层/链接/焦点）
    ├── api.js              # 前端 API 层（managed/custom 双通道路由）
    ├── composition.js      # 构图控制（比例/方向/分辨率）
    ├── sliders.js          # 维度滑杆组件
    ├── radar.js            # 雷达图（Chart.js 封装）
    ├── presets.js          # 预设方案卡片组件
    ├── style-toggle.js     # 动漫/写实程度滑杆（1-10档）
    ├── theme.js            # 夜间模式切换（OS偏好/localStorage）
    ├── settings.js         # 设置面板（模式切换 + 托管/自定义配置 + 连通测试）
    ├── history.js          # 历史记录（localStorage 持久化）
    └── utils.js            # 工具函数（debounce/throttle/toast/showEl）
```

---

## 架构关系

```
┌─────────────────────────────────────────────────────────┐
│                        index.html                       │
│                   (DOM 结构 + 资源引用)                   │
└─────────────────┬───────────────────────────────────────┘
                  │ type="module"
                  ▼
┌─────────────────────────────────────────────────────────┐
│                        app.js                           │
│              ★ 中央协调器（状态机 + 事件总线）             │
│                                                         │
│  state = {                                              │
│    originalPrompt, isAnalyzing, isOptimizing,           │
│    analysisResult, abortController                      │
│  }                                                      │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬───────────┘
   │      │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼      ▼
prompt  scene  canvas  api  sliders  theme  其他
 .js    .js    .js    .js    .js     .js   模块
```

### 模块依赖图

```
app.js
├── prompt.js          (无依赖，纯函数)
├── api.js             (无依赖，HTTP)
├── scene.js           (无依赖，DOM操作)
├── canvas.js          (无依赖，DOM操作)
├── composition.js     (无依赖)
├── sliders.js         (无依赖)
├── radar.js           (依赖 CDN: Chart.js)
├── presets.js         (无依赖)
├── style-toggle.js    (无依赖)
├── theme.js           (无依赖)
├── settings.js        (依赖 api.js)
├── history.js         (无依赖)
└── utils.js           (无依赖) ← 被多个模块引用
```

> **设计原则**：所有功能模块均为无状态或自持状态的独立单元，通过 `app.js` 协调通信，不直接互相 import（除 `settings.js → api.js`）。

---

## 模块说明

### CSS 层

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `variables.css` | 设计 Token | 糖果色板 / 间距 / 圆角 / 阴影 / 暗色主题变量 |
| `base.css` | 基础重置 | CSS Reset / 字体引入 / 糖果纸斜纹背景 / `[data-theme="dark"]` 覆盖规则 |
| `layout.css` | 页面骨架 | `.app-header` / `.app-main`（3列Grid）/ `.side-panel` 抽屉 |
| `components.css` | 通用组件 | 按钮 / 卡片 / 表单 / 滑杆 / Toast / 历史记录条目 |
| `canvas.css` | 画板系统 | 元素框 / 拖拽手柄 / 图层面板 / 深度链接线 / 焦点标记 |
| `scene.css` | 布光模块 | 三视图格子 / 相机指示器 / 灯光指示器 / 灯卡片（Toggle/Select/Slider）|
| `animations.css` | 动画 | `@keyframes` 定义（弹入/淡出/旋转/加载点/Toast）|

### JS 层

#### `app.js` — 主入口 / 中央状态机

- **状态对象** `state`：跟踪分析状态、原始提示词、abort 控制器
- **两阶段流程**：
  - `handleAnalyze()` → 调用 `buildAnalysisMessages()` + `streamChat()` + `parseAnalysisResponse()` → 渲染画板/滑杆/雷达图
  - `handleOptimize()` → 收集所有参数 → `buildOptimizeMessages()` + `streamChat()` → 流式渲染结果
- **画布同步**：AI 分析返回的 `elements` 经 `normalizeElements()` 归一化后写入 `canvas.js`

---

#### `prompt.js` — 提示词引擎（核心）

**分析阶段** `buildAnalysisMessages(userPrompt, styleLevel)`

向 AI 发送结构化分析请求，要求返回：
```json
{
  "dimensions": [...],    // 6-8个可调维度（名称/默认值/标签）
  "elements": [...],      // 视觉元素（人物+背景景物，含推荐坐标）
  "presets": [...]        // 2-4个预设方案
}
```

**优化阶段** `buildOptimizeMessages(userPrompt, params)`

将所有可视化参数序列化为自然语言发给 AI：

```
Original prompt: ...
Target style: 4/10（半写实）
Composition: 16:9 landscape, 2K (--ar 16:9)

Foreground elements (front to back):
- 角色A: left-center side, prominent, "黑发少年", [focus: 手中信件]

Background elements:
- 废弃教室: center of frame, dominant, "昏暗破旧"

Element relationships / depth links:
- 角色A and 角色B: 对视 — "目光交汇，气氛凝重"
- 角色A and 废弃教室: share the same focal plane (both in focus)

Dimension parameters:
画面细节: 75/100  光影层次: 80/100

Camera & lighting:
camera: 仰拍 (low-angle shot)
focal: 35mm lens, natural perspective
key light: 500W Rembrandt lighting, ~3200 lux on subject
fill light: 150W softbox, diffused soft fill, ~800 lux on subject
back light: [disabled]
color temp: 金橙 (golden hour warmth, amber tones)
```

**空间坐标转换** `posToSpatial(x, y)`：
```
水平 5 区间：far-left / left-center / center / right-center / far-right
垂直 3 区间：upper / middle / lower
```

---

#### `scene.js` — 相机与布光

**灯具数据结构**：
```js
lights = {
  key:  { x, y, on: true,  type: '聚光灯', watts: 500,  lumens: 5000 },
  fill: { x, y, on: true,  type: '柔光箱', watts: 300,  lumens: 3000 },
  back: { x, y, on: true,  type: '环形灯', watts: 200,  lumens: 2000 },
  hair: { x, y, on: false, type: '发灯',   watts: 100,  lumens: 1000 },
}
```

**8 种灯具类型**（含对应英文 prompt 词）：

| 中文 | 英文 prompt 词 | 特点 |
|------|---------------|------|
| 聚光灯 | spotlight, hard directional light | 强硬影/高对比 |
| 柔光箱 | softbox, diffused soft light | 均匀柔和 |
| 环形灯 | ring light, circular catchlight | 眼神光环 |
| 菲涅尔灯 | Fresnel light, theatrical beam | 舞台戏剧 |
| 发灯 | hair light, rim light, edge separation | 轮廓分离 |
| 反光板 | reflector, bounce fill light | 无阴影补光 |
| 霓虹灯 | neon light, colored ambient glow | 彩色氛围 |
| 蜡烛 | candlelight, warm flickering firelight | 暖色戏剧 |

**Subject Lux 计算**（平方反比衰减）：
```js
subjectLumens = lumens × 1 / (1 + 10 × distNorm²)
// distNorm = 灯到中心的归一化距离（0~1）
```

**三视图**：俯视（Top）/ 正视（Front）/ 侧视（Side），所有指示器可拖拽。

---

#### `canvas.js` — 画板系统

- **元素类型**：`character`（人物，前景）/ `object`（景物，后景）
- **图层面板**：右侧标签列，顺序决定遮挡关系，点击聚焦/拖拽
- **焦点物品**：为任意元素设置焦点描述（如"手中的信件"）
- **深度链接**：连接两元素标注关系（同一景深平面 / 自定义关系 + 说明）
- **画板过滤**：可单独预览前景层或后景层

---

#### `api.js` — 前端 API 层（双模式）

```js
// managed: 同源代理 /api/chat（无浏览器侧 Key）
// custom: 直连 customBaseUrl/chat/completions（携带用户自定义 Key）
streamChat(messages, { onChunk, onDone, onError, signal })
```

---

#### `theme.js` — 夜间模式

```js
initTheme()   // 读取 OS 偏好 + localStorage，在 <html> 上写 data-theme="dark"
toggleTheme() // 切换并持久化
```

暗色方案：深海军紫底色 `#16131F`，保留所有糖果强调色（粉/薰衣草/薄荷）不变。

---

## 核心数据流

```
用户输入
  │
  ├─ handleAnalyze()
  │     │
  │     ├─ buildAnalysisMessages(prompt, styleLevel)
  │     │     └─ 返回 [{role:"system",...}, {role:"user",...}]
  │     │
  │     ├─ streamChat(messages) ←── api.js（fetch + ReadableStream）
  │     │
  │     ├─ parseAnalysisResponse(text)
  │     │     └─ 返回 { dimensions, elements, presets }
  │     │
  │     ├─ renderSliders(dimensions)    ←── sliders.js
  │     ├─ initRadar(dimensions)        ←── radar.js
  │     ├─ renderPresets(presets)       ←── presets.js
  │     └─ initCanvas(elements, links)  ←── canvas.js
  │
  └─ handleOptimize()
        │
        ├─ getSliderValues()            ←── sliders.js
        ├─ getCanvasData()             ←── canvas.js
        │     └─ { elements, links }
        ├─ getSceneData()              ←── scene.js
        │     └─ { camera, lights, ... }
        ├─ getCompositionData()        ←── composition.js
        │     └─ { ratio, orientation, resolution }
        ├─ getStyle()                  ←── style-toggle.js
        │
        ├─ buildOptimizeMessages(prompt, allParams)  ←── prompt.js
        └─ streamChat(messages)  →  流式渲染结果
```

---

## 提示词管道

### 风格档位（1-10）

| 档位 | 定位 | 禁用词 | 推荐词 |
|------|------|--------|--------|
| 1-2 | 纯赛璐珞动漫 | photorealistic, DSLR | cel shading, flat color, bold outlines |
| 3 | 动漫插画 | photorealistic | anime illustration, soft cel shading |
| 4 | 风格化插画 | photorealistic | stylized illustration, concept art |
| 5 | 平衡混合 | cel shading & DSLR | semi-realistic, painterly |
| 6 | 半写实 | photorealistic | cinematic, volumetric lighting |
| 7 | 偏写实 | anime, cel shading | realistic, CG render, ray tracing |
| 8 | 写实CG | 所有动漫词 | hyperrealistic, subsurface scattering |
| 9-10 | 照片级 | 所有动漫词 | photorealistic, DSLR, RAW photo, 8K |

### 已知行业限制

- **角色精确定位**：扩散模型无法按像素坐标放置角色，本工具以空间语义（`left-center side`）描述，由 LLM 优化 AI 翻译为构图语言，已是软件层最优解；如需精确控制需使用 ControlNet。
- **物理光照单位**：`500W / 3200 lux` 等数值对生图模型无意义，但对 LLM 优化 AI 有意义（帮助推断光比），优化 AI 会将其翻译为 `dramatic chiaroscuro, 3:1 lighting ratio` 等生图语义词。

---

## 快速开始

### 1. 本地联调

本项目为静态页面 + Pages Functions，推荐使用 `wrangler` 联调：

```bash
npx wrangler pages dev . --compatibility-date=2026-05-24
```

在本地根目录新增 `.dev.vars`（仅本地，勿提交）：

```bash
UPSTREAM_BASE_URL=https://api.openai.com/v1
UPSTREAM_API_KEY=sk-xxxx
DEFAULT_MODEL=gpt-4o
```

### 2. 前端设置项（用户侧）

点击页面左上角 **⚙️ 设置** 后可选两种模式：
- `后台托管`（默认）：前端无需填写模型，模型由服务端 `DEFAULT_MODEL`/后端策略统一控制。
- `用户自定义`：需填写 `Base URL + API Key + Model`，浏览器将直接请求你的上游端点。

> 自定义模式前置条件：上游端点必须允许浏览器跨域请求（CORS），否则会在浏览器侧被拦截。

### 3. Cloudflare Pages 部署（GitHub 自动部署）

1. 将仓库推送到 GitHub（`master` 作为生产分支）。
2. Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git。
3. 选择仓库后配置：
   - Build command: 留空
   - Build output directory: `/`（仓库根目录）
   - Functions: 启用（`functions/` 自动生效）
4. 在 Preview 与 Production 都配置变量：
   - `UPSTREAM_BASE_URL`（例如 `https://api.openai.com/v1`）
   - `UPSTREAM_API_KEY`（Secret）
   - `DEFAULT_MODEL`（可选）
5. 分支策略：
   - `master` -> Production
   - 其他分支 -> Preview

### 4. 使用流程

1. **输入提示词** → 在左侧文本框输入你的生图描述（中英文均可）
2. **调节风格档** → 拖动 1-10 滑杆（1=纯动漫 10=照片级）
3. **点击「分析提示词」** → AI 自动识别视觉元素，展开画板和参数
4. **编辑画板** →
   - 拖动元素框调整位置/大小
   - 设置焦点物品
   - 添加深度链接
   - 切换前景/后景显示
5. **调节相机布光** →
   - 在三视图中拖拽相机/灯光位置
   - 设置每盏灯的类型/瓦数/流明/开关
6. **点击「优化提示词」** → 获得专业英文生图 prompt
7. **复制结果** → 直接粘贴到 Midjourney / SD / Flux 等工具

### 5. 运维与回滚

- 代理日志默认输出：`requestId`、`status`、`latencyMs`、`upstreamStatus`（不记录 prompt 正文）。
- Cloudflare Dashboard 建议为 `/api/chat` 增加按 IP 的 Rate Limiting 规则（函数内已做基础限流）。
- 回滚方式：Pages -> Deployments -> 选择上一个成功部署 -> Promote to Production。

---

## 配置说明

### 双模式 API 真值表

| 模式 | 必填项 | 测试连接目标 | 请求路径 | 安全边界 |
|------|--------|--------------|----------|----------|
| 后台托管 (`managed`) | 无 | `/api/chat` | 同源 `/api/chat` | 上游密钥与模型配置仅在 Pages Secrets/服务端 |
| 用户自定义 (`custom`) | `Base URL` + `API Key` + `Model` | `${BaseURL}/chat/completions` | 浏览器直连 `${BaseURL}/chat/completions` | 密钥仅保存在当前浏览器 localStorage |

### API 本地存储键

| Key | 说明 |
|-----|------|
| `pc_api_mode` | 模式：`managed` / `custom` |
| `pc_custom_base_url` | 自定义模式 Base URL |
| `pc_custom_api_key` | 自定义模式 API Key |
| `pc_custom_model` | 自定义模式模型名称 |

### 画布分辨率档位

| 选项 | 说明 |
|------|------|
| 不设置 | prompt 中不附加分辨率描述 |
| 1K | `~1024px, standard quality` |
| 2K | `~2048px, high quality` |
| 4K | `~4096px, ultra high quality` |

### 构图比例

支持 `16:9`（横屏）/ `9:16`（竖屏）/ `1:1`（方形）/ `4:3` / `3:4`，
输出 prompt 自动附加 `--ar W:H` 参数。

### 布光预设

| 预设 | 光位描述 |
|------|---------|
| 自然光 | 顶部漫射，无明显主光 |
| 伦勃朗 | 主光45°侧斜，补光对侧弱补 |
| 蝶形光 | 主光正前方偏高，蝴蝶形鼻影 |
| 侧光 | 强烈单侧光，戏剧性分割 |
| 逆光 | 背光+轮廓光，主体剪影 |

---

## 版本历史

| 版本 | 主要变更 |
|------|---------|
| v3.6.0 | Cloudflare Pages Functions 代理上线：同源 `/api/chat`、浏览器侧移除 API Key/Base URL、新增部署说明 |
| v3.5.2 | 夜间模式对比度修复（text-tertiary WCAG AA），全组件暗色覆盖 |
| v3.5.1 | 修复 `createView is not defined` 崩溃 |
| v3.5 | Prompt 审计修复：`posToSpatial` 5区间，same-plane 描述优化 |
| v3.4 | 布光系统 v4（4灯/8类型/瓦数流明/Subject Lux），夜间模式 |
| v3.3 | 修复空画板 bug，4档分辨率，元素归一化 |
| v3.2 | AI 自动补充后景元素，构图比例/分辨率/方向控制，图层过滤 |
| v3.1 | 点击外部关闭弹窗，项目重命名为 Candy Craft，引导提示 |
| v3.0 | 画板图层系统（前/后景、图层面板、焦点物品、深度链接）|
| v2.1 | 基线版本 |
| v1.0 | 初始提交 |

---

## 技术栈

| 层面 | 技术 | 版本/说明 |
|------|------|---------|
| 结构 | HTML5 | 语义化标签，单文件入口 |
| 样式 | Vanilla CSS | 无框架，CSS 变量设计系统 |
| 逻辑 | Vanilla JS | ES Modules，无构建工具 |
| 图表 | Chart.js | v4.5.1，CDN 引入，雷达图 |
| 渲染 | marked.js | CDN 引入，Markdown 渲染 |
| 字体 | Inter + LXGW WenKai Screen | Google Fonts + jsDelivr CDN |
| API | Pages Functions 代理 | 同源 `/api/chat` -> 上游 `/chat/completions`（SSE 透传） |
| 存储 | localStorage | 模型偏好 + 历史记录 + 主题偏好 |
| 版本 | Git | 本地 Git 仓库 |

---

*Candy Craft — Make your prompts sweet 🍭*
