// 场景：ZCode 端口 / workspace / dataBaseDir / tokenMode 经 host.config 落盘。
import type { WorkspaceAppConfigApi } from "@getagnx/app-sdk";
import {
  ZCODE_APP_ID,
  ZCODE_CONFIG_KEY,
  ZCODE_DEFAULT_PORT,
  type ZCodeTokenMode,
} from "./constants";

export interface ZCodeAppConfigDocument {
  version: 1;
  port: number;
  /** 上游 --workspace；空 = 仓根。 */
  workspacePath?: string;
  /** 映射 ZCODE_DATA_BASE_DIR；空 = 上游默认。 */
  dataBaseDir?: string;
  tokenMode: ZCodeTokenMode;
}

export function defaultZCodeAppConfigDocument(): ZCodeAppConfigDocument {
  return { version: 1, port: ZCODE_DEFAULT_PORT, tokenMode: "off" };
}

function normalizeTokenMode(raw: unknown): ZCodeTokenMode {
  return raw === "on" ? "on" : "off";
}

function normalizePath(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeZCodeAppConfigDocument(raw: unknown): ZCodeAppConfigDocument {
  const defaults = defaultZCodeAppConfigDocument();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const doc = raw as Partial<ZCodeAppConfigDocument>;
  const port = Number(doc.port);
  const tokenMode = normalizeTokenMode(doc.tokenMode);
  const workspacePath = normalizePath(doc.workspacePath);
  const dataBaseDir = normalizePath(doc.dataBaseDir);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return { ...defaults, tokenMode, workspacePath, dataBaseDir };
  }
  return {
    version: 1,
    port: Math.floor(port),
    tokenMode,
    workspacePath,
    dataBaseDir,
  };
}

export function zcodeConfigToEnsureArgs(
  cfg: ZCodeAppConfigDocument,
  options?: { forceRestart?: boolean },
): string[] {
  const args = ["--port", String(cfg.port), "--token-mode", cfg.tokenMode];
  if (cfg.workspacePath) {
    args.push("--workspace", cfg.workspacePath);
  }
  if (cfg.dataBaseDir) {
    args.push("--data-base-dir", cfg.dataBaseDir);
  }
  if (options?.forceRestart) {
    args.push("--force-restart");
  }
  return args;
}

export async function loadZCodeConfigFromHost(
  config: WorkspaceAppConfigApi | null | undefined,
): Promise<ZCodeAppConfigDocument> {
  if (!config?.get) {
    return defaultZCodeAppConfigDocument();
  }
  try {
    const raw = await config.get({
      scope: "app",
      appId: ZCODE_APP_ID,
      key: ZCODE_CONFIG_KEY,
      defaultValue: null,
    });
    return normalizeZCodeAppConfigDocument(raw);
  } catch {
    return defaultZCodeAppConfigDocument();
  }
}

export async function saveZCodeConfigToHost(
  config: WorkspaceAppConfigApi | null | undefined,
  patch: Partial<
    Pick<ZCodeAppConfigDocument, "port" | "workspacePath" | "dataBaseDir" | "tokenMode">
  >,
): Promise<ZCodeAppConfigDocument> {
  const current = await loadZCodeConfigFromHost(config);
  const merged: ZCodeAppConfigDocument = { ...current, ...patch };
  for (const key of ["workspacePath", "dataBaseDir"] as const) {
    if (patch[key] === "") {
      delete merged[key];
    }
  }
  const normalized = normalizeZCodeAppConfigDocument(merged);
  if (!config?.set) {
    return normalized;
  }
  await config.set({
    scope: "app",
    appId: ZCODE_APP_ID,
    key: ZCODE_CONFIG_KEY,
    value: normalized,
  });
  return normalized;
}
