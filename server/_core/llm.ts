import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  agentOverride?: "local" | "vps" | "openrouter";
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const DEFAULT_MODEL = ENV.llmModel || "google/gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = 8192;

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseText?: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

let cachedLocalUrl: string | null = null;

export async function detectActiveLocalUrl(): Promise<string> {
  if (cachedLocalUrl) return cachedLocalUrl;

  const candidateUrls = [
    ENV.localLlmUrl, // Custom configured URL
    "http://localhost:11434/v1/chat/completions", // Ollama
    "http://localhost:8080/v1/chat/completions",  // Llama.cpp / OpenClaw
    "http://localhost:1234/v1/chat/completions",  // LM Studio
  ].filter((url): url is string => !!url);

  console.log("[AI Auto-Detect] Probing candidate local LLM endpoints:", candidateUrls);

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 120); // Quick 120ms timeout
      
      const baseUrl = url.endsWith("/chat/completions") ? url.replace("/chat/completions", "/models") : url;
      const response = await fetch(baseUrl, { 
        method: "GET",
        signal: controller.signal 
      });
      clearTimeout(id);
      
      if (response.ok || response.status === 404 || response.status === 401) {
        console.log(`[AI Auto-Detect] Active local LLM detected at: ${url}`);
        cachedLocalUrl = url;
        return url;
      }
    } catch (e) {
      // offline
    }
  }

  // Fallback if none detected
  const fallback = ENV.localLlmUrl || "http://localhost:8080/v1/chat/completions";
  console.log(`[AI Auto-Detect] No online local LLM detected. Defaulting to: ${fallback}`);
  return fallback;
}

export async function resolveLocalModel(targetUrl: string, requestedModel: string): Promise<string> {
  try {
    const modelsUrl = targetUrl.replace("/chat/completions", "/models");
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 350); // 350ms timeout
    const res = await fetch(modelsUrl, { 
      headers: buildHeaders(targetUrl),
      signal: controller.signal 
    });
    clearTimeout(id);
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> };
      if (data && data.data && data.data.length > 0) {
        const availableModelIds = data.data.map(m => m.id);
        console.log(`[AI Auto-Detect] Available local models at ${targetUrl}:`, availableModelIds);
        if (availableModelIds.includes(requestedModel)) {
          return requestedModel;
        }
        console.log(`[AI Auto-Detect] Requested model "${requestedModel}" not found. Swapping to active local model: "${availableModelIds[0]}"`);
        return availableModelIds[0];
      }
    }
  } catch (err) {
    // ignore models check error, fallback
  }
  return requestedModel;
}

const resolveApiUrl = async (agentOverride?: string) => {
  const activeAgent = agentOverride || "local";
  if (activeAgent === "local") {
    return await detectActiveLocalUrl();
  }
  if (activeAgent === "vps") return ENV.vpsLlmUrl || "https://openrouter.ai/api/v1/chat/completions";
  return ENV.llmApiUrl || "https://openrouter.ai/api/v1/chat/completions";
};

const resolveStreamApiUrl = async (agentOverride?: string) => {
  return await resolveApiUrl(agentOverride);
};

const assertApiKey = async (agentOverride?: string) => {
  const targetUrl = await resolveApiUrl(agentOverride);
  if (targetUrl.includes("openrouter.ai") && !process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables");
  }
};

const buildHeaders = (targetUrl: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // ONLY send OpenRouter key if target is actually openrouter.ai
  if (targetUrl.includes("openrouter.ai")) {
    if (ENV.openRouterApiKey) {
      headers["Authorization"] = `Bearer ${ENV.openRouterApiKey.trim()}`;
    }
    headers["Referer"] = "https://bible-study-pro.com";
    headers["X-Title"] = "Bible Study Pro";
  } else if (targetUrl.includes("localhost:8888") || targetUrl.includes("127.0.0.1:8888") || targetUrl.includes(":8888")) {
    headers["Authorization"] = "Bearer sk-unsloth-71c916f6dde7eaedd2c64d76d089aa9a";
  }
  
  return headers;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  await assertApiKey(params.agentOverride);

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    agentOverride,
  } = params;

  const targetUrl = await resolveApiUrl(agentOverride);

  let targetModel = model;
  if (!targetModel) {
    const activeAgent = agentOverride || "local";
    if (activeAgent === "local") {
      targetModel = ENV.localLlmModel || "meta-llama/llama-3.1-8b-instruct";
    } else if (activeAgent === "vps") {
      targetModel = ENV.vpsLlmModel || "meta-llama/llama-3.1-8b-instruct";
    } else {
      targetModel = ENV.llmModel || DEFAULT_MODEL;
    }
  }

  // If local, automatically discover and use the available model (e.g. what is running in Ollama/LM Studio)
  if (targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1")) {
    targetModel = await resolveLocalModel(targetUrl, targetModel);
  }

  const payload: Record<string, unknown> = {
    model: targetModel,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = DEFAULT_MAX_TOKENS;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: buildHeaders(targetUrl),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `LLM invoke failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText,
      );
    }

    return (await response.json()) as InvokeResult;
  } catch (err: any) {
    if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
      const serverType = targetUrl.includes("11434") ? "Ollama" : targetUrl.includes("1234") ? "LM Studio" : "OpenClaw/Llama.cpp";
      throw new Error(`Local AI Server offline. Please start ${serverType} on your Mac. If you are using Ollama, run 'ollama run llama3.1' in your terminal.`);
    }
    throw err;
  }
}

export async function* invokeLLMStream(params: InvokeParams): AsyncGenerator<string, void, unknown> {
  await assertApiKey(params.agentOverride);

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    model,
    agentOverride,
  } = params;

  const targetUrl = await resolveStreamApiUrl(agentOverride);

  let targetModel = model;
  if (!targetModel) {
    const activeAgent = agentOverride || "local";
    if (activeAgent === "local") {
      targetModel = ENV.localLlmModel || "meta-llama/llama-3.1-8b-instruct";
    } else if (activeAgent === "vps") {
      targetModel = ENV.vpsLlmModel || "meta-llama/llama-3.1-8b-instruct";
    } else {
      targetModel = ENV.llmModel || DEFAULT_MODEL;
    }
  }

  // If local, automatically discover and use the available model (e.g. what is running in Ollama/LM Studio)
  if (targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1")) {
    targetModel = await resolveLocalModel(targetUrl, targetModel);
  }

  const payload: Record<string, unknown> = {
    model: targetModel,
    messages: messages.map(normalizeMessage),
    stream: true,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = DEFAULT_MAX_TOKENS;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: buildHeaders(targetUrl),
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
      const serverType = targetUrl.includes("11434") ? "Ollama" : targetUrl.includes("1234") ? "LM Studio" : "OpenClaw/Llama.cpp";
      throw new Error(`Local AI Server offline. Please start ${serverType} on your Mac. If you are using Ollama, run 'ollama run llama3.1' in your terminal.`);
    }
    throw err;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new LLMError(
      `LLM stream invoke failed: ${response.status} ${response.statusText}`,
      response.status,
      errorText,
    );
  }

  if (!response.body) {
    throw new LLMError("Stream response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createSSEStream(params: InvokeParams): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const token of invokeLLMStream(params)) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ token })}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown streaming error";
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });
}
