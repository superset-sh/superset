/**
 * Minimal local types for the host-service chat runtime surface that mobile
 * uses over the relay. INTERIM — see `plans/mobile-chat-runtime.md` (D2).
 *
 * We do NOT import `@superset/host-service`'s `AppRouter`. Note this is a choice,
 * not a hard block: setting `allowImportingTsExtensions: true` + node types in the
 * mobile tsconfig makes the type-only import typecheck cleanly (desktop does exactly
 * that — it extends `@superset/typescript/base.json`, which sets both). We decline
 * because that would make node globals (`Buffer`, `process`) ambient in RN code that
 * has no such runtime, and because `AppRouter = typeof appRouter` pulls the entire
 * server type graph (db, daemon, mastra, node-pty) into every mobile typecheck.
 *
 * Caveat: this is a LOSSY subset and nothing enforces it against the router. The real
 * shapes live in `@mastra/core/dist/harness/types.d.ts` (`HarnessDisplayState`,
 * `HarnessMessage`, `HarnessMessageContent`) and are stricter than what's below —
 * notably `content` is a 12-arm discriminated union, not `{ type; text? }`.
 *
 * Superseded by the normalized envelope (SCP v1, `packages/chat-protocol`), where
 * host-service normalizes harness types so mastra/codex/claude-sdk types never cross
 * the wire. Until then, keep this in sync by hand; the live E2E is the only check.
 */

export interface ChatMessagePart {
	type: string;
	text?: string;
	[key: string]: unknown;
}

export interface ChatMessage {
	id: string;
	role: string;
	content: ChatMessagePart[];
	createdAt?: string | Date;
	stopReason?: string;
	errorMessage?: string;
}

export interface ChatDisplayState {
	isRunning?: boolean;
	currentMessage?: ChatMessage | null;
	pendingApproval?: Record<string, unknown> | null;
	pendingQuestion?: Record<string, unknown> | null;
	pendingPlanApproval?: Record<string, unknown> | null;
	errorMessage?: string | null;
	[key: string]: unknown;
}

export interface ChatSnapshot {
	displayState: ChatDisplayState;
	messages: ChatMessage[];
}

export interface SendMessagePayload {
	content: string;
	files?: Array<{ data: string; mediaType: string; filename?: string }>;
}

/** Per-send message metadata the host threads into the harness before the turn:
 * `model` triggers `harness.switchModel({ scope: "thread" })`; `thinkingLevel`
 * sets reasoning effort. Both are optional — the host keeps the current values
 * when omitted. Mirrors the host router's `messageMetadataSchema`. */
export interface MessageMetadata {
	model?: string;
	thinkingLevel?: "off" | "low" | "medium" | "high" | "xhigh";
}

interface SessionInput {
	sessionId: string;
	workspaceId: string;
}

/** A live terminal-agent binding (read-only status), mirroring the host's
 * `TerminalAgentBinding` (packages/host-service/src/terminal-agents/types.ts).
 * Only live agent-bound sessions are returned (dead ones filtered server-side).
 * Requires the agent lifecycle hooks to reach this host, so it can be empty
 * even when PTY terminals exist — we merge it with `terminal.listSessions`. */
export interface TerminalAgentBinding {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	agentSessionId?: string;
	definitionId?: string;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
	/** The terminal's live title (OSC title sequence), when it has set one. */
	title: string | null;
}

/** The subset of host-service `chat.*` procedures mobile calls, shaped like a
 * tRPC proxy client (`.query`/`.mutate`). */
export interface HostChatClient {
	chat: {
		getSnapshot: { query: (input: SessionInput) => Promise<ChatSnapshot> };
		sendMessage: {
			mutate: (
				input: SessionInput & {
					payload: SendMessagePayload;
					metadata?: MessageMetadata;
				},
			) => Promise<unknown>;
		};
		respondToApproval: {
			mutate: (
				input: SessionInput & {
					payload: {
						decision: "approve" | "decline" | "always_allow_category";
					};
				},
			) => Promise<unknown>;
		};
		respondToQuestion: {
			mutate: (
				input: SessionInput & {
					payload: { questionId: string; answer: string };
				},
			) => Promise<unknown>;
		};
		respondToPlan: {
			mutate: (
				input: SessionInput & {
					payload: {
						planId: string;
						response: { action: "approved" | "rejected"; feedback?: string };
					};
				},
			) => Promise<unknown>;
		};
	};
	terminalAgents: {
		list: {
			query: () => Promise<TerminalAgentBinding[]>;
		};
		listByWorkspace: {
			query: (input: {
				workspaceId: string;
			}) => Promise<TerminalAgentBinding[]>;
		};
	};
}
