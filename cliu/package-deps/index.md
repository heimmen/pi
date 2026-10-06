# pi monorepo 包间依赖图

`packages/` 下 13 个 workspace 包之间的内部依赖关系。图片由 [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) 从同目录 `*.mmd` 渲染，中文字体 Noto Sans CJK SC。

**颜色 = 依赖层级**（灰色为最底层，必须最先构建）：

| 颜色 | 层级 | 包 |
| --- | --- | --- |
| 灰 | 基础层 · 无内部依赖 | `chord` `tui` `telemetry` `codemode` `mcp` |
| 蓝 | 模型与运行时层 | `ai` `protocol` |
| 绿 | 服务与传输层 | `agent` `durable` `client` `server` |
| 橙 | 应用层 | `coding-agent` |
| 粉 | 私有 · 仅开发期 | `evals` |

**实线 = `dependencies`（运行时依赖），虚线 `dev` = `devDependencies`（仅开发期）。**

## 图 1：包间依赖全图

![06-monorepo-package-deps](06-monorepo-package-deps.png)

```mermaid
flowchart LR
  chord["chord<br/>@earendil-works/chord<br/>应用组合运行时 · 复制状态 / RPC"]
  tui["tui<br/>@earendil-works/pi-tui<br/>终端 UI 差分渲染"]
  telemetry["telemetry<br/>@earendil-works/pi-telemetry<br/>遥测契约与 schema"]
  codemode["codemode<br/>@earendil-works/pi-codemode<br/>沙箱 JS 执行"]
  mcp["mcp<br/>@earendil-works/pi-mcp<br/>MCP 客户端"]

  protocol["protocol<br/>@earendil-works/pi-protocol<br/>CBOR 会话协议"]
  ai["ai<br/>@earendil-works/pi-ai<br/>统一 LLM API"]

  agent["agent<br/>@earendil-works/pi-agent-core<br/>Agent 循环内核"]
  durable["durable<br/>@earendil-works/pi-durable<br/>持久化会话 / 任务 / 文档"]
  client["client<br/>@earendil-works/pi-client<br/>远程会话客户端"]
  server["server<br/>@earendil-works/pi-server<br/>实验性服务端"]

  coding["coding-agent<br/>@earendil-works/pi-coding-agent<br/>编码 Agent CLI"]

  evals["evals<br/>@earendil-works/pi-evals<br/>私有 · 仅开发期"]

  ai --> telemetry
  protocol --> chord
  agent --> ai
  durable --> chord
  durable --> ai
  client --> chord
  client --> protocol
  server --> chord
  server --> protocol
  coding --> chord
  coding --> agent
  coding --> ai
  coding --> codemode
  coding --> mcp
  coding --> tui

  coding -.->|dev| client
  coding -.->|dev| protocol
  coding -.->|dev| server
  evals -.->|dev| ai
  evals -.->|dev| coding

  classDef base fill:#eeeeee,stroke:#9e9e9e,color:#212121
  classDef mid fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
  classDef svc fill:#dcfce7,stroke:#22c55e,color:#14532d
  classDef app fill:#ffedd5,stroke:#f97316,color:#7c2d12
  classDef priv fill:#fce7f3,stroke:#ec4899,color:#831843

  class chord,tui,telemetry,codemode,mcp base
  class protocol,ai mid
  class agent,durable,client,server svc
  class coding app
  class evals priv

  linkStyle 15,16,17,18,19 stroke-dasharray:6 4
```

## 图 2：分层总览

![07-layer-overview](07-layer-overview.png)

```mermaid
flowchart TB
  subgraph L4["私有 · 仅开发期"]
    evals["evals"]
  end
  subgraph L3["应用层"]
    coding["coding-agent"]
  end
  subgraph L2["服务与传输层"]
    client["client"]
    server["server"]
  end
  subgraph L1["模型与运行时层"]
    ai["ai"]
    agent["agent"]
    durable["durable"]
    protocol["protocol"]
  end
  subgraph L0["基础层 · 无内部依赖"]
    chord["chord"]
    tui["tui"]
    telemetry["telemetry"]
    codemode["codemode"]
    mcp["mcp"]
  end

  L4 -.->|dev| L3
  L4 -.->|dev| L1
  L3 --> L2
  L3 --> L1
  L3 --> L0
  L2 --> L1
  L2 --> L0
  L1 --> L0

  classDef base fill:#eeeeee,stroke:#9e9e9e,color:#212121
  classDef mid fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
  classDef svc fill:#dcfce7,stroke:#22c55e,color:#14532d
  classDef app fill:#ffedd5,stroke:#f97316,color:#7c2d12
  classDef priv fill:#fce7f3,stroke:#ec4899,color:#831843
  class chord,tui,telemetry,codemode,mcp base
  class ai,agent,durable,protocol mid
  class client,server svc
  class coding app
  class evals priv
  linkStyle 0,1 stroke-dasharray:6 4
```

## 依赖边清单

| 来源 | 目标 | 类型 |
| --- | --- | --- |
| `agent` | `ai` | dependencies |
| `ai` | `telemetry` | dependencies |
| `client` | `chord` | dependencies |
| `client` | `protocol` | dependencies |
| `coding-agent` | `chord` | dependencies |
| `coding-agent` | `agent` | dependencies |
| `coding-agent` | `ai` | dependencies |
| `coding-agent` | `codemode` | dependencies |
| `coding-agent` | `mcp` | dependencies |
| `coding-agent` | `tui` | dependencies |
| `durable` | `chord` | dependencies |
| `durable` | `ai` | dependencies |
| `protocol` | `chord` | dependencies |
| `server` | `chord` | dependencies |
| `server` | `protocol` | dependencies |
| `coding-agent` | `client` | devDependencies |
| `coding-agent` | `protocol` | devDependencies |
| `coding-agent` | `server` | devDependencies |
| `evals` | `ai` | devDependencies |
| `evals` | `coding-agent` | devDependencies |

## 第三方依赖（非 workspace）

| 包 | 运行时依赖 |
| --- | --- |
| `agent` | `typebox` |
| `ai` | `@anthropic-ai/sdk` `@aws-sdk/client-bedrock-runtime` `@google/genai` `@smithy/node-http-handler` `http-proxy-agent` `https-proxy-agent` `openai` `partial-json` `typebox` |
| `chord` | `esbuild` |
| `client` | — |
| `codemode` | `quickjs-wasi` |
| `coding-agent` | `@silvia-odwyer/photon-node` `brace-expansion` `chalk` `cross-spawn` `diff` `grok-mermaid` `highlight.js` `hosted-git-info` `ignore` `jiti` `minimatch` `proper-lockfile` `quickjs-wasi` `semver` `typebox` `undici` `yaml` |
| `durable` | `diff` `typebox` |
| `evals` | — |
| `mcp` | `cross-spawn` |
| `protocol` | `typebox` |
| `server` | — |
| `telemetry` | — |
| `tui` | `get-east-asian-width` `marked` |

## 复现

```bash
npx -y @mermaid-js/mermaid-cli@11.17.0 \
  -i 06-monorepo-package-deps.mmd -o 06-monorepo-package-deps.png \
  -p puppeteer-config.json -c mermaid-config.json -b white -s 2 -w 2000
```

> 依赖数据取自各包 `package.json` 的 `dependencies` / `devDependencies`，只保留指向本 monorepo 其他 workspace 的边；`packages/coding-agent/examples/extensions/*` 下的示例 workspace 未纳入。
