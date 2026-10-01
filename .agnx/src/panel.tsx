/**
 * 场景：ZCode 薄壳 Panel — 首帧品牌扫光 + host.guest.mount（满铺）+ retain + 配置热重启。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import type {
  WorkspaceAppBrandLogoLoaderPanelProps,
  WorkspaceAppHostApi,
} from "@getagnx/app-sdk";
import {
  ZCODE_APP_ID,
  ZCODE_DEFAULT_PORT,
  ZCODE_ENSURE_TOOL_REL,
  ZCODE_OPEN_COMMAND_ID,
  ZCODE_PANEL_ID,
} from "./constants";
import { bindZCodeHost, requireBoundHost } from "./host-bind";
import {
  loadZCodeConfigFromHost,
  zcodeConfigToEnsureArgs,
} from "./zcode-config";
import {
  subscribeZCodeRuntimeRestart,
  type ZCodeRuntimeRestartReason,
} from "./zcode-runtime-coordinator";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)",
};

const ERROR_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  background: "rgba(9,9,11,0.88)",
};

const ERROR_FALLBACK_STYLE: CSSProperties = {
  ...ERROR_LAYER_STYLE,
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  padding: 24,
  textAlign: "center",
};

const RETAIN_REASON = "zcode-open";
const ENSURE_TIMEOUT_MS = 300_000;
const SURFACE_READY_TIMEOUT_MS = 120_000;

export function bindZCodePanelHost(host: WorkspaceAppHostApi): void {
  bindZCodeHost(host);
}

function canUseGuestSurface(): boolean {
  return typeof document !== "undefined" && requireBoundHost().platform.isWeb;
}

export function ZCodePanel(_props: {
  appId?: string;
  panelId?: string;
  entityId?: string;
}): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);

  useEffect(() => {
    const host = requireBoundHost();
    host.background?.requestRetain?.({
      appId: ZCODE_APP_ID,
      active: true,
      reason: RETAIN_REASON,
    });
    return () => {
      host.background?.requestRetain?.({
        appId: ZCODE_APP_ID,
        active: false,
        reason: RETAIN_REASON,
      });
    };
  }, []);

  useEffect(() => {
    return subscribeZCodeRuntimeRestart((_reason: ZCodeRuntimeRestartReason) => {
      setBooting(true);
      setError(null);
      setMountKey((k) => k + 1);
    });
  }, []);

  useEffect(() => {
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("当前平台暂不支持嵌入 ZCode（需桌面或网页壳）。");
      return;
    }
    const host = requireBoundHost();
    if (!host.guest?.mount) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx）");
      return;
    }
    const container = guestHostRef.current;
    if (!container) {
      return;
    }
    let cancelled = false;
    let unmount: (() => void) | undefined;

    void (async () => {
      const cfg = await loadZCodeConfigFromHost(host.config);
      if (cancelled) {
        return;
      }
      const ensureArgs = zcodeConfigToEnsureArgs(cfg, { forceRestart: mountKey > 0 });
      unmount = host.guest!.mount({
        container,
        ensureTool: ZCODE_ENSURE_TOOL_REL,
        ensureArgs: ensureArgs.length > 0 ? ensureArgs : ["--port", String(ZCODE_DEFAULT_PORT)],
        timeoutMs: ENSURE_TIMEOUT_MS,
        surfaceReadyTimeoutMs: SURFACE_READY_TIMEOUT_MS,
        bootOverlay: false,
        onReady: () => {
          if (cancelled) {
            return;
          }
          setError(null);
          window.setTimeout(() => setBooting(false), 320);
        },
        onError: (detail) => {
          if (cancelled) {
            return;
          }
          setBooting(false);
          setError(`${detail.code}: ${detail.message}`);
        },
      });
    })();

    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [mountKey]);

  const BrandPanel = requireBoundHost().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div style={WEB_ROOT_STYLE} aria-label="ZCode panel">
      <div
        ref={guestHostRef}
        data-agnx-guest-surface-host="true"
        data-testid="workspace-mini-app-zcode-root"
        style={GUEST_HOST_STYLE}
      />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel
            title="正在启动 ZCode…"
            description="需本机已 bootstrap / 可用 zcode CLI（Node ≥ 24）。与 Agnx Agent 并存。"
            testID="zcode-boot-overlay"
          />
        </div>
      ) : null}
      {booting && !error && !BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={ERROR_FALLBACK_STYLE} role="status">
          正在启动 ZCode…
        </div>
      ) : null}
      {error && BrandPanel ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <BrandPanel
            title={error}
            description="打开命令面板 → ZCode → 详情复制 Guest Surface。确认 pnpm bootstrap 或 PATH 有 zcode。"
            testID="zcode-mount-error"
          />
        </div>
      ) : null}
      {error && !BrandPanel ? (
        <div style={ERROR_FALLBACK_STYLE} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

void ZCODE_PANEL_ID;
void ZCODE_OPEN_COMMAND_ID;
