import { eq } from "drizzle-orm";
import { createMastraCode } from "mastracode";
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
	description: string;
}

interface ChatPendingQuestion {
	questionId: string;
	question: string;
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

export class ChatRuntimeManager {
	private readonly db: HostDb;
	private readonly runtimeResolver: ModelProviderRuntimeResolver;
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly runtimeCreations = new Map<
		string,
		Promise<RuntimeSession>
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
				return;
			}

			if (isObjectRecord(event) && event.type === "agent_end") {
				runtime.pendingSandboxQuestion = null;
			}
		});
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

		await this.runtimeResolver.prepareRuntimeEnv();

		const runtime = await createMastraCode({
			cwd,
			disableMcp: true,
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
			return inflight;
		}

		const creation = this.createRuntime(sessionId, workspaceId).finally(() => {
			this.runtimeCreations.delete(sessionId);
		});
		this.runtimeCreations.set(sessionId, creation);
		return creation;
	}

	async getDisplayState(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<ChatDisplayState> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
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

		return {
			...displayState,
			pendingQuestion:
				displayState.pendingQuestion ??
				(runtime.pendingSandboxQuestion
					? {
							questionId: runtime.pendingSandboxQuestion.questionId,
							question: `Grant sandbox access to "${runtime.pendingSandboxQuestion.path}"?`,
							options: [
								{
									label: "Yes",
									description: `Allow access. Reason: ${runtime.pendingSandboxQuestion.reason}`,
								},
								{
									label: "No",
									description: "Deny access.",
								},
							],
						}
					: null),
			errorMessage: currentMessageError ?? runtime.lastErrorMessage,
		};
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

		if (
			runtime.pendingSandboxQuestion?.questionId === input.payload.questionId
		) {
			runtime.pendingSandboxQuestion = null;
		}

		return runtime.harness.respondToQuestion(input.payload);
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

	async getSlashCommands(_input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<
		Array<{
			name: string;
			aliases: string[];
			description: string;
			argumentHint: string;
			kind: "builtin" | "prompt";
		}>
	> {
		return [];
	}

	async resolveSlashCommand(input: {
		sessionId: string;
		workspaceId: string;
		text: string;
	}) {
		return {
			handled: false,
			invokedAs: input.text.trim().startsWith("/")
				? input.text.trim()
				: undefined,
		};
	}

	async previewSlashCommand(input: {
		sessionId: string;
		workspaceId: string;
		text: string;
	}) {
		return this.resolveSlashCommand(input);
	}

	async getMcpOverview(_input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<{ sourcePath: string | null; servers: never[] }> {
		return { sourcePath: null, servers: [] };
	}
}
