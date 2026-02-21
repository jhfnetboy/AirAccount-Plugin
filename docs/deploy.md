# Deploy Guide (Milestone 6) — Cloudflare Workers Wildcard Gateway

This document captures the deployment steps and key design notes discussed for Milestone 6: providing a Web2 fallback gateway so users without the extension do not hit a DNS dead end.

## What We Intercept (Not DNS)

The extension does **not** intercept at the DNS layer. It intercepts at the **browser navigation/request layer** for `main_frame`:

- When the extension is installed, a `declarativeNetRequest` (DNR) rule redirects matching navigations for `*.forest.mushroom.box` to an extension-owned renderer page.
- Because the browser request is redirected before it goes out to the network, extension users typically do **not** depend on public DNS records for each subdomain (e.g. `aaa.forest.mushroom.box`).

Implication:

- For **extension users**, you do **not** need to create per-subdomain DNS records.
- For **non-extension users**, you **must** provide wildcard DNS routing so requests resolve and reach a gateway. This is exactly what Milestone 6 requires.

Reference:

- DNR rule: [forest.rules.json](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/chrome-extension/public/forest.rules.json)

## “Automatic Registration” Clarification

There are two different “registration” concepts:

### A) DNS record automation (usually unnecessary)

If `*.forest.mushroom.box` is configured as a wildcard to a gateway (Workers), you do **not** need to create DNS records for `AAA.forest.mushroom.box`, `BBB.forest.mushroom.box`, etc.

Cloudflare’s DNS API for creating per-subdomain records is therefore usually not needed.

### B) Name ownership + content mapping (should be onchain)

The actual mapping for `AAA.forest.mushroom.box` is owned by onchain records:

- namehash(node)
- resolver records (`text:content`, `contenthash`, other text keys)
- optional gasless update via a relayer/controller

If you want an “email signup → allocate name AAA automatically” flow, the backend should automate **onchain name registration / record initialization**, not DNS.

Recommended backend shape:

- A Registration API (e.g. `POST /v1/forest/register`) that validates label rules and performs onchain subname assignment + initial resolver record writes.
- A Relayer API (already exists) for “sign only” updates submitted by users.

## Cloudflare Workers Fallback Gateway (Recommended)

Goal:

- `https://aaa.forest.mushroom.box/` works for non-extension users by reaching a Worker.
- The Worker returns an install/learn-more page (+ optional preview mode later).
- Health endpoint supports monitoring: `GET /healthz` returns `ok`.

### 1) Create the Worker

Cloudflare Dashboard:

1. **Workers & Pages → Create → Worker**
2. Name it (example): `forest-gateway`
3. Replace the script with the minimal gateway below.

Minimal Worker (install page + healthz):

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (request.headers.get("host") || "").toLowerCase();

    const FOREST_SUFFIX = "forest.mushroom.box";
    const isForestHost = host === FOREST_SUFFIX || host.endsWith("." + FOREST_SUFFIX);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (request.method !== "GET") {
      return new Response("not_found", { status: 404 });
    }

    if (!isForestHost) {
      return new Response("not_found", { status: 404 });
    }

    const installUrl = (env.FOREST_INSTALL_URL || "").trim() || "https://github.com/jhfnetboy/AirAccount-Plugin";
    const learnMoreUrl = (env.FOREST_LEARN_MORE_URL || "").trim() || "https://github.com/jhfnetboy/AirAccount-Plugin";

    const escapeHtml = s =>
      String(s).replace(/[&<>"']/g, c => {
        if (c === "&") return "&amp;";
        if (c === "<") return "&lt;";
        if (c === ">") return "&gt;";
        if (c === '"') return "&quot;";
        return "&#39;";
      });

    const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(host)} — Mushroom Forest</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; }
      main { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
      h1 { font-size: 22px; margin: 0 0 12px; }
      p { line-height: 1.6; margin: 0 0 12px; opacity: 0.9; }
      code { padding: 2px 6px; border-radius: 6px; background: rgba(127,127,127,0.15); }
      .card { border: 1px solid rgba(127,127,127,0.35); border-radius: 12px; padding: 16px; margin-top: 16px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
      a.button { display: inline-block; padding: 10px 14px; border-radius: 10px; text-decoration: none; border: 1px solid rgba(127,127,127,0.45); }
      a.primary { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.55); }
      footer { margin-top: 28px; opacity: 0.75; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Mushroom Forest</h1>
      <p>你正在访问：<code>${escapeHtml(host)}</code></p>
      <div class="card">
        <p>这个域名设计为由浏览器扩展在本地解析链上记录并安全渲染（无需信任中心化网关注入远程代码）。</p>
        <p>请先安装扩展以正常访问。</p>
        <div class="actions">
          <a class="button primary" href="${escapeHtml(installUrl)}" rel="noreferrer">安装扩展</a>
          <a class="button" href="${escapeHtml(learnMoreUrl)}" rel="noreferrer">了解更多</a>
        </div>
      </div>
      <footer>Gateway fallback page (no extension detected).</footer>
    </main>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};
```

### 2) Configure Worker Variables

In the Worker dashboard: **Settings → Variables**:

- `FOREST_INSTALL_URL` (recommended: Chrome Web Store listing URL)
- `FOREST_LEARN_MORE_URL` (project landing / docs URL)

### 3) Bind the Custom Domains (root + wildcard)

In the Worker dashboard:

- **Triggers → Custom Domains → Add custom domain**
  - Add: `forest.mushroom.box`
  - Add: `*.forest.mushroom.box`

If wildcard custom domain is not available in your UI, use **Routes**:

- `forest.mushroom.box/*`
- `*.forest.mushroom.box/*`

Important:

- Wildcard does not cover the root, so always include both the root and wildcard patterns.

### 4) DNS Notes

If you use **Custom Domains**, Cloudflare often auto-manages DNS entries. If you use **Routes**, ensure the zone has records that allow the request to reach Cloudflare (typically proxied/orange-cloud).

### 5) Verify

- `https://aaa.forest.mushroom.box/` should return the install page.
- `https://aaa.forest.mushroom.box/healthz` should return `ok`.

## Repo Implementation (Server Alternative)

This repository also contains a Node HTTP service that can act as a fallback gateway and relayer in one process:

- Gateway mode: serves `GET /healthz` and `GET *.forest.mushroom.box` install page
- Relayer mode: enables `POST /v1/forest/update-text` when relayer env is provided

Reference:

- Service: [index.ts](file:///Volumes/UltraDisk/Dev2/aastar/AirAccount-Plugin/packages/forest-controller/src/index.ts)

For Workers deployment, prefer the Worker script above; it is simpler and removes the need to host a Node process for the fallback page.

