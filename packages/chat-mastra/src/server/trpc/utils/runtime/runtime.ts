import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { createMastraCode } from "mastracode";
import { generateTitleFromMessage } from "./title-generation";

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
	lastErrorMessage: string | null;
	pendingSandboxQuestion: {
		questionId: string;
		path: string;
		reason: string;
	} | null;
	cwd: string;
}

export function syncRuntimeHookSessionId(runtime: RuntimeSession): void {
	runtime.hookManager?.setSessionId(runtime.sessionId);
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

interface RuntimeRestartPayload {
	messageId: string;
	payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	};
	metadata?: {
		model?: string;
	};
}

interface RuntimeStoredMessage {
	id: string;
	role: string;
}

interface RuntimeStoredThread {
	id: string;
	resourceId: string;
	title?: string;
}

interface RuntimeMemoryStore {
	getThreadById(args: {
		threadId: string;
	}): Promise<RuntimeStoredThread | null>;
	listMessages(args: {
		threadId: string;
		perPage: false;
		orderBy: { field: "createdAt"; direction: "ASC" };
	}): Promise<{ messages: RuntimeStoredMessage[] }>;
	cloneThread(args: {
		sourceThreadId: string;
		resourceId?: string;
		title?: string;
		options?: {
			messageFilter?: {
				messageIds?: string[];
			};
		};
	}): Promise<{ thread: RuntimeStoredThread }>;
}

interface HarnessWithConfig {
	config?: {
		storage?: {
			getStore: (domain: "memory") => Promise<RuntimeMemoryStore | null>;
		};
	};
}

async function getRuntimeMemoryStore(
	runtime: RuntimeSession,
): Promise<RuntimeMemoryStore> {
	const harness = runtime.harness as unknown as HarnessWithConfig;
	const storage = harness.config?.storage;
	if (!storage) {
		throw new Error("Mastra storage is not configured for this session");
	}

	const memoryStore = await storage.getStore("memory");
	if (!memoryStore) {
		throw new Error("Mastra memory storage is unavailable for this session");
	}

	return memoryStore;
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
 * Call once after creating a runtime — handles runtime error state and stop hooks.
 */
export function subscribeToSessionEvents(runtime: RuntimeSession): void {
	runtime.harness.subscribe((event: unknown) => {
		if (
			isHarnessThreadChangedEvent(event) ||
			isHarnessThreadCreatedEvent(event)
		) {
			syncRuntimeHookSessionId(runtime);
			return;
		}
		if (isHarnessErrorEvent(event) || isHarnessWorkspaceErrorEvent(event)) {
			runtime.lastErrorMessage = toRuntimeErrorMessage(event.error);
			return;
		}
		if (isHarnessSandboxAccessRequestEvent(event)) {
			runtime.pendingSandboxQuestion = {
				questionId: event.questionId,
				path: event.path,
				reason: event.reason,
			};
			return;
		}
		if (isHarnessAgentStartEvent(event)) {
			runtime.lastErrorMessage = null;
			runtime.pendingSandboxQuestion = null;
			return;
		}
		if (isHarnessAgentEndEvent(event)) {
			runtime.pendingSandboxQuestion = null;
			const raw = event.reason;
			const reason = raw === "aborted" || raw === "error" ? raw : "complete";
			if (runtime.hookManager) {
				void runtime.hookManager.runStop(undefined, reason).catch(() => {});
			}
		}
	});
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHarnessErrorEvent(
	event: unknown,
): event is { type: "error"; error: unknown } {
	return isObjectRecord(event) && event.type === "error" && "error" in event;
}

function isHarnessWorkspaceErrorEvent(
	event: unknown,
): event is { type: "workspace_error"; error: unknown } {
	return (
		isObjectRecord(event) &&
		event.type === "workspace_error" &&
		"error" in event
	);
}

function isHarnessAgentStartEvent(
	event: unknown,
): event is { type: "agent_start" } {
	return isObjectRecord(event) && event.type === "agent_start";
}

function isHarnessAgentEndEvent(
	event: unknown,
): event is { type: "agent_end"; reason?: string } {
	return isObjectRecord(event) && event.type === "agent_end";
}

function isHarnessSandboxAccessRequestEvent(event: unknown): event is {
	type: "sandbox_access_request";
	questionId: string;
	path: string;
	reason: string;
} {
	if (!isObjectRecord(event)) return false;
	if (event.type !== "sandbox_access_request") return false;
	return (
		typeof event.questionId === "string" &&
		typeof event.path === "string" &&
		typeof event.reason === "string"
	);
}

function isHarnessThreadChangedEvent(
	event: unknown,
): event is { type: "thread_changed"; threadId: string } {
	return (
		isObjectRecord(event) &&
		event.type === "thread_changed" &&
		typeof event.threadId === "string"
	);
}

function isHarnessThreadCreatedEvent(
	event: unknown,
): event is { type: "thread_created"; thread: { id: string } } {
	return (
		isObjectRecord(event) &&
		event.type === "thread_created" &&
		isObjectRecord(event.thread) &&
		typeof event.thread.id === "string"
	);
}

function toRuntimeErrorMessage(error: unknown): string {
	const providerMessage = extractProviderMessage(error);
	if (providerMessage) return providerMessage;
	if (error instanceof Error && error.message.trim()) {
		return normalizeErrorMessage(error.message);
	}
	if (typeof error === "string" && error.trim()) {
		return normalizeErrorMessage(error);
	}
	if (isObjectRecord(error) && typeof error.message === "string") {
		return normalizeErrorMessage(error.message);
	}
	return "Unexpected chat error";
}

function normalizeErrorMessage(message: string): string {
	return message.trim().replace(/^AI_APICallError\d*\s*:\s*/i, "");
}

function extractProviderMessage(error: unknown): string | null {
	if (!isObjectRecord(error)) return null;

	const data = error.data;
	if (isObjectRecord(data)) {
		const nestedError = data.error;
		if (
			isObjectRecord(nestedError) &&
			typeof nestedError.message === "string"
		) {
			return normalizeErrorMessage(nestedError.message);
		}
	}

	const nestedError = error.error;
	if (isObjectRecord(nestedError) && typeof nestedError.message === "string") {
		return normalizeErrorMessage(nestedError.message);
	}

	if (typeof error.responseBody === "string" && error.responseBody.trim()) {
		try {
			const parsed = JSON.parse(error.responseBody);
			if (
				isObjectRecord(parsed) &&
				isObjectRecord(parsed.error) &&
				typeof parsed.error.message === "string"
			) {
				return normalizeErrorMessage(parsed.error.message);
			}
		} catch {
			// ignore parse errors
		}
	}

	return null;
}

export async function restartRuntimeFromUserMessage(
	runtime: RuntimeSession,
	input: RuntimeRestartPayload,
): Promise<void> {
	const threadId = runtime.harness.getCurrentThreadId();
	if (!threadId) {
		throw new Error("No active Mastra thread is available for editing");
	}

	const memoryStore = await getRuntimeMemoryStore(runtime);
	const sourceThread = await memoryStore.getThreadById({ threadId });
	if (!sourceThread) {
		throw new Error(`Mastra thread not found: ${threadId}`);
	}

	const sourceMessages = await memoryStore.listMessages({
		threadId,
		perPage: false,
		orderBy: { field: "createdAt", direction: "ASC" },
	});
	const targetIndex = sourceMessages.messages.findIndex(
		(message) => message.id === input.messageId,
	);
	if (targetIndex === -1) {
		throw new Error("The selected message is no longer available to edit");
	}

	const targetMessage = sourceMessages.messages[targetIndex];
	if (targetMessage?.role !== "user") {
		throw new Error("Only user messages can be edited or resent");
	}

	const clonedThread = await memoryStore.cloneThread({
		sourceThreadId: threadId,
		resourceId: sourceThread.resourceId,
		title: sourceThread.title,
		options: {
			messageFilter: {
				messageIds: sourceMessages.messages
					.slice(0, targetIndex)
					.map((message) => message.id),
			},
		},
	});

	runtime.harness.abort();
	await runtime.harness.switchThread({ threadId: clonedThread.thread.id });

	const selectedModel = input.metadata?.model?.trim();
	if (selectedModel) {
		await runtime.harness.switchModel({
			modelId: selectedModel,
			scope: "thread",
		});
	}

	runtime.lastErrorMessage = null;
	await runtime.harness.sendMessage(input.payload);
}

function extractTextContent(parts: MessageLike["content"]): string {
	return parts
		.filter(
			(c): c is TextContentPart =>
				c.type === "text" && typeof c.text === "string",
		)
		.map((c) => c.text)
		.join(" ");
}

export async function generateAndSetTitle(
	runtime: RuntimeSession,
	apiClient: ApiClient,
	options?: {
		submittedUserMessage?: string;
	},
): Promise<void> {
	try {
		const messages: MessageLike[] = await runtime.harness.listMessages();
		const submittedUserMessage = options?.submittedUserMessage?.trim();
		const latestPersistedUserMessage = [...messages]
			.reverse()
			.find((message) => message.role === "user");
		const submittedAlreadyPersisted =
			Boolean(submittedUserMessage) &&
			latestPersistedUserMessage !== undefined &&
			extractTextContent(latestPersistedUserMessage.content).trim() ===
				submittedUserMessage;
		const messagesForTitle: MessageLike[] = submittedUserMessage
			? submittedAlreadyPersisted
				? messages
				: [
						...messages,
						{
							role: "user",
							content: [{ type: "text", text: submittedUserMessage }],
						},
					]
			: messages;
		const userMessages = messagesForTitle.filter((m) => m.role === "user");
		const userCount = userMessages.length;

		const isFirst = userCount === 1;
		const isRename = userCount > 1 && userCount % 10 === 0;
		if (!isFirst && !isRename) return;

		let text: string;
		const firstMessage = userMessages[0];
		if (isFirst && firstMessage) {
			text = extractTextContent(firstMessage.content).slice(0, 500);
		} else {
			text = messagesForTitle
				.slice(-10)
				.map((m) => `${m.role}: ${extractTextContent(m.content)}`)
				.join("\n")
				.slice(0, 2000);
		}
		if (!text.trim()) return;

		const mode = runtime.harness.getCurrentMode();
		const agent =
			typeof mode.agent === "function" ? mode.agent({}) : mode.agent;

		const title = await generateTitleFromMessage({
			agent,
			message: text,
			modelId: runtime.harness.getFullModelId(),
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
