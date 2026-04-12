# Voice Agent Implementation Plan (MVP)

Push-to-talk voice interface for creating worktrees via natural language.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                           │
│                                                                 │
│  Push-to-Talk ──► Audio Recorder ──► Voice Store ──► UI        │
│      Hotkey         (Web Audio)       (Zustand)                 │
│                          │                                      │
│                          │ base64 audio                         │
│                          ▼                                      │
│              tRPC: voice.runAgent.subscribe()                   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MAIN PROCESS                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  voiceRouter.runAgent (tRPC subscription)                │  │
│  │                                                          │  │
│  │  1. Transcribe audio (WisprFlow API)                     │  │
│  │  2. Stream to Claude Agent SDK with custom tools         │  │
│  │  3. Forward messages to renderer                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Custom Tools (called by Agent SDK)                      │  │
│  │  - createWorktree({ name, branch?, baseBranch? })        │  │
│  │  - listWorktrees({ projectId? })                         │  │
│  │  - getCurrentContext()                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼ (spawned by SDK)
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE CLI                              │
│  Agent loop, tool execution, API calls                          │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Create/Modify

### 1. Hotkey (update existing)

**File:** `apps/desktop/src/shared/hotkeys.ts`

```typescript
// Add "Voice" to HotkeyCategory
// Add hotkey:
VOICE_PUSH_TO_TALK: defineHotkey({
  id: "VOICE_PUSH_TO_TALK",
  name: "Push to Talk",
  category: "Voice",
  defaults: {
    darwin: "meta+shift+space",
    win32: "ctrl+shift+space",
    linux: "ctrl+shift+space",
  },
})
```

### 2. Audio Recorder (renderer)

**New:** `apps/desktop/src/renderer/lib/audio-recorder.ts`

```typescript
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.mediaRecorder.start();
  }

  async stop(): Promise<string> {
    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        const wav = await convertToWav(blob);
        const base64 = await blobToBase64(wav);
        resolve(base64);
      };
      this.mediaRecorder!.stop();
    });
  }
}

// Convert to 16kHz WAV for WisprFlow
async function convertToWav(blob: Blob): Promise<Blob> { /* ... */ }
async function blobToBase64(blob: Blob): Promise<string> { /* ... */ }
```

### 3. Voice Store (renderer)

**New:** `apps/desktop/src/renderer/stores/voice/store.ts`

```typescript
interface VoiceState {
  isRecording: boolean;
  isProcessing: boolean;
  messages: AgentMessage[];  // Streamed from agent
  error: string | null;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isRecording: false,
  isProcessing: false,
  messages: [],
  error: null,

  startRecording: () => set({ isRecording: true, messages: [], error: null }),
  stopRecording: () => set({ isRecording: false }),
  setProcessing: (v: boolean) => set({ isProcessing: v }),
  addMessage: (msg: AgentMessage) => set((s) => ({ messages: [...s.messages, msg] })),
  setError: (err: string) => set({ error: err, isProcessing: false }),
}));
```

### 4. Voice tRPC Router (main process)

**New:** `apps/desktop/src/lib/trpc/routers/voice/index.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { observable } from "@trpc/server/observable";

export const voiceRouter = router({
  runAgent: publicProcedure
    .input(z.object({ audioBase64: z.string() }))
    .subscription(({ input }) => {
      return observable((emit) => {
        const run = async () => {
          // 1. Transcribe
          const transcription = await transcribeAudio(input.audioBase64);
          emit.next({ type: "transcription", text: transcription });

          // 2. Run agent with custom tools
          for await (const message of query({
            prompt: transcription,
            options: {
              systemPrompt: VOICE_AGENT_PROMPT,
              tools: workspaceTools,  // Custom tools defined below
            }
          })) {
            emit.next({ type: "agent", message });
          }
        };
        run().catch((err) => emit.error(err));
      });
    }),
});

// Custom tools for the agent
const workspaceTools = {
  createWorktree: {
    description: "Create a new worktree/workspace for a feature or bug fix",
    parameters: z.object({
      name: z.string().describe("Human-readable name for the workspace"),
      branch: z.string().optional().describe("Git branch name (auto-generated if omitted)"),
      baseBranch: z.string().optional().describe("Branch to base off of (default: main)"),
    }),
    execute: async ({ name, branch, baseBranch }) => {
      // Call existing workspace creation logic
      const result = await createWorkspace({ name, branch, baseBranch });
      return { success: true, workspaceId: result.id, branch: result.branch };
    },
  },

  listWorktrees: {
    description: "List all current worktrees/workspaces",
    parameters: z.object({}),
    execute: async () => {
      const workspaces = await getAllWorkspaces();
      return workspaces.map(w => ({ id: w.id, name: w.name, branch: w.branch }));
    },
  },

  getCurrentContext: {
    description: "Get info about the currently active workspace",
    parameters: z.object({}),
    execute: async () => {
      const current = await getActiveWorkspace();
      return current ? { id: current.id, name: current.name, branch: current.branch } : null;
    },
  },
};

const VOICE_AGENT_PROMPT = `You are a voice assistant for workspace management.
When the user asks to create a worktree/workspace, use the createWorktree tool.
Be concise. Confirm what you created.`;
```

### 5. WisprFlow Client (main process)

**New:** `apps/desktop/src/main/lib/wisprflow.ts`

```typescript
const WISPRFLOW_API = "https://api.wisprflow.ai/v1/transcribe";

export async function transcribeAudio(audioBase64: string): Promise<string> {
  const apiKey = await getStoredApiKey("wisprflow");

  const response = await fetch(WISPRFLOW_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio: audioBase64, format: "wav" }),
  });

  const result = await response.json();
  return result.text;
}
```

### 6. Voice UI (renderer)

**New:** `apps/desktop/src/renderer/components/VoiceOverlay/VoiceOverlay.tsx`

```typescript
export function VoiceOverlay() {
  const { isRecording, isProcessing, messages } = useVoiceStore();

  if (!isRecording && !isProcessing && messages.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                    bg-background/95 backdrop-blur border rounded-lg p-4 min-w-80">
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Listening...
        </div>
      )}

      {messages.map((msg, i) => (
        <div key={i} className="text-sm">
          {msg.type === "transcription" && <p>"{msg.text}"</p>}
          {msg.type === "agent" && msg.message.result && <p>{msg.message.result}</p>}
        </div>
      ))}

      {isProcessing && <Spinner />}
    </div>
  );
}
```

### 7. Hook it up (renderer)

**New:** `apps/desktop/src/renderer/hooks/useVoiceCommand.ts`

```typescript
export function useVoiceCommand() {
  const recorder = useRef(new AudioRecorder());
  const store = useVoiceStore();

  const startRecording = async () => {
    store.startRecording();
    await recorder.current.start();
  };

  const stopRecording = async () => {
    store.stopRecording();
    store.setProcessing(true);

    const audioBase64 = await recorder.current.stop();

    // Subscribe to agent stream
    electronTrpc.voice.runAgent.subscribe(
      { audioBase64 },
      {
        onData: (msg) => store.addMessage(msg),
        onError: (err) => store.setError(err.message),
        onComplete: () => store.setProcessing(false),
      }
    );
  };

  // Bind to hotkey
  useAppHotkey("VOICE_PUSH_TO_TALK", {
    onKeyDown: startRecording,
    onKeyUp: stopRecording,
  });
}
```

## File Structure

```
apps/desktop/src/
├── main/lib/
│   └── wisprflow.ts              # NEW: Transcription API
├── renderer/
│   ├── lib/audio-recorder.ts     # NEW: Web Audio recording
│   ├── stores/voice/store.ts     # NEW: Voice state
│   ├── hooks/useVoiceCommand.ts  # NEW: Hotkey + recording logic
│   └── components/VoiceOverlay/  # NEW: UI
├── lib/trpc/routers/voice/       # NEW: tRPC router + tools
└── shared/hotkeys.ts             # UPDATE: Add VOICE_PUSH_TO_TALK
```

## Dependencies

```bash
bun add @anthropic-ai/claude-agent-sdk
```

## Implementation Order

1. Add hotkey to `hotkeys.ts`
2. Create audio recorder
3. Create voice store
4. Create tRPC router with tools (main process)
5. Create WisprFlow client
6. Create UI overlay
7. Wire up with `useVoiceCommand` hook

## Example Usage

| Voice | Result |
|-------|--------|
| "Create a worktree for the login feature" | Creates workspace with branch `feature/login` |
| "Spin up a workspace for the auth bug" | Creates workspace with branch `fix/auth-bug` |
| "What worktrees do I have?" | Lists current workspaces |
