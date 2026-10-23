// 场景：详情「配置」— 端口 / workspace / dataBaseDir / tokenMode / git pull（W2–W3）。
import { createElement, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import {
  ZCODE_APP_ID,
  ZCODE_DEFAULT_PORT,
  ZCODE_GIT_PULL_TOOL_REL,
  ZCODE_GIT_STATUS_TOOL_REL,
  type ZCodeTokenMode,
} from "./constants";
import { getBoundHost } from "./host-bind";
import {
  defaultZCodeAppConfigDocument,
  loadZCodeConfigFromHost,
  saveZCodeConfigToHost,
  type ZCodeAppConfigDocument,
} from "./zcode-config";
import { notifyZCodeRuntimeNeedsRestart } from "./zcode-runtime-coordinator";

let cachedConfig: ZCodeAppConfigDocument = defaultZCodeAppConfigDocument();

export function getCachedZCodeConfig(): ZCodeAppConfigDocument {
  return cachedConfig;
}

function setCachedZCodeConfig(next: ZCodeAppConfigDocument): void {
  cachedConfig = next;
}

function useDetailLayoutStyles() {
  const { theme } = useUnistyles();
  const dark = theme.colorScheme !== "light";
  return useMemo(() => {
    const column: ViewStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      alignSelf: "stretch",
      width: "100%",
      gap: 8,
      minWidth: 0,
    };
    const row: ViewStyle = {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    };
    const muted: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foregroundMuted,
    };
    const mono: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foreground,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
    const ok: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusSuccess || "#15803d",
    };
    const warn: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusWarning || theme.colors.statusDanger,
    };
    const input = (focused: boolean): TextStyle => ({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 72,
      fontSize: 12,
      lineHeight: 16,
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 32,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: theme.colors.foreground,
      borderColor: focused
        ? theme.colors.accent
        : dark
          ? "rgba(255,255,255,0.35)"
          : "rgba(0,0,0,0.22)",
      backgroundColor: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.92)",
    });
    return { column, row, muted, mono, ok, warn, input };
  }, [dark, theme]);
}

function DetailChip({
  label,
  busy,
  disabled,
  tone,
  onPress,
  testID,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "overlay";
  onPress: () => void;
  testID?: string;
}): ReactElement | null {
  const Chip = getBoundHost()?.ui?.Chip;
  if (!Chip) {
    return null;
  }
  return createElement(Chip, {
    label: busy ? "…" : label,
    tone: tone ?? "overlay",
    busy,
    disabled: disabled || busy,
    onPress,
    testID,
    accessibilityLabel: label,
  });
}

function parseToolJson(result: {
  ok?: boolean;
  resultJson?: unknown;
  stdout?: string;
  stderr?: string;
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
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  if (stderr) {
    return { ok: false, error: stderr.slice(0, 400) };
  }
  return null;
}

function RuntimeDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [portText, setPortText] = useState(String(cachedConfig.port));
  const [workspacePath, setWorkspacePath] = useState(cachedConfig.workspacePath ?? "");
  const [dataBaseDir, setDataBaseDir] = useState(cachedConfig.dataBaseDir ?? "");
  const [tokenMode, setTokenMode] = useState<ZCodeTokenMode>(cachedConfig.tokenMode);
  const [portFocused, setPortFocused] = useState(false);
  const [wsFocused, setWsFocused] = useState(false);
  const [dataFocused, setDataFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const host = getBoundHost();
        if (!host) {
          return;
        }
        const loaded = await loadZCodeConfigFromHost(host.config);
        if (cancelled) {
          return;
        }
        setCachedZCodeConfig(loaded);
        setPortText(String(loaded.port));
        setWorkspacePath(loaded.workspacePath ?? "");
        setDataBaseDir(loaded.dataBaseDir ?? "");
        setTokenMode(loaded.tokenMode);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      setError("Host 未绑定");
      return;
    }
    const port = Number(portText);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      setError(`端口无效（默认 ${ZCODE_DEFAULT_PORT}）`);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const prev = getCachedZCodeConfig();
      const saved = await saveZCodeConfigToHost(host.config, {
        port: Math.floor(port),
        workspacePath: workspacePath.trim(),
        dataBaseDir: dataBaseDir.trim(),
        tokenMode,
      });
      setCachedZCodeConfig(saved);
      setMessage("已保存");
      const needRestart =
        prev.port !== saved.port ||
        (prev.workspacePath ?? "") !== (saved.workspacePath ?? "") ||
        (prev.dataBaseDir ?? "") !== (saved.dataBaseDir ?? "") ||
        prev.tokenMode !== saved.tokenMode;
      if (needRestart) {
        const reason =
          prev.port !== saved.port
            ? "port"
            : prev.tokenMode !== saved.tokenMode
              ? "token-mode"
              : (prev.workspacePath ?? "") !== (saved.workspacePath ?? "")
                ? "workspace"
                : "data-dir";
        notifyZCodeRuntimeNeedsRestart(reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dataBaseDir, portText, tokenMode, workspacePath]);

  const pickWorkspace = useCallback(async () => {
    const host = getBoundHost();
    const picked = await host?.files?.pickDirectory?.({ title: "选择 ZCode 工作区" });
    if (typeof picked === "string" && picked.trim()) {
      setWorkspacePath(picked.trim());
    }
  }, []);

  const pickDataDir = useCallback(async () => {
    const host = getBoundHost();
    const picked = await host?.files?.pickDirectory?.({ title: "选择 ZCODE_DATA_BASE_DIR" });
    if (typeof picked === "string" && picked.trim()) {
      setDataBaseDir(picked.trim());
    }
  }, []);

  return (
    <View style={styles.column} testID="zcode-runtime-config">
      <Text style={styles.muted}>
        与 Agnx Agent 并存。嵌页内「选目录」可能不可用，请在此用 Chip 选择。
      </Text>
      <Text style={styles.muted}>端口（默认 {ZCODE_DEFAULT_PORT}）</Text>
      <TextInput
        value={portText}
        onChangeText={setPortText}
        onFocus={() => setPortFocused(true)}
        onBlur={() => setPortFocused(false)}
        keyboardType="number-pad"
        style={styles.input(portFocused)}
        testID="zcode-config-port"
      />
      <Text style={styles.muted}>工作区路径（--workspace；空=仓根）</Text>
      <TextInput
        value={workspacePath}
        onChangeText={setWorkspacePath}
        onFocus={() => setWsFocused(true)}
        onBlur={() => setWsFocused(false)}
        placeholder="/path/to/project"
        style={styles.input(wsFocused)}
        testID="zcode-config-workspace"
      />
      <View style={styles.row}>
        <DetailChip label="选择工作区" onPress={() => void pickWorkspace()} testID="zcode-pick-workspace" />
      </View>
      <Text style={styles.muted}>数据基目录（ZCODE_DATA_BASE_DIR；可选）</Text>
      <TextInput
        value={dataBaseDir}
        onChangeText={setDataBaseDir}
        onFocus={() => setDataFocused(true)}
        onBlur={() => setDataFocused(false)}
        placeholder="空=上游默认 ~/.zcode"
        style={styles.input(dataFocused)}
        testID="zcode-config-data-dir"
      />
      <View style={styles.row}>
        <DetailChip label="选择数据目录" onPress={() => void pickDataDir()} testID="zcode-pick-data" />
      </View>
      <Text style={styles.muted}>访问令牌（loopback 默认关；开则写 ZCODE_SERVER_AUTH_TOKEN）</Text>
      <View style={styles.row}>
        {(["off", "on"] as ZCodeTokenMode[]).map((mode) => (
          <DetailChip
            key={mode}
            label={mode === "off" ? "关闭" : "开启"}
            tone={tokenMode === mode ? "accent" : "overlay"}
            onPress={() => setTokenMode(mode)}
            testID={`zcode-token-mode-${mode}`}
          />
        ))}
      </View>
      <View style={styles.row}>
        <DetailChip label="保存" busy={busy} tone="accent" onPress={() => void onSave()} testID="zcode-config-save" />
      </View>
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function GitDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTool = useCallback(async (tool: string, afterPull?: boolean) => {
    const host = getBoundHost();
    if (!host?.tools?.run) {
      setError("需桌面端 host.tools.run");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await host.tools.run({
        appId: ZCODE_APP_ID,
        tool,
        args: [],
        timeoutMs: 180_000,
      });
      const payload = parseToolJson(result);
      if (!payload || payload.ok === false) {
        setError(String(payload?.error || result.stderr || "git 失败").slice(0, 400));
        return;
      }
      const head = String(payload.afterHead || payload.head || "");
      const branch = String(payload.branch || "");
      const summary = String(payload.summary || payload.message || "ok");
      setStatus(`${branch} ${head} · ${summary}`.trim());
      if (afterPull && payload.changed) {
        notifyZCodeRuntimeNeedsRestart("git-pull");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View style={styles.column} testID="zcode-git-config">
      <Text style={styles.muted}>仅允许 git pull --ff-only；禁止 reset/checkout。</Text>
      <View style={styles.row}>
        <DetailChip
          label="状态"
          busy={busy}
          onPress={() => void runTool(ZCODE_GIT_STATUS_TOOL_REL)}
          testID="zcode-git-status"
        />
        <DetailChip
          label="拉取最新"
          busy={busy}
          tone="accent"
          onPress={() => void runTool(ZCODE_GIT_PULL_TOOL_REL, true)}
          testID="zcode-git-pull"
        />
      </View>
      {status ? <Text style={styles.mono}>{status}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function ReloadTabSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  return (
    <View style={styles.column}>
      <Text style={styles.muted}>强制重拉 ensure + Guest。</Text>
      <DetailChip
        label="重新加载 sidecar"
        tone="accent"
        onPress={() => notifyZCodeRuntimeNeedsRestart("manual")}
        testID="zcode-reload"
      />
    </View>
  );
}

export function registerZCodeDetailConfig(host: WorkspaceAppHostApi): () => void {
  if (!host.ui?.registerDetailSheetExtras) {
    return () => {};
  }
  void loadZCodeConfigFromHost(host.config).then((loaded) => {
    setCachedZCodeConfig(loaded);
  });
  return host.ui.registerDetailSheetExtras({
    appId: ZCODE_APP_ID,
    surface: "config",
    buildRows: () => {
      const cfg = getCachedZCodeConfig();
      return [
        {
          label: "运行时",
          value: `${cfg.port} · token=${cfg.tokenMode}`,
          helpText: "workspace / port / dataBaseDir / token。嵌页选目录请用下方 Chip。",
          groupId: "zcode-runtime",
          groupTitle: "ZCode",
          valueContent: createElement(RuntimeDetailField),
        },
        {
          label: "上游 Git",
          value: "ff-only pull",
          helpText: "同步官方更新后可重启 sidecar。",
          groupId: "zcode-runtime",
          groupTitle: "ZCode",
          valueContent: createElement(GitDetailField),
        },
        {
          label: "重新加载",
          value: "Tab / sidecar",
          helpText: "强制重拉 ensure + Guest。",
          groupId: "zcode-runtime",
          groupTitle: "ZCode",
          valueContent: createElement(ReloadTabSection),
        },
      ];
    },
  });
}
