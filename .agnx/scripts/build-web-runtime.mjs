#!/usr/bin/env node
/**
 * 场景：Agnx 外置 ZCode — 可复跑地构建并 stage「仅 --web」运行时到
 *   dist/zcode/debug/zcode/bin/zcode.mjs
 * （ensure-zcode 的 dist-mjs 路径；跳过上游 build:zcode 的 TUI SEA assets，避免 @zcode/shared 发行依赖卡死）
 *
 * 用法（仓根，Node ≥ 24）：
 *   node .agnx/scripts/build-web-runtime.mjs
 *   node .agnx/scripts/build-web-runtime.mjs --skip-build   # 只重 stage
 *   node .agnx/scripts/build-web-runtime.mjs --check        # 只验入口存在
 *   npm run build:web-runtime --prefix .agnx
 */
import { spawnSync } from "node:child_process";
import { access, chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agnxRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(agnxRoot, "..");
const packageRoot = path.join(repoRoot, "dist/zcode/debug/zcode");
const runnerSrc = path.join(repoRoot, "scripts/zcode-distribution/runner.mjs");
const assetsMod = path.join(repoRoot, "scripts/zcode-distribution/assets.mjs");

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build");
const checkOnly = args.has("--check");
const help = args.has("--help") || args.has("-h");

function log(msg) {
  console.log(`[zcode web-runtime] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[zcode web-runtime] ${msg}`);
  process.exit(code);
}

async function exists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, argv, cwd = repoRoot) {
  log(`${command} ${argv.join(" ")}`);
  const result = spawnSync(command, argv, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    fail(`${command} 启动失败: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} 退出码 ${result.status}`);
  }
}

async function assertBuiltInputs() {
  const required = [
    path.join(repoRoot, "apps/zcode-cli/packages/cli/dist/zcode.cjs"),
    path.join(repoRoot, "apps/zcode-cli/packages/cli/dist/provider/zcode-builtin.json"),
    path.join(repoRoot, "packages/server/dist/entry-http.js"),
    path.join(repoRoot, "packages/web/dist/index.html"),
    runnerSrc,
    assetsMod,
  ];
  for (const file of required) {
    if (!(await exists(file))) {
      fail(`缺少构建产物: ${path.relative(repoRoot, file)}（先去掉 --skip-build 重跑，或先 pnpm install）`);
    }
  }
}

async function stagePackage() {
  const { copyRuntimeNodeModules, patchNodePtyPrebuilds } = await import(
    pathToFileURL(assetsMod).href,
  );
  const version = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")).version;

  await rm(packageRoot, { force: true, recursive: true });
  await mkdir(packageRoot, { recursive: true });

  await cp(path.join(repoRoot, "packages/web/dist"), path.join(packageRoot, "web"), {
    recursive: true,
  });
  await cp(path.join(repoRoot, "packages/server/dist"), path.join(packageRoot, "server"), {
    recursive: true,
  });
  await mkdir(path.join(packageRoot, "agent"), { recursive: true });
  await cp(
    path.join(repoRoot, "apps/zcode-cli/packages/cli/dist/zcode.cjs"),
    path.join(packageRoot, "agent/zcode.cjs"),
  );
  await cp(
    path.join(repoRoot, "apps/zcode-cli/packages/cli/dist/provider"),
    path.join(packageRoot, "agent/provider"),
    { recursive: true },
  );
  await chmod(path.join(packageRoot, "agent/zcode.cjs"), 0o755);

  log("copyRuntimeNodeModules…");
  await copyRuntimeNodeModules(packageRoot);
  await patchNodePtyPrebuilds(packageRoot);

  await mkdir(path.join(packageRoot, "bin"), { recursive: true });
  const runnerDst = path.join(packageRoot, "bin/zcode.mjs");
  await cp(runnerSrc, runnerDst);
  await chmod(runnerDst, 0o755);

  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify(
      {
        name: "zcode-runtime",
        private: true,
        type: "module",
        version: typeof version === "string" ? version : "0.0.0",
        description: "Agnx web-only stage (no TUI SEA); for zcode --web / ensure-zcode",
      },
      null,
      2,
    ),
  );

  log(`staged → ${path.relative(repoRoot, packageRoot)} (v${version})`);
}

async function verifyEntry() {
  const entry = path.join(packageRoot, "bin/zcode.mjs");
  if (!(await exists(entry))) {
    fail(`ensure 入口不存在: ${path.relative(repoRoot, entry)}`);
  }
  const server = path.join(packageRoot, "server/entry-http.js");
  const web = path.join(packageRoot, "web/index.html");
  const agent = path.join(packageRoot, "agent/zcode.cjs");
  for (const p of [server, web, agent]) {
    if (!(await exists(p))) fail(`运行时残缺: ${path.relative(repoRoot, p)}`);
  }
  log(`ok entry=${path.relative(repoRoot, entry)}`);
  console.log(
    JSON.stringify({
      ok: true,
      entry: entry,
      relativeEntry: path.relative(repoRoot, entry),
      packageRoot,
      hint: "ensure 会优先用此 dist-mjs；也可: node dist/zcode/debug/zcode/bin/zcode.mjs --web --host 127.0.0.1 --port 3030 --no-open --no-token",
    }),
  );
}

async function main() {
  if (help) {
    console.log(`Usage:
  node .agnx/scripts/build-web-runtime.mjs [--skip-build] [--check] [--help]

Builds @zcode/cli… + server + web, then stages web-only runtime to:
  dist/zcode/debug/zcode/bin/zcode.mjs
`);
    return;
  }

  if (!(await exists(path.join(repoRoot, "package.json")))) {
    fail(`仓根异常: ${repoRoot}`);
  }

  if (checkOnly) {
    await verifyEntry();
    return;
  }

  if (!skipBuild) {
    run("pnpm", ["--filter", "@zcode/cli...", "build"]);
    run("pnpm", ["--filter", "@zcode/server", "build"]);
    run("pnpm", ["--filter", "@zcode/web", "build"]);
  }

  await assertBuiltInputs();
  await stagePackage();
  await verifyEntry();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
