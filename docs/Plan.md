# AirAccount Plugin — Plan (Background, Architecture, Milestones)

This repository is currently a fork of a Chrome Extension boilerplate. The target product described in [Solution.md](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/docs/Solution.md) is a “local gateway” that makes a normal browser behave like it natively understands:

- A domain namespace: `*.forest.mushroom.box`
- An onchain name system (ENS-style) for resolution
- IPFS (or compatible gateways) for content distribution

The extension intercepts matching navigations, resolves the name via RPC, fetches content via IPFS gateways, and renders a page locally with extension-owned code (MV3-safe). Optionally, a Web2 fallback gateway exists for users without the extension.

## Background

The core idea is to ship a “client-side resolver + renderer” instead of relying on a centralized gateway (like `eth.limo`-style server-side resolution). The extension becomes the translation layer from:

- Human-readable names (`sunflower.forest.mushroom.box`)
to
- Onchain records (resolver outputs)
to
- Content addresses (IPFS CIDs / contenthash)
to
- A deterministic rendered page

This design aims to preserve:

- Availability: content can be fetched from any working RPC and any working IPFS gateway
- Sovereignty: users can own/update their subname records (directly or via signed delegation)
- Distribution: links shared on Web2 can still work via a fallback gateway

## Product Goals

- Make `*.forest.mushroom.box` “just work” in Chrome after installing the extension.
- Render pages safely under Chrome Web Store / Manifest V3 constraints.
- Provide in-extension UX for:
  - RPC/IPFS configuration
  - Registration (request a subname)
  - Management (update profile/content pointers)
- Support caching to hide RPC/IPFS latency and rate limiting.

## Non-Goals (v0)

- Executing remote HTML/JS fetched from IPFS in privileged extension contexts.
- Becoming a general-purpose `.eth` browser. Scope is the Mushroom Forest namespace.
- Building a full anti-sybil identity system. v0 can start with lightweight controls.

## Guiding Constraints (From Solution.md)

- Chrome Web Store + MV3 disallow “remote code execution” patterns; do not load arbitrary HTML/JS from IPFS and execute it as code.
- Prefer “built-in templates + remote data” (JSON/Markdown/images) rendered by extension-owned code.
- Wildcard DNS is required if we want a usable fallback for non-extension users (otherwise users hit DNS errors before any web request is made).
- Public RPC/IPFS gateways will rate-limit at scale; caching + configurable endpoints are required.

## Plan Designation (System Design)

This section abstracts the “what we are building” into components, responsibilities, and data flows so anyone can understand the system without reading the whole repo.

### High-Level Architecture

```
User Navigation: https://<name>.forest.mushroom.box/...
        |
        | (A) Extension installed
        v
Chrome MV3 Extension
  - Navigation Intercept (DNR)
  - Renderer UI (extension page)
  - Resolver Client (RPC)
  - Content Fetcher (IPFS gateway)
  - Cache (chrome.storage / indexed cache)
  - Dashboard UI (register / manage)
        |
        | RPC calls + IPFS fetches
        v
Public/Private RPC + IPFS Gateways
        |
        | (Optional for gasless)
        v
Controller/Relayer Service (verifies signatures, submits tx)

        | (B) Extension NOT installed
        v
Wildcard DNS -> Web2 Fallback Gateway (install page / optional centralized render)
```

### Core Components (Responsibilities)

#### 1) Navigation Intercept (MV3)

Purpose: ensure the browser never depends on DNS/HTTP for `*.forest.mushroom.box` when the extension is installed.

- Mechanism: `declarativeNetRequest` rule for `resourceTypes: ["main_frame"]`
- Action: redirect to an extension-owned renderer page (e.g., `renderer/index.html`) that reads the original URL and continues locally

Key design rule:

- Redirect must be deterministic and must not leak user secrets (no sensitive data in query params beyond the requested URL).

#### 2) Renderer (Safe Page Assembler)

Purpose: given a hostname and path, produce a safe page.

Inputs:

- Requested URL: hostname, path, query
- Resolved onchain data (resolver results)
- Fetched content (IPFS JSON/Markdown/images)
- Cached entries (optional)

Outputs:

- A rendered page using extension-controlled templates (React UI in this repo)

Rendering rule (MV3/store-safe):

- The extension renders content as data (JSON/Markdown/images) into pre-built templates.
- It does not execute remote JavaScript and does not treat IPFS HTML as trusted code.

#### 3) Resolver Client (RPC)

Purpose: resolve `name -> records`.

Responsibilities:

- Name normalization and node derivation (e.g., ENS namehash flow)
- Resolver address discovery strategy (explicit configured resolver vs registry lookup)
- Record reads: at minimum `contenthash` + selected text records needed for templates

Operational needs:

- Configurable RPC endpoints (user can override defaults)
- Batching/parallelization where possible
- Timeout + retry + clear error messages

#### 4) Content Fetcher (IPFS Gateway)

Purpose: fetch the referenced content payloads and assets.

Responsibilities:

- Translate content pointers to gateway URLs
- Fetch payloads with size limits and type validation
- Enforce allowed remote formats (v0: JSON/Markdown/images)

Operational needs:

- Configurable gateway endpoints
- Backoff on 429/5xx

#### 5) Cache (Performance + Resilience)

Purpose: hide latency and reduce dependency on public infra limits.

Minimum cache strategy:

- Resolver reads cached by (chainId, node, recordType) with TTL
- IPFS payloads cached by (CID) with TTL and max size guardrails

Implementation note for this repo:

- Small metadata can live in `chrome.storage.local`
- Larger payloads may require an indexed solution (to be designed when we implement)

#### 6) Dashboard (Register + Manage)

Purpose: give users a “Web2-like” admin experience inside the extension.

Functions:

- Settings: RPC/IPFS endpoints, cache controls
- Registration: request/register a subname under `forest.mushroom.box`
- Management: edit profile fields, publish content to IPFS, update pointers onchain

Design rule:

- Everything required for the core product should be reachable from inside the extension UI, without sending users to external websites.

#### 7) Optional Controller/Relayer (Gasless UX)

Purpose: support “sign only” updates (EIP-712 style) where an operator submits transactions.

Responsibilities:

- Verify user signatures
- Apply abuse prevention (rate limiting, allow-lists, quotas)
- Submit onchain updates and surface status back to the extension

Custody model options (plan-level, not chosen yet):

- Operator EOA submits tx (simpler, higher key-risk)
- Smart-account + paymaster/bundler path (more complex, better operational posture)

#### 8) Optional Web2 Fallback Gateway (No Extension)

Purpose: avoid a dead-end for people clicking shared links without installing the extension.

Requirements:

- Wildcard DNS for `*.forest.mushroom.box` pointing to a gateway
- Gateway returns:
  - Install/learn-more page, and optionally
  - A centralized-render preview (“like limo”) with explicit disclosure

## Data Model (Conceptual)

This is the minimum set of objects the system should agree on (UI + caching + future APIs).

### Objects

- **ForestName**
  - `hostname`: `sunflower.forest.mushroom.box`
  - `label`: `sunflower`
  - `parent`: `forest.mushroom.box`
  - `path`: `/...` (optional)

- **ResolvedRecords**
  - `node`: namehash output (bytes32)
  - `resolver`: address
  - `contenthash`: optional (primary content pointer)
  - `texts`: key/value subset used by templates (e.g., title, description, avatar CID)
  - `timestamp`: resolution time (for TTL decisions)

- **ContentBundle**
  - `cid`: IPFS CID
  - `type`: `json | markdown | image`
  - `payload`: parsed data or URL to local cached blob

- **RenderedViewState**
  - `name`: ForestName
  - `records`: ResolvedRecords
  - `bundle`: ContentBundle[]
  - `errors`: typed errors for UX

## Data Flows (End-to-End)

### Flow 1 — Visiting a Forest Domain (Extension Installed)

1. User navigates to `https://sunflower.forest.mushroom.box/`.
2. Navigation intercept redirects the request to the extension renderer page.
3. Renderer parses the original hostname/path.
4. Renderer checks cache:
   - If fresh cache exists, render immediately and refresh in background.
   - If not, resolve onchain records via RPC.
5. Renderer derives content pointers (contenthash + referenced CIDs).
6. Renderer fetches allowed content types via IPFS gateway.
7. Renderer selects a built-in template and renders the page with the fetched data.
8. Renderer stores new cache entries.

### Flow 2 — Visiting a Forest Domain (No Extension)

1. User navigates to `https://sunflower.forest.mushroom.box/`.
2. DNS wildcard routes the request to the fallback gateway.
3. Gateway returns:
   - Install/learn-more page, or
   - Centralized-render preview (optional, explicitly disclosed)

### Flow 3 — Registration (Request a Subname)

1. User opens the extension dashboard.
2. User submits a registration form (desired label + metadata).
3. Registration path depends on the chosen model:
   - Direct onchain: user signs and submits transaction.
   - Gasless: user signs a request, controller/relayer submits the transaction.
4. Once registered, the dashboard shows the subname and its current onchain records.

### Flow 4 — Updating Profile / Content

1. User edits fields in the dashboard.
2. Extension produces allowed content payloads (JSON/Markdown/images) and publishes them to IPFS (gateway/pinning strategy TBD).
3. Extension updates onchain pointers:
   - Direct onchain transaction, or
   - Signed request to controller/relayer
4. Renderer immediately reflects updates:
   - By invalidating cache entries for the name
   - By resolving again and re-rendering

## Key Risks (Technical + UX)

- **Chrome Web Store policy risk:** remote HTML/JS execution patterns can lead to rejection or takedown; templates must be built-in.
- **Dead-end without wildcard DNS:** without wildcard records, users can hit DNS errors before any gateway can help.
- **Public infra rate limiting:** default public RPC/IPFS endpoints will 429 at scale; caching + configurable endpoints are mandatory.
- **Trust boundary confusion:** if a centralized gateway exists, it must clearly disclose centralized rendering and avoid injecting executable code.
- **Key management risk (gasless):** an operator EOA is a single point of failure; smart-account/paymaster is safer but more complex.

## Repo Reality Check (Template Baseline)

The repo already provides:

- MV3 extension build pipeline (Vite + TS, multi-page structure under `pages/*`)
- A background service worker entrypoint at [background/index.ts](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/chrome-extension/src/background/index.ts)
- Storage utilities under `packages/storage` and shared React UI under `packages/ui`
- A generated manifest at [manifest.ts](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/chrome-extension/manifest.ts)

The milestones below assume we extend the existing structure rather than introducing a separate app.

## Milestones

### Milestone 0 — Product Guardrails + Minimal Architecture

**Outcome:** A concrete, MV3-safe scope for v0.

- Define the v0 rendering contract: which onchain keys we support (e.g., `contenthash`, specific text records), and which remote formats are allowed (JSON/Markdown/images only).
- Decide the “domain suffix” policy (`forest.mushroom.box` hardcoded vs configurable for dev/test).
- Decide the minimum UX: “view pages” + “settings (RPC/IPFS)” + “basic dashboard shell”.

**Acceptance criteria**
- A single source of truth for v0 “allowed remote content types” and render behavior.
- No plan item requires loading executable remote JS/HTML into privileged extension contexts.

---

### Milestone 1 — Navigation Intercept + Local Renderer Skeleton

**Outcome:** Typing `https://<anything>.forest.mushroom.box/` shows an extension-owned page instead of a network request.

- Add a `declarativeNetRequest` redirect rule for `main_frame` requests matching `*.forest.mushroom.box`.
- Implement a renderer page (extension page) that receives the original URL and displays:
  - Parsed name (`<label>.forest.mushroom.box`)
  - Loading state / error state
  - “Open settings” link

**Acceptance criteria**
- On a clean profile with the extension installed, visiting any matching domain consistently lands on the renderer UI.
- Renderer can display the requested hostname/path/query without relying on remote assets.

---

### Milestone 2 — ENS/L2 Resolution + Deterministic Data Model

**Outcome:** Renderer can resolve and display a domain’s data via user-configured RPC.

- Implement namehashing and resolver reads for the target network (Optimism first).
- Define a single “ResolvedProfile” model used by UI and cache.
- Add a settings UI to configure:
  - RPC endpoint(s)
  - IPFS gateway(s)
  - Cache controls (on/off, TTL)

**Acceptance criteria**
- With a test domain configured onchain, the renderer shows resolved fields (at minimum: title/name + a content pointer).
- Failures are explicit (RPC unreachable, resolver missing, record missing).

---

### Milestone 3 — IPFS Fetch + Safe Rendering Templates

**Outcome:** The page becomes a real “home page” assembled from safe templates + remote data.

- Fetch non-executable payloads (JSON/Markdown/images) from IPFS via gateway.
- Implement 1–2 built-in templates (e.g., “Profile” and “Community”) that render the resolved data.
- Implement local caching for:
  - Resolver reads (keyed by node + record type)
  - IPFS payloads (keyed by CID)

**Acceptance criteria**
- A domain can render meaningful content offline after it has been visited once (within cache TTL).
- No direct execution of remote scripts; CSP and MV3 rules remain compatible with store review.

---

### Milestone 4 — Registration + Management Dashboard (In-Extension)

**Outcome:** Users can register and update their page metadata from within the extension UI.

- Add a dashboard page in the extension that:
  - Lets users request/register a subname
  - Lets users edit profile fields + publish to IPFS
  - Lets users update onchain pointers (direct tx or signed request, depending on backend choice)
- Store and show per-account state (selected address, registered names, pending actions).

**Acceptance criteria**
- A user can complete a “create/update profile” flow end-to-end in a test environment.
- All sensitive actions are clearly gated (explicit user intent, clear signing prompts).

---

### Milestone 5 — Controller / Relayer (Optional for v0, Required for “Gasless”)

**Outcome:** Support “sign only” updates via an operator service (EIP-712 / delegated resolver model).

- Introduce a minimal relayer/controller service design:
  - Signature verification
  - Rate limiting / abuse controls
  - Transaction submission pipeline
- Decide custody model (EOA key in service vs smart-account/bundler path).

**Acceptance criteria**
- Extension can submit an update request as a signed payload and receive an onchain update without the user paying gas (testnet).

---

### Milestone 6 — Web2 Fallback Gateway + Install Flow

**Outcome:** Non-extension users do not hit a dead end.

- Configure wildcard DNS for `*.forest.mushroom.box` to point to a gateway (Cloudflare/Workers or equivalent).
- Gateway behavior:
  - If extension not present: render an install/learn-more page, and optionally a “centralized render” preview mode.
  - If extension present: users typically never hit the gateway due to local interception.

**Acceptance criteria**
- Visiting a matching domain without the extension always returns a valid page (not DNS failure).

---

### Milestone 7 — Hardening + Store Readiness

**Outcome:** Ready for public distribution.

- Threat modeling and security checks:
  - Content injection boundaries
  - Cache poisoning resistance
  - RPC/IPFS endpoint trust and overrides
- Performance checks (cold start, caching, RPC batching).
- Web Store compliance checks for MV3 permissions and content policies.

**Acceptance criteria**
- Minimal permission set is justified and documented.
- No remote-code execution patterns; build artifacts are reproducible.

## Suggested Build Order (If We Want Fast Proof)

1. Milestone 1 → show the renderer reliably (most confidence-building)
2. Milestone 2 → resolve real onchain data
3. Milestone 3 → render safe templates + cache
4. Milestone 4 → ship a usable MVP UX
5. Milestones 5–7 → scale, gasless UX, and distribution

---

## 中文版本（面向所有人可读）

本仓库当前是一个 Chrome 扩展模板工程。目标产品（见 [Solution.md](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/docs/Solution.md)）是一个“本地网关（Local Gateway）”，让普通 Chrome 在安装扩展后，就像原生支持如下能力一样：

- 域名命名空间：`*.forest.mushroom.box`
- 链上名称系统（ENS 风格）解析
- IPFS（或兼容网关）内容分发

扩展会拦截匹配域名的访问请求，在本地通过 RPC 解析链上记录、通过 IPFS 网关获取内容，并使用扩展自身代码安全渲染页面（满足 Chrome Web Store / MV3 要求）。对于未安装扩展的用户，可选提供 Web2 兜底网关。

### 背景

核心思路是把“解析 + 渲染”的能力放到用户浏览器本地，而不是依赖中心化网关（类似 `eth.limo` 的服务端解析）。扩展扮演翻译层：

`sunflower.forest.mushroom.box` → 链上解析记录（Resolver 输出）→ 内容地址（contenthash / IPFS CID）→ 本地确定性渲染页面

希望同时满足：

- 可用性：任一可用 RPC + 任一可用 IPFS 网关即可访问
- 主权性：用户可拥有/更新子域名内容（直接上链或签名委托）
- 传播性：Web2 链接分享给未装扩展用户，也不至于“死链”

### 产品目标

- 安装扩展后，`*.forest.mushroom.box` 在 Chrome 中“直接可用”
- 渲染方案满足 Chrome Web Store / Manifest V3 安全要求
- 扩展内置完整用户路径：
  - RPC / IPFS 网关配置
  - 注册（申请子域名）
  - 管理（更新主页字段与内容指针）
- 通过缓存降低 RPC/IPFS 延迟与限流影响

### v0 非目标

- 不在扩展高权限上下文中执行从 IPFS 拉取的远程 HTML/JS（避免远程代码执行）
- 不做通用 `.eth` 浏览器，范围聚焦 Mushroom Forest 命名空间
- 不在 v0 完成复杂反女巫身份体系（先用轻量风控/配额）

### 关键约束（来自 Solution.md）

- MV3 + Web Store 对“远程代码执行”非常敏感：不要把 IPFS 的 HTML/JS 当成可执行代码加载
- 推荐“内置模板 + 远程数据（JSON/Markdown/图片）”的渲染模式
- 若要支持未安装扩展用户，必须做 `*.forest.mushroom.box` 的泛解析（否则用户会先遇到 DNS 失败，网关都接不到请求）
- 公共 RPC / 公共 IPFS 网关会限流：必须有缓存与可配置端点

### 方案设计（系统设计）

#### 总体架构

```
用户访问: https://<name>.forest.mushroom.box/...
        |
        | (A) 已安装扩展
        v
Chrome MV3 扩展
  - 访问拦截（DNR）
  - 渲染页（扩展页面）
  - 链上解析客户端（RPC）
  - 内容获取（IPFS 网关）
  - 缓存（storage / 本地索引缓存）
  - 控制台（注册 / 管理）
        |
        | RPC 调用 + IPFS 获取
        v
RPC 节点 / IPFS 网关
        |
        |（可选：免 Gas）
        v
中继/控制器服务（验签、风控、发交易）

        | (B) 未安装扩展
        v
泛解析 DNS -> Web2 兜底网关（安装引导 / 可选中心化渲染预览）
```

#### 核心组件与职责

- 访问拦截（MV3 / DNR）
  - 目标：装了扩展后访问不依赖公网 DNS/HTTP
  - 手段：对 `main_frame` 匹配 `*.forest.mushroom.box` 做重定向到扩展渲染页
- 渲染器（安全组装页面）
  - 输入：原始 URL、链上解析结果、IPFS 数据、缓存
  - 输出：使用扩展内置模板渲染的页面
  - 规则：只把远程内容当数据，不执行远程脚本
- 解析客户端（RPC）
  - 目标：`name -> records`
  - 能力：namehash/规范化、resolver 查找、读取 `contenthash` 与必要 text records
  - 需求：端点可配置、并发/超时/重试、错误可解释
- 内容获取（IPFS 网关）
  - 目标：按 CID 拉取允许类型内容（JSON/Markdown/图片）
  - 需求：类型校验、大小限制、429/5xx 退避
- 缓存
  - 目标：降低延迟与公共基础设施限流风险
  - 最小策略：resolver 结果按 TTL 缓存；IPFS payload 按 CID 缓存
- 扩展控制台（Dashboard）
  - 目标：把注册/管理闭环放在扩展内部完成
  - 功能：配置、注册、编辑、发布、上链更新
- 可选：中继/控制器（免 Gas）
  - 目标：用户“只签名”，服务端代发交易
  - 职责：验签、风控/配额、提交交易、回传状态
- 可选：Web2 兜底网关（未装扩展）
  - 目标：避免“点击即 DNS 失败”
  - 依赖：`*.forest.mushroom.box` 泛解析到网关

#### 数据模型（概念）

- ForestName：`hostname / label / parent / path`
- ResolvedRecords：`node / resolver / contenthash / texts / timestamp`
- ContentBundle：`cid / type / payload`
- RenderedViewState：`name / records / bundle / errors`

#### 关键流程

- 访问（已装扩展）
  - 拦截重定向 → 读取原始 URL → 查缓存 → RPC 解析 → IPFS 拉取 → 内置模板渲染 → 写缓存
- 访问（未装扩展）
  - 泛解析命中网关 → 返回安装引导页（可选中心化渲染预览并明确提示）
- 注册
  - 扩展控制台提交 → 直接上链或签名提交给中继 → 注册完成后展示域名与记录
- 更新
  - 扩展内编辑 → 发布允许类型内容到 IPFS → 更新链上指针（直发或中继）→ 刷新/失效缓存

### 关键风险（技术与体验）

- Web Store 审核：远程代码执行/动态注入风险必须规避（内置模板 + 远程数据）
- 未做泛解析时的“死胡同”：DNS 失败会让网关无法介入
- 公共 RPC/IPFS 限流：必须缓存 + 端点可配置
- 信任边界不清：如果有中心化兜底渲染，必须显式披露，避免误导
- 免 Gas 的密钥风险：单一 EOA 是高风险点，后续可演进到更安全的账户模型
