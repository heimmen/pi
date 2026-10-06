# cc-haha 的 agent 循环 —— 与 pi `agent-loop.ts` 对照

这个仓库是 **Claude Code 的衍生版**。与 pi `packages/agent` 的 `agent-loop.ts` 最直接对应的是 `src/query.ts` 里的 `queryLoop()`（约 244–1737 行，主循环 `while (true)` 在 310 行）。

![08-queryLoop-control-flow](08-queryLoop-control-flow.png)

> 图 1 由 [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) 从同目录 `08-queryLoop-control-flow.mmd` 渲染，中文字体 Noto Sans CJK SC。

```mermaid
flowchart TD
  START(["query / queryLoop 入口"]) --> STATE0["初始化 state<br/>messages · toolUseContext · turnCount=1<br/>预算/预取预热"]
  STATE0 --> PREP["每轮迭代 start<br/>yield stream_request_start"]
  PREP --> CTX["上下文打理（顺序执行）<br/>snip → microcompact → contextCollapse<br/>→ autocompact · 产出 compaction 摘要消息<br/>→ 更新 messagesForQuery"]
  CTX --> BUDGET["阻塞检查<br/>计算并压制 over-limit？"]
  BUDGET -->|"是 blocking_limit"| RBLOCK["yield 超长错误消息<br/>return blocking_limit"]
  BUDGET -->|否| MODEL["deps.callModel(...)<br/>Anthropic 流式请求（含 fallback/缓存）"]
  MODEL --> STR{"流式事件 loop"}
  STR -->|"assistant 消息"| AM["收集 assistantMessages<br/>提取 tool_use 块 → toolUseBlocks<br/>needsFollowUp = true<br/>（若开流式工具执行则 addTool）"]
  STR -->|"tool_result 消息"| TR["yield 并收集 toolResults"]
  STR -->|"error / fallback"| FB{"FallbackTriggered?"}
  FB -->|"是且 fallbackModel"| FBSW["切换 model → attemptWithFallback<br/>清空累积的消息 重新请求"]
  FBSW --> MODEL
  FB -->|否| ERR["yield 错误助手消息<br/>return model_error"]
  AM --> EOS["流结束（需 fallback / error 处理）"]
  TR --> EOS
  EOS --> ABORT{"已 abort ?"}
  ABORT -->|是| RABORT["补发缺失 tool_result<br/>yield 中断消息<br/>return aborted_streaming"]
  ABORT -->|否| NEEDS{"needsFollowUp ?"}
  NEEDS -->|"否（无 tool_use）"| REC{"可恢复错误被抑制?<br/>prompt-too-long / max-tokens / media"}
  REC -->|"可折叠/可压缩"| DRAIN{"collapse 或 reactiveCompact 成功?"}
  DRAIN -->|是| RETRY["重建 state · transition 标记<br/>continue 重试"]
  DRAIN -->|否| RERR["yield 被抑制的错误<br/>return prompt_too_long / image_error"]
  REC -->|"max_output_tokens"| OTF{"恢复次数 < 上限?"}
  OTF -->|是| OTRETRY["注入 recovery 元消息<br/>maxOutputTokensRecoveryCount+1<br/>continue"]
  OTF -->|否| OTFULL["surface 错误"]
  REC -->|否·正常结束| STOPHOOK["handleStopHooks(...)<br/>← 相当于 finishTurn"]
  STOPHOOK --> SHP{"preventContinuation?"}
  SHP -->|是| RSTOP["return stop_hook_prevented"]
  STOPHOOK --> SHB{"blockingErrors 非空?"}
  SHB -->|是| SHRETRY["追加 blocking 错误<br/>stopHookActive=true · continue"]
  SHP -->|否| BUDB{"TOKEN_BUDGET"}

  NEEDS -->|"是（有 tool_use）"| EXECTOOL["执行工具<br/>streamingToolExecutor 或 runTools(toolUseBlocks)<br/>→ 逐条 yield tool_result + 更新 toolUseContext"]
  EXECTOOL --> EXABORT{"工具中 abort?"}
  EXABORT -->|是| RTABORT["yield 中断消息<br/>return aborted_tools"]
  EXABORT -->|否| PREVENT{"hook 阻止继续?"}
  PREVENT -->|是| RHOOK["return hook_stopped"]
  PREVENT -->|否| ATTACH["注入 attachments<br/>队列命令 · memory 预取 · skill 预取<br/>→ 全部追加到 toolResults"]
  ATTACH --> MAXT{"maxTurns 且 turnCount+1 > maxTurns?"}
  MAXT -->|是| RMAX["yield max_turns_reached<br/>return max_turns"]
  MAXT -->|否| CONTINUE["state = messages+assistant+toolResults<br/>turnCount+1 · transition=next_turn<br/>continue 到下一轮"]

  BUDB -->|"continue"| BUDRETRY["注入 token-budget 提示元消息 · continue"]
  BUDB -->|"空/完成"| COMPLETE["return completed"]
```

## pi ↔ cc-haha 一一对照

![09-pi-vs-queryLoop-mapping](09-pi-vs-queryLoop-mapping.png)

```mermaid
flowchart LR
  subgraph pi["pi packages/agent · agent-loop.ts · 通用内核"]
    direction TB
    runLoop["runLoop 双层循环<br/>（工具 + steering 内层 / follow-up 外层）"]
    streamFn["streamFunction(model, ctx, opts)<br/>模型无关，可换 provider"]
    exec["executeToolCalls<br/>并行 / 串行 + before/after 钩子"]
    finish["finishTurn / prepareNextTurn / prepareRequest"]
    transform["transformContext → convertToLlm"]
    events["AgentEvent 事件流 + subscribe"]
  end

  subgraph cc["cc-haha · src/query.ts · Claude Code 生产实现"]
    direction TB
    queryLoop["queryLoop 单层 while(<br/>state 每次 continue 整体重写)"]
    callModel["deps.callModel(...)<br/>绑定 Anthropic 流式 + fallback/缓存"]
    runTools["runTools / StreamingToolExecutor"]
    stopHooks["handleStopHooks / transitions"]
    compact["autocompact / microcompact /<br/>snip / contextCollapse"]
    gen["yield StreamEvent / Message<br/>AsyncGenerator 流"]
  end

  runLoop -.-|"≈ 控制流"| queryLoop
  streamFn -.-|"≈ LLM 边界"| callModel
  exec -.-|"≈ 工具执行"| runTools
  finish -.-|"≈ 收尾/决策"| stopHooks
  transform -.-|"≈ 上下文打理"| compact
  events -.-|"≈ 事件流"| gen
```

