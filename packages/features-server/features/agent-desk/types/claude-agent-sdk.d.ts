declare module "@anthropic-ai/claude-agent-sdk" {
  interface QueryOptions {
    prompt: string;
    options?: {
      cwd?: string;
      abortController?: AbortController;
      permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
      allowedTools?: string[];
      maxTurns?: number;
      systemPrompt?: {
        type: "preset";
        preset: string;
        append?: string;
      };
    };
  }

  interface SDKMessage {
    type: string;
    subtype?: string;
    message?: {
      content: Array<{ text?: string; name?: string; type?: string }>;
    };
  }

  export function query(options: QueryOptions): AsyncIterable<SDKMessage>;
}
