# all-platform-video-extract

> 解析 1000+ 视频平台链接（抖音/快手/B站/YouTube/TikTok/小红书等），获取标题、封面、各清晰度下载直链。零依赖，仅需 Node.js。

## 特性

- 零 npm install：仅依赖 Node.js 内置模块（`crypto` / `fetch` / `child_process`）
- 1000+ 平台：抖音、快手、B站、YouTube、TikTok、小红书、微博、公众号等
- 两种模式：仅解析获取链接 / 解析 + 下载到本地
- 公众号支持：自动保存 markdown 全文，内嵌图片本地化
- B 站自动加 Referer 头
- 明文脚本，完全可审计
- 首次加载询问配置（下载目录、并行数、间隔），持久化到配置文件
- 多视频并行下载，限制最大并行数和下载间隔，避免请求过于频繁

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
│   ├── index.html                    # 部署在 video-extract.bajiaolu.cn
│   └── logo.png
├── README.md                         # 项目文档（本文件）
└── .gitignore
```

## 快速开始

### 安装为 Skill

将项目根目录软链接到 AI 助手的 skills 目录：

```bash
# CatPaw
ln -s "$(pwd)" ~/.catpaw/skills/all-platform-video-extract

# Claude Code
ln -s "$(pwd)" ~/.claude/skills/all-platform-video-extract

# 其他 AI 工具请参照各自文档
```

### 首次使用

首次下载视频时，Skill 会询问三项配置并写入 `~/.extract_video_config.json`：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `outputDir` | `~/extract_video` | 视频下载保存目录 |
| `maxParallel` | `3` | 多视频同时下载的最大并行数 |
| `downloadInterval` | `3` | 每个视频之间的启动间隔（秒） |

后续使用自动读取配置文件，不再重复询问。

### 命令行使用

```bash
# 仅解析（获取链接）
node scripts/video_extract.cjs "8.94 复制打开抖音，看看【xxx的作品】..."

# 下载到本地
node scripts/download_videos.cjs "8.94 复制打开抖音..."

# 批量下载（自动限制并行数和间隔）
node scripts/download_videos.cjs "链接1" "链接2" "链接3"

# 从文件读（每行一个）
node scripts/download_videos.cjs urls.txt
```

### 下载目录结构

```
<输出根目录>/<平台>-<vid>-<标题截断60字>/
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

### 部署主页

主页源码在 `website/`，部署到服务器（根目录未随域名更改）：

```bash
scp website/index.html website/logo.png root@62.234.16.218:/www/wwwroot/all-platform-video-extract.widetoken.cn/
scp dist/skill.zip root@62.234.16.218:/www/wwwroot/all-platform-video-extract.widetoken.cn/
```

在线访问：https://video-extract.bajiaolu.cn

### 发布到 SkillHub

SkillHub 不允许上传 zip 和 .gitignore 等文件，需用临时目录只包含 Skill 文件：

```bash
# 准备临时目录
mkdir -p /tmp/skillhub_pub
cp SKILL.md /tmp/skillhub_pub/
cp -r scripts /tmp/skillhub_pub/scripts

# 本地预检
skillhub publish /tmp/skillhub_pub --dry-run

# 正式发布
skillhub publish /tmp/skillhub_pub --changelog "变更说明"

# 清理
rm -rf /tmp/skillhub_pub
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

**如何修改下载目录或并行设置？**
编辑 `~/.extract_video_config.json`，修改 `outputDir`、`maxParallel`、`downloadInterval` 字段即可。也可以用 `GV_OUTPUT` 环境变量临时覆盖下载目录。

**如何发布到 SkillHub？**
参见上方「发布到 SkillHub」章节，需用临时目录排除 zip 等非 Skill 文件。

## License

仅供个人学习研究使用。解析服务为公开免登录网站，本工具仅调用其公开接口，不涉及绕过付费/鉴权。下载的视频/图片请在 24 小时内删除，遵守原作者版权。
