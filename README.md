# all-platform-video-extract

> 解析 1000+ 视频平台链接（抖音/快手/B站/YouTube/TikTok/小红书等），获取标题、封面、各清晰度下载直链。零依赖，仅需 Node.js。

## 特性

- 零 npm install：仅依赖 Node.js 内置模块（`crypto` / `fetch` / `child_process`）
- 1000+ 平台：抖音、快手、B站、YouTube、TikTok、小红书、微博、公众号等
- 两种模式：仅解析获取链接 / 解析 + 下载到本地
- 公众号支持：自动保存 markdown 全文，内嵌图片本地化
- B 站自动加 Referer 头
- 明文脚本，完全可审计

## 目录结构

```
all-platform-video-extract/
├── SKILL.md                          # Skill 入口（触发条件 + 工作流）
├── scripts/
│   ├── video_extract.cjs             # 解析脚本
│   └── download_videos.cjs           # 下载脚本
├── build.cjs                         # 打包脚本（生成 dist/skill.zip）
├── references/
│   └── encryption_flow.md            # 接口逆向分析（开发参考）
├── dist/
│   └── skill.zip                     # 发布压缩包（由 build.cjs 生成）
├── website/                          # 项目主页源码
│   └── index.html                    # 部署在 all-platform-video-extract.widetoken.cn
├── README.md                         # 项目文档（本文件）
└── .gitignore
```

## 快速开始

### 安装为 Skill

将项目根目录软链接到 skills 目录：

```bash
ln -s "$(pwd)" ~/.workbuddy/skills/all-platform-video-extract
```

### 命令行使用

```bash
# 仅解析（获取链接）
node scripts/video_extract.cjs "8.94 复制打开抖音，看看【xxx的作品】..."

# 下载到本地
node scripts/download_videos.cjs "8.94 复制打开抖音..."

# 批量下载
node scripts/download_videos.cjs "链接1" "链接2" "链接3"

# 从文件读（每行一个）
node scripts/download_videos.cjs urls.txt

# 自定义输出目录
GV_OUTPUT=~/Videos/归档 node scripts/download_videos.cjs "链接"
```

### 下载目录结构

```
<平台>-<vid>-<标题截断60字>/
├── info.json
├── cover.<ext>
├── video.mp4
├── audio.mp3              # 抖音等平台
├── image-001.jpg
├── image-002.jpg
├── ...
└── content.md             # 公众号：markdown + 图片本地化
```

## 支持平台

抖音、快手、B站、YouTube、TikTok、Twitter/X、Instagram、Facebook、threads、Pinterest、小红书、微博、西瓜视频、好看视频、今日头条、知乎、AcFun、搜狐视频、网易视频、CCTV、公众号、虎牙、斗鱼、Vimeo、Weverse、新片场、糖豆广场舞等 1000+ 平台。未列出的平台也可尝试传入 URL，接口会自动识别。

## 开发与发布

### 开发

直接在 `scripts/` 下编辑脚本，运行测试：

```bash
node scripts/video_extract.cjs "视频链接"
node scripts/download_videos.cjs "视频链接"
```

### 生成 skill.zip

修改脚本或 SKILL.md 后，运行打包脚本：

```bash
node build.cjs
```

生成的 `dist/skill.zip` 内部结构：

```
all-platform-video-extract/
├── scripts/
│   ├── video_extract.cjs
│   └── download_videos.cjs
└── SKILL.md
```

可直接上传到 SkillHub、GitHub Release 等平台。

### 部署主页

主页源码在 `website/index.html`，部署到服务器：

```bash
scp website/index.html root@<server>:/www/wwwroot/all-platform-video-extract.widetoken.cn/
scp dist/skill.zip root@<server>:/www/wwwroot/all-platform-video-extract.widetoken.cn/
```

在线访问：https://all-platform-video-extract.widetoken.cn

### 发布到 SkillHub

```bash
# 本地预检
skillhub publish . --dry-run

# 正式发布
skillhub publish . --changelog "变更说明"
```

## 接口协议

详见 [`references/encryption_flow.md`](references/encryption_flow.md)。

```
原始 body {url, list, pageNo, pageSize}
  ↓ JSON.stringify
  ↓ AES-128-CBC + PKCS7 加密
  ↓ RSA-1024 PKCS#1 v1.5 长文本分段加密
  ↓ POST /api/video/cnSimpleExtract
```

## FAQ

**如何更新脚本？**
直接编辑 `scripts/` 下的源码，然后运行 `node build.cjs` 重新打包。

**如何发布到 SkillHub？**
运行 `skillhub publish . --changelog "变更说明"`，注意发布前需将 `dist/` 下的 zip 文件移出（SkillHub 不允许上传 zip）。

## License

仅供个人学习研究使用。解析服务为公开免登录网站，本工具仅调用其公开接口，不涉及绕过付费/鉴权。下载的视频/图片请在 24 小时内删除，遵守原作者版权。
