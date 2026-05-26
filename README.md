# Candy Craft

> AI 驱动的可视化生图提示词优化工具。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Deployable on Cloudflare Pages](https://img.shields.io/badge/Deployable-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/pages/)

---

## 目录

- [项目简介](#项目简介)
- [功能总览](#功能总览)
- [工作流](#工作流)
- [AI 输出稳定性](#ai-输出稳定性)
- [目录结构](#目录结构)
- [模块说明](#模块说明)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [技术栈](#技术栈)
- [版本历史](#版本历史)

---

## 项目简介

Candy Craft 是一个纯静态前端 + Cloudflare Pages Functions 的可视化生图提示词工作台。它把提示词分析、画板编辑、构图尺寸、相机布光、风格维度、文本保真、排除约束和最终提示词优化整合到一个可操作的界面中。

当前版本：`BetaA.a.8`，版本号由 `js/version.js` 单一来源驱动。

支持两种 AI 调用方式：

- `后台托管`：浏览器请求同源 `/api/chat` 与 `/api/analyze-orchestrate`，上游密钥只保存在 Pages Secrets / 服务端环境变量中。
- `用户自定义`：浏览器按角色直连用户配置的 OpenAI 兼容端点，支持 `structure / lighting / normalize` 三角色分别配置 `Base URL + API Key + Model`。

---

## 功能总览

### 提示词分析与迭代

- 分析提示词后生成固定 8 项调节维度、画板元素、预设方案、场景建议与构图建议。
- 支持预设方案独立刷新、维度独立刷新、单项维度修改、基于当前状态的迭代分析。
- AI 输出使用版本化 JSON 契约、严格解析与失败回退，避免脏 JSON 直接污染 UI 状态。

### 画板与海报工作区

- 画板支持元素拖拽、缩放、图层、焦点、深度链接、前后景管理。
- 首页提供独立海报模式入口；进入后画板占主体，工作流、构图尺寸、模板、图层、结果输出收纳到右侧参数面板。
- 场景控制与维度雷达通过右侧快捷按钮打开悬浮窗，避免常驻挤占工作区。
- 画板可视尺寸采用三档显示桶：横向 `10:7`、方形 `1:1`、纵向 `3:4`；最终出图比例仍以构图数据为准。

### 构图尺寸

- 构图尺寸只保留生图 AI 稳定可理解的两类信息：横竖比例与最终像素尺寸。
- 尺寸模式：`preset_resolution`（长边分辨率）与 `custom_pixel`（自定义像素）。
- 长边像素预设：`1024 / 1536 / 1920 / 2048 / 2560 / 2712 / 3072 / 3840 / 4096 / 7680`。
- 比例库覆盖横向、纵向、方形、黄金比例与纸张比例模板；纸张仅作为比例模板，不引入厘米、DPI 或印前语义。

### 相机、布光与 3D 预览

- 相机与布光支持三视图联动：俯视、正视、侧视。
- 光源主状态为动态 `lights[]`，支持增删改查，软上限 12。
- 灯光建议支持二轮细化、纠错重试 1 次、失败安全降级。
- Three.js 3D 预览同步相机、主体代理、灯光 marker、覆盖体与视锥，只读预览，不阻断原三视图编辑。

### 模板、文本与排除项

- 模板体系支持本地保存、导出、导入、应用与旧模板兼容迁移，模板版本为 `cc.template.v1`。
- 画板文本支持 Exact Text Blocks 原文透传，用于海报标题、招牌文字、封面文案等确定文本。
- 支持对象级与全局“排除 / 反向提示词”，最终以通用 `Avoid:` / `Negative constraints` 表达，不默认绑定平台私有 `--no` 语法。

### 视觉模式

- Candy / Pro 是视觉主题模式。
- Candy 保留轻量糖果风格。
- Pro 使用米黄 / 深灰专业视觉、小圆角、弱阴影与更高对比度。
- 明暗主题与 Candy / Pro 可组合使用。

---

## 工作流

```text
用户输入提示词或进入海报模式
  |
  +-- 分析提示词
  |     +-- 结构分析：元素、维度、预设、场景、构图
  |     +-- 灯光细化：相机与光源建议
  |     +-- 归一化：字段校验、冲突规避、失败回退
  |
  +-- 可视化编辑
  |     +-- 画板：元素、图层、焦点、链接、文本透传、排除项
  |     +-- 构图：比例、方向、最终像素尺寸
  |     +-- 场景：相机、动态光源、Three.js 预览
  |     +-- 维度：8 项滑杆与雷达图
  |
  +-- 优化提示词
        +-- 收集当前画板与参数状态
        +-- 生成结构化优化契约
        +-- 输出最终可复制的生图 prompt
```

---

## AI 输出稳定性

核心 AI 步骤均使用固定 schema、字段顺序与语义校验：

| 步骤 | 契约版本 | 说明 |
|---|---|---|
| 主分析 | `cc.analysis.v1` | 维度、元素、预设、场景建议、构图建议 |
| 预设刷新 | `cc.presets_refresh.v1` | 只刷新预设方案 |
| 维度刷新 | `cc.dimensions_refresh.v1` | 维度固定 8 项 |
| 单项修改 | `cc.dimension_replace.v1` | 修改一个维度并保持总数 8 |
| 灯光细化 | `cc.lighting.v2` | 动态光源归一化、重试降级 |
| 最终优化 | `cc.optimize.v1` | JSON 包裹 + `finalPrompt` 文本输出 |

`cc.optimize.v1` 的 block 顺序固定为：

```text
subject -> composition -> foreground -> background -> camera -> lighting -> style -> exactText -> negativeConstraints -> renderConstraints
```

稳定性规则：

- `Exact text blocks` 必须保留原文，不翻译、不改写、不纠错。
- `Negative constraints` 只进入排除段，不混入正向主体、前景或背景描述。
- 构图只输出 `aspect ratio / orientation / final pixel size / --ar`，不输出厘米、DPI 或打印尺寸。
- 室内 / 棚拍在未显式给出时段词时不自动注入日出、黄金、正午或夜晚。
- 流明值按场景分档软上限压制，避免合法但不实用的极值。
- 托管编排与前端解析都会产生合同状态与可读错误信息，保证失败时可降级而不中断主流程。

---

## 目录结构

```text
intelligent-hawking/
|
|-- index.html                         # 单页入口与 DOM 结构
|-- README.md                          # 项目说明
|-- LICENSE
|
|-- assets/
|   `-- favicon.svg
|
|-- css/
|   |-- variables.css                  # 设计 token、Candy/Pro、明暗变量
|   |-- base.css                       # reset、全局基础、主题覆盖
|   |-- layout.css                     # 页面、海报工作区、右侧检视器布局
|   |-- components.css                 # 按钮、卡片、表单、设置、模板、弹窗
|   |-- canvas.css                     # 画板、元素、图层、链接、文本/排除标识
|   |-- scene.css                      # 三视图、灯光、Three.js 区域
|   `-- animations.css                 # 动画关键帧
|
|-- functions/api/
|   |-- chat.js                        # 同源 /api/chat 代理，SSE 透传
|   `-- analyze-orchestrate.js         # 托管三角色编排与合同门禁
|
`-- js/
    |-- app.js                         # 主入口、状态机、DOM 搬运、流程编排
    |-- ai-contract.js                 # AI 合同定义、错误码与状态生成
    |-- prompt.js                      # 分析/优化消息构建、响应解析、语义校验
    |-- api.js                         # managed/custom API 通道与角色配置
    |-- settings.js                    # 设置面板、托管/自定义三角色配置
    |-- canvas.js                      # 画板、对象编辑、文本透传、排除项
    |-- composition.js                 # 比例库、长边分辨率、自定义像素
    |-- composition-recommendation.js   # 构图推荐归一化
    |-- scene.js                       # 相机、动态光源、三视图状态
    |-- scene-recommendation.js        # 场景推荐约束与时段漂移修复
    |-- lighting-recommendation.js     # 灯光建议归一化、重试质量判定、流明软上限
    |-- scene-preview-3d.js            # Three.js 3D 预览
    |-- sliders.js                     # 维度滑杆
    |-- radar.js                       # 雷达图封装
    |-- presets.js                     # 预设方案卡片
    |-- templates.js                   # 模板保存、导入、导出、应用
    |-- style-toggle.js                # 动漫/写实风格滑杆
    |-- theme.js                       # 明暗主题
    |-- ui-mode.js                     # Candy / Pro UI 模式
    |-- history.js                     # 历史记录
    |-- utils.js                       # 通用工具
    `-- version.js                     # APP_VERSION 单一版本源
```

---

## 模块说明

### 前端编排

- `app.js` 是中央协调器，负责分析、优化、海报工作区进入/退出、节点挂载/回挂、状态快照与结果渲染。
- `api.js` 负责双模式传输：后台托管走同源 Functions，自定义模式按角色直连用户端点。
- `settings.js` 管理 `managed/custom`、三角色配置、连接测试与旧单端点配置迁移。

### 画板与构图

- `canvas.js` 管理元素拖拽、缩放、焦点、链接、图层、文本透传与排除项。
- `composition.js` 只维护生图 AI 能稳定理解的比例与像素尺寸，不维护厘米、DPI 或打印尺寸。
- `templates.js` 以 `cc.template.v1` 保存 composition、elements、links、scene、dimensions、文本透传与排除项。

### 相机与布光

- `scene.js` 维护相机、动态光源数组、三视图与场景快照。
- `scene-preview-3d.js` 读取同一份 scene snapshot 渲染 Three.js 只读预览。
- `lighting-recommendation.js` 负责二轮灯光输出质量判定、兼容旧命名、纠错重试与流明分档软上限。

### AI 合同

- `ai-contract.js` 定义 schema、字段顺序、block 顺序和合同状态。
- `prompt.js` 负责构建每一步消息、解析模型返回、生成合同元信息、保护 Exact Text Blocks 与 Negative Constraints。

---

## 快速开始

### 1. 本地联调

项目无构建步骤，推荐使用 Wrangler 启动静态页面 + Pages Functions：

```bash
npx wrangler pages dev . --compatibility-date=2026-05-24
```

默认本地地址通常为：

```text
http://127.0.0.1:8788
```

### 2. 本地环境变量

在仓库根目录创建 `.dev.vars`。该文件已加入 `.gitignore`，不要提交真实密钥。

```bash
UPSTREAM_BASE_URL=https://api.openai.com/v1
UPSTREAM_API_KEY=sk-your-api-key
DEFAULT_MODEL=gpt-4o
```

后台托管模式需要以上变量；用户自定义模式可在浏览器设置面板内填写自己的三角色端点。

### 3. 使用流程

1. 输入提示词并选择 Candy / Pro、明暗主题与动漫 / 写实风格档。
2. 点击“分析提示词”，生成画板元素、维度、预设、构图建议和相机布光建议。
3. 在画板中拖拽元素、调整图层、设置焦点、建立链接；必要时开启文本透传或排除内容。
4. 调整构图比例、最终像素尺寸、相机、光源、Three.js 预览与 8 项维度。
5. 点击“优化提示词”，输出经 `cc.optimize.v1` 合同校验的最终生图 prompt。
6. 也可直接进入海报模式，在大画板工作区中从空画板开始创作。

---

## 配置说明

### API 模式

| 模式 | 请求路径 | 密钥位置 | 适用场景 |
|---|---|---|---|
| `managed` 后台托管 | `/api/chat`、`/api/analyze-orchestrate` | Pages Secrets / 服务端环境变量 | 公开部署、统一模型策略、浏览器不暴露密钥 |
| `custom` 用户自定义 | `${BaseURL}/chat/completions` | 当前浏览器 localStorage | 本地测试、多供应商、多角色端点 |

### 用户自定义三角色配置

| 角色 | 作用 | 推荐模型倾向 |
|---|---|---|
| `structure` | 结构分析、元素、维度、预设 | `pro` 更稳，复杂提示词优先 |
| `lighting` | 灯光细化、二轮纠错 | `flash` 可用，失败会重试/降级 |
| `normalize` | 合同归一化、最终 prompt | `pro` 更稳，负责最终输出质量 |

### localStorage 键

| Key | 说明 |
|---|---|
| `pc_api_mode` | `managed` / `custom` |
| `pc_role_structure_base_url` | structure 角色 Base URL |
| `pc_role_structure_api_key` | structure 角色 API Key |
| `pc_role_structure_model` | structure 角色模型 |
| `pc_role_lighting_base_url` | lighting 角色 Base URL |
| `pc_role_lighting_api_key` | lighting 角色 API Key |
| `pc_role_lighting_model` | lighting 角色模型 |
| `pc_role_normalize_base_url` | normalize 角色 Base URL |
| `pc_role_normalize_api_key` | normalize 角色 API Key |
| `pc_role_normalize_model` | normalize 角色模型 |
| `cc_templates` | 本地模板库 |
| `cc_ui_mode` | `candy` / `pro` |

旧版 `pc_custom_base_url / pc_custom_api_key / pc_custom_model` 会在首次读取时复制到三角色配置中作为兼容迁移来源。

### Cloudflare Pages 部署

1. 将仓库推送到 GitHub。
2. Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git。
3. 构建配置：
   - Build command：留空
   - Build output directory：`/`
   - Functions：启用，`functions/` 会自动生效
4. 在 Preview 与 Production 环境配置：
   - `UPSTREAM_BASE_URL`
   - `UPSTREAM_API_KEY`（Secret）
   - `DEFAULT_MODEL`
5. 推荐使用 `main` 作为 Production 分支，其他分支作为 Preview。

### Cloudflare 后台密钥填写

在 Cloudflare Pages 项目中进入：

```text
Settings -> Environment variables
```

分别给 `Production` 和 `Preview` 配置同名变量：

基础兜底配置仍建议保留，供 `/api/chat`、连接测试和任一未单独配置的角色使用：

| 变量名 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `UPSTREAM_BASE_URL` | Variable | `https://api.openai.com/v1` | OpenAI 兼容接口根地址，只填到 `/v1`，不要带 `/chat/completions` |
| `UPSTREAM_API_KEY` | Secret | `sk-...` | 上游 API Key，必须用 Secret 保存 |
| `DEFAULT_MODEL` | Variable | `gpt-4o` | 后台托管模式使用的模型名 |

如果只想用一套托管模型，例如 DeepSeek，填写方式是：

```text
UPSTREAM_BASE_URL=https://api.deepseek.com/v1
UPSTREAM_API_KEY=你的 DeepSeek API Key
DEFAULT_MODEL=deepseek-v4-flash
```

如果希望 Cloudflare 后端也按角色使用多 AI 协作，可以在保留上面三项兜底配置的基础上，按需增加角色级覆盖：

| 角色 | 变量名 | 建议用途 |
|---|---|---|
| 结构分析 | `STRUCTURE_BASE_URL` / `STRUCTURE_API_KEY` / `STRUCTURE_MODEL` | 复杂提示词结构拆解，建议用更稳的 pro 模型 |
| 灯光细化 | `LIGHTING_BASE_URL` / `LIGHTING_API_KEY` / `LIGHTING_MODEL` | 灯光二轮建议，可用更快更便宜的 flash 模型 |
| 最终归一化 | `NORMALIZE_BASE_URL` / `NORMALIZE_API_KEY` / `NORMALIZE_MODEL` | 最终合同归一化与 prompt 输出，建议用更稳的 pro 模型 |

示例：

```text
# 全局兜底
UPSTREAM_BASE_URL=https://api.deepseek.com/v1
UPSTREAM_API_KEY=你的 DeepSeek API Key
DEFAULT_MODEL=deepseek-v4-flash

# 结构分析：可换成强模型
STRUCTURE_BASE_URL=https://api.example-pro.com/v1
STRUCTURE_API_KEY=你的结构分析 Key
STRUCTURE_MODEL=example-pro

# 灯光细化：可继续用 flash
LIGHTING_BASE_URL=https://api.deepseek.com/v1
LIGHTING_API_KEY=你的 DeepSeek API Key
LIGHTING_MODEL=deepseek-v4-flash

# 最终归一化：建议用强模型
NORMALIZE_BASE_URL=https://api.example-pro.com/v1
NORMALIZE_API_KEY=你的归一化 Key
NORMALIZE_MODEL=example-pro
```

注意：

- 所有 `*_API_KEY` 都建议在 Cloudflare 中设置为 Secret，不要写进代码、README、`.dev.vars.example` 或前端设置。
- `UPSTREAM_BASE_URL` 不要写成 `https://api.deepseek.com/v1/chat/completions`，代码会自动拼接 `/chat/completions`。
- 角色级 `*_BASE_URL` 同样只填到 `/v1`，不要带 `/chat/completions`。
- 某个角色的三项变量不完整时，会自动回退到全局 `UPSTREAM_* + DEFAULT_MODEL`。
- `/api/chat` 仍使用全局 `UPSTREAM_* + DEFAULT_MODEL` 作为单模型兜底路径。
- 前端“用户自定义”模式仍是浏览器本地配置，不读取 Cloudflare 后台变量。

---

## 技术栈

| 层面 | 技术 | 说明 |
|---|---|---|
| 结构 | HTML5 | 单页入口，无构建工具 |
| 样式 | Vanilla CSS | CSS 变量、Candy/Pro、明暗主题 |
| 逻辑 | Vanilla JS | ES Modules |
| 3D | Three.js | 动态导入 CDN 模块，场景只读预览 |
| 图表 | Chart.js | 雷达图 |
| 渲染 | marked.js | 优化结果 Markdown 渲染 |
| API | Cloudflare Pages Functions | `/api/chat` 与 `/api/analyze-orchestrate` |
| 存储 | localStorage | 设置、历史、模板、主题 |

---

## 版本历史

| 版本 | 主要变更 |
|---|---|
| `BetaA.a.8` | 动态光源、Three.js、海报工作区、模板、Pro 主题、文本透传、排除项、AI 合同门禁 |
| `BetaA.a.x` | 独立刷新、迭代分析、固定 8 维、结构化输出契约 |
| Legacy v3.x | Cloudflare Pages Functions、夜间模式、画板图层、基础四灯布光与比例控制 |

---

Candy Craft — 可视化、可审计、可迭代的生图提示词工作台。
