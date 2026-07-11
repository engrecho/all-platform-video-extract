---
slug: all-platform-video-extract
displayName: ExtractVideoSkill
version: 2.0.0
summary: 解析 1000+ 视频平台链接，获取标题、封面、各清晰度下载直链。
license: MIT
name: all-platform-video-extract
description: 解析 1000+ 视频平台的视频链接（抖音/快手/B站/YouTube/TikTok/小红书/微博等），获取标题、封面、各清晰度下载直链。当用户提供视频分享文本或视频 URL 想提取下载链接时触发。
agent_created: true
links:
  - label: GitHub
    url: https://github.com/engrecho/ExtractVideoSkill
---

# ExtractVideoSkill

解析视频分享文本或 URL，获取标题、封面、下载直链。支持抖音、快手、B站、YouTube、TikTok、小红书等 1000+ 平台。

## When To Use

- 用户给出视频分享文本或视频 URL，想获取视频信息（标题、封面、下载链接等）
- 用户想把视频下载到本地

不触发：youtube-dl/yt-dlp 类通用下载需求、本地视频文件处理。

## Quick Start

```bash
# 仅解析（获取链接）
node scripts/video_extract.cjs "<视频分享文本或URL>"

# 下载到本地
node scripts/download_videos.cjs "<视频分享文本或URL>"
```

## Workflow

### Step 1: 识别输入

从用户消息中提取视频链接或分享文本。抖音/快手分享文本需整段传入，不要只提取 URL。

### Step 2: 判断行为模式

- **仅获取信息**：用户说"解析"、"看看"、"获取链接"等 → 调用 `video_extract.cjs`，呈现结果
- **下载到本地**：用户说"下载"、"保存"等 → 调用 `download_videos.cjs`

### Step 3: 执行脚本

```bash
node scripts/video_extract.cjs "<分享文本或URL>"
```

脚本超时 60 秒，解析通常 3~15 秒。

### Step 4: 处理结果

- **code=200**：解析成功，提取各清晰度下载链接
- **code=530**：公钥过期（约 5 分钟有效），重跑即可
- **超时/网络错误**：间隔几秒重试

### Step 5: 呈现结果

- 下载链接必须**完整输出**，不得截断
- 多清晰度按从高到低排列
- 提醒用户链接有时效性，尽早下载

### Step 6: 下载（仅模式 B）

```bash
# 单个
node scripts/download_videos.cjs "<分享文本或URL>"

# 多个
node scripts/download_videos.cjs "<链接1>" "<链接2>"

# 从文件读
node scripts/download_videos.cjs urls.txt

# 自定义输出目录
GV_OUTPUT=~/Videos node scripts/download_videos.cjs "<链接>"
```

下载目录结构：`<平台>-<vid>-<标题>/`，含 video.mp4、cover、images、content.md（公众号）。

## Notes

- 链接完整性：呈现任何 URL 时必须完整输出，不得省略
- 链接时效性：下载链接通常几小时有效，解析成功后建议立即下载
- B 站下载需加 `Referer: https://www.bilibili.com` 头，脚本已自动处理
