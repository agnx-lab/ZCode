#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — git status 摘要（只读）。
 * stdout：单行 JSON { ok, head, branch, dirty, repoRoot, status }
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    timeout: 60_000,
    maxBuffer: 2_000_000,
  });
  return stdout.trim();
}

async function main() {
  try {
    const head = await runGit(["rev-parse", "--short", "HEAD"]);
    let branch = "";
    try {
      branch = await runGit(["branch", "--show-current"]);
    } catch {
      branch = "";
    }
    const status = await runGit(["status", "--porcelain", "-b"]);
    const dirty = status
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("##"))
      .length;
    console.log(
      JSON.stringify({
        ok: true,
        head,
        branch: branch || "（无分支名）",
        dirty: dirty > 0,
        repoRoot,
        status: status.slice(0, 800),
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        repoRoot,
      }),
    );
    process.exitCode = 1;
  }
}

main();
