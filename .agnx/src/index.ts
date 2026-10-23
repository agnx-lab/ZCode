/**
 * 场景：ZCode Sub App 入口 — Guest（auth:none）+ ensure + 详情配置 + 薄 Agent 工具。
 */
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import {
  ZCODE_APP_ID,
  ZCODE_ENSURE_TOOL_REL,
  ZCODE_GIT_PULL_TOOL_REL,
  ZCODE_GIT_STATUS_TOOL_REL,
  ZCODE_OPEN_COMMAND_ID,
  ZCODE_PANEL_ID,
} from "./constants";
import { registerZCodeAgentTools } from "./agent-tools";
import { registerZCodeDetailConfig } from "./detail-config";
import { bindZCodePanelHost, ZCodePanel } from "./panel";

export const appId = ZCODE_APP_ID;

function openZCodeTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openSubAppTab({
    appId: ZCODE_APP_ID,
    panelId: ZCODE_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): void {
  bindZCodePanelHost(host);
  registerZCodeDetailConfig(host);
  registerZCodeAgentTools(host);

  host.registerMiniApp({
    id: ZCODE_PANEL_ID,
    appId: ZCODE_APP_ID,
    title: "ZCode",
    component: ZCodePanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [
        ZCODE_ENSURE_TOOL_REL,
        ZCODE_GIT_STATUS_TOOL_REL,
        ZCODE_GIT_PULL_TOOL_REL,
      ],
      note: "Tab Guest 加载本仓受管 ZCode Web；ensure 默认 zcode --web :3030",
    },
  });

  host.registerCommand({
    id: ZCODE_OPEN_COMMAND_ID,
    appId: ZCODE_APP_ID,
    title: "ZCode",
    keywords: ["zcode", "z.ai", "智谱", "coding", "工作台"],
    sidebarAction: {
      defaultVisible: true,
      label: "ZCode",
      order: 66,
    },
    run: (context) => {
      openZCodeTab(host, context);
    },
  });
}

const moduleExport: WorkspaceAppModule = {
  appId: ZCODE_APP_ID,
  activate,
};

export default moduleExport;

export {
  ZCODE_APP_ID,
  ZCODE_OPEN_COMMAND_ID,
  ZCODE_PANEL_ID,
} from "./constants";
export { ZCodePanel } from "./panel";
