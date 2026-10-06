# cc-haha 的 state 控制 —— 与 pi 对照

cc-haha 没有 pi `agent-core` 那种「单一状态对象 + 事件归约」，而是**四层分工、无统一 reducer**：循环本地 `State`、`ToolUseContext`、应用态 Store、消费方转录本。

## 图 1：cc-haha 四层 state 架构

![10-cc-haha-state-control](10-cc-haha-state-control.png)

> 图由 [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) 从同目录 `10-cc-haha-state-control.mmd` 渲染，中文字体 Noto Sans CJK SC。

```mermaid
flowchart TD
  Q["query / queryLoop<br/>AsyncGenerator<br/>（yield 消息 · continue 循环）"]

  subgraph L1["① 循环本地 State · 一轮内流动"]
    S1["State<br/>messages · toolUseContext · turnCount<br/>autoCompactTracking · pendingToolUseSummary · transition"]
    S2["7 个 continue 点整体重写<br/>state = { ... }"]
  end

  subgraph L2["② ToolUseContext · 跨轮会话上下文"]
    T1["options · abortController · readFileState"]
    T2["函数式 setter<br/>setAppState(f) · setInProgressToolUseIDs(f)<br/>setResponseLength(f) · appendSystemMessage"]
  end

  subgraph L3["③ 应用态 Store · UI / 权限 / 运行指标"]
    A1["createStore<br/>getState · setState(updater) · subscribe"]
    A2["AppState = DeepImmutable"]
  end

  subgraph L4["④ 转录本 · 归消费方所有（非 Agent）"]
    C1["REPL.tsx<br/>setMessages(prev => [...prev, msg])"]
    C2["QueryEngine / SDK<br/>messages.push(message)"]
  end

  Q -->|yield 消息| C1
  Q -->|yield 消息| C2
  Q -->|continue| S2
  S2 -->|重写| S1
  S1 -.->|读写| T1
  S1 -.->|读写| T2
  T2 -->|"setAppState 写入"| A1
  A1 -->|"更新与通知订阅者"| A2


  style L1 fill:#dbeafe,stroke:#3b82f6
  style L2 fill:#dcfce7,stroke:#22c55e
  style L3 fill:#fef9c3,stroke:#eab308
  style L4 fill:#ffedd5,stroke:#f97316
```

## 图 2：pi ↔ cc-haha 状态模型对照

![11-pi-vs-cc-state](11-pi-vs-cc-state.png)

```mermaid
flowchart LR
  subgraph P["pi agent-core · 单一状态 + 事件归约"]
    direction TB
    P0["loop currentContext<br/>（快照，循环自由改）"]
    PW["processEvents()<br/>唯一的写回通道 + 订阅屏障"]
    P1["Agent._state<br/>messages · streaming · pending tools"]
    EP["外部写入口<br/>steer/followUp · reset · abort"]
  end
  subgraph C["cc-haha · 四层分工 · 无统一 reducer"]
    direction TB
    C1["① State（query.ts）<br/>循环本地 · continue 重写"]
    C2["② ToolUseContext<br/>会话上下文 · 函数式 setter"]
    C3["③ createStore / AppState<br/>UI · 权限 · 运行指标"]
    C4["④ 消费方 messages<br/>REPL / QueryEngine 各自 push"]
  end

  P0 -->|"事件流"| PW
  PW -->|"归约"| P1
  EP -.->|"仅在边界操作"| P1

  C1 --> C2 --> C3
  C1 -->|"yield"| C4

  style P fill:#dbeafe,stroke:#3b82f6
  style C fill:#fef9c3,stroke:#eab308
```

