#!/usr/bin/env node
/**
 * greenvideo-extract 下载脚本
 *
 * 解析一个或多个视频链接，把所有可下载资源按规范保存到本地。
 *
 * 用法：
 *   node download_videos.cjs "<分享文本1>" ["<分享文本2>" ...]
 *   node download_videos.cjs < urlfile.txt      （每行一个链接/分享文本）
 *
 * 目录命名规范（解决长路径问题）：
 *   <输出根目录>/<平台>-<vid>-<标题截断>/
 *     ├── info.json              # 视频元信息（title/host/vid/code/message/原始时间戳）
 *     ├── cover.<ext>            # 封面（按实际扩展名）
 *     ├── video.mp4              # 视频（如有）
 *     ├── audio.mp3              # 音频（如有）
 *     ├── image-001.jpg          # 第 1 张图（如有）
 *     ├── image-002.jpg
 *     ├── ...
 *     └── content.md             # 公众号/文章类平台，markdown 文本独立保存；图片链接替换为相对路径
 *
 * 标题截断策略（macOS APFS 兼容 + 同步盘安全）：
 *   - 截取前 60 个字符
 *   - 移除文件系统非法字符：/ \ : * ? " < > |
 *   - 合并连续空白为一个空格
 *   - 去除首尾空白
 *   - 整目录名控制在 ~120 字符以内
 *
 * 行为：调用 greenvideo_extract.cjs 解析后，逐个下载 + 公众号生成 MD。
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const SKILL_DIR = path.resolve(__dirname);
const EXTRACT_SCRIPT = path.join(SKILL_DIR, 'greenvideo_extract.cjs');
const OUTPUT_ROOT = process.env.GV_OUTPUT || path.join(process.cwd(), 'gv_downloads');
const NODE_BIN = process.env.GV_NODE || '/Users/jaylon/.workbuddy/binaries/node/versions/22.22.2/bin/node';

const TITLE_MAX = 60;          // 标题部分最多 60 字符
const DOWNLOAD_TIMEOUT = 60000; // 单文件下载 60s
const MAX_CONCURRENCY = 4;

// ---------- 工具函数 ----------

function sanitizeTitle(title) {
  if (!title) return 'untitled';
  // 去掉 HTML 标签
  let t = String(title).replace(/<[^>]+>/g, '');
  // 去掉表情符号等高 unicode（保留中文/英文字符）
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}]/gu, '');
  // 移除文件系统非法字符（含全角/半角变体，跨平台安全）
  t = t.replace(/[\\/:*?"<>|\uFF5C\u2502]/g, ' ');
  // 合并空白
  t = t.replace(/\s+/g, ' ').trim();
  // 截断
  if (t.length > TITLE_MAX) t = t.slice(0, TITLE_MAX).trim();
  return t || 'untitled';
}

function dirName(host, vid, title) {
  const safeTitle = sanitizeTitle(title);
  return `${host}-${vid}-${safeTitle}`;
}

function extFromUrl(url, fallback) {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p.includes('mp4')) return 'mp4';
    if (p.includes('mp3')) return 'mp3';
    if (p.includes('png')) return 'png';
    if (p.includes('jpg') || p.includes('jpeg')) return 'jpg';
    if (p.includes('webp')) return 'webp';
    if (p.includes('gif')) return 'gif';
  } catch {}
  return fallback || 'bin';
}

function downloadFile(url, destPath, headers = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(new Error('Invalid URL: ' + url)); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
    };
    const req = lib.request(parsed, opts, (res) => {
      // 跟随 3xx 重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, parsed).toString();
        res.resume();
        return downloadFile(redirect, destPath, headers).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ size: fs.statSync(destPath).size })));
      file.on('error', reject);
    });
    req.setTimeout(DOWNLOAD_TIMEOUT, () => {
      req.destroy(new Error('Download timeout: ' + url));
    });
    req.on('error', reject);
    req.end();
  });
}

// 并发控制
async function pMap(items, mapper, concurrency = MAX_CONCURRENCY) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await mapper(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- 调用 extract 脚本（用 --json 模式拿原始 JSON） ----------

function callExtract(input) {
  try {
    const stdout = execFileSync(NODE_BIN, [EXTRACT_SCRIPT, '--json', input], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return stdout;
  } catch (e) {
    throw new Error(`extract 失败: ${e.message}\nstderr: ${e.stderr || ''}`);
  }
}

/**
 * 从 extract 脚本的 --json 模式输出中解析出原始接口返回。
 * 脚本会用 marker 分隔：__GV_JSON_BEGIN__ ... __GV_JSON_END__
 */
function parseExtractJson(out) {
  const beginIdx = out.indexOf('__GV_JSON_BEGIN__');
  const endIdx = out.indexOf('__GV_JSON_END__');
  if (beginIdx < 0 || endIdx < 0) {
    throw new Error('extract 输出未找到 JSON marker，可能解析失败');
  }
  const jsonStr = out.slice(beginIdx + '__GV_JSON_BEGIN__'.length, endIdx).trim();
  const j = JSON.parse(jsonStr);
  const d = j.data || {};
  const rawItems = d.videoItemVoList || [];
  return {
    code: String(j.code),
    message: j.message || '',
    vid: d.vid || '',
    host: d.host || '',
    title: d.displayTitle || d.title || '',
    items: rawItems.map(v => ({
      quality: v.qualityAlias || String(v.quality || ''),
      fileType: v.fileType,
      size: v.size,
      canDirectDownload: v.canDirectDownload,
      baseUrl: v.baseUrl,
    })),
  };
}

/**
 * 从 extract 脚本输出中解析出接口返回的 JSON。
 * 脚本输出形如：
 *   ...
 *   === 接口返回 ===
 *   status: 200
 *   code: 200   message: 操作成功
 *   vid: xxx  host: yyy  title: zzz
 *   共 N 个清晰度：
 *     [xxx] yyy  size=...
 *       https://...
 *     [xxx] yyy  size=...
 *       https://...
 */
function parseExtractOutput(out) {
  const lines = out.split('\n');
  let code = null, message = '', vid = '', host = '', title = '';
  const items = [];
  let inItems = false;
  let pendingItem = null;

  for (const ln of lines) {
    const m1 = ln.match(/^code:\s*(\S+)\s+message:\s*(.*)$/);
    if (m1) { code = m1[1]; message = m1[2].trim(); continue; }
    const m2 = ln.match(/^vid:\s*(\S+)\s+host:\s*(\S+)\s+title:\s*(.*)$/);
    if (m2) { vid = m2[1]; host = m2[2]; title = m2[3].trim(); continue; }
    if (/^共 \d+ 个/.test(ln)) { inItems = true; continue; }
    if (inItems) {
      const itemMatch = ln.match(/^\s*\[(.+?)\]\s+(\S+)\s+size=([\d.]+)MB\s+direct=(\S+)\s*$/);
      if (itemMatch) {
        if (pendingItem) items.push(pendingItem);
        pendingItem = {
          quality: itemMatch[1],
          fileType: itemMatch[2],
          size: parseFloat(itemMatch[3]),
          canDirectDownload: itemMatch[4] === 'true',
          baseUrl: null,
        };
      } else if (pendingItem) {
        const urlMatch = ln.match(/^\s*(https?:\/\/\S+)\s*$/);
        if (urlMatch) {
          pendingItem.baseUrl = urlMatch[1];
        }
      }
    }
  }
  if (pendingItem) items.push(pendingItem);
  return { code, message, vid, host, title, items };
}

// ---------- 单个视频处理 ----------

async function processOne(input) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`处理: ${input.slice(0, 80)}${input.length > 80 ? '...' : ''}`);
  const t0 = Date.now();

  console.log('  [1/3] 解析中...');
  const out = callExtract(input);
  const r = parseExtractJson(out);

  if (r.code !== '200') {
    console.log(`  !! 解析失败 code=${r.code} ${r.message}`);
    return { input, ok: false, reason: `code=${r.code}` };
  }

  if (!r.vid || !r.host) {
    console.log('  !! 无法识别 vid/host，跳过');
    return { input, ok: false, reason: 'no vid/host' };
  }

  const dir = path.join(OUTPUT_ROOT, dirName(r.host, r.vid, r.title));
  fs.mkdirSync(dir, { recursive: true });
  console.log(`  [目录] ${dir}`);

  // 保存 info.json
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({
    input, host: r.host, vid: r.vid, title: r.title, code: r.code, message: r.message,
    items: r.items, fetchedAt: new Date().toISOString(),
  }, null, 2), 'utf8');

  // 给一些 platform 的视频加 Referer（B 站已知需要）
  const refererMap = {
    bilibili: 'https://www.bilibili.com',
  };
  const extraHeaders = refererMap[r.host] ? { 'Referer': refererMap[r.host] } : {};

  // 分类：视频/音频/封面/图片/markdown
  const tasks = [];
  let videoIdx = 0, audioIdx = 0, imageIdx = 0;
  const markdownItems = [];

  for (const item of r.items) {
    if (!item.baseUrl) continue;
    const ftype = item.fileType;
    const qa = (item.quality || '').toLowerCase();
    let target = null, category = null;
    if (ftype === 'video' && qa.includes('markdown')) {
      markdownItems.push(item);
    } else if (ftype === 'video' && !qa.includes('封面') && !qa.includes('图片')) {
      videoIdx++;
      target = videoIdx === 1 ? 'video.mp4' : `video-${String(videoIdx).padStart(2,'0')}.${extFromUrl(item.baseUrl, 'mp4')}`;
      category = 'video';
    } else if (ftype === 'audio') {
      audioIdx++;
      target = audioIdx === 1 ? 'audio.mp3' : `audio-${String(audioIdx).padStart(2,'0')}.${extFromUrl(item.baseUrl, 'mp3')}`;
      category = 'audio';
    } else if (qa.includes('封面') || qa.includes('cover')) {
      const ext = extFromUrl(item.baseUrl, 'jpg');
      target = `cover.${ext}`;
      category = 'cover';
    } else if (ftype === 'image' || qa.includes('图片')) {
      imageIdx++;
      const ext = extFromUrl(item.baseUrl, 'jpg');
      target = `image-${String(imageIdx).padStart(3,'0')}.${ext}`;
      category = 'image';
    } else {
      // 未分类，放 loose
      imageIdx++;
      const ext = extFromUrl(item.baseUrl, 'bin');
      target = `image-${String(imageIdx).padStart(3,'0')}.${ext}`;
      category = 'image';
    }
    if (target) tasks.push({ item, target, category, headers: extraHeaders });
  }

  console.log(`  [2/3] 下载 ${tasks.length} 个文件...`);
  await pMap(tasks, async ({ item, target, category, headers }) => {
    const dest = path.join(dir, target);
    try {
      const { size } = await downloadFile(item.baseUrl, dest, headers);
      console.log(`    [OK] ${target.padEnd(28)} ${(size/1024).toFixed(1)}KB  [${category}]`);
    } catch (e) {
      console.log(`    [FAIL] ${target.padEnd(28)} ${e.message}`);
    }
  });

  // 公众号/文章的 markdown 文本：直接使用接口返回的 baseUrl 字段（本身就是 markdown 文本），不需下载
  // 仅当内容含真正的 markdown 标记（# 标题/![]图片/[]()链接）时才生成 content.md
  if (markdownItems.length > 0) {
    const realMd = markdownItems.filter(it => {
      const t = String(it.baseUrl || '');
      return /(^|\n)#{1,6}\s|^!\[|]\(http/m.test(t);
    });
    if (realMd.length === 0) {
      console.log(`  [3/3] markdown 项只是标题文本，已跳过 content.md 生成`);
    } else {
      console.log(`  [3/3] 生成 content.md（${realMd.length} 个 markdown 文本）...`);
    // 从 info.json 重建 URL → 本地文件名映射（精确匹配）
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
    const urlToFile = new Map();
    const allFiles = fs.readdirSync(dir);
    for (const item of info.items) {
      // 找到对应的本地文件
      // 简单策略：按 item 在原数组的顺序 + imageFiles 的字典序匹配
      // 实际上 download 阶段会保持 items 顺序，文件名按 imageIdx 递增
    }
    // 用 items 顺序直接构建映射：按 items 顺序，image-NNN 文件按 NNN 升序排列
    const imageFiles = allFiles.filter(f => /^image-\d+\./.test(f)).sort();
    const urlOrdered = [];
    for (const item of info.items) {
      if (item.fileType === 'image' || (item.quality || '').toLowerCase().includes('图片')) {
        urlOrdered.push(item.baseUrl);
      }
    }
    for (let i = 0; i < urlOrdered.length && i < imageFiles.length; i++) {
      urlToFile.set(urlOrdered[i], imageFiles[i]);
    }

    for (let k = 0; k < realMd.length; k++) {
      const item = realMd[k];
      try {
        let md = String(item.baseUrl || '');
        const mdImgUrls = [...new Set(md.match(/https:\/\/mmbiz\.qpic\.cn\/[^\s\)\]]+/g) || [])];
        let replaced = 0;
        for (const mUrl of mdImgUrls) {
          const local = urlToFile.get(mUrl);
          if (local) {
            md = md.split(mUrl).join(local);
            replaced++;
          }
        }
        const mdName = k === 0 ? 'content.md' : `content-${k+1}.md`;
        fs.writeFileSync(path.join(dir, mdName), md, 'utf8');
        console.log(`    [OK] ${mdName}（${(md.length/1024).toFixed(1)}KB，${replaced}/${mdImgUrls.length} 张图片本地化）`);
      } catch (e) {
        console.log(`    [FAIL] markdown #${k}: ${e.message}`);
      }
    }
    }
  } else {
    console.log(`  [3/3] 无 markdown 文本`);
  }

  const t1 = Date.now();
  console.log(`  完成: 耗时 ${((t1-t0)/1000).toFixed(1)}s`);
  return { input, ok: true, dir, host: r.host, vid: r.vid, title: r.title };
}

// ---------- 入口 ----------

async function main() {
  let inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.log(`用法：
  node download_videos.cjs "<分享文本或URL>" ["<更多>" ...]
  node download_videos.cjs < urlfile.txt    # 每行一个链接/分享文本

环境变量：
  GV_OUTPUT    输出根目录（默认 ./gv_downloads）
  GV_NODE      Node 二进制路径（默认 /Users/jaylon/.workbuddy/binaries/node/versions/22.22.2/bin/node）

目录命名：<平台>-<vid>-<标题截断60字>/
`);
    process.exit(0);
  }
  // 支持从文件读
  if (inputs.length === 1 && fs.existsSync(inputs[0]) && fs.statSync(inputs[0]).isFile()) {
    const text = fs.readFileSync(inputs[0], 'utf8');
    inputs = text.split('\n').map(s => s.trim()).filter(Boolean);
  }

  console.log(`输出根目录: ${OUTPUT_ROOT}`);
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const results = [];
  for (const input of inputs) {
    try {
      const r = await processOne(input);
      results.push(r);
    } catch (e) {
      console.log(`  !! 异常: ${e.message}`);
      results.push({ input, ok: false, reason: e.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`汇总: 共处理 ${results.length} 个，${results.filter(r => r.ok).length} 个成功`);
  for (const r of results) {
    if (r.ok) console.log(`  [OK]   ${r.host}/${r.vid}  -> ${r.dir}`);
    else console.log(`  [FAIL] ${r.input.slice(0, 50)}...  (${r.reason})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
