# 加密流程参考（AI 阅读）

> 何时读这份文档：用户在排查 `code=530` 错误、需要复现加密参数、或 `--replay` 模式失败时。
> 不必读的场景：脚本正常返回 `code=200` 时 —— 直接用 `video_extract.cjs` 即可。
> 维护者读这份文档：扩展支持新平台、修正接口常量。

---

## 1. AI 在不同情境下要做什么

### 1.1 用户报"解析失败 / code=530 / 报错"

按顺序：

1. 重跑脚本（公钥 5 分钟内会过期，重新拿一次就好）
2. 仍失败 → 让用户用浏览器 DevTools 抓 `cnSimpleExtract` 那个 POST 请求的 **body 字符串**，跑 `--replay` 验证接口本身
3. `--replay` 成功 → 说明服务正常，问题在客户端加密脚本，参考第 3 节"客户端加密"对比 diff
4. `--replay` 失败 → 报给用户："服务端可能更新了，参考第 2 节'服务端协议'检查接口变更"

### 1.2 用户想理解"为什么能解析"

回答要点：
- 服务端返回加密的 AES key + 公钥
- 客户端用公钥还原 AES key，再用 AES + RSA 长文本加密 POST body
- 服务端校验通过 → 返回明文 JSON（含各平台下载链接）

### 1.3 用户想加新平台

- 平台支持由服务端决定，客户端脚本不感知
- 新平台解析失败 → 提交服务端问题或等待服务端更新平台列表
- 客户端无需改动

### 1.4 用户问"为什么 is not found / 404"

- 大概率是分享文本里 URL 缺了 token 段（抖音短链经常这样）
- 提示用户提供**完整分享文本**（含 `数字 复制打开 xxx` 那段）

---

## 2. 服务端协议（必传 / 可变 / 固定）

| 项目 | 类型 | 用途 | 维护注意 |
|------|------|------|---------|
| 域名 | 必传 | 解析服务 | 仅维护在 `video_extract.cjs` 顶部的常量，改名要找全部调用方 |
| 接口 | 必传 | `POST /api/video/cnSimpleExtract` | 路径改了脚本就废，注意服务端路由 |
| Header | 必传 | `KdSystem=GreenVideo` | 这串改了脚本就废 |
| IV | 固定 | `a2Vkb3VAODk4OSE2MzIzMw==`（base64），明文 `kedou@8989!63233` | 服务端硬编码，不应变更；变更就废 |
| 公钥 | 动态 | `GET /api/auth/keys` 返回的 `k1` | 每次 5 分钟过期 |
| 加密 AES key | 动态 | `/auth/keys` 返回的 `k2`（用私钥加密） | 客户端用公钥还原 |

---

## 3. 客户端加密（脚本对应位置）

`video_extract.cjs` 内部按以下顺序执行，对应原前端 4 个 JS 文件：

| 步骤 | 对应原前端 | 脚本函数 | 行为 |
|------|-----------|---------|------|
| 1. Cookie | `C8YVeVYM.js` 首页 | `fetchBaseUrl()` | GET 首页拿 Set-Cookie |
| 2. 公钥+AES | `CuWTknZj.js` useReqPublicKey | `fetchKeys()` | GET /api/auth/keys，存 k1、k2 |
| 3. 还原 AES | `D7yAekyA.js` 白名单 | `decryptByPublicKey(k2)` | RSA doPublic（PKCS#1 v1.5） |
| 4. AES 加密 body | `Cnx7Ipy2-1.js` aesEncryptString | `aesEncryptString(plain, aesKey)` | AES-128-CBC + PKCS7 |
| 5. RSA 分段加密 | `Cnx7Ipy2-1.js` encryptLongByPublicKey | `encryptLongByPublicKey(step1, k1)` | 117 字符切片（1024 bit - 11 padding），每段 RSA encrypt，base64 拼接 |
| 6. POST | `C8YVeVYM.js` w() | `postExtract(body)` | 发请求，解析返回 |

**关键细节**（出问题先看这些）：

- **RSA 分段长度 117 = 1024/8 - 11**：如果服务端换了 2048 位 RSA，分段要改成 245
- **RSA padding 是 PKCS#1 v1.5**（不是 OAEP）：和 JSEncrypt 默认行为一致
- **AES IV 是常量**：base64 解码后正好 16 字节（`kedou@8989!63233` 长度 16）
- **白名单接口**：只 `/video/cnSimpleExtract`、`/video/extract/v2`、`/message/report` 走加密，其他接口不加密 —— 抓包时区分清楚

---

## 4. 抓包排查清单

当 `--replay` 也失败时，AI 应引导用户提供以下抓包信息（**只让用户提供 body 字符串本身，不要截图整个请求**）：

1. POST `/api/video/cnSimpleExtract` 请求的 **body 字符串**（DevTools → Network → Payload 标签）
2. 同请求的 `KdSystem` header 值
3. 响应状态码和响应 body 前 200 字符

**不要让用户提供**：cookie、token、登录信息等敏感数据。

---

## 5. 故障模式速查

| 现象 | 可能原因 | AI 应做的动作 |
|------|---------|--------------|
| `code=530` | 公钥过期 | 重跑脚本 |
| `code=530` 重跑仍失败 | 加密 body 与抓包不一致 | 引导用 `--replay` 比对 |
| `code=200` 但 videoItemVoList 为空 | 输入文本不完整（抖音最常见） | 提示用户提供完整分享文本 |
| 超时 60s | 服务端慢 | 提示重试 1~2 次 |
| `canDirectDownload=false` 担心不能下载 | 该字段不可靠 | 实测：小红书/抖音/公众号可直接 curl；B 站需 Referer |
| B 站 403 | 缺 Referer | curl 加 `-H "Referer: https://www.bilibili.com"` |
| 同一 B 站链接解析出多条结果 | B 站同视频多码率流 | 告知用户对比 `bw` 字段选高清 |
| 公众号 content.md 没生成 | 接口没返回 markdown 项 | 检查接口返回的 items 是否有 `markdown文本` 字段 |
| 公众号图片没本地化 | mmbiz 链接没出现在 markdown 中 | 检查 markdown 源文，确认图片用 `![...](https://mmbiz.qpic.cn/...)` 形式 |

---

## 6. 不在这份文档范围

- **脚本整体使用**：见 `SKILL.md` 的 Quick Start
- **下载目录规范**：见 `SKILL.md` 的 Step 6
- **接口返回 JSON 结构**：脚本直接打印，无需文档
