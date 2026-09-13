# 推 main 自动更新网页版（Cloudflare）

手机上打开的那个网页版（`https://sully-os-site.qiana-s.workers.dev`）是**静态站点**，靠一条 GitHub Actions 工作流在**你每次推 `main` 之后自动重新构建并上传**。

工作流文件：[`.github/workflows/deploy-site-main.yml`](../.github/workflows/deploy-site-main.yml)

> **为什么以前"推了但线上没变"**：这条自动部署以前是不存在的。
> 仓库里原有的 `deploy-cloudflare-worker.yml` 只监听 `master` 分支（上游作者的发布分支），在只推 `main` 的仓库里一次都没触发过；
> 而每次推 `main` 会跑的那条是 GitHub Pages（需要仓库先启用 Pages），实际是失败的。
> 过去线上能更新，是因为每次推完都有人在本地手动打包 + `wrangler deploy` 了一遍。

---

## 一次性配置（约 3 分钟，只需做一次）

### 第 1 步：在 Cloudflare 建一枚 API Token

1. 打开 <https://dash.cloudflare.com/profile/api-tokens>（Cloudflare 面板右上角头像 → **My Profile** → 左侧 **API Tokens**）
2. 点 **Create Token** → 找到 **Create Custom Token** 那一栏 → 点 **Get started**
3. 按下面填：

| 位置 | 填什么 |
|------|--------|
| Token name | 随便起，比如 `sullyos-site-deploy` |
| Permissions | `Account` → `Workers Scripts` → `Edit`（第一行下拉这样选，其余留空） |
| Account Resources | `Include` → 选你自己那个账号（名字） |
| Client IP Address Filtering | 不用填 |
| TTL | 不用填（永不过期；想更保险就设个 1 年后再来换一次） |

4. 点 **Continue to summary** → **Create Token**
5. 页面上会出现一串 Token（形如 `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）——**它只显示这一次**，复制下来（先粘到备忘录也行，下一步要填）

> Token 的权限只要 `Workers Scripts: Edit` 就够。别选成 `Edit Cloudflare Workers` 模板以外的杂项，也别给它加域名/DNS 权限。

**账号 ID 不用你操心**：工作流里已经填了本仓库用的那个（`70592357c9a42c223eae8375e1bddcb2`）。
要换成别的账号再往下看第 2 步的 Variables 部分。想核对自己是哪个账号 ID：Cloudflare 面板 → **Workers & Pages** → 右侧栏 **Account ID**（一串 32 位字符）。

### 第 2 步：把 Token 填进 GitHub

打开 <https://github.com/361293184/ShinQ-qs/settings/secrets/actions>（仓库 **Settings** → **Secrets and variables** → **Actions**）

1. 停在 **Secrets** 标签页 → 点 **New repository secret**

| 位置 | 填什么 |
|------|--------|
| Name | `CLOUDFLARE_API_TOKEN`（必须一字不差） |
| Secret | 粘贴第 1 步复制的那串 Token |

点 **Add secret**。填对了的话，这个页面会出现一条 `CLOUDFLARE_API_TOKEN`（内容之后看不到，只能覆盖）。

2. **可选的 Variables**（切到 **Variables** 标签页 → **New repository variable**）。一个都不填也能正常工作：

| Name | 什么时候填 |
|------|-----------|
| `CLOUDFLARE_ACCOUNT_ID` | 只有当你要部署到**另一个** Cloudflare 账号时（覆盖文件里的默认值） |
| `SITE_URL` | 换了自定义域名时（用于部署后自检，默认 `https://sully-os-site.qiana-s.workers.dev`） |
| `UMAMI_SCRIPT_URL` / `UMAMI_WEBSITE_ID` | 想让站点带访问统计时。值在仓库的 `.env.capacitor` 里能翻到；不填就是零统计的干净版本 |

### 第 3 步：验证一次

1. 打开 <https://github.com/361293184/ShinQ-qs/actions/workflows/deploy-site-main.yml>
2. 右上角 **Run workflow** → 分支选 `main` → **Run workflow**
3. 等 3~5 分钟。**绿勾**就说明配好了

---

## 怎么判断"真的生效了"

工作流最后一步 **Smoke test live version** 会自己去拉线上 `version.json`，并打印类似：

```
线上 version.json = { "branch": "main", "commit": "xxxxxxxx", ... }
线上已是本次提交 xxxxxxxx
```

看到这句就是**线上确实是这次提交的构建**。手机上再打开 App，设置里的版本信息处会提示「有新版本 · 立即刷新」，点一下就换到新版；没看到提示就关掉标签页重开，或者用 Safari 的「清除网站数据」清掉 Service Worker 缓存。

> 这一步只是自检，**失败不会让部署变红**。要是它打了黄字 warning，多半是边缘节点还在传播，过一两分钟刷新页面确认即可。

---

## 常见失败对照

| 运行记录里看到 | 原因与处理 |
|----------------|-----------|
| `缺少 CLOUDFLARE_API_TOKEN`（红） | 第 2 步没配或名字写错。配好后重新 Run workflow |
| 部署步骤 401 / 403 | Token 权限不够（要 `Account → Workers Scripts → Edit`）、Token 被删或过期了。回第 1 步重建一枚，覆盖原来的 Secret |
| `pnpm install --frozen-lockfile` 失败 | `pnpm-lock.yaml` 和 `package.json` 不同步（多半是本地改了依赖没提交 lockfile）。本地跑一次 `pnpm install`，把 `pnpm-lock.yaml` 一起提交 |
| `Cloudflare site deployment must remain static-assets-only` | 有人把站点配置从"纯静态资产"改成带 Worker 脚本的形态了。站点必须保持 `wrangler.jsonc` 里只有 `assets`，不要加 `main` / `assets.binding` / `assets.run_worker_first` |
| 部署成功但页面还是旧的 | 先看自检那步的 warning；再在 Safari「设置 → Safari → 高级 → 网站数据」里清掉该站点数据，然后重新打开；SwiftUI 版客户端（Capacitor）另有自己的缓存 |
| 这个工作流在某个仓库里显示 **skipped** | 正常。同一笔提交会推到私有 `ShinQ` 和公开 `ShinQ-qs` 两个仓库，只有公开那个真正部署（否则两个构建会同时上传、互相覆盖） |

**另外两条工作流的状态，别被它们误导：**

- `Deploy static site to Cloudflare`（`deploy-cloudflare-worker.yml`）：上游的文件，只监听 `master`，在本仓库永远不会跑。**故意不改它**——改了它每次 `Merge upstream` 都会冲突。
- `Deploy to GitHub Pages`（`deploy-pages.yml`）：推 `main` 会跑，但仓库没启用 Pages，所以**每次都是红叉**。它不影响 Cloudflare 站点。想让它变绿就去 仓库 **Settings → Pages** → Source 选 **GitHub Actions**（那样会多出一个 `github.io` 的访问地址，不用也无妨）。

---

## 不想配 Token：手动部署（应急）

在仓库根目录执行（本机已 `npx wrangler login` 过一次即可）：

```bash
pnpm install
pnpm run build
npx --yes wrangler@4.122.0 deploy
```

`VITE_HIDE_BUILD_BADGE=1` 只在**本地用非 main 分支构建**时要加（否则线上会带一个「开发中内容」角标）；CI 从 `main` 构建，自动隐藏。

## 安全提醒

- Token 只存 GitHub Secrets，**不要**贴进聊天、issue、代码或截图里
- 万一泄露：Cloudflare 面板 → My Profile → API Tokens → 对应那条 → **Delete / Roll**，然后回 GitHub 更新 Secret
- 这个 Token 只能改你账号下的 Worker 脚本，动不了 DNS、账单和别的账号
