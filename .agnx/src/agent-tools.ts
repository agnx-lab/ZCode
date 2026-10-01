// 场景：W3 — 极薄 Agnx Agent 工具：zcode_health / zcode_open / zcode_restart。
import type { WorkspaceAppHostApi } from "@getagnx/app-sdk";
import {
  ZCODE_APP_ID,
  ZCODE_ENSURE_TOOL_REL,
  ZCODE_PANEL_ID,
} from "./constants";
import { loadZCodeConfigFromHost, zcodeConfigToEnsureArgs } from "./zcode-config";
import { notifyZCodeRuntimeNeedsRestart } from "./zcode-runtime-coordinator";

const GROUP = {
  groupId: "zcode",
  groupTitle: "ZCode",
} as const;

function pickEnsurePayload(result: {
  resultJson?: unknown;
  stdout?: string;
}): Record<string, unknown> | null {
  const json = result.resultJson;
  if (json && typeof json === "object" && json !== null) {
    return json as Record<string, unknown>;
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  return null;
}

export function registerZCodeAgentTools(host: WorkspaceAppHostApi): () => void {
  return host.registerAgentTools({
    appId: ZCODE_APP_ID,
    availability: "always",
    tools: [
      {
        name: "zcode_health",
        ...GROUP,
        description:
          "检查 ZCode Web（zcode --web）是否就绪（必要时短跑 ensure）。返回 origin/port；不代替上游内 Agent/MCP 操作。",
        inputSchema: {
          type: "object",
          properties: {
            ensure: {
              type: "boolean",
              description: "为 true 时主动跑 ensure（默认 true）",
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const ensure = (input as { ensure?: boolean } | null)?.ensure !== false;
          if (!ensure) {
            return {
              ok: true,
              message: "未执行 ensure；请打开 ZCode Tab 或设 ensure:true。",
            };
          }
          if (!host.tools?.run) {
            return {
              ok: false,
              error: "host_tools_unavailable",
              message: "需 Agnx 桌面端 host.tools.run。",
            };
          }
          const cfg = await loadZCodeConfigFromHost(host.config);
          const result = await host.tools.run({
            appId: ZCODE_APP_ID,
            tool: ZCODE_ENSURE_TOOL_REL,
            args: zcodeConfigToEnsureArgs(cfg),
            timeoutMs: 300_000,
          });
          const payload = pickEnsurePayload(result);
          if (payload) {
            return payload;
          }
          return {
            ok: false,
            error: "empty_ensure_result",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stderr: result.stderr?.slice(0, 400),
          };
        },
      },
      {
        name: "zcode_open",
        ...GROUP,
        description:
          "在工作区打开 ZCode Tab（上游 Web UI）。与 Agnx agent-stream 并存；密钥/会话在上游数据树。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          host.openSubAppTab({
            appId: ZCODE_APP_ID,
            panelId: ZCODE_PANEL_ID,
          });
          return {
            ok: true,
            appId: ZCODE_APP_ID,
            panelId: ZCODE_PANEL_ID,
            message: "已请求打开 ZCode Tab。",
          };
        },
      },
      {
        name: "zcode_restart",
        ...GROUP,
        description: "请求已打开的 ZCode Tab 强制重拉 ensure + Guest（配置变更后可用）。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          notifyZCodeRuntimeNeedsRestart("manual");
          return { ok: true, message: "已通知 ZCode 面板重启 sidecar。" };
        },
      },
    ],
  });
}
