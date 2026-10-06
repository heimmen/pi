# packages/agent 内部执行关系图

对应源码：[`packages/agent/src`](../../packages/agent/src)。图片由 [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) 从同目录 `*.mmd` 渲染，中文字体使用 Noto Sans CJK SC。

重新渲染单个图：

```bash
npx -y @mermaid-js/mermaid-cli@11.17.0 \
  -i 01-module-dependencies.mmd -o 01-module-dependencies.png \
  -p puppeteer-config.json -c mermaid-config.json -b white -s 2 -w 1600
```

## 图 1：模块静态依赖（单向无环）

![01-module-dependencies](01-module-dependencies.png)

```mermaid
graph TD
  index["index.ts 桶导出"]
  agent["agent.ts<br/>Agent 状态 + 队列 + 事件分发"]
  loop["agent-loop.ts<br/>无状态循环内核"]
  sf["stream-fn.ts<br/>默认 StreamFn 注册表"]
  proxy["proxy.ts<br/>HTTP/SSE 版 StreamFn"]
  types["types.ts<br/>纯类型层"]
  pai["@earendil-works/pi-ai"]

  index --> agent
  index --> loop
  index --> proxy
  index --> types
  index -->|setDefaultStreamFn| sf
  agent -->|runAgentLoop / runAgentLoopContinue| loop
  agent -->|getDefaultStreamFn| sf
  loop -->|getDefaultStreamFn| sf
  agent -.->|类型| types
  loop -.->|类型| types
  sf -.->|类型| types
  agent --> pai
  loop --> pai
  proxy --> pai
```

## 图 2：prompt() 调用时序

![02-prompt-sequence](02-prompt-sequence.png)

```mermaid
sequenceDiagram
  autonumber
  participant U as 调用方
  participant A as Agent (agent.ts)
  participant L as runLoop (agent-loop.ts)
  participant S as StreamFn
  participant T as Tool.execute

  U->>A: prompt("...")
  A->>A: normalizePromptInput → AgentMessage[]
  A->>A: runWithLifecycle 建 AbortController，isStreaming=true
  A->>L: runAgentLoop(prompts, contextSnapshot, loopConfig, emit, signal, streamFn)
  L->>L: declareToolChanges() 工具差集 → system 消息
  L-->>A: emit agent_start / turn_start / message_start+end
  A-->>U: await 监听器，形成屏障
  L->>L: prepareNextTurn → prepareRequest
  L->>S: streamFunction(model, llmContext, opts)
  S-->>L: start / text_delta / toolcall_delta ... / done
  L-->>A: emit message_start / message_update* / message_end
  A-->>U: 流式增量
  L->>T: execute(id, args, signal, onUpdate)
  T-->>L: onUpdate → tool_execution_update
  L-->>A: emit tool_execution_start/end + toolResult message_start/end
  L->>L: finishTurn → turn_end
  alt 有工具结果 / steering / follow-up
    L->>S: 发起下一轮请求
  else 结束
    L-->>A: emit agent_end
    A->>A: finishRun，isStreaming=false，resolve(activeRun)
  end
```

## 图 3：runLoop 双层控制流

![03-runloop-control-flow](03-runloop-control-flow.png)

```mermaid
flowchart TD
  START(["runLoop 入口"]) --> STEER0["pendingMessages =<br/>getSteeringMessages()"]
  STEER0 --> OUTER{"外层 while true"}
  OUTER --> INNER{"内层 hasMoreToolCalls<br/>或 pendingMessages 非空"}
  INNER -->|是| PREP["lastCompletedTurn 存在时<br/>prepareNextTurn 换 context/model<br/>并补投一次 steering"]
  PREP --> DECL["declareToolChanges<br/>emit message_start/end"]
  DECL --> PREQ["prepareRequest<br/>可整体替换 context/model"]
  PREQ --> STREAM["streamAssistantResponse<br/>transformContext 然后 convertToLlm 然后 StreamFn"]
  STREAM --> STOP{"stopReason 是<br/>error 或 aborted"}
  STOP -->|是| HARD["finishTurn 然后 turn_end 然后 agent_end<br/>直接 return"]
  STOP -->|否| TC{"有 toolCall 吗"}
  TC -->|"是且 length 截断"| FAIL["failToolCallsFromTruncatedMessage<br/>全部判失败不执行"]
  TC -->|是| EXEC["executeToolCalls<br/>串行或并行"]
  TC -->|否| FT
  FAIL --> FT["finishTurn 然后 turn_end"]
  EXEC --> FT
  FT --> ENDQ{"decision.action"}
  ENDQ -->|end| AE1["emit agent_end 然后 return"]
  ENDQ -->|continue| EC["explicitContinuation = true"]
  ENDQ -->|undefined| POLL
  EC --> POLL{"poll steering 或<br/>hasMoreToolCalls"}
  POLL -->|是| RESET["explicitContinuation = false"] --> INNER
  POLL -->|否| INNER
  INNER -->|否| FOLLOW{"followUp 非空"}
  FOLLOW -->|是| SETP["pendingMessages = followUp"] --> OUTER
  FOLLOW -->|否| EXPL{"explicitContinuation"}
  EXPL -->|是| OUTER
  EXPL -->|否| AE2["emit agent_end 然后 return"]
```

## 图 4：工具执行三段式与两种模式

![04-tool-execution](04-tool-execution.png)

```mermaid
flowchart TD
  subgraph PREP["阶段一 prepareToolCall，逐条串行"]
    P1["find tool by name"] --> P2["prepareArguments 兼容 shim"]
    P2 --> P3["validateToolArguments 校验"]
    P3 --> P4["beforeToolCall 钩子"]
  end
  P4 --> P5{"block 或校验失败"}
  P5 -->|是| IMM["immediate error result<br/>terminate 透传"]
  P4 -.->|"signal.aborted"| AB["Operation aborted"]
  P5 -->|否| MODE{"toolExecution 为 sequential<br/>或本批含 executionMode sequential"}
  MODE -->|是| SEQ["逐条 execute 再 finalize<br/>emit end 与 result 均保序"]
  MODE -->|否| PAR["execute 用 Promise.all 并发<br/>finalize 按完成顺序<br/>end 事件按完成序<br/>toolResult 消息按源序"]
  SEQ --> AGC{"afterToolCall 存在"}
  PAR --> AGC
  AGC -->|是| OVR["content / details / usage<br/>isError / terminate 逐字段覆盖"]
  AGC -->|否| TERM
  OVR --> TERM{"本批每条 terminate 均为真"}
  TERM -->|是| SKIP["跳过后续 LLM 调用"]
  TERM -->|否| NEXT["回到内层循环继续下一轮"]
```

## 图 5：事件到状态回写

![05-event-state](05-event-state.png)

```mermaid
flowchart TD
  E1["message_start / message_update"] --> S1["streamingMessage = message"]
  E2["message_end"] --> S2["streamingMessage = undefined<br/>messages.push 唯一增长点"]
  E3["tool_execution_start"] --> S3["pendingToolCalls 增加 id"]
  E4["tool_execution_end"] --> S4["pendingToolCalls 移除 id"]
  E5["turn_end 带 errorMessage"] --> S5["state.errorMessage 赋值"]
  E6["agent_end"] --> S6["streamingMessage = undefined"]
  S1 --> LIS
  S2 --> LIS
  S3 --> LIS
  S4 --> LIS
  S5 --> LIS
  S6 --> LIS["await 所有 subscribe 监听器<br/>按注册顺序，计入 run settlement"]
  LIS --> IDLE["finishRun<br/>isStreaming=false<br/>activeRun.resolve"]
```

