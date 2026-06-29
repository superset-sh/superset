import {
	type AcpPermissionOption,
	type AcpPermissionRequest,
	type AcpSessionNotification,
	appendAcpUpdateToDisplayState,
	createInitialDisplayState,
	finishCurrentAssistantMessage,
	payloadToAcpPrompt,
	payloadToChatParts,
} from "./acp-protocol";
import type {
	ChatApprovalPayload,
	ChatDisplayState,
	ChatMessage,
	ChatMessagePayload,
	ChatSnapshot,
} from "./acp-types";
import { AcpJsonRpcError, StdioAcpAgentClient } from "./stdio-acp-client";

export interface AcpRuntimeCreateOptions {
	supersetSessionId: string;
	workspaceId: string;
	cwd: string;
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
}

interface PermissionWaiter {
	requestId: string;
	options: AcpPermissionOption[];
	resolve: (value: unknown) => void;
}

export class AcpChatRuntime {
	readonly sessionId: string;
	readonly workspaceId: string;
	readonly cwd: string;
	private readonly client: StdioAcpAgentClient;
	private readonly history: ChatMessage[] = [];
	private readonly displayState: ChatDisplayState = createInitialDisplayState();
	private acpSessionId: string | null = null;
	private pendingPermission: PermissionWaiter | null = null;
	private promptInFlight: Promise<unknown> | null = null;

	constructor(options: AcpRuntimeCreateOptions) {
		this.sessionId = options.supersetSessionId;
		this.workspaceId = options.workspaceId;
		this.cwd = options.cwd;
		this.client = new StdioAcpAgentClient({
			command: options.command,
			args: options.args,
			cwd: options.cwd,
			env: options.env,
			onUpdate: (notification) => this.handleUpdate(notification),
			onPermissionRequest: (request) => this.handlePermissionRequest(request),
			onError: (error) => {
				this.displayState.errorMessage = error.message;
				this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
				if (this.displayState.isRunning) {
					finishCurrentAssistantMessage({
						state: this.displayState,
						history: this.history,
						stopReason: "error",
						errorMessage: error.message,
					});
				}
			},
		});
	}

	async initialize(): Promise<void> {
		await this.client.initialize();
		const session = await this.client.newSession(this.cwd);
		this.acpSessionId = session.sessionId;
	}

	getDisplayState(): ChatDisplayState {
		return this.displayState;
	}

	listMessages(): ChatMessage[] {
		return this.history;
	}

	getSnapshot(): ChatSnapshot {
		return {
			displayState: this.displayState,
			messages: this.history,
		};
	}

	async sendMessage(
		payload: ChatMessagePayload,
	): Promise<{ stopReason?: string }> {
		if (this.promptInFlight) {
			throw new Error("ACP chat already has a prompt in progress");
		}
		const acpSessionId = this.requireAcpSessionId();
		this.displayState.errorMessage = null;
		this.displayState.pendingApproval = null;
		this.displayState.pendingQuestion = null;
		this.history.push({
			id: `user-${crypto.randomUUID()}`,
			role: "user",
			content: payloadToChatParts(payload),
			createdAt: new Date(),
		});
		this.displayState.isRunning = true;

		const promptPromise = this.client.prompt(
			acpSessionId,
			payloadToAcpPrompt(payload),
		);
		this.promptInFlight = promptPromise;
		try {
			const result = await promptPromise;
			finishCurrentAssistantMessage({
				state: this.displayState,
				history: this.history,
				stopReason: result.stopReason ?? "end_turn",
			});
			return result;
		} catch (error) {
			if (isPromptCancelledError(error)) {
				return { stopReason: "cancelled" };
			}
			this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
			const message = error instanceof Error ? error.message : String(error);
			finishCurrentAssistantMessage({
				state: this.displayState,
				history: this.history,
				stopReason: this.isAuthRequiredError(error) ? "auth_required" : "error",
				errorMessage: message,
			});
			throw error;
		} finally {
			if (this.promptInFlight === promptPromise) this.promptInFlight = null;
		}
	}

	stop(): void {
		const acpSessionId = this.acpSessionId;
		if (!acpSessionId) return;
		this.client.cancel(acpSessionId);
		this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
		finishCurrentAssistantMessage({
			state: this.displayState,
			history: this.history,
			stopReason: "cancelled",
		});
	}

	async dispose(): Promise<void> {
		this.stop();
		await this.client.dispose();
	}

	respondToApproval(payload: ChatApprovalPayload): void {
		const pending = this.pendingPermission;
		if (!pending) throw new Error("No ACP permission request is pending");
		const option = selectPermissionOption(payload.decision, pending.options);
		if (!option)
			throw new Error(
				`ACP permission request has no option for ${payload.decision}`,
			);
		this.resolvePendingPermission({
			outcome: { outcome: "selected", optionId: option.optionId },
		});
	}

	restartFromMessage(): Promise<void> {
		throw new Error(
			"ACP chat does not support editing or restarting prior turns yet.",
		);
	}

	respondToQuestion(): Promise<void> {
		throw new Error(
			"ACP chat question responses are not available for this request.",
		);
	}

	respondToPlan(): Promise<void> {
		throw new Error(
			"ACP chat plan approval is not available for this request.",
		);
	}

	private handleUpdate(notification: AcpSessionNotification): void {
		if (this.acpSessionId && notification.sessionId !== this.acpSessionId)
			return;
		appendAcpUpdateToDisplayState({
			state: this.displayState,
			update: notification.update,
		});
	}

	private handlePermissionRequest(
		request: AcpPermissionRequest,
	): Promise<unknown> {
		if (this.pendingPermission) {
			return Promise.resolve({ outcome: { outcome: "cancelled" } });
		}
		const toolCallId = request.toolCall.toolCallId ?? crypto.randomUUID();
		const title = request.toolCall.title ?? request.toolCall.kind ?? "tool";
		this.displayState.pendingApproval = {
			toolCallId,
			toolName: title,
			args: request.toolCall.rawInput ?? request.toolCall.content ?? {},
		};
		const { promise, resolve } = Promise.withResolvers<unknown>();
		this.pendingPermission = {
			requestId: toolCallId,
			options: request.options,
			resolve,
		};
		return promise;
	}

	private resolvePendingPermission(result: unknown): void {
		const pending = this.pendingPermission;
		if (!pending) return;
		this.pendingPermission = null;
		this.displayState.pendingApproval = null;
		pending.resolve(result);
	}

	private requireAcpSessionId(): string {
		if (!this.acpSessionId)
			throw new Error("ACP session has not been initialized");
		return this.acpSessionId;
	}

	private isAuthRequiredError(error: unknown): boolean {
		return error instanceof AcpJsonRpcError && error.code === -32001;
	}
}

function isPromptCancelledError(error: unknown): boolean {
	return error instanceof Error && error.message === "ACP prompt cancelled";
}

function selectPermissionOption(
	decision: ChatApprovalPayload["decision"],
	options: AcpPermissionOption[],
): AcpPermissionOption | null {
	const preferredKinds: Record<ChatApprovalPayload["decision"], string[]> = {
		approve: ["allow_once", "allow_always"],
		always_allow_category: ["allow_always"],
		decline: ["reject_once", "reject_always"],
	};
	for (const kind of preferredKinds[decision]) {
		const option = options.find((candidate) => candidate.kind === kind);
		if (option) return option;
	}
	const labelNeedles: Record<ChatApprovalPayload["decision"], string[]> = {
		approve: ["allow", "yes", "approve"],
		always_allow_category: ["always"],
		decline: ["deny", "decline", "reject", "no"],
	};
	return (
		options.find((option) => {
			const label = `${option.optionId} ${option.name}`.toLowerCase();
			return labelNeedles[decision].some((needle) => label.includes(needle));
		}) ?? null
	);
}
