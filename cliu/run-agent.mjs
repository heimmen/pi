import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

// 1. 读取 claude-code-router 配置文件中的 API Key、base url 与 model
const configPath = join(homedir(), ".claude-code-router/config.json.sf.ds-v32");
let apiKey = "";
let baseUrl = "https://api.siliconflow.cn/v1";
let modelId = "deepseek-ai/DeepSeek-V3.2";

try {
  const routerConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  const deepseekProvider = routerConfig.Providers?.find((p) => p.name === "deepseek");
  if (deepseekProvider) {
    apiKey = deepseekProvider.api_key;
    baseUrl = deepseekProvider.api_base_url.replace(/\/chat\/completions\/?$/, "");
    if (deepseekProvider.models?.[0]) {
      modelId = deepseekProvider.models[0];
    }
  }
} catch (err) {
  console.warn(`[Warning] 无法读取配置文件 ${configPath}:`, err.message);
}

const userPrompt = process.argv[2] || "请列出上级目录 package.json 的 name 和版本号。";

console.log(`\x1b[36m[Pi Agent]\x1b[0m 初始化配置:`);
console.log(`  - 基础 URL: ${baseUrl}`);
console.log(`  - 目标模型: ${modelId}`);
console.log(`  - 工作目录: ${process.cwd()}`);

// 2. 初始化 ModelRuntime 并注册 Provider
const modelRuntime = await ModelRuntime.create();

modelRuntime.registerProvider("siliconflow", {
  name: "SiliconFlow",
  baseUrl: baseUrl,
  api: "openai-completions",
  apiKey: apiKey,
  models: [
    {
      id: modelId,
      name: "DeepSeek V3.2 (SiliconFlow)",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 64000,
      maxTokens: 4096,
      compat: {
        maxTokensField: "max_tokens",
      },
    },
  ],
});

const targetModel = modelRuntime.getModel("siliconflow", modelId);
if (!targetModel) {
  throw new Error(`未找到目标模型 siliconflow/${modelId}`);
}

console.log(`\x1b[32m[Model]\x1b[0m 已配置模型: ${targetModel.provider}/${targetModel.id}`);
console.log(`\x1b[34m[Prompt]\x1b[0m ${userPrompt}\n`);
console.log("----------------------------------------\n");

// 3. 创建 Agent 会话
const { session } = await createAgentSession({
  cwd: process.cwd(),
  model: targetModel,
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});

try {
  // 4. 监听事件流输出
  session.subscribe((event) => {
    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent;
      if (sub.type === "text_delta") {
        process.stdout.write(sub.delta);
      } else if (sub.type === "thinking_delta") {
        process.stdout.write(`\x1b[90m${sub.delta}\x1b[0m`);
      }
    } else if (event.type === "tool_execution_start") {
      console.log(`\n\x1b[33m[Tool Call]\x1b[0m ${event.toolName}(${JSON.stringify(event.args || {})})`);
    } else if (event.type === "tool_execution_end") {
      console.log(`\x1b[32m[Tool Done]\x1b[0m ${event.toolName}\n`);
    }
  });

  // 5. 执行 prompt
  await session.prompt(userPrompt);

  console.log("\n\n----------------------------------------");
  console.log("\x1b[32m[Done]\x1b[0m 会话执行完成。");
} catch (err) {
  console.error("\x1b[31m[Error]\x1b[0m 执行出错:", err);
} finally {
  session.dispose();
}
