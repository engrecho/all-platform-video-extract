#!/usr/bin/env node
/**
 * greenvideo.cc /api/video/cnSimpleExtract 调用脚本
 *
 * 功能：
 *   1) 自动访问 greenvideo.cc 获取 cookie（网站免登录）
 *   2) 复刻前端加密流程（AES-128-CBC + RSA-1024）
 *   3) 调用 /api/video/cnSimpleExtract 解析视频
 *
 * 用法：
 *   加密模式（推荐）：node greenvideo_extract.cjs "<视频分享文本或URL>"
 *   重放模式：          node greenvideo_extract.cjs --replay "<抓包 body>"
 *   交互模式：          node greenvideo_extract.cjs
 *
 * 加密流程（复刻 Cnx7Ipy2-1.js / D7yAekyA.js）：
 *   1) GET /api/auth/keys        -> { k1: 公钥(base64), k2: RSA加密的AES密钥(base64) }
 *   2) aesKey = publicDecrypt(k2)  // 用公钥 RSA 解密得到 AES key
 *   3) step1 = AES-128-CBC( JSON.stringify({url,list,pageNo,pageSize}), aesKey, IV )
 *   4) final = RSA-encryptLong(step1)  // JSEncrypt.encryptLong，117字符/段
 *   5) POST /api/video/cnSimpleExtract, body=final
 *
 * 依赖：仅 node 内置模块（crypto, fetch/undici）
 * 注意：- 解析视频通常 3~15 秒，脚本默认超时 60s
 *       - /auth/keys 的公钥有效期约 5 分钟，超时需要重新拉取
 *       - cookie 自动从 https://greenvideo.cc/ 获取，无需手动提供
 */

const crypto = require('crypto');

const HOST   = 'https://greenvideo.cc';
const IV_B64 = 'a2Vkb3VAODk4OSE2MzIzMw==';  // 固定 IV: 'kedou@8989!63233'

// -------- 自动获取 Cookie --------

async function fetchCookie() {
  const r = await fetch(HOST + '/', {
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'zh-CN,zh;q=0.9',
    },
  });
  if (r.status !== 200) throw new Error(`访问首页失败 status=${r.status}`);
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.raw()['set-cookie'] || []);
  if (!setCookies.length) {
    console.warn('  [warn] 首页未返回 Set-Cookie，将尝试不带 cookie 调用');
    return '';
  }
  // 拼接为请求用的 cookie 字符串
  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log(`  [cookie] 获取到 ${setCookies.length} 个 cookie`);
  return cookieStr;
}

// -------- 加密流程 --------

// RSA 公钥解密（PKCS#1 v1.5，用公钥做 doPublic 运算）
function decryptByPublicKey(k2Base64, publicPem) {
  const buf = Buffer.from(k2Base64, 'base64');
  const key = crypto.createPublicKey(publicPem);
  return crypto.publicDecrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, buf).toString('utf8');
}

// AES-128-CBC + PKCS7，输出 base64（等价 CryptoJS.AES.encrypt）
function aesEncryptString(plainJson, aesKeyUtf8, ivBase64) {
  const iv  = Buffer.from(ivBase64, 'base64');
  const key = Buffer.from(aesKeyUtf8, 'utf8');
  const algo = `aes-${key.length * 8}-cbc`;
  const enc = crypto.createCipheriv(algo, key, iv);
  return enc.update(plainJson, 'utf8', 'base64') + enc.final('base64');
}

// JSEncrypt.encryptLong 正确复刻
// 关键：JSEncrypt 的 E 函数（hex2b64）是自定义 base64，
//       每 3 个 hex 字符（12 bits）转为 2 个 base64 字符
//       不能用标准的 Buffer.from(hex, 'hex').toString('base64')
const F_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function E_hex2b64(hex) {
  let i, n, o = '';
  for (i = 0; i + 3 <= hex.length; i += 3) {
    n = parseInt(hex.substring(i, i + 3), 16);
    o += F_CHARSET.charAt(n >> 6) + F_CHARSET.charAt(n & 63);
  }
  if (i + 1 === hex.length) {
    n = parseInt(hex.substring(i, i + 1), 16);
    o += F_CHARSET.charAt(n << 2);
  } else if (i + 2 === hex.length) {
    n = parseInt(hex.substring(i, i + 2), 16);
    o += F_CHARSET.charAt(n >> 2) + F_CHARSET.charAt((n & 3) << 4);
  }
  while ((o.length & 3) > 0) o += '=';
  return o;
}

function encryptLongBase64(plainBase64, publicPem) {
  const keyObj = crypto.createPublicKey(publicPem);
  const parts = plainBase64.match(/.{1,117}/g);
  let allHex = '';
  for (const p of (parts || [])) {
    // JSEncrypt 把 base64 字符串当 UTF-8 字节送入 RSA 加密
    const bytes = Buffer.from(p, 'utf8');
    const enc = crypto.publicEncrypt(
      { key: keyObj, padding: crypto.constants.RSA_PKCS1_PADDING },
      bytes
    );
    allHex += enc.toString('hex');
  }
  return E_hex2b64(allHex);
}

// -------- API 调用 --------

async function fetchKeys(cookie) {
  const r = await fetch(`${HOST}/api/auth/keys`, {
    method: 'GET',
    headers: { 'cookie': cookie, 'user-agent': 'Mozilla/5.0' },
  });
  if (r.status !== 200) throw new Error(`拉 /auth/keys 失败 status=${r.status}`);
  const j = await r.json();
  if (j.code !== 200) throw new Error('/auth/keys 返回非 200: ' + JSON.stringify(j));
  const { k1, k2 } = j.data;
  const k1Pem = '-----BEGIN PUBLIC KEY-----\n' + k1.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----\n';
  const aesKey = decryptByPublicKey(k2, k1Pem);
  return { k1Pem, aesKey };
}

async function encryptAndCall(inputUrl, cookie) {
  console.log('\n[1/5] 获取 cookie ...');
  const finalCookie = cookie || await fetchCookie();

  console.log('[2/5] GET /auth/keys ...');
  const { k1Pem, aesKey } = await fetchKeys(finalCookie);
  console.log(`      AES key = ${JSON.stringify(aesKey)} (${Buffer.byteLength(aesKey, 'utf8')} 字节)`);

  const bodyObj = { url: inputUrl, list: undefined, pageNo: undefined, pageSize: undefined };
  const bodyJson = JSON.stringify(bodyObj);
  console.log(`[3/5] body JSON 长度 = ${Buffer.byteLength(bodyJson, 'utf8')} 字节`);

  const step1 = aesEncryptString(bodyJson, aesKey, IV_B64);
  console.log(`[4/5] AES 输出 base64 长度 = ${step1.length}`);

  const final = encryptLongBase64(step1, k1Pem);
  console.log(`[5/5] 最终加密 body 长度 = ${final.length} 字符`);

  const headers = {
    'accept': 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'cookie': finalCookie,
    'dnt': '1',
    'kdsystem': 'GreenVideo',
    'origin': HOST,
    'priority': 'u=1, i',
    'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('客户端超时 60s')), 60000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${HOST}/api/video/cnSimpleExtract`, {
      method: 'POST',
      headers,
      body: final,
      signal: ac.signal,
    });
    const txt = await r.text();
    const t1 = Date.now();
    console.log(`\n>>> POST 状态 = ${r.status}  耗时 = ${t1 - t0} ms`);
    return { status: r.status, text: txt, time: t1 - t0 };
  } finally {
    clearTimeout(timer);
  }
}

async function replayBody(encryptedBody, cookie) {
  const finalCookie = cookie || await fetchCookie();
  const headers = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'cookie': finalCookie,
    'kdsystem': 'GreenVideo',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('客户端超时 60s')), 60000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${HOST}/api/video/cnSimpleExtract`, {
      method: 'POST',
      headers,
      body: encryptedBody,
      signal: ac.signal,
    });
    const txt = await r.text();
    const t1 = Date.now();
    console.log(`\n>>> POST 状态 = ${r.status}  耗时 = ${t1 - t0} ms`);
    return { status: r.status, text: txt, time: t1 - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// -------- 入口 --------

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
用法：
  加密模式（推荐）：node greenvideo_extract.cjs "<视频分享文本或URL>"
  重放模式：          node greenvideo_extract.cjs --replay "<抓包 body>"
  交互模式：          node greenvideo_extract.cjs

示例：
  node greenvideo_extract.cjs "8.94 复制打开抖音，看看【高逊丨Ai行业全案的作品】..."
  node greenvideo_extract.cjs "https://www.bilibili.com/video/BV1ypdgBCE9B/"

输出：
  成功（code=200）时，会打印 videoItemVoList 中各清晰度的下载链接
  失败（code=530）时，说明加密 body 与服务端期望不一致，可尝试 --replay 模式重放浏览器抓包的 body
`);
    process.exit(0);
  }

  const isJsonMode = args.includes('--json');
  const argsNoFlag = args.filter(a => a !== '--json');

  let result;
  try {
    if (argsNoFlag[0] === '--replay') {
      const body = argsNoFlag.slice(1).join(' ');
      if (!body) { console.error('错误：--replay 需要传入抓包的 body 字符串'); process.exit(1); }
      result = await replayBody(body);
    } else {
      const inputUrl = argsNoFlag.join(' ');
      result = await encryptAndCall(inputUrl);
    }
  } catch (e) {
    if (e.name === 'AbortError' || e.message?.includes('超时')) {
      console.error('\n!! 请求超时（60s），视频解析时间较长，可尝试重试');
    } else {
      console.error('\n!! 失败 !!', e.message || e);
    }
    process.exit(1);
  }

  // --json 模式：只把原始 JSON 输出到 stdout（用特殊 marker 分隔），所有日志走 stderr
  if (isJsonMode) {
    try {
      const j = JSON.parse(result.text);
      console.log('__GV_JSON_BEGIN__');
      console.log(JSON.stringify(j));
      console.log('__GV_JSON_END__');
    } catch (e) {
      console.error('!! 响应非 JSON：', e.message);
      process.exit(1);
    }
    return;
  }

  console.log('\n=== 接口返回 ===');
  console.log('status:', result.status);
  try {
    const j = JSON.parse(result.text);
    console.log('code:', j.code, '  message:', j.message || '');
    if (j.code === 200 && j.data) {
      console.log('vid:', j.data.vid, '  host:', j.data.host, '  title:', j.data.displayTitle || '');
      const items = j.data.videoItemVoList || [];
      console.log(`\n共 ${items.length} 个清晰度：`);
      for (const v of items) {
        console.log(`  [${v.qualityAlias || v.quality}] ${v.fileType}  size=${(v.size / 1024 / 1024).toFixed(1)}MB  direct=${v.canDirectDownload}`);
        console.log(`    ${v.baseUrl}`);
      }
    } else if (j.code === 530) {
      console.log('\n!! code=530：加密验证失败');
      console.log('   可能原因：1) /auth/keys 公钥过期（>5分钟） 2) 输入的 URL 文本与浏览器实际发送的不一致');
      console.log('   建议：用浏览器抓包拿到加密 body，然后用 --replay 模式重放');
    }
  } catch (e) {
    console.log('raw:', result.text);
  }
}

main().catch(e => {
  console.error('!! 未捕获错误 !!', e);
  process.exit(1);
});
