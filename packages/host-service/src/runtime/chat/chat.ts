import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	getSlashCommands as getSlashCommandsFromCwd,
	resolveSlashCommand as resolveSlashCommandFromCwd,
} from "@superset/chat/server/desktop";
import { eq } from "drizzle-orm";
import { createAuthStorage, createMastraCode } from "mastracode";
import type { HostDb } from "../../db";
import { workspaces } from "../../db/schema";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers";

type RuntimeHarness = Awaited<ReturnType<typeof createMastraCode>>["harness"];
type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];
type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;
type RuntimeMessages = Awaited<ReturnType<RuntimeHarness["listMessages"]>>;
type RuntimeSendMessageResult = Awaited<
	ReturnType<RuntimeHarness["sendMessage"]>
>;
type RuntimeApprovalResult = Awaited<
	ReturnType<RuntimeHarness["respondToToolApproval"]>
>;
type RuntimeQuestionResult = Awaited<
	ReturnType<RuntimeHarness["respondToQuestion"]>
>;
type RuntimePlanResult = Awaited<
	ReturnType<RuntimeHarness["respondToPlanApproval"]>
>;
type ChatThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

interface ChatSendMessageInput {
	sessionId: string;
	workspaceId: string;
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
		thinkingLevel?: ChatThinkingLevel;
	};
}

interface RestartPayload extends ChatSendMessageInput {
	messageId: string;
}

interface PendingSandboxQuestion {
	questionId: string;
	path: string;
	reason: string;
}

interface ChatPendingQuestionOption {
	label: string;
	description?: string;
}

interface ChatPendingQuestion {
	questionId: string;
	question: string;
	description?: string;
	options: ChatPendingQuestionOption[];
}

export type ChatDisplayState = RuntimeDisplayState & {
	pendingQuestion:
		| RuntimeDisplayState["pendingQuestion"]
		| ChatPendingQuestion
		| null;
	errorMessage: string | null;
};

interface ChatApprovalPayload {
	decision: "approve" | "decline" | "always_allow_category";
}

interface ChatQuestionPayload {
	questionId: string;
	answer: string;
}

interface ChatPlanPayload {
	planId: string;
	response: {
		action: "approved" | "rejected";
		feedback?: string;
	};
}

interface RuntimeSession {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
	hookManager: RuntimeHookManager;
	lastErrorMessage: string | null;
	pendingSandboxQuestion: PendingSandboxQuestion | null;
	answeredQuestionIds: Set<string>;
	pendingQuestionResponses: Map<string, Promise<RuntimeQuestionResult>>;
}

function respondToQuestionWithOptimisticState(
	runtime: RuntimeSession,
	payload: ChatQuestionPayload,
): Promise<RuntimeQuestionResult> {
	const questionId = payload.questionId;
	const pendingResponse = runtime.pendingQuestionResponses.get(questionId);
	if (pendingResponse) return pendingResponse;

	const wasAlreadyAnswered = runtime.answeredQuestionIds.has(questionId);
	const previousSandboxQuestion = runtime.pendingSandboxQuestion;
	const clearsSandboxQuestion =
		previousSandboxQuestion?.questionId === questionId;

	runtime.answeredQuestionIds.add(questionId);
	if (clearsSandboxQuestion) {
		runtime.pendingSandboxQuestion = null;
	}

	let responsePromise: Promise<RuntimeQuestionResult>;
	responsePromise = Promise.resolve()
		.then(() => runtime.harness.respondToQuestion(payload))
		.catch((error) => {
			if (
				runtime.pendingQuestionResponses.get(questionId) === responsePromise
			) {
				if (!wasAlreadyAnswered) {
					runtime.answeredQuestionIds.delete(questionId);
				}
				if (clearsSandboxQuestion && runtime.pendingSandboxQuestion === null) {
					runtime.pendingSandboxQuestion = previousSandboxQuestion;
				}
			}
			throw error;
		})
		.finally(() => {
			if (
				runtime.pendingQuestionResponses.get(questionId) === responsePromise
			) {
				runtime.pendingQuestionResponses.delete(questionId);
			}
		});
	runtime.pendingQuestionResponses.set(questionId, responsePromise);
	return responsePromise;
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

export interface ChatRuntimeManagerOptions {
	db: HostDb;
	runtimeResolver: ModelProviderRuntimeResolver;
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

function isHarnessSandboxAccessRequestEvent(event: unknown): event is {
	type: "sandbox_access_request";
	questionId: string;
	path: string;
	reason: string;
} {
	if (!isObjectRecord(event) || event.type !== "sandbox_access_request") {
		return false;
	}

	return (
		typeof event.questionId === "string" &&
		typeof event.path === "string" &&
		typeof event.reason === "string"
	);
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

	return null;
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

/**
 * Pick the model mastra should use for observational-memory reflection
 * (a background task that runs after each turn). Mastra's default is
 * google/gemini-2.5-flash, which fails when GOOGLE_GENERATIVE_AI_API_KEY
 * is unset — we fall back to whichever provider the user has actually
 * authenticated with so reflection just uses those credentials.
 */
function resolveOmModelFromAuth(): string | undefined {
	if (process.env.GOOGLE_GENERATIVE_AI_API_KEY)
		return "google/gemini-2.5-flash";
	const authStorage = createAuthStorage();
	authStorage.reload();
	const anthropic = authStorage.get("anthropic");
	if (
		anthropic?.type === "oauth" ||
		(anthropic?.type === "api_key" && anthropic.key.trim())
	) {
		return "anthropic/claude-haiku-4-5";
	}
	const openai = authStorage.get("openai-codex");
	if (
		openai?.type === "oauth" ||
		(openai?.type === "api_key" && openai.key.trim())
	) {
		return "openai/gpt-4.1-nano";
	}
	return undefined;
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

async function restartRuntimeFromUserMessage(
	runtime: RuntimeSession,
	input: RestartPayload,
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

	const thinkingLevel = input.metadata?.thinkingLevel;
	if (thinkingLevel) {
		await runtime.harness.setState({ thinkingLevel });
	}

	runtime.lastErrorMessage = null;
	await runtime.harness.sendMessage(input.payload);
}

interface InflightRuntimeCreation {
	workspaceId: string;
	promise: Promise<RuntimeSession>;
}

export class ChatRuntimeManager {
	private readonly db: HostDb;
	private readonly runtimeResolver: ModelProviderRuntimeResolver;
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly runtimeCreations = new Map<
		string,
		InflightRuntimeCreation
	>();

	constructor(options: ChatRuntimeManagerOptions) {
		this.db = options.db;
		this.runtimeResolver = options.runtimeResolver;
	}

	private subscribeToSessionEvents(runtime: RuntimeSession): void {
		runtime.harness.subscribe((event: unknown) => {
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

			if (isObjectRecord(event) && event.type === "agent_start") {
				runtime.lastErrorMessage = null;
				runtime.pendingSandboxQuestion = null;
				runtime.answeredQuestionIds.clear();
				runtime.pendingQuestionResponses.clear();
				return;
			}

			if (isObjectRecord(event) && event.type === "agent_end") {
				runtime.pendingSandboxQuestion = null;
				runtime.answeredQuestionIds.clear();
				runtime.pendingQuestionResponses.clear();
			}
		});
	}

	/**
	 * Ensures ~/.mastracode/AGENTS.md exists with Superset-specific instructions.
	 * Only writes when the file is absent or was previously written by us (identified
	 * by the managed-by marker). Skips silently on any filesystem error.
	 */
	private ensureGlobalAgentInstructions(): void {
		const MANAGED_MARKER = "<!-- managed-by: superset -->";
		const INSTRUCTIONS = `${MANAGED_MARKER}
## Question Tool

When you need to ask the user ANY question — including simple yes/no, confirmations, and clarifications — ALWAYS use the \`ask_user\` tool. Never ask questions in plain text. The Superset UI renders \`ask_user\` calls as an interactive overlay with clickable option buttons; plain-text questions will not be surfaced to the user in the same way.
`;
		try {
			const dir = join(homedir(), ".mastracode");
			const filePath = join(dir, "AGENTS.md");
			if (existsSync(filePath)) {
				const existing = readFileSync(filePath, "utf-8");
				if (!existing.includes(MANAGED_MARKER)) {
					// User-managed file — don't overwrite
					return;
				}
			}
			mkdirSync(dir, { recursive: true });
			writeFileSync(filePath, INSTRUCTIONS, "utf-8");
		} catch {
			// Non-fatal — instructions enhancement is best-effort
		}
	}

	private async createRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<RuntimeSession> {
		if (!(await this.runtimeResolver.hasUsableRuntimeEnv())) {
			throw new Error("No model provider credentials available");
		}

		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new Error(`Workspace not found: ${workspaceId}`);
		}

		const cwd = workspace.worktreePath;

		this.ensureGlobalAgentInstructions();
		await this.runtimeResolver.prepareRuntimeEnv();

		const omModel = resolveOmModelFromAuth();
		const runtime = await createMastraCode({
			cwd,
			disableMcp: true,
			...(omModel && {
				initialState: {
					observerModelId: omModel,
					reflectorModelId: omModel,
				},
			}),
		});
		runtime.hookManager?.setSessionId(sessionId);
		await runtime.harness.init();
		runtime.harness.setResourceId({ resourceId: sessionId });
		await runtime.harness.selectOrCreateThread();

		const sessionRuntime: RuntimeSession = {
			sessionId,
			workspaceId,
			cwd,
			harness: runtime.harness,
			mcpManager: runtime.mcpManager,
			hookManager: runtime.hookManager,
			lastErrorMessage: null,
			pendingSandboxQuestion: null,
			answeredQuestionIds: new Set(),
			pendingQuestionResponses: new Map(),
		};
		this.subscribeToSessionEvents(sessionRuntime);
		this.runtimes.set(sessionId, sessionRuntime);
		return sessionRuntime;
	}

	private async getOrCreateRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<RuntimeSession> {
		const existing = this.runtimes.get(sessionId);
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already bound to workspace ${existing.workspaceId}`,
				);
			}
			return existing;
		}

		const inflight = this.runtimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}

		const promise = this.createRuntime(sessionId, workspaceId).finally(() => {
			this.runtimeCreations.delete(sessionId);
		});
		this.runtimeCreations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	/**
	 * Tear down the in-memory runtime for a session. Aborts any in-flight
	 * work, disconnects MCP servers, removes the runtime from the manager's
	 * map, and is a no-op for unknown session ids. Should be called after
	 * the cloud session row is deleted, or when a workspace is deleted.
	 *
	 * Validates `workspaceId` against the runtime / in-flight creation so a
	 * caller can't dispose a session bound to a different workspace.
	 *
	 * If a creation is in-flight for this session, awaits it first so the
	 * just-created runtime doesn't get inserted into `runtimes` after we
	 * delete from it (which would leak).
	 */
	async disposeRuntime(sessionId: string, workspaceId: string): Promise<void> {
		const inflight = this.runtimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is being created for workspace ${inflight.workspaceId}`,
				);
			}
			try {
				await inflight.promise;
			} catch {
				// Creation failed — nothing to dispose.
				return;
			}
		}

		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return;

		if (runtime.workspaceId !== workspaceId) {
			throw new Error(
				`Session ${sessionId} is bound to workspace ${runtime.workspaceId}`,
			);
		}

		try {
			runtime.harness.abort();
		} catch {
			// best-effort — proceed with cleanup even if abort fails
		}
		try {
			await runtime.mcpManager?.disconnect();
		} catch {
			// best-effort — MCP servers may already be disconnected
		}
		this.runtimes.delete(sessionId);
	}

	/**
	 * Shape the harness's raw display state into the shape the renderer
	 * expects. Both getDisplayState and getSnapshot must apply the same
	 * shaping — keep this the single source of truth so the two functions
	 * cannot drift.
	 */
	private buildDisplayState(runtime: RuntimeSession): ChatDisplayState {
		const displayState = runtime.harness.getDisplayState();
		const currentMessage = displayState.currentMessage as {
			role?: string;
			errorMessage?: string;
		} | null;
		const currentMessageError =
			currentMessage?.role === "assistant" &&
			typeof currentMessage.errorMessage === "string" &&
			currentMessage.errorMessage.trim()
				? currentMessage.errorMessage.trim()
				: null;

		// Skip any pending question whose ID was already answered this turn.
		// The harness only clears pendingQuestion on agent_end, so without this
		// filter an answered ask_user question would permanently shadow the
		// sandbox question that fired in the same turn.
		const harnessPendingQuestion =
			displayState.pendingQuestion &&
			!runtime.answeredQuestionIds.has(displayState.pendingQuestion.questionId)
				? displayState.pendingQuestion
				: null;
		const sandboxPendingQuestion = runtime.pendingSandboxQuestion
			? {
					questionId: runtime.pendingSandboxQuestion.questionId,
					question: `Grant sandbox access to "${runtime.pendingSandboxQuestion.path}"?`,
					description: runtime.pendingSandboxQuestion.reason,
					options: [
						{
							label: "Yes",
							description: "Allow access.",
						},
						{ label: "No", description: "Deny access." },
					],
				}
			: null;
		return {
			...displayState,
			pendingQuestion: harnessPendingQuestion ?? sandboxPendingQuestion,
			errorMessage: currentMessageError ?? runtime.lastErrorMessage,
		};
	}

	async getDisplayState(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<ChatDisplayState> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return this.buildDisplayState(runtime);
	}

	async listMessages(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<RuntimeMessages> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.listMessages();
	}

	/**
	 * Single server-side observation that returns both displayState and messages
	 * from one runtime acquisition. This avoids the dual-poll race between
	 * independent getDisplayState / listMessages queries on the client.
	 *
	 * Note: not a fully locked atomic snapshot — listMessages() is async, so
	 * harness state can change between the displayState read and the messages
	 * read. This still removes the *client-side* two-query race, which is the
	 * one that caused mismatched message/display state.
	 */
	async getSnapshot(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<{
		displayState: ChatDisplayState;
		messages: RuntimeMessages;
	}> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		const displayState = this.buildDisplayState(runtime);
		const messages = await runtime.harness.listMessages();
		// Intentionally no observedAt: when the harness state hasn't changed,
		// the response object is structurally identical to the previous poll's
		// response, so React Query's structuralSharing preserves the object
		// identity and idle polls don't trigger downstream rerenders.
		return { displayState, messages };
	}

	async sendMessage(
		input: ChatSendMessageInput,
	): Promise<RuntimeSendMessageResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.lastErrorMessage = null;

		const selectedModel = input.metadata?.model?.trim();
		if (selectedModel) {
			await runtime.harness.switchModel({
				modelId: selectedModel,
				scope: "thread",
			});
		}

		const thinkingLevel = input.metadata?.thinkingLevel;
		if (thinkingLevel) {
			await runtime.harness.setState({ thinkingLevel });
		}

		return runtime.harness.sendMessage(input.payload);
	}

	async restartFromMessage(input: RestartPayload): Promise<void> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.lastErrorMessage = null;
		await restartRuntimeFromUserMessage(runtime, input);
	}

	async stop(input: { sessionId: string; workspaceId: string }): Promise<void> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.harness.abort();
	}

	async respondToApproval(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatApprovalPayload;
	}): Promise<RuntimeApprovalResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.respondToToolApproval(input.payload);
	}

	async respondToQuestion(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatQuestionPayload;
	}): Promise<RuntimeQuestionResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);

		return respondToQuestionWithOptimisticState(runtime, input.payload);
	}

	async respondToPlan(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatPlanPayload;
	}): Promise<RuntimePlanResult> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.respondToPlanApproval(input.payload);
	}

	private resolveWorkspaceCwd(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
		if (!workspace) {
			throw new Error(`Workspace not found: ${workspaceId}`);
		}
		return workspace.worktreePath;
	}

	async getSlashCommands(input: { workspaceId: string }): Promise<
		Array<{
			name: string;
			aliases: string[];
			description: string;
			argumentHint: string;
			kind: "builtin" | "custom";
		}>
	> {
		const cwd = this.resolveWorkspaceCwd(input.workspaceId);
		return getSlashCommandsFromCwd(cwd).map((command) => ({
			name: command.name,
			aliases: command.aliases,
			description: command.description,
			argumentHint: command.argumentHint,
			kind: command.kind,
		}));
	}

	async resolveSlashCommand(input: { workspaceId: string; text: string }) {
		const cwd = this.resolveWorkspaceCwd(input.workspaceId);
		return resolveSlashCommandFromCwd(cwd, input.text);
	}

	async previewSlashCommand(input: { workspaceId: string; text: string }) {
		return this.resolveSlashCommand(input);
	}

	async getMcpOverview(_input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<{ sourcePath: string | null; servers: never[] }> {
		return { sourcePath: null, servers: [] };
	}
}
