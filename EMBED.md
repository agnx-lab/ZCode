## 上游嵌入

- 工作方式：整仓魔改（真树 `$AGNX_HOME/apps/zcode`）
- 推荐模式：Wrap + Sidecar（`zcode --web` loopback；`guest.auth=none` → `direct-iframe`）
- 挂载：`host.guest.mount`；禁手写 iframe；禁外开 `ZCode.app`
- Agent 工具：极薄 `zcode_health` / `zcode_open` / `zcode_restart`；不镜像插件/MCP 全表
- host.config：workspacePath / port / dataBaseDir / tokenMode
- 上游：`zai-org/ZCode@main`（本目录 git remote）
- Port 切片：无
- 默认值：port=3030，tokenMode=off，workspace=仓根或用户配置
- 首次成本：Node ≥ 24 + `pnpm install` + `npm run build:web-runtime --prefix .agnx`（或 PATH 已有 `zcode` CLI）；ensure 不跑全量 bootstrap
- Web 运行时入口：`dist/zcode/debug/zcode/bin/zcode.mjs`（由 `.agnx/scripts/build-web-runtime.mjs` stage；跳过上游 TUI SEA）
- 活页：`docs/sub-app/ZCode子应用需求_zcode-sub-app.md`（Agnx monorepo）

## 嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 选工作区目录 | `IPlatformService.selectDirectory` | iframe 内 dialog 失效 | A 详情 pickDirectory；嵌页 E→B | 是 | |
| Z.AI / BigModel OAuth | 外开浏览器 / 轮询 | Guest 深链可能断 | D/E 文案引导；禁外开整壳 | 是 | |
| 系统通知 | `showTaskNotification` | iframe 弱 | D | 否 | |
| Browser-use / CUA | Desktop Main | Web 子集 | D 一期不接 | 否 | |
| Reveal 路径 | platform opener | no-op | A/D | 否 | |

处置字母见 `skills/agnx-app/SKILL.md` §嵌页宿主能力缺口视角。
