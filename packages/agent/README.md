# @superset/agent

Shared Claude Agent SDK execution package for running AI agents across different environments.

## Overview

This package provides core agent execution logic that can be consumed by:
- Desktop app (Electron main process)
- Future: Sandbox workers (E2B, Firecracker)
- Future: Cloud agents (Fly.io, Cloudflare Workers)

## Usage

```typescript
import { executeAgent } from "@superset/agent";

await executeAgent({
  sessionId: "session-123",
  prompt: "Create a new React component",
  cwd: "/path/to/project",
  env: {
    ANTHROPIC_API_KEY: "...",
  },
  onChunk: async (chunk) => {
    // Send chunk to streams server or handle locally
  },
  onPermissionRequest: async ({ toolUseId, toolName, input, signal }) => {
    // Handle permission approval
    return { behavior: "allow", updatedInput: input };
    // Or deny: return { behavior: "deny", message: "Not allowed" };
  },
});
```

## Architecture

- `agent-executor.ts` - Main `executeAgent()` function
- `sdk-to-ai-chunks.ts` - Converts SDK events to stream chunks
- `session-store.ts` - Session state management
- `permission-manager.ts` - Permission/approval handling
- `types.ts` - Shared TypeScript types

## Design Principles

- **Environment agnostic** - Core logic doesn't depend on desktop/sandbox/cloud specifics
- **Callback-based** - Consumers inject environment-specific behavior via callbacks
- **Type-safe** - Full TypeScript support with strict types
- **Testable** - Pure functions, easy to mock dependencies
