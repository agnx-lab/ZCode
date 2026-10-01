// 场景：ZCode 运行时协调 — 配置变更后通知面板停旧再起。
export type ZCodeRuntimeRestartReason =
  | "port"
  | "workspace"
  | "data-dir"
  | "token-mode"
  | "manual"
  | "git-pull";

type RestartListener = (reason: ZCodeRuntimeRestartReason) => void;

const listeners = new Set<RestartListener>();

export function subscribeZCodeRuntimeRestart(listener: RestartListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyZCodeRuntimeNeedsRestart(reason: ZCodeRuntimeRestartReason): void {
  for (const listener of listeners) {
    listener(reason);
  }
}
