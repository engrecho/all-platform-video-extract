---
slug: all-platform-video-extract
displayName: all-platform-video-extract
version: 2.1.0
summary: 解析 1000+ 视频平台链接，获取标题、封面、各清晰度下载直链。
license: MIT
name: all-platform-video-extract
description: 解析 1000+ 视频平台的视频链接（抖音/快手/B站/YouTube/TikTok/小红书/微博等），获取标题、封面、各清晰度下载直链。当用户提供视频分享文本或视频 URL 想提取下载链接时触发。
agent_created: true
links: GitHub https://github.com/engrecho/all-platform-video-extract

---

# all-platform-video-extract

解析视频分享文本或 URL，获取标题、封面、下载直链。支持抖音、快手、B站、YouTube、TikTok、小红书等 1000+ 平台。

## When To Use

- 用户给出视频分享文本或视频 URL，想获取视频信息（标题、封面、下载链接等）
- 用户想把视频下载到本地

不触发：youtube-dl/yt-dlp 类通用下载需求、本地视频文件处理。

## 首次加载：初始化配置

当本 Skill 首次被使用时（检测到 `~/.extract_video_config.json` 不存在），**必须**执行以下初始化流程，一次性询问三项配置：

1. 询问用户：「视频下载保存到哪个目录？默认是 `~/extract_video`，是否需要修改？」
2. 如果用户明确给出目录，使用用户指定的目录；如果用户说「不用改」「默认就行」「可以」等未明确修改的回复，使用 `~/extract_video`
3. 询问用户：「多视频同时下载时，最大并行几个？默认 3，是否需要修改？」
4. 如果用户明确给出数字，使用用户指定的值；否则使用默认值 `3`
5. 询问用户：「每个视频之间的下载间隔多少秒？默认 3 秒，是否需要修改？」
6. 如果用户明确给出数字，使用用户指定的值；否则使用默认值 `3`
7. 将最终配置写入配置文件：

```bash
cat > ~/.extract_video_config.json << 'EOF'
{
  "outputDir": "~/extract_video",
  "maxParallel": 3,
  "downloadInterval": 3
}
EOF
```

（根据用户的选择替换对应值）

8. 后续所有下载操作都从该配置文件读取配置，不再重复询问

**检测配置是否已存在：**

```bash
cat ~/.extract_video_config.json 2>/dev/null
```

如果输出有效 JSON 则跳过初始化；如果报错或文件不存在，则执行上述初始化流程。

配置文件字段说明：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `outputDir` | string | `~/extract_video` | 视频下载保存目录 |
| `maxParallel` | number | `3` | 多视频同时下载的最大并行数 |
| `downloadInterval` | number | `3` | 每个视频之间的启动间隔（秒） |

## Quick Start

```bash
# 仅解析（获取链接）
node scripts/video_extract.cjs "<视频分享文本或URL>"

# 下载到本地
node scripts/download_videos.cjs "<视频分享文本或URL>"
```

## Workflow

### Step 1: 检查配置文件

每次下载前，先检查 `~/.extract_video_config.json` 是否存在：

```bash
cat ~/.extract_video_config.json 2>/dev/null
```

- 如果不存在或无效 → 执行「首次加载：初始化配置」流程
- 如果存在 → 从中读取 `outputDir`、`maxParallel`、`downloadInterval` 作为下载配置

### Step 2: 识别输入

从用户消息中提取视频链接或分享文本。抖音/快手分享文本需整段传入，不要只提取 URL。

### Step 3: 判断行为模式

- **仅获取信息**：用户说"解析"、"看看"、"获取链接"等 → 调用 `video_extract.cjs`，呈现结果
- **下载到本地**：用户说"下载"、"保存"等 → 调用 `download_videos.cjs`

### Step 4: 执行脚本

```bash
node scripts/video_extract.cjs "<分享文本或URL>"
```

脚本超时 60 秒，解析通常 3~15 秒。

### Step 5: 处理结果

- **code=200**：解析成功，提取各清晰度下载链接
- **code=530**：公钥过期（约 5 分钟有效），重跑即可
- **超时/网络错误**：间隔几秒重试

### Step 6: 呈现结果

- 下载链接必须**完整输出**，不得截断
- 多清晰度按从高到低排列
- 提醒用户链接有时效性，尽早下载

### Step 7: 下载（仅模式 B）

```bash
# 单个
node scripts/download_videos.cjs "<分享文本或URL>"

# 多个
node scripts/download_videos.cjs "<链接1>" "<链接2>" "<链接3>"

# 从文件读
node scripts/download_videos.cjs urls.txt
```

**多任务并行限制（从配置文件读取）：**
- 最大并行数：默认 3（可由用户在配置文件中修改 `maxParallel`）
- 下载间隔：默认 3 秒（可由用户在配置文件中修改 `downloadInterval`）
- 脚本自动从 `~/.extract_video_config.json` 读取这两个值

下载目录结构：`<输出根目录>/<平台>-<vid>-<标题>/`，含 video.mp4、cover、images、content.md（公众号）。

## Notes

- 链接完整性：呈现任何 URL 时必须完整输出，不得省略
- 链接时效性：下载链接通常几小时有效，解析成功后建议立即下载
- B 站下载需加 `Referer: https://www.bilibili.com` 头，脚本已自动处理
- 配置文件路径：`~/.extract_video_config.json`，记录用户选择的下载目录、最大并行数、下载间隔
