#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 确保本仓 ZCode Web 已起（默认 :3030，loopback）。
 * 用法：node .agnx/tools/ensure-zcode.mjs [--port 3030] [--workspace <path>] [--data-base-dir <path>] [--token-mode off|on] [--force-restart] [--supervised]
 * stdout：JSON { ok, port, origin, reused, pid, warnings? }；--supervised 时含 plan
 *
 * 启动优先级：ZCODE_CLI → PATH zcode → dist/.../bin/zcode.mjs → 可读失败（提示 bootstrap）。
 */
import { spawn, execFileSync } from "node:child_process";
import { access, constants as fsConstants, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const defaultPort = 3030;
const APP_ID = "zcode";
const ENSURE_ID = "ensure-zcode";
const STATE_FILE = "zcode.json";

function parseArgs(argv) {
  let port = defaultPort;
  let forceRestart = false;
  let supervised = false;
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let workspace = "";
  let dataBaseDir = "";
  let tokenMode = "off";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) port = n;
      i += 1;
    } else if ((arg === "--workspace" || arg === "--workSpace") && next) {
      workspace = String(next).trim();
      i += 1;
    } else if ((arg === "--data-base-dir" || arg === "--dataBaseDir") && next) {
      dataBaseDir = String(next).trim();
      i += 1;
    } else if ((arg === "--token-mode" || arg === "--tokenMode") && next) {
      tokenMode = next === "on" ? "on" : "off";
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    } else if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    }
  }
  const fallbackWorkDir = path.join(repoRoot, ".agnx-zcode-runtime");
  return {
    port,
    forceRestart,
    supervised,
    repoRoot,
    workspace: workspace || repoRoot,
    dataBaseDir,
    tokenMode,
    workDir: workDir || (supervised ? "" : fallbackWorkDir),
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isWebHealthy(port) {
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

async function waitForHealth(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isWebHealthy(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // ignore
  }
}

function fingerprint(cfg, token) {
  return JSON.stringify({
    repoRoot: cfg.repoRoot,
    port: cfg.port,
    workspace: cfg.workspace,
    dataBaseDir: cfg.dataBaseDir || "",
    tokenMode: cfg.tokenMode,
    tokenHash: token ? token.slice(0, 8) : "",
  });
}

function whichZcode() {
  if (process.env.ZCODE_CLI && process.env.ZCODE_CLI.trim()) {
    return { command: process.env.ZCODE_CLI.trim(), kind: "env" };
  }
  try {
    const out = execFileSync("/bin/bash", ["-lc", "command -v zcode"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (out) return { command: out.split(/\r?\n/)[0].trim(), kind: "path" };
  } catch {
    // ignore
  }
  return null;
}

async function findDistZcodeMjs(repoRoot) {
  const candidates = [
    path.join(repoRoot, "dist/zcode/debug/zcode/bin/zcode.mjs"),
    path.join(repoRoot, "dist/zcode/zcode/bin/zcode.mjs"),
  ];
  for (const p of candidates) {
    if (await pathExists(p)) return p;
  }
  // scan releases/*/ 
  const releases = path.join(repoRoot, "dist/zcode/releases");
  if (await pathExists(releases)) {
    try {
      const versions = await readdir(releases);
      for (const v of versions) {
        const p = path.join(releases, v, "zcode", "bin", "zcode.mjs");
        // also after extract
        const p2 = path.join(repoRoot, "dist/zcode/debug/zcode/bin/zcode.mjs");
        if (await pathExists(p2)) return p2;
        void p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * @returns {Promise<{ ok: true, command: string, args: string[], cwd: string, env: Record<string,string>, origin: string, token: string } | { ok: false, error: string }>}
 */
async function resolveLaunch(cfg) {
  const token =
    cfg.tokenMode === "on"
      ? process.env.ZCODE_SERVER_AUTH_TOKEN?.trim() || randomBytes(24).toString("base64url")
      : "";
  const origin = token
    ? `http://127.0.0.1:${cfg.port}/?token=${encodeURIComponent(token)}`
    : `http://127.0.0.1:${cfg.port}/`;

  const envExtra = {
    PORT: String(cfg.port),
    ZCODE_SERVER_HOST: "127.0.0.1",
    ZCODE_SERVER_WORKSPACE: cfg.workspace,
    ZCODE_SERVER_AUTH_TOKEN: token,
  };
  if (cfg.dataBaseDir) {
    envExtra.ZCODE_DATA_BASE_DIR = cfg.dataBaseDir;
  }

  const webArgs = [
    "--web",
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "--workspace",
    cfg.workspace,
    "--no-open",
  ];
  if (cfg.tokenMode === "on") {
    webArgs.push("--token", token);
  } else {
    webArgs.push("--no-token");
  }

  const fromPath = whichZcode();
  if (fromPath) {
    return {
      ok: true,
      command: fromPath.command,
      args: webArgs,
      cwd: cfg.workspace,
      env: envExtra,
      origin,
      token,
      launchKind: fromPath.kind,
    };
  }

  const distMjs = await findDistZcodeMjs(cfg.repoRoot);
  if (distMjs) {
    return {
      ok: true,
      command: process.execPath,
      args: [distMjs, ...webArgs],
      cwd: cfg.workspace,
      env: envExtra,
      origin,
      token,
      launchKind: "dist-mjs",
    };
  }

  return {
    ok: false,
    error:
      "未找到 zcode 入口。请：1) nvm use 24 && pnpm bootstrap && pnpm build:zcode；或 2) 安装官方 CLI 到 PATH；或 3) 设置 ZCODE_CLI。详见 EMBED.md / README.agnx.md。",
    origin,
    token,
  };
}

function spawnDetached(command, args, { cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

async function tryReused(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) return null;
  const existing = await readState(statePath);
  if (!existing || !(await isWebHealthy(cfg.port))) return null;
  if (existing.fingerprint !== wantedFp) return null;
  return {
    ok: true,
    reused: true,
    port: cfg.port,
    pid: existing.pid ?? null,
    origin: existing.origin || `http://127.0.0.1:${cfg.port}/`,
    repoRoot: cfg.repoRoot,
    warnings: existing.warnings || [],
  };
}

function buildSupervisedPlan(cfg, launch) {
  return {
    ok: true,
    appId: APP_ID,
    ensureId: ENSURE_ID,
    origin: launch.origin,
    port: cfg.port,
    reused: false,
    sidecar: {
      supervised: true,
      stateFile: STATE_FILE,
      defaultPort: cfg.port,
    },
    plan: {
      command: launch.command,
      args: launch.args,
      cwd: launch.cwd,
      env: launch.env,
      health: {
        url: `http://127.0.0.1:${cfg.port}/`,
        timeoutMs: 180_000,
      },
    },
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (cfg.supervised && !cfg.workDir) {
    console.log(
      JSON.stringify({
        ok: false,
        appId: APP_ID,
        ensureId: ENSURE_ID,
        error: "ENSURE_MISSING_DATA_ROOT",
        message: "supervised 须由 daemon 注入 AGNX_APP_DATA_ROOT。",
        port: cfg.port,
      }),
    );
    process.exit(1);
  }
  await mkdir(cfg.workDir, { recursive: true });
  const statePath = path.join(cfg.workDir, STATE_FILE);
  const warnings = [];

  const launch = await resolveLaunch(cfg);
  if (!launch.ok) {
    console.log(
      JSON.stringify({
        ok: false,
        appId: APP_ID,
        ensureId: ENSURE_ID,
        error: "ENSURE_MISSING_ZCODE",
        message: launch.error,
        port: cfg.port,
        repoRoot: cfg.repoRoot,
      }),
    );
    process.exit(1);
  }

  const wantedFp = fingerprint(cfg, launch.token);

  if (cfg.supervised) {
    const reused = await tryReused(cfg, statePath, wantedFp);
    if (reused) {
      console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
      return;
    }
    console.log(JSON.stringify(buildSupervisedPlan(cfg, launch)));
    return;
  }

  const lockDir = path.join(cfg.workDir, "ensure-zcode.lock");
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    try {
      await mkdir(lockDir);
      try {
        const reused = await tryReused(cfg, statePath, wantedFp);
        if (reused) {
          console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
          return;
        }
        const existing = await readState(statePath);
        if (existing?.pid) stopPid(existing.pid);

        const child = spawnDetached(launch.command, launch.args, {
          cwd: launch.cwd,
          env: launch.env,
        });
        const ready = await waitForHealth(cfg.port, 180_000);
        if (!ready) {
          stopPid(child.pid);
          console.log(
            JSON.stringify({
              ok: false,
              appId: APP_ID,
              ensureId: ENSURE_ID,
              error: `zcode --web 启动超时（port=${cfg.port}）。请手动在仓根验证 CLI / dist。`,
              port: cfg.port,
              repoRoot: cfg.repoRoot,
              launchKind: launch.launchKind,
            }),
          );
          process.exit(1);
        }
        await writeState(statePath, {
          fingerprint: wantedFp,
          port: cfg.port,
          pid: child.pid ?? null,
          origin: launch.origin,
          repoRoot: cfg.repoRoot,
          warnings,
          updatedAt: Date.now(),
        });
        console.log(
          JSON.stringify({
            ok: true,
            reused: false,
            appId: APP_ID,
            ensureId: ENSURE_ID,
            port: cfg.port,
            pid: child.pid ?? null,
            origin: launch.origin,
            repoRoot: cfg.repoRoot,
            launchKind: launch.launchKind,
            warnings,
          }),
        );
        return;
      } finally {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const reused = await tryReused(cfg, statePath, wantedFp);
      if (reused) {
        console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  console.log(
    JSON.stringify({
      ok: false,
      appId: APP_ID,
      ensureId: ENSURE_ID,
      error: "ensure 等待锁超时",
      port: cfg.port,
    }),
  );
  process.exit(1);
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      appId: APP_ID,
      ensureId: ENSURE_ID,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
