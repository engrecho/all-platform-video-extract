# all-platform-video-extract

> 解析 1000+ 视频平台链接（抖音/快手/B站/YouTube/TikTok/小红书等），获取标题、封面、各清晰度下载直链。零依赖，仅需 Node.js。

## 特性

- 零 npm install：仅依赖 Node.js 内置模块（`crypto` / `fetch` / `child_process`）
- 1000+ 平台：抖音、快手、B站、YouTube、TikTok、小红书、微博、公众号等
- 两种模式：仅解析获取链接 / 解析 + 下载到本地
- 公众号支持：自动保存 markdown 全文，内嵌图片本地化
- B 站自动加 Referer 头
- 发布版脚本 AES-256-CBC 加密，防止源码查看

## 目录结构

```
all-platform-video-extract/
├── dev/                              # 开发文件夹（明文源码）
│   ├── scripts/
│   │   ├── video_extract.cjs         # 解析脚本（明文）
│   │   └── download_videos.cjs       # 下载脚本（明文）
│   ├── references/
│   │   └── encryption_flow.md        # 接口逆向分析（开发参考）
│   ├── SKILL.md                      # Skill 入口（触发条件 + 工作流）
│   └── build.cjs                     # 加密构建 + 打包脚本
├── release/                          # 发布文件夹（加密代码）
│   ├── scripts/
│   │   ├── video_extract.cjs         # 加密 loader
│   │   └── download_videos.cjs       # 加密 loader
│   ├── SKILL.md                      # 由 build.cjs 从 dev/ 同步
│   └── skill.zip                     # 发布压缩包（由 build.cjs 生成）
├── website/                          # 项目主页源码
│   └── index.html                    # 部署在 all-platform-video-extract.widetoken.cn
├── README.md                         # 项目文档（本文件）
└── .gitignore
```

## 快速开始

### 安装为 Skill

将 release 文件夹软链接到 skills 目录：

```bash
ln -s "$(pwd)/release" ~/.workbuddy/skills/all-platform-video-extract
```

### 命令行使用

```bash
# 仅解析（获取链接）
node release/scripts/video_extract.cjs "8.94 复制打开抖音，看看【xxx的作品】..."

# 下载到本地
node release/scripts/download_videos.cjs "8.94 复制打开抖音..."

# 批量下载
node release/scripts/download_videos.cjs "链接1" "链接2" "链接3"

# 从文件读（每行一个）
node release/scripts/download_videos.cjs urls.txt

# 自定义输出目录
GV_OUTPUT=~/Videos/归档 node release/scripts/download_videos.cjs "链接"
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

在 `dev/scripts/` 下编辑明文源码，直接运行测试：

```bash
node dev/scripts/video_extract.cjs "视频链接"
node dev/scripts/download_videos.cjs "视频链接"
```

### 生成 Release

修改源码后，运行构建脚本一键完成「加密 + 同步 + 打包」：

```bash
node dev/build.cjs
```

构建流程：

| 步骤 | 操作 | 输出 |
|------|------|------|
| Step 1 | AES-256-CBC 加密 `dev/scripts/*.cjs` | `release/scripts/*.cjs` |
| Step 2 | 复制 `dev/SKILL.md` | `release/SKILL.md` |
| Step 3 | 将 `release/` 打包为 zip | `release/skill.zip` |

也可仅加密不打包：

```bash
node dev/build.cjs --no-zip
```

生成的 `release/skill.zip` 内部结构：

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
scp release/skill.zip root@<server>:/www/wwwroot/all-platform-video-extract.widetoken.cn/
```

在线访问：https://all-platform-video-extract.widetoken.cn

### 脚本加密方案

发布版脚本使用 AES-256-CBC 加密：

- 源码加密后以 base64 嵌入 loader
- 密钥和 IV 拆成混淆字节数组（加随机偏移），运行时还原
- loader 用 `vm.compileFunction` 解密执行，保留 CommonJS 上下文
- 零依赖，仅用 `crypto` + `vm`
- 使用方式跟普通脚本完全一样，运行时自动解密，不需要手动操作

加密局限性：Node.js 脚本密钥必须嵌入文件才能自运行，能防止直接查看代码，但不防专业逆向。如需更强保护，建议将核心常量移到服务端 API。

## 接口协议

详见 [`dev/references/encryption_flow.md`](dev/references/encryption_flow.md)。

```
原始 body {url, list, pageNo, pageSize}
  ↓ JSON.stringify
  ↓ AES-128-CBC + PKCS7 加密
  ↓ RSA-1024 PKCS#1 v1.5 长文本分段加密
  ↓ POST /api/video/cnSimpleExtract
```

## FAQ

**加密后的脚本每次运行都需要解密吗？**
不需要。加密后的文件是自包含的 loader，运行时自动在内存中解密执行，毫秒级完成，使用方式跟普通脚本一样。

**如何更新发布版脚本？**
修改 `dev/scripts/` 下的源码，然后运行 `node dev/build.cjs`。

**dev/ 和 release/ 的关系？**
`dev/` 是明文源码，`release/` 是加密后的发布版本。`build.cjs` 负责加密 + 同步 + 打包。

## License

仅供个人学习研究使用。解析服务为公开免登录网站，本工具仅调用其公开接口，不涉及绕过付费/鉴权。下载的视频/图片请在 24 小时内删除，遵守原作者版权。
