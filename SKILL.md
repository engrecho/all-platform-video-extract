---
slug: all-platform-video-extract
displayName: ExtractVideoSkill
version: 1.0.0
summary: 解析 1000+ 视频平台链接（抖音/快手/B站/YouTube/TikTok/小红书等），获取标题、封面、各清晰度下载直链。
license: MIT
name: all-platform-video-extract
description: 通过加密接口（AES-128-CBC + RSA-1024）解析 1000+ 视频平台的视频链接（抖音/快手/B站/YouTube/TikTok/小红书/微博等），获取标题、封面、各清晰度下载直链。当用户提供视频分享文本或视频 URL 想提取下载链接时触发；也适用于加密失败需要用 --replay 模式重放浏览器抓包 body 的排查场景。
agent_created: true
links:
  - label: GitHub
    url: https://github.com/engrecho/ExtractVideoSkill
  - label: SkillHub
    url: https://skillhub.cn/skills/all-platform-video-extract
---

# ExtractVideoSkill

## Overview

通过加密接口（AES-128-CBC + RSA-1024 PKCS#1 v1.5 长文本分段加密）解析视频链接，获取标题、封面、各清晰度下载直链。支持 1000+ 视频平台（抖音、快手、B 站、YouTube、TikTok、小红书、微博等）。

core 脚本 `scripts/video_extract.cjs` 已实现完整的加密流程与接口调用，仅依赖 Node.js 内置模块（`crypto`、`fetch`），无需安装任何第三方包。

## Supported Platforms

支持 1000+ 平台。以下是已确认支持的平台：

**主要平台**（官网有独立入口）：

| 平台 | 输入形式 | 备注 |
|------|----------|------|
| 抖音 | 分享文本或 `https://v.douyin.com/xxxx` | 无水印，`canDirectDownload` 通常为 true |
| 快手 | 分享文本或短链 | 无水印 |
| 哔哩哔哩 (B站) | `https://www.bilibili.com/video/BVxxxx` | 需 Referer 才能下载，见 Download Guide |
| YouTube | `https://www.youtube.com/watch?v=xxxx` 或短链 | |
| TikTok | `https://www.tiktok.com/@user/video/xxxx` | |
| Twitter / X | `https://x.com/xxxx/status/xxxx` | |
| Instagram | `https://www.instagram.com/p/xxxx` | |
| Facebook | `https://www.facebook.com/xxxx` | |
| threads | `https://www.threads.net/xxxx` | |
| Pinterest | `https://www.pinterest.com/pin/xxxx` | |
| 小红书 | `https://www.xiaohongshu.com/xxxx` | |
| 微博 | `https://weibo.com/xxxx` | |
| 西瓜视频 | `https://www.ixigua.com/xxxx` | |
| 好看视频 | `https://haokan.baidu.com/xxxx` | |
| 今日头条 | `https://www.toutiao.com/xxxx` | |
| 知乎 | `https://www.zhihu.com/xxxx` | |
| AcFun | `https://www.acfun.cn/xxxx` | |
| 搜狐视频 | `https://tv.sohu.com/xxxx` | |
| 网易视频 | `https://v.163.com/xxxx` | |
| CCTV | `https://tv.cctv.com/xxxx` | |
| 公众号 | 公众号文章链接 | |
| 虎牙 | `https://www.huya.com/xxxx` | 直播回放 |
| 斗鱼 | `https://www.douyu.com/xxxx` | 直播回放 |
| Vimeo | `https://vimeo.com/xxxx` | |
| Weverse | `https://weverse.io/xxxx` | |
| 新片场 | `https://www.xpc.cn/xxxx` | |
| 糖豆广场舞 | `https://www.tangdou.com/xxxx` | |

**额外支持**（官网列表提及）：梨视频、秒懂百科、微视、音悦台、QQ 短视频、美拍、懂车帝、PP 视频、皮皮虾等。

未列出的平台也可尝试传入 URL，接口会自动识别。

## When To Use

触发场景（满足任一即应加载本 skill）：

- 用户给出视频分享文本或视频 URL，想获取视频信息（标题、封面、下载链接等）
- 用户在排查加密失败（code=530）、想用 `--replay` 模式重放抓包 body
- 用户想理解前端 AES+RSA 加密流程（此时引导读 `references/encryption_flow.md`）

不触发：youtube-dl/yt-dlp 类通用下载需求、本地视频文件处理。

## Behavior Mode（重要：区分"获取信息"与"下载"）

根据用户意图选择行为模式：

### 模式 A：仅获取信息（默认）

**触发条件**：用户没有明确说"下载"、"保存到本地"、"下载视频"等，只是想看视频信息、获取链接、解析内容。

**行为**：调用脚本解析，把接口返回的**原始信息完整呈现**给用户，包括：
- 视频标题、平台、vid
- 各清晰度的下载链接（**完整 URL，不得省略**）
- 封面图链接
- 文件大小、格式、是否可直接下载（`canDirectDownload`）

**不主动执行下载**，不生成 curl/wget 命令，除非用户后续要求。

### 模式 B：下载到本地

**触发条件**：用户明确说"下载"、"保存"、"下到本地"等。

**行为**：调用脚本解析后，根据平台特性给出对应的下载方式（见 Download Guide）。对于需要特殊参数（如 Referer）的平台，务必给出完整可执行的下载命令。

## Quick Start

### 1. 加密模式（推荐，最常用）

把视频分享文本或 URL 作为参数传入：

```bash
node ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs "<视频分享文本或URL>"
```

示例（抖音分享文本）：

```bash
node ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs "3.58 复制打开抖音，看看【_馬冬的作品】出门在外身份是自己给的！！ # 文静小女生 # 馬... https://v.douyin.com/q3Xf96DFFCk/ Iic:/ m@Q.xF 03/03"
```

示例（B 站 URL）：

```bash
node ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs "https://www.bilibili.com/video/BV1ypdgBCE9B/"
```

成功时输出形如：

```
[1/5] 获取 cookie ...
[2/5] GET /auth/keys ...
      AES key = "xxxxx" (16 字节)
[3/5] body JSON 长度 = xxx 字节
[4/5] AES 输出 base64 长度 = xxx
[5/5] 最终加密 body 长度 = xxx 字符

>>> POST 状态 = 200  耗时 = 5234 ms

=== 接口返回 ===
code: 200
vid: xxx  host: xxx  title: 视频标题

共 3 个清晰度：
  [1080p] mp4  size=12.3MB  direct=true
    https://完整链接（不省略）
  [720p]  mp4  size=8.1MB   direct=true
    https://完整链接（不省略）
```

### 2. 重放模式（加密失败时排查用）

如果加密模式返回 `code=530`（加密验证失败），可以让用户从浏览器 DevTools 抓取真实请求 body，然后用重放模式验证接口本身是否正常：

```bash
node ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs --replay "<抓包拿到的加密 body 字符串>"
```

### 3. 交互模式（查看帮助）

不带参数运行会打印用法说明：

```bash
node ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs
```

## Workflow

处理用户请求时按以下顺序操作：

### Step 1: 判断行为模式

先判断用户意图：
- **仅获取信息**（模式 A）：用户只说"解析"、"看看"、"获取链接"、"这个视频是什么"等 → 走 Step 2-4，只呈现信息
- **需要下载**（模式 B）：用户说"下载"、"保存到本地"、"下下来"、"存一下"等 → 走 Step 2-6，**调用下载脚本**把资源存到本地

### Step 6:（仅模式 B）执行下载脚本

**关键：每个视频/链接单独存为一个独立目录**，目录命名格式：

```
<平台>-<vid>-<标题截断>/
```

- 标题部分最多 60 个字符（解决长路径同步问题）
- 移除文件系统非法字符（`/ \ : * ? " < > |`）、合并空白、去除 emoji

**调用下载脚本**（推荐用方式一；脚本会自动建目录、下载所有资源、公众号生成 MD）：

```bash
# 方式一：直接传分享文本或 URL
node ~/.workbuddy/skills/all-platform-video-extract/scripts/download_videos.cjs \
  "8.94 复制打开抖音，看看【xxx的作品】..."

# 方式二：传多个
node ~/.workbuddy/skills/all-platform-video-extract/scripts/download_videos.cjs \
  "<链接1>" "<链接2>" "<链接3>"

# 方式三：从文件读（每行一个）
node ~/.workbuddy/skills/all-platform-video-extract/scripts/download_videos.cjs urls.txt
```

**环境变量**：
- `GV_OUTPUT` 自定义输出根目录（默认 `./gv_downloads`）
- `GV_NODE` 自定义 Node 路径

**下载后的目录结构**：

```
<平台>-<vid>-<标题>/
├── info.json           # 视频元信息 + 原始 items 列表
├── cover.<ext>         # 封面（如有）
├── video.mp4           # 视频（如有）
├── audio.mp3           # 音频（抖音等平台）
├── image-001.jpg       # 第 1 张图（图文章/公众号/小红书等）
├── image-002.jpg
├── ...
└── content.md          # 公众号/文章类平台生成，markdown 文本独立保存
                        # 内嵌图片链接已替换为本地相对路径
```

**公众号特殊处理**：公众号返回的 markdown 文本会单独保存为 `content.md`，且文中的 `mmbiz.qpic.cn` 图片链接会**按出现顺序替换为 `image-NNN.ext` 相对路径**——这样 MD 文件配合本地图片就形成了完整离线副本。

**文件类型识别规则**（脚本内部）：

| fileType / qualityAlias | 映射到 | 文件名 |
|-------------------------|--------|--------|
| video（非封面/非 markdown） | 视频 | `video.mp4` 或 `video-NN.<ext>` |
| audio | 音频 | `audio.mp3` 或 `audio-NN.<ext>` |
| 图片(封面) / cover | 封面 | `cover.<ext>` |
| 图片(1) / image | 图片 | `image-001.<ext>` ... |
| video + markdown 文本 | 文本文档 | `content.md`（公众号专用） |

### Step 2: 识别输入

从用户消息中提取视频链接或分享文本。注意：

- **抖音/快手分享文本**：通常形如 `数字 复制打开抖音，看看【作者的作品】标题 # 标签 ... https://v.douyin.com/xxxx/ ...`，**整段文本都要传给脚本**，不要只提取 URL —— 服务端会校验整段文本的哈希
- **B 站/YouTube/小红书等**：直接传完整 URL 即可，如 `https://www.bilibili.com/video/BV1ypdgBCE9B/`
- 如果用户只给了抖音短链 `https://v.douyin.com/xxxx`，可以先传短链试试，但成功率不如完整分享文本
- 文本中可能含 emoji、特殊字符，传参时务必用双引号包裹

### Step 3: 执行脚本

使用 Node.js 运行 `scripts/video_extract.cjs`。推荐使用受管理的 Node 运行时：

```bash
/Users/jaylon/.workbuddy/binaries/node/versions/22.22.2/bin/node \
  ~/.workbuddy/skills/all-platform-video-extract/scripts/video_extract.cjs \
  "<分享文本或URL>"
```

脚本默认超时 60 秒（视频解析通常 3~15 秒，复杂场景更久）。

### Step 4: 处理返回结果

- **code=200**：解析成功。从返回 JSON 的 `data.videoItemVoList` 中提取各清晰度下载链接。
- **code=530**：加密验证失败。常见原因：①`/auth/keys` 公钥已过期（有效期约 5 分钟）—— 重跑脚本即可；②输入文本与浏览器实际发送的不一致 —— 改用 `--replay` 模式排查。向用户说明并给出建议。
- **超时**：视频解析时间较长，可重试 1~2 次。
- **网络错误**：解析服务偶尔不稳定，建议间隔几秒重试。

### Step 5: 呈现结果（关键：链接必须完整）

把解析结果整理成易读格式给用户。**严格遵守以下规则**：

1. **链接完整性**：呈现下载链接、封面链接等任何 URL 时，**必须给出完整的链接值，不得用 `...` 或省略号截断**。即使链接很长（B 站链接常含大量 query 参数），也要完整输出。用户需要完整链接才能下载。
2. **清晰度排序**：如果有多个清晰度，按清晰度从高到低排列。
3. **时效提醒**：提醒用户下载链接通常有时效性（几小时到一天不等），尽早下载。
4. **direct 标识**：标注每个链接的 `canDirectDownload` 状态，但注意该字段**不可靠**（实测全标 false，多数平台实际可直接下载，见 Download Guide）。

### Step 6:（仅模式 B）给出下载方式

如果用户要求下载，根据平台特性给出下载命令，见下方 Download Guide。

## Download Guide（按平台）

**重要：`canDirectDownload` 字段不可靠**——实测所有平台该字段都标 `false`，但多数平台的 CDN 链接实际可直接 curl 下载。判断是否可下载应以**实际 curl 测试**为准，而非该字段值。

### 实测可直接下载的平台（无需 Referer）

以下平台实测 `canDirectDownload=false`，但链接可直接 curl 下载，无需任何额外头：

| 平台 | 内容类型 | 实测结果 | CDN 域名 |
|------|---------|---------|---------|
| 小红书 | 视频 mp4 / 封面 jpg | ✅ HTTP 206 直接下载 | sns-video-hw.xhscdn.com / sns-webpic.xhscdn.com |
| 抖音 | 视频 mp4 / 音频 mp3 / 图片 jpg | ✅ HTTP 206 直接下载 | v26-dy.ixigua.com / douyinstatic.com / douyinpic.com |
| 微信公众号 | 图片 png / jpg | ✅ HTTP 206 直接下载 | mmbiz.qpic.cn |

下载命令：

```bash
curl -o video.mp4 "<完整下载链接>"
```

### 需要 Referer 的平台

#### 哔哩哔哩 (B站)

B 站返回的 mp4 链接直接 curl/浏览器打开会 **403 Forbidden**，必须带 `Referer` 头：

```bash
curl -o video.mp4 \
  -H "Referer: https://www.bilibili.com" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  "<完整下载链接>"
```

**B 站特殊行为**：
- 同一 BV 号多次解析可能返回**不同的视频流**（cid 不同），码率（`bw` 字段）也可能不同。如需更高画质，可多跑几次脚本对比 `bw` 数值，挑大的那条。
- 链接含 `deadline` 参数，约 2 小时有效。
- 返回的 `qualityAlias` 可能显示为"未知清晰度"，但链接本身可正常下载。

### 下载判断流程（遇到新平台时）

`canDirectDownload` 字段不可靠，按以下流程判断：

1. 先直接 curl 测试（不加任何头），下载前 1KB 验证：`curl -sS -r 0-1023 -o /tmp/test -w "%{http_code}" "<链接>"`
2. **HTTP 200/206** → 可直接下载，用 `curl -o file "<链接>"`
3. **HTTP 403** → 加 `Referer`（平台主域名，如 `https://www.bilibili.com`）重试
4. **仍失败** → 加 `User-Agent` 头，或建议用户用浏览器打开链接手动下载

**待补充**：随着实测更多平台（YouTube/TikTok/快手/微博等），此处会逐步补充各平台的下载特性。

## Encryption Flow（背景知识）

完整加密流程分析见 `references/encryption_flow.md`，简述如下：

```
原始 body {url, list, pageNo, pageSize}
  ↓ JSON.stringify
  ↓ AES-128-CBC + PKCS7 加密（key=服务端下发的一次性 AES key，iv=固定常量 atob("a2Vkb3VAODk4OSE2MzIzMw==")）
  ↓ RSA-1024 PKCS#1 v1.5 长文本分段加密（每段 117 字节，JSEncrypt.encryptLong 复刻）
  ↓ POST /api/video/cnSimpleExtract  (header: KdSystem=GreenVideo)
```

关键细节（排查问题时需要知道）：

- **首次请求必返回 530**：这是协议设计，迫使客户端先 `GET /api/auth/keys` 拿公钥 `k1` 和被服务端私钥加密的 AES key `k2`
- **`k2` 是被私钥加密的**，客户端用公钥做 `publicDecrypt`（RSA doPublic）还原 AES key —— 这种设计让客户端能解出明文但不能伪造
- **IV 是常量** `a2Vkb3VAODk4OSE2MzIzMw==`，base64 解码后是 `kedou@8989!63233`（16 字节）
- **RSA keySize = 1024 bit**：从抓包 body 长度 ~516 base64 字符反推（1024/8=128 字节 = 172 base64，3 段 ≈ 516 字符）；分段长度 117 = 128 - 11（PKCS#1 v1.5 padding）
- **白名单接口**：只有 `/video/cnSimpleExtract`、`/video/extract/v2`、`/message/report` 走加密，其它接口不加密
- **Cookie 自动获取**：脚本会先访问解析服务首页获取 Set-Cookie，网站免登录

## Resources

### scripts/video_extract.cjs

核心执行脚本，已跑通。功能：

1. 自动访问解析服务获取 cookie
2. `GET /api/auth/keys` 拉取公钥 k1 和加密的 AES key k2
3. 用公钥 `publicDecrypt(k2)` 还原 AES key
4. AES-128-CBC + PKCS7 加密 `JSON.stringify({url, list, pageNo, pageSize})`
5. RSA-1024 PKCS#1 v1.5 长文本分段加密（复刻 JSEncrypt.encryptLong，含自定义 hex2b64）
6. POST `/api/video/cnSimpleExtract`，解析返回并打印各清晰度下载链接

仅依赖 Node.js 内置模块，**无需 `npm install`**。

支持三种模式：加密模式（默认）、重放模式（`--replay`）、交互模式（无参数）。

### scripts/download_videos.cjs

**下载模式专用脚本**（行为模式 B）。封装 `video_extract.cjs` 的解析能力，下载所有资源到本地：

- 调用 extract 脚本解析接口
- 按 `<平台>-<vid>-<标题截断60字>/` 规范建独立目录
- 视频 → `video.mp4`、音频 → `audio.mp3`、封面 → `cover.<ext>`、多图 → `image-NNN.<ext>`
- 公众号/文章类：markdown 文本存为 `content.md`，内嵌 `mmbiz.qpic.cn` 图片链接按出现顺序替换为 `image-NNN.ext` 相对路径
- 元信息存为 `info.json`
- 给已知需要 Referer 的平台（B站）自动加 `Referer: https://www.bilibili.com` 头
- 并发下载（默认 4 并发），单文件 60s 超时

仅依赖 Node.js 内置模块，**无需 `npm install`**。

### references/encryption_flow.md

详细的加密流程逆向分析文档，包含：

- 关键代码位置（C8YVeVYM.js / CuWTknZj.js / D7yAekyA.js / Cnx7Ipy2-1.js）
- 完整加密流程图
- 关键常量与代码片段（白名单逻辑、useReqPublicKey、三个加密函数、extractVideoUrl 入口）
- 重要细节与踩坑点
- 复现脚本调用样例

当用户询问加密原理、排查 530 错误、或想理解 JSEncrypt.encryptLong 的自定义 hex2b64 实现时，加载此文档。

## Notes

- 解析服务是公开免登录网站，脚本仅调用其公开接口，不涉及绕过付费/鉴权
- **支持 1000+ 平台**：抖音、快手、B 站、YouTube、TikTok、小红书、微博等，完整列表见上方 Supported Platforms，未列出的平台也可尝试传入 URL
- **行为区分**：用户没说下载时只呈现原始信息（含完整链接），用户说要下载/保存/存到本地时调用 `download_videos.cjs` 存为独立目录
- **链接完整性**：呈现任何 URL 时必须完整输出，不得用 `...` 省略
- **链接时效性**：下载链接通常几小时有效（B 站 mp4 链接含 `deadline` 参数，约 2 小时；抖音图片链接含 `x-expires` 参数），解析成功后建议立即下载
- **`canDirectDownload` 字段不可靠**：实测所有平台都标 false，但小红书/抖音/公众号等多数平台的 CDN 链接可直接 curl 下载，无需 Referer；仅 B 站需要 Referer。判断是否可下载以实际 curl 测试为准
- **B 站多流特性**：同一 BV 号多次解析可能返回不同码率的视频流，对比 `bw` 字段挑高清版本
- 网站偶发不稳定，遇到网络错误间隔几秒重试
- 如脚本因网站前端更新导致加密失效，参考 `references/encryption_flow.md` 重新逆向定位关键代码
- **源文件位置**：skill 源文件在项目目录 `ExtractVideoSkill/`，`~/.workbuddy/skills/all-platform-video-extract/` 是指向它的软链接，编辑任一侧都生效
