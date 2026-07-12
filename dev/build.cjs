#!/usr/bin/env node
/**
 * 明文构建 + 发布打包脚本
 *
 * 工作流：
 *   dev/SKILL.md        → release/SKILL.md        （直接复制）
 *   dev/scripts/*.cjs   → release/scripts/*.cjs    （直接复制，明文）
 *   release/            → release/skill.zip
 *
 * 用法：
 *   node dev/build.cjs              # 同步 + 打包 zip
 *   node dev/build.cjs --no-zip     # 同步，不打包
 *
 * 依赖：仅 Node.js 内置模块
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEV_DIR = path.join(__dirname, 'scripts');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');
const OUT_DIR = path.join(RELEASE_DIR, 'scripts');
const ZIP_PATH = path.join(RELEASE_DIR, 'skill.zip');

const NO_ZIP = process.argv.includes('--no-zip');

// ======== 文件操作 ========

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    ensureDir(dest);
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ======== 打包 zip ========

function packageZip() {
  // 清理旧 zip
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

  // 用临时目录 staging，确保 zip 内顶层目录名为 all-platform-video-extract
  const tmpDir = path.join(PROJECT_ROOT, '.tmp_package');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  const stagedDir = path.join(tmpDir, 'all-platform-video-extract');
  ensureDir(stagedDir);

  // 复制 release 内容到临时目录（排除旧 zip）
  for (const item of fs.readdirSync(RELEASE_DIR)) {
    if (item.startsWith('.') || item.endsWith('.zip')) continue;
    copyRecursive(path.join(RELEASE_DIR, item), path.join(stagedDir, item));
  }

  // 打包
  execSync(
    `cd "${tmpDir}" && zip -r "${ZIP_PATH}" all-platform-video-extract -x "*.DS_Store" -x "__MACOSX*"`,
    { stdio: 'pipe' }
  );

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true });

  const zipSize = fs.statSync(ZIP_PATH).size;
  console.log(`  [ZIP] ${path.relative(PROJECT_ROOT, ZIP_PATH)}  ${(zipSize / 1024).toFixed(1)}KB`);
}

// ======== 主流程 ========

function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   all-platform-video-extract — 明文构建 + 打包     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // --- Step 1: 复制脚本（明文） ---
  ensureDir(OUT_DIR);

  const files = fs.readdirSync(DEV_DIR).filter(f => f.endsWith('.cjs'));
  if (files.length === 0) {
    console.error('错误：未找到 dev/scripts/*.cjs');
    process.exit(1);
  }

  console.log('【Step 1/3】复制脚本（明文）');
  console.log(`  源: ${path.relative(PROJECT_ROOT, DEV_DIR)}/`);
  console.log(`  出: ${path.relative(PROJECT_ROOT, OUT_DIR)}/\n`);

  for (const file of files) {
    const src = path.join(DEV_DIR, file);
    const dest = path.join(OUT_DIR, file);
    fs.copyFileSync(src, dest);
    const size = fs.statSync(dest).size;
    console.log(`  [OK] ${file}  ${size}B`);
  }

  // --- Step 2: 同步 SKILL.md ---
  console.log('\n【Step 2/3】同步 SKILL.md');
  const skillSrc = path.join(__dirname, 'SKILL.md');
  const skillDest = path.join(RELEASE_DIR, 'SKILL.md');
  if (fs.existsSync(skillSrc)) {
    fs.copyFileSync(skillSrc, skillDest);
    console.log(`  [OK] dev/SKILL.md → release/SKILL.md`);
  } else {
    console.error('  [ERROR] dev/SKILL.md 不存在！');
    process.exit(1);
  }

  // --- Step 3: 打包 zip ---
  if (NO_ZIP) {
    console.log('\n【Step 3/3】跳过打包（--no-zip）');
  } else {
    console.log('\n【Step 3/3】打包 skill.zip');
    packageZip();
  }

  // --- 汇总 ---
  console.log('\n═══════════════════════════════════════════');
  console.log('构建完成！');
  console.log(`  明文脚本: ${files.length} 个 → release/scripts/`);
  console.log(`  SKILL.md: 已同步 → release/SKILL.md`);
  if (!NO_ZIP) {
    console.log(`  发布包:   ${path.relative(PROJECT_ROOT, ZIP_PATH)}`);
  }
  console.log('═══════════════════════════════════════════\n');
}

main();
