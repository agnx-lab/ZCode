# ZCode · Agnx 外置子应用

短 id：`zcode`。整仓在本目录；Agnx 胶水在 `.agnx/`。

## 用户怎么用

1. Agnx 命令面板 → 子应用 → **ZCode**（或重新扫描后打开）
2. Tab 内嵌上游 Web UI（本机 `127.0.0.1:3030` 默认）
3. 详情 → 配置：工作区路径、端口、数据目录、访问令牌开关

与 Agnx 自带 Agent Tab **并存**，不替换。

## 首次准备

```bash
# Node ≥ 24（nvm use 24）
cd "${AGNX_HOME:-$HOME/.agnx-dev}/apps/zcode"
pnpm install   # 或 pnpm bootstrap（含桌面 runtime，更重）

# Agnx 推荐：只打 --web 入口（ensure 用的 dist-mjs；跳过上游 TUI SEA）
npm run build:web-runtime --prefix .agnx
# 仅验入口：npm run check:web-runtime --prefix .agnx
# 上游改过代码后重打：同上；已有 dist 产物只重 stage：node .agnx/scripts/build-web-runtime.mjs --skip-build

# 可选：官方完整发行包（需 ZCODE_DIST_BASE_URL / --base-url，且含 TUI SEA）
# pnpm build:zcode --base-url https://example.invalid/
# 或安装官方 CLI，使 PATH 上有 zcode

cd .agnx && npm run build
```

在 Agnx 仓：

```bash
npm run sub-apps:register -- --app-id=zcode --url=https://github.com/zai-org/ZCode --launch-mode=packaged
```

然后命令面板「重新扫描」。

## 权威

- 仓内需求：`docs/sub-app/ZCode子应用需求_zcode-sub-app.md`
- Skill：`skills/agnx-app/SKILL.md`
- 本目录：`EMBED.md`
