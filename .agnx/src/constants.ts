/** 场景：ZCode Sub App 常量 — appId / panel / ensure / config。 */
export const ZCODE_APP_ID = "zcode";
export const ZCODE_PANEL_ID = "zcode.main";
export const ZCODE_OPEN_COMMAND_ID = "zcode.open";
export const ZCODE_ENSURE_TOOL_REL = ".agnx/tools/ensure-zcode.mjs";
export const ZCODE_GIT_PULL_TOOL_REL = ".agnx/tools/git-pull-upstream.mjs";
export const ZCODE_GIT_STATUS_TOOL_REL = ".agnx/tools/git-status-upstream.mjs";
export const ZCODE_CONFIG_KEY = "zcode-app-config";
export const ZCODE_DEFAULT_PORT = 3030;

/** off = loopback 无 token（guest.auth=none）；on = 强制 ZCODE_SERVER_AUTH_TOKEN */
export type ZCodeTokenMode = "off" | "on";
