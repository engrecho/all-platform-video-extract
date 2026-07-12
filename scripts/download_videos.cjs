#!/usr/bin/env node
/**
 * all-platform-video-extract 下载脚本
 *
 * 解析一个或多个视频链接，把所有可下载资源按规范保存到本地。
 *
 * 用法：
 *   node download_videos.cjs "<分享文本1>" ["<分享文本2>" ...]
 *   node download_videos.cjs < urlfile.txt      （每行一个链接/分享文本）
 *
 * 配置文件：
 *   ~/.extract_video_config.json
 *   {
 *     "outputDir": "~/extract_video",
 *     "maxParallel": 3,
 *     "downloadInterval": 3
 *   }
 *   首次运行时由 AI 创建，脚本自动读取。
 *   环境变量 GV_OUTPUT 可覆盖配置文件的 outputDir。
 *
 * 目录命名规范（解决长路径问题）：
 *   <输出根目录>/<平台>-<vid>-<标题截断>/
 *     ├── info.json              # 视频元信息
 *     ├── cover.<ext>            # 封面
 *     ├── video.mp4              # 视频（如有）
 *     ├── audio.mp3              # 音频（如有）
 *     ├── image-001.jpg          # 第 1 张图（如有）
 *     ├── ...
 *     └── content.md             # 公众号/文章类，markdown + 图片本地化
 *
 * 多任务并行限制：
 *   - 最大并行数：3（同时最多处理 3 个视频）
 *   - 下载间隔：3 秒（每个视频之间间隔 3s）
 *
 * 行为：调用 video_extract.cjs 解析后，逐个下载 + 公众号生成 MD。
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const { URL } = require('url');

const SKILL_DIR = path.resolve(__dirname);
const EXTRACT_SCRIPT = path.join(SKILL_DIR, 'video_extract.cjs');
const NODE_BIN = process.env.GV_NODE || require('child_process').execSync('which node').toString().trim();

const TITLE_MAX = 60;          // 标题部分最多 60 字符
const DOWNLOAD_TIMEOUT = 60000; // 单文件下载 60s
const MAX_CONCURRENCY = 3;     // 单个视频内文件下载并发数

// 默认值，可被配置文件覆盖
const DEFAULT_MAX_PARALLEL = 3;
const DEFAULT_INTERVAL_SEC = 3;

// ---------- 配置文件 ----------

const CONFIG_PATH = path.join(os.homedir(), '.extract_video_config.json');

function resolveHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getConfig() {
  const cfg = readConfig() || {};
  return {
    outputDir: process.env.GV_OUTPUT
      ? resolveHome(process.env.GV_OUTPUT)
      : (cfg.outputDir ? resolveHome(cfg.outputDir) : path.join(os.homedir(), 'extract_video')),
    maxParallel: typeof cfg.maxParallel === 'number' && cfg.maxParallel > 0 ? cfg.maxParallel : DEFAULT_MAX_PARALLEL,
    downloadInterval: typeof cfg.downloadInterval === 'number' && cfg.downloadInterval >= 0 ? cfg.downloadInterval : DEFAULT_INTERVAL_SEC,
  };
}

const _config = getConfig();
const OUTPUT_ROOT = _config.outputDir;
const MAX_VIDEO_PARALLEL = _config.maxParallel;
const VIDEO_INTERVAL = _config.downloadInterval * 1000; // 转为毫秒

// ---------- 工具函数 ----------

function sanitizeTitle(title) {
  if (!title) return 'untitled';
  let t = String(title).replace(/<[^>]+>/g, '');
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}]/gu, '');
  t = t.replace(/[\\/:*?"<>|\uFF5C\u2502]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

// 单个视频内文件并发下载
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

// 多视频并行控制（最大并行数 + 间隔）
async function runVideosWithLimit(inputs, processor) {
  const results = new Array(inputs.length);
  let nextIdx = 0;
  let activeCount = 0;
  let launchIdx = 0;

  return new Promise((resolve) => {
    const launchNext = () => {
      // 达到最大并行或没有更多任务时停止启动
      while (activeCount < MAX_VIDEO_PARALLEL && launchIdx < inputs.length) {
        const idx = launchIdx++;
        activeCount++;

        // 非第一个任务，延迟启动
        const delay = idx > 0 ? VIDEO_INTERVAL : 0;
        setTimeout(() => {
          processor(inputs[idx], idx)
            .then(r => { results[idx] = r; })
            .catch(e => { results[idx] = { input: inputs[idx], ok: false, reason: e.message }; })
            .finally(() => {
              activeCount--;
              if (launchIdx < inputs.length) {
                launchNext();
              } else if (activeCount === 0) {
                resolve(results);
              }
            });
        }, delay);
      }
    };
    launchNext();
  });
}

// ---------- 调用 extract 脚本 ----------

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

  // 给一些 platform 的视频加 Referer
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

  // 公众号 markdown
  if (markdownItems.length > 0) {
    const realMd = markdownItems.filter(it => {
      const t = String(it.baseUrl || '');
      return /(^|\n)#{1,6}\s|^!\[|]\(http/m.test(t);
    });
    if (realMd.length === 0) {
      console.log(`  [3/3] markdown 项只是标题文本，已跳过 content.md 生成`);
    } else {
      console.log(`  [3/3] 生成 content.md（${realMd.length} 个 markdown 文本）...`);
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
    const urlToFile = new Map();
    const allFiles = fs.readdirSync(dir);
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

配置文件：
  ~/.extract_video_config.json
  { "outputDir": "~/extract_video", "maxParallel": 3, "downloadInterval": 3 }

环境变量：
  GV_OUTPUT    输出根目录（覆盖配置文件）

并行限制（从配置文件读取，以上为默认值）：
  maxParallel       最大并行数
  downloadInterval  每个视频间隔（秒）

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
  console.log(`配置文件: ${CONFIG_PATH}`);
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  if (inputs.length === 1) {
    // 单个视频，直接处理
    const results = [];
    try {
      const r = await processOne(inputs[0]);
      results.push(r);
    } catch (e) {
      console.log(`  !! 异常: ${e.message}`);
      results.push({ input: inputs[0], ok: false, reason: e.message });
    }
    printSummary(results);
  } else {
    // 多个视频，并行控制
    console.log(`\n共 ${inputs.length} 个视频，最大并行 ${MAX_VIDEO_PARALLEL}，间隔 ${VIDEO_INTERVAL / 1000}s\n`);
    const results = await runVideosWithLimit(inputs, async (input) => {
      try {
        return await processOne(input);
      } catch (e) {
        console.log(`  !! 异常: ${e.message}`);
        return { input, ok: false, reason: e.message };
      }
    });
    printSummary(results);
  }
}

function printSummary(results) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`汇总: 共处理 ${results.length} 个，${results.filter(r => r.ok).length} 个成功`);
  for (const r of results) {
    if (r.ok) console.log(`  [OK]   ${r.host}/${r.vid}  -> ${r.dir}`);
    else console.log(`  [FAIL] ${r.input.slice(0, 50)}...  (${r.reason})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
