#!/usr/bin/env node
/**
 * 打包脚本 — 将 Skill 文件打包为 dist/skill.zip
 *
 * 工作流：
 *   SKILL.md + scripts/  → dist/skill.zip（内部顶层目录名为 all-platform-video-extract）
 *
 * 用法：
 *   node build.cjs              # 打包 zip
 *   node build.cjs --no-zip     # 仅校验，不打包
 *
 * 依赖：仅 Node.js 内置模块
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname);
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const SKILL_FILE = path.join(PROJECT_ROOT, 'SKILL.md');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const ZIP_PATH = path.join(DIST_DIR, 'skill.zip');

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

// ======== 校验 ========

function validate() {
  const errors = [];
  if (!fs.existsSync(SKILL_FILE)) errors.push('SKILL.md 不存在');
  if (!fs.existsSync(SCRIPTS_DIR)) errors.push('scripts/ 目录不存在');
  const scripts = fs.existsSync(SCRIPTS_DIR) ? fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.cjs')) : [];
  if (scripts.length === 0) errors.push('scripts/ 下没有 .cjs 脚本');
  return { errors, scripts };
}

// ======== 打包 zip ========

function packageZip() {
  ensureDir(DIST_DIR);

  // 清理旧 zip
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

  // 用临时目录 staging，确保 zip 内顶层目录名为 all-platform-video-extract
  const tmpDir = path.join(PROJECT_ROOT, '.tmp_package');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  const stagedDir = path.join(tmpDir, 'all-platform-video-extract');
  ensureDir(stagedDir);

  // 复制 SKILL.md
  fs.copyFileSync(SKILL_FILE, path.join(stagedDir, 'SKILL.md'));

  // 复制 scripts/
  copyRecursive(SCRIPTS_DIR, path.join(stagedDir, 'scripts'));

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
  console.log('║   all-platform-video-extract — 打包脚本           ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // --- Step 1: 校验 ---
  console.log('【Step 1/2】校验文件');
  const { errors, scripts } = validate();
  if (errors.length > 0) {
    for (const e of errors) console.error(`  [ERROR] ${e}`);
    process.exit(1);
  }
  console.log(`  [OK] SKILL.md`);
  for (const f of scripts) {
    console.log(`  [OK] scripts/${f}`);
  }

  // --- Step 2: 打包 zip ---
  if (NO_ZIP) {
    console.log('\n【Step 2/2】跳过打包（--no-zip）');
  } else {
    console.log('\n【Step 2/2】打包 dist/skill.zip');
    packageZip();
  }

  // --- 汇总 ---
  console.log('\n═══════════════════════════════════════════');
  console.log('完成！');
  if (!NO_ZIP) {
    console.log(`  发布包: ${path.relative(PROJECT_ROOT, ZIP_PATH)}`);
  }
  console.log('═══════════════════════════════════════════\n');
}

main();
