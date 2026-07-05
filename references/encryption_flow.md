# cnSimpleExtract 加密流程分析

> 目标：分析前端代码怎么把原始文本输入变成 `https://greenvideo.cc/api/video/cnSimpleExtract` POST 接口的加密 body，并完整复现。
> 不涉及解密服务端返回内容，只复现"如何加密"。

---

## 1. 关键代码位置

| 角色 | 文件 | 关键内容 |
|------|------|---------|
| 入口调用 | `C8YVeVYM.js` | 主页 `index.vue`，`w()` 里调 `l.extractVideoUrl({url: inputUrl, list, pageNo, pageSize})` |
| 业务 action | `CuWTknZj.js` | `extractVideoUrl(i)` 调 `C("/video/cnSimpleExtract", {method:"post", body:i})`；code===530 时 `await R().useReqPublicKey()` 后重试 |
| 请求封装 + 加密前置 | `D7yAekyA.js` | `Ko = async (e,o)=>{...}` 里的白名单分支（`/video/cnSimpleExtract` / `/video/extract/v2` / `/message/report`）执行加密 |
| 加密库 | `Cnx7Ipy2-1.js` | 末尾导出 `aesEncryptString / decryptByPublicKey / encryptLongByPublicKey`（基于 CryptoJS + JSEncrypt） |

---

## 2. 整体加密流程

```
                       ┌────────────────────────────────────────┐
   原始 inputUrl       │  step 0 构造 body                      │
   (例抖音分享文本) ──>│  body = { url, list, pageNo, pageSize }│
                       └───────────────┬────────────────────────┘
                                       │  POST /video/cnSimpleExtract (body 明文)
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  server 第一次：返回 { code: 530 }     │
                       │  → 触发 useReqPublicKey()              │
                       └───────────────┬────────────────────────┘
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  GET /auth/keys                        │
                       │  server 返回 { code:200, data:{k1,k2}} │
                       │    k1: PEM 公钥                        │
                       │    k2: 用私钥 PKCS#1 v1.5 加密的 AES key│
                       └───────────────┬────────────────────────┘
                                       │  store.publicKey = k1, store.k2 = k2
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  step 3 解 AES key                     │
                       │  aesKey = decryptByPublicKey(k2)       │
                       │  (= 用公钥 doPublic，把服务端私钥签的   │
                       │     一次性 AES key 还原)                │
                       └───────────────┬────────────────────────┘
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  step 4 AES 加密 body                  │
                       │  tmp = AES-CBC-PKCS7(                  │
                       │           JSON.stringify(body),        │
                       │           key = aesKey,               │
                       │           iv  = atob(                  │
                       │             "a2Vkb3VAODk4OSE2MzIzMw==")│
                       │        )                                │
                       │  → base64 字符串                       │
                       └───────────────┬────────────────────────┘
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  step 5 RSA 加密长文本                 │
                       │  final = encryptLongByPublicKey(tmp)   │
                       │  (= JSEncrypt.encryptLong，PKCS#1 v1.5 │
                       │     分段加密)                          │
                       └───────────────┬────────────────────────┘
                                       ▼
                       ┌────────────────────────────────────────┐
                       │  POST /video/cnSimpleExtract           │
                       │  body = final   (header.KdSystem=      │
                       │             "GreenVideo")              │
                       └────────────────────────────────────────┘
```

---

## 3. 关键常量 / 代码片段

### 3.1 白名单 + 加密逻辑（来自 `D7yAekyA.js` 第 101530 行附近）

```js
if (e.indexOf("/video/cnSimpleExtract")!==-1
 || e.indexOf("/video/extract/v2")!==-1
 || e.indexOf("/message/report")!==-1) {
  let { encryptLongByPublicKey, decryptByPublicKey, aesEncryptString } =
      await import("./Cnx7Ipy2.js");
  const h = decryptByPublicKey(r.k2);             // 1) 还原 AES 密钥
  let m = o.body;
  m = aesEncryptString(JSON.stringify(m), h, "a2Vkb3VAODk4OSE2MzIzMw=="); // 2) AES 加密
  m = encryptLongByPublicKey(m);                   // 3) RSA 长文本加密
  o.body = m;
}
```

> 整个加密前置逻辑就在 `Ko()` 的 onRequest 阶段里。`r` 是 pinia store（`un`），`r.k2` 来自 `useReqPublicKey()`。

### 3.2 `useReqPublicKey`（来自 `D7yAekyA.js` 第 1475 行附近）

```js
async useReqPublicKey() {
  const e = await Ko("/auth/keys", { method: "get" });
  if (e.code !== 200) return Promise.resolve(e.message);
  this.publicKey = e.data.k1;
  this.k2        = e.data.k2;
}
```

### 3.3 三个加密函数（来自 `Cnx7Ipy2-1.js` 第 183565 行附近）

```js
// mi: AES-CBC + PKCS7，key/iv 都用 Utf8.parse
const aesEncryptString = (a, e, t) => {
  const r = CryptoJS.enc.Utf8.parse(e);
  const s = CryptoJS.enc.Utf8.parse(atob(t));
  return CryptoJS.AES.encrypt(a, r, {
    iv: s, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
  }).toString();
};

// Fi: 用前端缓存的 publicKey 做 RSA 长文本加密
const encryptLongByPublicKey = (a) => {
  const e = hr();                                  // 取 store 里的 publicKey
  const t = new JSEncrypt();
  t.setPublicKey(e.publicKey);
  return t.encryptLong(a) + "";
};

// wi: 用 publicKey（公钥）解出 k2 的明文
//   —— 实际是 raw RSA doPublic：服务端先用私钥 PKCS#1 v1.5 type 1 加密，
//   客户端用公钥 doPublic 解出 PKCS#1 v1.5 type 1 block，再剥 padding 取明文。
const decryptByPublicKey = (a) => {
  const e = hr();
  const t = new JSEncrypt();
  t.setPublicKey(e.publicKey);
  const r = t.getKey();
  r.decrypt = function(s) {                       // 覆盖默认 decrypt，做 raw 解密
    const u = parse(s, 16);
    const l = this.doPublic(u);
    return l == null ? null : stripPkcs1(l, this.n.bitLength() + 7 >> 3);
  };
  return t.decrypt(a) + "";
};
```

### 3.4 入口 `extractVideoUrl`（来自 `CuWTknZj.js` 第 5216 行附近）

```js
async extractVideoUrl(i) {
  let o = await C("/video/cnSimpleExtract", { method: "post", body: i });
  if (o.code !== 200) {
    if (o.code === 530) {
      await R().useReqPublicKey();
      o = await C("/video/cnSimpleExtract", { method: "post", body: i });
      if (o.code !== 200) return Promise.reject(new Error(q(o.code, o.message)));
    } else {
      return Promise.reject(new Error(q(o.code, o.message)));
    }
  }
  this.videoExtractInfo = o.data;
}
```

注意：第二次重试时 `body: i` 还是原始明文对象，因为整个加密是在 `C / Ko` 的 onRequest 前置里完成的（`C` 是 `Ko` 的封装），跟调用方传的 body 是不是明文无关。

### 3.5 调用方传的 body 形状（来自 `C8YVeVYM.js` 的 `w()`）

```js
const n = { url: a.value, list: undefined, pageNo: undefined, pageSize: undefined };
await l.extractVideoUrl(n);
```

---

## 4. 重要细节 / 踩坑点

1. **首次请求一定返回 530**——这是协议设计，迫使客户端先拉公钥。
2. **`k2` 不是"被公钥加密的"，而是"被私钥加密的"**。所以 `decryptByPublicKey` 实际是调用 RSA 公钥指数 e 做 raw 解密（doPublic）。这种用法只有"服务端需要让客户端能解出明文、但又不想让客户端伪造"时才这么设计。
3. **IV 是常量** `a2Vkb3VAODk4OSE2MzIzMw==`，`atob` 后是 `kedou@8989!63233`（**16 字节，0 字符**），符合 AES-CBC IV 长度要求。key 才是随机的。
4. **RSA keySize**：从抓包 body 长度 ~516 base64 反推 1024-bit RSA（128 字节 = 172 base64），3 段说明 key 1024 bit。
5. **`KdSystem: GreenVideo`** header 是 `onRequest` 阶段必带的，业务路由校验会用到。
6. **白名单**：只有 `/video/cnSimpleExtract`、`/video/extract/v2`、`/message/report` 走加密。其它接口不加密。

---

## 5. 复现脚本

文件 `cnSimpleExtract_加密复现.cjs` 已经写好并跑通：

```
$ node cnSimpleExtract_加密复现.cjs
[+] k1 公钥前 60 字符 = -----BEGIN PUBLIC KEY----- ...
[+] k2 密文 (base64) = ...
[+] AES key 解出来 = s3cr3t-aes-key-A
[+] AES 加密后 (中间值) = rUAkycqqt1zGTvCeKM+ol0iU9+EH3WqENj3XwJvdaGhgC2YdGoY7JN7XW3co ... len= 256
[+] 最终 body (RSA) 前 60 字符 = ... len= 516
```

脚本里：

- 用 `node:crypto` 原生实现了 RSA 1024 + AES-128-CBC + PKCS#1 v1.5（不依赖 crypto-js / node-rsa / jsencrypt）。
- `encryptPrivateToPublic` 模拟服务端"用私钥加密 AES 密钥"（即 k2 的来源）。
- `clientDecryptByPublicKey` 还原客户端 `wi` 流程。
- `aesEncryptString` 等价于 CryptoJS.AES.encrypt（key/iv 走 Utf8.parse，mode CBC, padding PKCS7）。
- `encryptLongByPublicKey` 按 RSA keySize/11 分段加密，再拼成一段 base64，跟 JSEncrypt.encryptLong 行为一致。

> 真实环境下你只需要把 `serverIssueKeys` 改成调 `GET /auth/keys` 拿 `k1/k2`，其余加密流程不变；调用样例（对应你给的抖音文本）：

```js
const sample = '3.58 复制打开抖音，看看【_馬冬的作品】出门在外身份是自己给的！！ # 文静小女生 # 馬... https://v.douyin.com/q3Xf96DFFCk/ Iic:/ m@Q.xF 03/03';
const out = reproduce(sample);   // → 最终 body
// fetch("https://greenvideo.cc/api/video/cnSimpleExtract", {
//   method: "POST",
//   headers: { "content-type": "application/json", "kdsystem": "GreenVideo", ... },
//   body: out,
// })
```
