import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Memory } from "@mastra/memory";
import {
	getSlashCommands as getSlashCommandsFromCwd,
	resolveSlashCommand as resolveSlashCommandFromCwd,
} from "@superset/chat/server/desktop";
import { eq } from "drizzle-orm";
import { createMastraCode } from "mastracode";
import type { HostDb } from "../../db";
import { workspaces } from "../../db/schema";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers";
import { AcpChatRuntime } from "./acp-chat-runtime";
import type {
	ChatDisplayState as AcpChatDisplayState,
	ChatApprovalPayload,
	ChatMessage,
	ChatPlanPayload,
	ChatQuestionPayload,
	ChatSendMessageInput,
	RestartPayload,
} from "./acp-types";

type ChatThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

type ChatPayload = ChatSendMessageInput["payload"];

interface MastraPendingQuestion {
	questionId: string;
	[key: string]: unknown;
}

interface MastraDisplayState {
	isRunning?: boolean;
	currentMessage?: (ChatMessage & { errorMessage?: string }) | null;
	pendingQuestion?: MastraPendingQuestion | null;
	pendingApproval?: unknown;
	pendingPlanApproval?: unknown;
	activeTools?: Map<string, unknown>;
	toolInputBuffers?: Map<string, unknown>;
	activeSubagents?: Map<string, unknown>;
	errorMessage?: string | null;
	[key: string]: unknown;
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

export type ChatDisplayState = (MastraDisplayState | AcpChatDisplayState) & {
	pendingQuestion: MastraPendingQuestion | ChatPendingQuestion | null;
	errorMessage: string | null;
};

interface RuntimeChatSnapshot {
	displayState: ChatDisplayState;
	messages: ChatMessage[];
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
		options?: { messageFilter?: { messageIds?: string[] } };
	}): Promise<{ thread: RuntimeStoredThread }>;
}

interface RuntimeHarness {
	init(): Promise<void>;
	setResourceId(input: { resourceId: string }): void;
	selectOrCreateThread(): Promise<void>;
	getDisplayState(): MastraDisplayState;
	listMessages(): Promise<ChatMessage[]>;
	sendMessage(payload: ChatPayload): Promise<unknown>;
	abort(): void;
	switchModel(input: { modelId: string; scope: "thread" }): Promise<void>;
	setState(input: { thinkingLevel: ChatThinkingLevel }): Promise<void>;
	respondToToolApproval(payload: ChatApprovalPayload): Promise<unknown>;
	respondToQuestion(payload: ChatQuestionPayload): Promise<unknown>;
	respondToPlanApproval(payload: ChatPlanPayload): Promise<unknown>;
	getCurrentThreadId(): string | null;
	switchThread(input: { threadId: string }): Promise<void>;
	subscribe(callback: (event: unknown) => void): void;
	config?: {
		storage?: {
			getStore: (domain: "memory") => Promise<RuntimeMemoryStore | null>;
		};
	};
}

interface RuntimeMcpManager {
	disconnect?(): Promise<void>;
}

interface RuntimeHookManager {
	setSessionId?(sessionId: string): void;
}

interface MastraRuntimeSession {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager | null;
	hookManager: RuntimeHookManager | null;
	lastErrorMessage: string | null;
	pendingSandboxQuestion: {
		questionId: string;
		path: string;
		reason: string;
	} | null;
	answeredQuestionIds: Set<string>;
	pendingQuestionResponses: Map<string, Promise<unknown>>;
}

interface MastraInflightRuntimeCreation {
	workspaceId: string;
	promise: Promise<MastraRuntimeSession>;
}

interface AcpInflightRuntimeCreation {
	workspaceId: string;
	promise: Promise<AcpChatRuntime>;
}

export interface ChatRuntimeManagerOptions {
	db: HostDb;
	runtimeResolver: ModelProviderRuntimeResolver;
}

interface AcpCommandConfig {
	command: string;
	args: string[];
}

export class ChatRuntimeManager {
	private readonly db: HostDb;
	private readonly runtimeResolver: ModelProviderRuntimeResolver;
	private readonly mastraRuntimes = new Map<string, MastraRuntimeSession>();
	private readonly mastraRuntimeCreations = new Map<
		string,
		MastraInflightRuntimeCreation
	>();
	private readonly acpRuntimes = new Map<string, AcpChatRuntime>();
	private readonly acpRuntimeCreations = new Map<
		string,
		AcpInflightRuntimeCreation
	>();

	constructor(options: ChatRuntimeManagerOptions) {
		this.db = options.db;
		this.runtimeResolver = options.runtimeResolver;
	}

	private shouldUseAcpChat(): boolean {
		const value =
			process.env.SUPERSET_EXPERIMENTAL_ACP_CHAT?.trim().toLowerCase();
		return value === "1" || value === "true" || value === "yes";
	}

	private subscribeToMastraSessionEvents(runtime: MastraRuntimeSession): void {
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

	private ensureGlobalAgentInstructions(): void {
		const managedMarker = "<!-- managed-by: superset -->";
		const instructions = `${managedMarker}
## Question Tool

When you need to ask the user ANY question — including simple yes/no, confirmations, and clarifications — ALWAYS use the \`ask_user\` tool. Never ask questions in plain text. The Superset UI renders \`ask_user\` calls as an interactive overlay with clickable option buttons; plain-text questions will not be surfaced to the user in the same way.
`;
		try {
			const dir = join(homedir(), ".mastracode");
			const filePath = join(dir, "AGENTS.md");
			if (existsSync(filePath)) {
				const existing = readFileSync(filePath, "utf-8");
				if (!existing.includes(managedMarker)) return;
			}
			mkdirSync(dir, { recursive: true });
			writeFileSync(filePath, instructions, "utf-8");
		} catch {
			// Best-effort compatibility for existing Mastra chat.
		}
	}

	private async createMastraRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<MastraRuntimeSession> {
		if (!(await this.runtimeResolver.hasUsableRuntimeEnv())) {
			throw new Error("No model provider credentials available");
		}
		const cwd = this.resolveWorkspaceCwd(workspaceId);
		this.ensureGlobalAgentInstructions();
		await this.runtimeResolver.prepareRuntimeEnv();
		const runtime = await createMastraCode({
			cwd,
			disableMcp: true,
			memory: new Memory({ options: { observationalMemory: false } }),
		});
		const harness = runtime.harness as unknown as RuntimeHarness;
		const mcpManager = runtime.mcpManager as RuntimeMcpManager | null;
		const hookManager = runtime.hookManager as RuntimeHookManager | null;
		hookManager?.setSessionId?.(sessionId);
		await harness.init();
		harness.setResourceId({ resourceId: sessionId });
		await harness.selectOrCreateThread();
		const sessionRuntime: MastraRuntimeSession = {
			sessionId,
			workspaceId,
			cwd,
			harness,
			mcpManager,
			hookManager,
			lastErrorMessage: null,
			pendingSandboxQuestion: null,
			answeredQuestionIds: new Set(),
			pendingQuestionResponses: new Map(),
		};
		this.subscribeToMastraSessionEvents(sessionRuntime);
		this.mastraRuntimes.set(sessionId, sessionRuntime);
		return sessionRuntime;
	}

	private async createAcpRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<AcpChatRuntime> {
		const cwd = this.resolveWorkspaceCwd(workspaceId);
		await this.prepareOptionalRuntimeEnv();
		const { command, args } = resolveAcpCommandConfig();
		const runtime = new AcpChatRuntime({
			supersetSessionId: sessionId,
			workspaceId,
			cwd,
			command,
			args,
			env: process.env,
		});
		try {
			await runtime.initialize();
		} catch (error) {
			await runtime.dispose().catch(() => {
				// Best-effort cleanup after failed ACP initialization.
			});
			throw error;
		}
		this.acpRuntimes.set(sessionId, runtime);
		return runtime;
	}

	private async prepareOptionalRuntimeEnv(): Promise<void> {
		try {
			await this.runtimeResolver.prepareRuntimeEnv();
		} catch {
			// ACP chat is experimental and additive. The ACP agent owns auth; existing
			// provider env loading is best-effort for users who already configured keys.
		}
	}

	private async getOrCreateMastraRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<MastraRuntimeSession> {
		const existing = this.mastraRuntimes.get(sessionId);
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already bound to workspace ${existing.workspaceId}`,
				);
			}
			return existing;
		}
		const inflight = this.mastraRuntimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}
		const promise = this.createMastraRuntime(sessionId, workspaceId).finally(
			() => {
				this.mastraRuntimeCreations.delete(sessionId);
			},
		);
		this.mastraRuntimeCreations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	private async getOrCreateAcpRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<AcpChatRuntime> {
		const existing = this.acpRuntimes.get(sessionId);
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already bound to workspace ${existing.workspaceId}`,
				);
			}
			return existing;
		}
		const inflight = this.acpRuntimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}
		const promise = this.createAcpRuntime(sessionId, workspaceId).finally(
			() => {
				this.acpRuntimeCreations.delete(sessionId);
			},
		);
		this.acpRuntimeCreations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	private getExistingAcpRuntime(
		sessionId: string,
		workspaceId: string,
	): AcpChatRuntime | null {
		const runtime = this.acpRuntimes.get(sessionId);
		if (!runtime) return null;
		if (runtime.workspaceId !== workspaceId) {
			throw new Error(
				`Session ${sessionId} is bound to workspace ${runtime.workspaceId}`,
			);
		}
		return runtime;
	}

	async disposeRuntime(sessionId: string, workspaceId: string): Promise<void> {
		await this.disposeMastraRuntime(sessionId, workspaceId);
		await this.disposeAcpRuntime(sessionId, workspaceId);
	}

	private async disposeMastraRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<void> {
		const inflight = this.mastraRuntimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is being created for workspace ${inflight.workspaceId}`,
				);
			}
			try {
				await inflight.promise;
			} catch {
				// Creation already failed; no runtime was inserted to dispose.
				return;
			}
		}
		const runtime = this.mastraRuntimes.get(sessionId);
		if (!runtime) return;
		if (runtime.workspaceId !== workspaceId) {
			throw new Error(
				`Session ${sessionId} is bound to workspace ${runtime.workspaceId}`,
			);
		}
		try {
			runtime.harness.abort();
		} catch {
			// Best-effort abort; continue with MCP disconnect and map cleanup.
		}
		try {
			await runtime.mcpManager?.disconnect?.();
		} catch {
			// Best-effort disconnect; the process may already be torn down.
		}
		this.mastraRuntimes.delete(sessionId);
	}

	private async disposeAcpRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<void> {
		const inflight = this.acpRuntimeCreations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new Error(
					`Session ${sessionId} is being created for workspace ${inflight.workspaceId}`,
				);
			}
			try {
				await inflight.promise;
			} catch {
				// Creation already failed; no runtime was inserted to dispose.
				return;
			}
		}
		const runtime = this.acpRuntimes.get(sessionId);
		if (!runtime) return;
		if (runtime.workspaceId !== workspaceId) {
			throw new Error(
				`Session ${sessionId} is bound to workspace ${runtime.workspaceId}`,
			);
		}
		await runtime.dispose();
		this.acpRuntimes.delete(sessionId);
	}

	private buildMastraDisplayState(
		runtime: MastraRuntimeSession,
	): ChatDisplayState {
		const displayState = runtime.harness.getDisplayState();
		const currentMessage = displayState.currentMessage;
		const currentMessageError =
			currentMessage?.role === "assistant" &&
			typeof currentMessage.errorMessage === "string" &&
			currentMessage.errorMessage.trim()
				? currentMessage.errorMessage.trim()
				: null;
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
						{ label: "Yes", description: "Allow access." },
						{ label: "No", description: "Deny access." },
					],
				}
			: null;
		return {
			...displayState,
			pendingQuestion: harnessPendingQuestion ?? sandboxPendingQuestion,
			errorMessage: currentMessageError ?? runtime.lastErrorMessage,
		} as ChatDisplayState;
	}

	async getDisplayState(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<ChatDisplayState> {
		if (this.shouldUseAcpChat()) {
			const runtime = await this.getOrCreateAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			return runtime.getDisplayState() as ChatDisplayState;
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return this.buildMastraDisplayState(runtime);
	}

	async listMessages(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<ChatMessage[]> {
		if (this.shouldUseAcpChat()) {
			const runtime = await this.getOrCreateAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			return runtime.listMessages();
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.listMessages();
	}

	async getSnapshot(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<RuntimeChatSnapshot> {
		if (this.shouldUseAcpChat()) {
			const runtime = await this.getOrCreateAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			return runtime.getSnapshot();
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return {
			displayState: this.buildMastraDisplayState(runtime),
			messages: await runtime.harness.listMessages(),
		};
	}

	async sendMessage(input: ChatSendMessageInput): Promise<unknown> {
		if (this.shouldUseAcpChat()) {
			const runtime = await this.getOrCreateAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			return runtime.sendMessage(input.payload);
		}
		const runtime = await this.getOrCreateMastraRuntime(
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
		if (this.shouldUseAcpChat()) {
			throw new Error(
				"ACP chat does not support editing or restarting prior turns yet.",
			);
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.lastErrorMessage = null;
		await restartMastraRuntimeFromUserMessage(runtime, input);
	}

	async stop(input: { sessionId: string; workspaceId: string }): Promise<void> {
		if (this.shouldUseAcpChat()) {
			const runtime = this.getExistingAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			runtime?.stop();
			return;
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		runtime.harness.abort();
	}

	async respondToApproval(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatApprovalPayload;
	}): Promise<unknown> {
		if (this.shouldUseAcpChat()) {
			const runtime = this.getExistingAcpRuntime(
				input.sessionId,
				input.workspaceId,
			);
			if (!runtime) throw new Error("No ACP runtime exists for this session");
			runtime.respondToApproval(input.payload);
			return;
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.respondToToolApproval(input.payload);
	}

	async respondToQuestion(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatQuestionPayload;
	}): Promise<unknown> {
		if (this.shouldUseAcpChat()) {
			void input.payload;
			throw new Error(
				"ACP chat question responses are not available for this request.",
			);
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return respondToQuestionWithOptimisticState(runtime, input.payload);
	}

	async respondToPlan(input: {
		sessionId: string;
		workspaceId: string;
		payload: ChatPlanPayload;
	}): Promise<unknown> {
		if (this.shouldUseAcpChat()) {
			void input.payload;
			throw new Error(
				"ACP chat plan approval is not available for this request.",
			);
		}
		const runtime = await this.getOrCreateMastraRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return runtime.harness.respondToPlanApproval(input.payload);
	}

	private resolveWorkspaceCwd(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
		if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
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

function respondToQuestionWithOptimisticState(
	runtime: MastraRuntimeSession,
	payload: ChatQuestionPayload,
): Promise<unknown> {
	const questionId = payload.questionId;
	const pendingResponse = runtime.pendingQuestionResponses.get(questionId);
	if (pendingResponse) return pendingResponse;
	const wasAlreadyAnswered = runtime.answeredQuestionIds.has(questionId);
	const previousSandboxQuestion = runtime.pendingSandboxQuestion;
	const clearsSandboxQuestion =
		previousSandboxQuestion?.questionId === questionId;
	runtime.answeredQuestionIds.add(questionId);
	if (clearsSandboxQuestion) runtime.pendingSandboxQuestion = null;
	let responsePromise: Promise<unknown>;
	responsePromise = Promise.resolve()
		.then(() => runtime.harness.respondToQuestion(payload))
		.catch((error) => {
			if (
				runtime.pendingQuestionResponses.get(questionId) === responsePromise
			) {
				if (!wasAlreadyAnswered) runtime.answeredQuestionIds.delete(questionId);
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

async function restartMastraRuntimeFromUserMessage(
	runtime: MastraRuntimeSession,
	input: RestartPayload,
): Promise<void> {
	const threadId = runtime.harness.getCurrentThreadId();
	if (!threadId)
		throw new Error("No active Mastra thread is available for editing");
	const memoryStore = await getRuntimeMemoryStore(runtime);
	const sourceThread = await memoryStore.getThreadById({ threadId });
	if (!sourceThread) throw new Error(`Mastra thread not found: ${threadId}`);
	const sourceMessages = await memoryStore.listMessages({
		threadId,
		perPage: false,
		orderBy: { field: "createdAt", direction: "ASC" },
	});
	const targetIndex = sourceMessages.messages.findIndex(
		(message) => message.id === input.messageId,
	);
	if (targetIndex === -1)
		throw new Error("The selected message is no longer available to edit");
	const targetMessage = sourceMessages.messages[targetIndex];
	if (targetMessage?.role !== "user")
		throw new Error("Only user messages can be edited or resent");
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
	if (selectedModel)
		await runtime.harness.switchModel({
			modelId: selectedModel,
			scope: "thread",
		});
	const thinkingLevel = input.metadata?.thinkingLevel;
	if (thinkingLevel) await runtime.harness.setState({ thinkingLevel });
	runtime.lastErrorMessage = null;
	await runtime.harness.sendMessage(input.payload);
}

async function getRuntimeMemoryStore(
	runtime: MastraRuntimeSession,
): Promise<RuntimeMemoryStore> {
	const storage = runtime.harness.config?.storage;
	if (!storage)
		throw new Error("Mastra storage is not configured for this session");
	const memoryStore = await storage.getStore("memory");
	if (!memoryStore)
		throw new Error("Mastra memory storage is unavailable for this session");
	return memoryStore;
}

function resolveAcpCommandConfig(): AcpCommandConfig {
	const command = process.env.SUPERSET_ACP_COMMAND?.trim() || "omp";
	const argsEnv = process.env.SUPERSET_ACP_ARGS?.trim();
	if (!argsEnv) return { command, args: ["acp"] };
	try {
		const parsed = JSON.parse(argsEnv) as unknown;
		if (
			Array.isArray(parsed) &&
			parsed.every((arg) => typeof arg === "string")
		) {
			return { command, args: parsed };
		}
	} catch {
		// Fall back to shell-style whitespace splitting below.
	}
	return {
		command,
		args: argsEnv.split(/\s+/).filter((arg) => arg.length > 0),
	};
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
	return (
		isObjectRecord(event) &&
		event.type === "sandbox_access_request" &&
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
	if (error instanceof Error && error.message.trim())
		return normalizeErrorMessage(error.message);
	if (typeof error === "string" && error.trim())
		return normalizeErrorMessage(error);
	if (isObjectRecord(error) && typeof error.message === "string") {
		return normalizeErrorMessage(error.message);
	}
	return "Unexpected chat error";
}
