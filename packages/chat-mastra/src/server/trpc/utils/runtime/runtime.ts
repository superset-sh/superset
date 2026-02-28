import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { createMastraCode } from "mastracode";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
export type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];

export interface RuntimeMcpServerStatus {
	connected: boolean;
	toolCount: number;
	error?: string;
}

export interface RuntimeSession {
	sessionId: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
	hookManager: RuntimeHookManager;
	mcpManualStatuses: Map<string, RuntimeMcpServerStatus>;
	cwd: string;
	lastErrorMessage?: string | null;
}

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

interface TextContentPart {
	type: "text";
	text: string;
}
interface MessageLike {
	role: string;
	content: Array<{ type: string; text?: string }>;
}

const AI_API_CALL_ERROR_PREFIX = /^\s*AI_APICallError\d*:\s*/;
const MAX_ERROR_PARSE_DEPTH = 12;
const GENERIC_ERROR_TOKENS = new Set([
	"error",
	"workspace_error",
	"agent_start",
	"agent_end",
]);

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function normalizeRuntimeErrorMessage(message: string): string {
	let normalized = message.trim();
	while (AI_API_CALL_ERROR_PREFIX.test(normalized)) {
		normalized = normalized.replace(AI_API_CALL_ERROR_PREFIX, "").trim();
	}
	return normalized;
}

function toUserFacingErrorMessage(message: string): string | null {
	const normalized = normalizeRuntimeErrorMessage(message);
	if (normalized.length === 0) return null;
	const lower = normalized.toLowerCase();
	if (GENERIC_ERROR_TOKENS.has(lower)) return null;
	return normalized;
}

function extractRuntimeErrorMessageFromUnknown(
	value: unknown,
	seen: WeakSet<object>,
	depth = 0,
): string | null {
	if (depth > MAX_ERROR_PARSE_DEPTH) return null;

	const asString = toNonEmptyString(value);
	if (asString) {
		return toUserFacingErrorMessage(asString);
	}

	if (value instanceof Error) {
		const ownMessage = toNonEmptyString(value.message);
		if (ownMessage) {
			return normalizeRuntimeErrorMessage(ownMessage);
		}

		const causeMessage = extractRuntimeErrorMessageFromUnknown(
			(value as Error & { cause?: unknown }).cause,
			seen,
			depth + 1,
		);
		if (causeMessage) return causeMessage;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const nested = extractRuntimeErrorMessageFromUnknown(item, seen, depth + 1);
			if (nested) return nested;
		}
		return null;
	}

	const record = asRecord(value);
	if (!record) return null;
	if (seen.has(record)) return null;
	seen.add(record);

	// Prioritize nested provider payloads where actionable messages usually live.
	const preferredKeys = [
		"userFacingMessage",
		"displayMessage",
		"error",
		"cause",
		"data",
		"details",
		"responseBody",
		"body",
		"payload",
		"result",
	];
	for (const key of preferredKeys) {
		const nested = extractRuntimeErrorMessageFromUnknown(
			record[key],
			seen,
			depth + 1,
		);
		if (nested) return nested;
	}

	const messageKeys = ["message", "errorMessage", "reason"];
	for (const key of messageKeys) {
		const message = toNonEmptyString(record[key]);
		if (!message) continue;
		const normalized = toUserFacingErrorMessage(message);
		if (normalized) return normalized;
	}

	for (const nestedValue of Object.values(record)) {
		const nested = extractRuntimeErrorMessageFromUnknown(
			nestedValue,
			seen,
			depth + 1,
		);
		if (nested) return nested;
	}

	return null;
}

export function extractRuntimeErrorMessage(value: unknown): string | null {
	return extractRuntimeErrorMessageFromUnknown(value, new WeakSet(), 0);
}

/**
 * Gate: validates user prompt against hooks before sending.
 * Throws if the hook blocks the message.
 */
export async function onUserPromptSubmit(
	runtime: RuntimeSession,
	userMessage: string,
): Promise<void> {
	if (!runtime.hookManager) return;
	const result = await runtime.hookManager.runUserPromptSubmit(userMessage);
	if (!result.allowed) {
		throw new Error(result.blockReason ?? "Blocked by UserPromptSubmit hook");
	}
}

/**
 * Fire SessionStart hook when a runtime is first created.
 */
export async function runSessionStartHook(
	runtime: RuntimeSession,
): Promise<void> {
	if (!runtime.hookManager) return;
	await runtime.hookManager.runSessionStart();
}

/**
 * Reload hook config so user edits take effect without restarting.
 */
export function reloadHookConfig(runtime: RuntimeSession): void {
	if (!runtime.hookManager) return;
	try {
		runtime.hookManager.reload();
	} catch {
		// Best-effort — swallow reload failures
	}
}

/**
 * Destroy a runtime: fire SessionEnd hook and tear down the harness.
 */
export async function destroyRuntime(runtime: RuntimeSession): Promise<void> {
	if (runtime.hookManager) {
		await runtime.hookManager.runSessionEnd().catch(() => {});
	}
	const harnessWithDestroy = runtime.harness as RuntimeHarness & {
		destroy?: () => Promise<void>;
	};
	await harnessWithDestroy.destroy?.().catch(() => {});
}

/**
 * Subscribe to harness lifecycle events for a runtime session.
 * Call once after creating a runtime — handles stop hooks and title generation.
 */
export function subscribeToSessionEvents(
	runtime: RuntimeSession,
	apiClient: ApiClient,
): void {
	runtime.harness.subscribe((event: unknown) => {
		const eventRecord = asRecord(event);
		if (!eventRecord) return;
		const eventType = toNonEmptyString(eventRecord.type);
		if (!eventType) return;

		if (eventType === "agent_start") {
			runtime.lastErrorMessage = null;
			return;
		}

		if (eventType === "error" || eventType === "workspace_error") {
			const message = extractRuntimeErrorMessage(eventRecord);
			if (message) {
				runtime.lastErrorMessage = message;
			}
			return;
		}

		if (eventType === "agent_end") {
			const raw = toNonEmptyString(eventRecord.reason);
			const reason = raw === "aborted" || raw === "error" ? raw : "complete";
			if (runtime.hookManager) {
				void runtime.hookManager.runStop(undefined, reason).catch(() => {});
			}
			if (reason === "complete") {
				void generateAndSetTitle(runtime, apiClient);
			}
		}
	});
}

async function generateAndSetTitle(
	runtime: RuntimeSession,
	apiClient: ApiClient,
): Promise<void> {
	try {
		const messages: MessageLike[] = await runtime.harness.listMessages();
		const userMessages = messages.filter((m) => m.role === "user");
		const userCount = userMessages.length;

		const isFirst = userCount === 1;
		const isRename = userCount > 1 && userCount % 10 === 0;
		if (!isFirst && !isRename) return;

		const extractText = (parts: MessageLike["content"]): string =>
			parts
				.filter((c): c is TextContentPart => c.type === "text")
				.map((c) => c.text)
				.join(" ");

		let text: string;
		const firstMessage = userMessages[0];
		if (isFirst && firstMessage) {
			text = extractText(firstMessage.content).slice(0, 500);
		} else {
			text = messages
				.slice(-10)
				.map((m) => `${m.role}: ${extractText(m.content)}`)
				.join("\n")
				.slice(0, 2000);
		}
		if (!text.trim()) return;

		const mode = runtime.harness.getCurrentMode();
		const agent =
			typeof mode.agent === "function" ? mode.agent({}) : mode.agent;

		const title = await agent.generateTitleFromUserMessage({
			message: text,
			model: runtime.harness.getFullModelId(),
			tracingContext: {},
		});
		if (!title?.trim()) return;

		await apiClient.chat.updateTitle.mutate({
			sessionId: runtime.sessionId,
			title: title.trim(),
		});
	} catch (error) {
		console.warn("[chat-mastra] Title generation failed:", error);
	}
}
