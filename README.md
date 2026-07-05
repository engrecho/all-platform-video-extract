# ExtractVideoSkill

> 一个 WorkBuddy SKILL，把任意视频分享文本或 URL（抖音/快手/B站/小红书/公众号等 1000+ 平台）解析成可下载的原始资源。

通过复刻 [greenvideo.cc](https://greenvideo.cc) 前端加密流程（AES-128-CBC + RSA-1024 PKCS#1 v1.5），调用其 `/api/video/cnSimpleExtract` 接口，零依赖拿到视频直链、封面、音频、所有图片，以及公众号文章的完整 markdown 文案。

## 特性

- 🚀 **零 npm install**：仅依赖 Node.js 内置模块（`crypto` / `fetch` / `child_process`）
- 🌐 **1000+ 平台**：抖音、快手、B站、YouTube、TikTok、小红书、微博、公众号、CCTV、知乎、AcFun、虎牙、斗鱼、Vimeo、Weverse 等
- 📦 **两种使用模式**：
  - `greenvideo_extract.cjs` — 仅解析，把原始链接完整呈现
  - `download_videos.cjs` — 解析 + 下载到本地，自动建独立目录、公众号生成 MD、图片本地化
- 📝 **公众号支持**：自动保存文章 markdown 全文，内嵌图片全部本地化
- 🔁 **B 站特殊处理**：自动加 `Referer` 头；同 BV 号多次解析可能返回不同码率流，可对比 `bw` 字段挑高清

## 目录结构

```
ExtractVideoSkill/
├── SKILL.md                          # WorkBuddy SKILL 主入口（触发词 / Workflow / Download Guide）
├── scripts/
│   ├── greenvideo_extract.cjs        # 核心：复刻加密 + 调接口
│   └── download_videos.cjs           # 下载模式：批量下载到独立目录
├── references/
│   └── encryption_flow.md            # greenvideo 前端加密流程逆向分析
└── .gitignore
```

## 快速开始

### 安装为 WorkBuddy SKILL

本项目也可以作为用户级 SKILL 安装：

```bash
# 软链接到用户级 skills 目录（macOS / Linux）
ln -s "$(pwd)" ~/.workbuddy/skills/greenvideo-extract
```

装好后，在 WorkBuddy 中发任何视频分享文本或链接都会自动触发。

### 命令行使用

**仅解析**（拿原始链接）：

```bash
node scripts/greenvideo_extract.cjs "8.94 复制打开抖音，看看【xxx的作品】..."
```

**下载到本地**（行为模式 B）：

```bash
# 单个
node scripts/download_videos.cjs "8.94 复制打开抖音..."

# 多个
node scripts/download_videos.cjs "链接1" "链接2" "链接3"

# 从文件读（每行一个）
node scripts/download_videos.cjs urls.txt

# 自定义输出根目录
GV_OUTPUT=~/Videos/归档 node scripts/download_videos.cjs "链接"
```

下载后的目录结构：

```
<平台>-<vid>-<标题截断60字>/
├── info.json
├── cover.<ext>
├── video.mp4              # 视频
├── audio.mp3              # 音频（抖音等）
├── image-001.jpg          # 图片
├── image-002.jpg
├── ...
└── content.md             # 公众号：完整 markdown + 图片本地化
```

## 加密流程

详见 [`references/encryption_flow.md`](references/encryption_flow.md)。

```
原始 body {url, list, pageNo, pageSize}
  ↓ JSON.stringify
  ↓ AES-128-CBC + PKCS7 加密（key=服务端下发的一次性 AES key，iv=固定常量）
  ↓ RSA-1024 PKCS#1 v1.5 长文本分段加密（每段 117 字节，复刻 JSEncrypt.encryptLong）
  ↓ POST /api/video/cnSimpleExtract
```

## License

仅供个人学习研究使用。greenvideo.cc 是公开免登录网站，本工具仅调用其公开接口，不涉及绕过付费/鉴权。

下载的视频/图片请在 24 小时内删除，遵守原作者版权。
