import { randomUUID } from "node:crypto";
import type {
	ApprovalRequest,
	Decision,
	Item,
	SessionState,
	ToolCall,
	Turn,
	UserContent,
} from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";
import { EventQueue } from "../../eventQueue";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../types";
import { mapThreadItem } from "../mapThreadItem";
import type {
	CodexNotification,
	CodexServerRequest,
	CodexTransport,
	CodexTransportHandlers,
	SpawnCodexOptions,
} from "../rpcClient";
import { CodexRpcClient, spawnCodexTransport } from "../rpcClient";
import type { CodexRequestId, CodexThreadItem, CodexTurn } from "../wire";
import {
	commandApprovalParamsSchema,
	errorNotificationSchema,
	fileChangeApprovalParamsSchema,
	itemDeltaSchema,
	itemLifecycleSchema,
	planUpdatedSchema,
	serverRequestResolvedSchema,
	threadStartResponseSchema,
	threadStatusChangedSchema,
	tokenUsageUpdatedSchema,
	turnLifecycleSchema,
	warningNotificationSchema,
} from "../wire";
import type { CodexDecisionOption } from "./approvalDecisions";
import { codexDecision, decisionOptions } from "./approvalDecisions";
import { CODEX_MODES, codexTurnPolicy, DEFAULT_CODEX_MODE } from "./codexModes";
import {
	MIN_CODEX_VERSION,
	meetsMinimumVersion,
	parseCodexVersion,
} from "./codexVersion";

const TEXT_DELTA_METHODS = new Set([
	"item/agentMessage/delta",
	"item/plan/delta",
	"item/reasoning/textDelta",
	"item/reasoning/summaryTextDelta",
]);

const NOTICE_METHODS: Record<string, "info" | "error" | "config_change"> = {
	warning: "info",
	configWarning: "info",
	guardianWarning: "info",
	deprecationNotice: "info",
	"model/rerouted": "config_change",
	"model/verification": "info",
};

const IGNORED_METHODS = new Set([
	"thread/started",
	"turn/diff/updated",
	"rawResponseItem/completed",
	"hook/started",
	"hook/completed",
	"mcpServer/startupStatus/updated",
	"remoteControl/status/changed",
	"account/updated",
	"account/rateLimits/updated",
	"app/list/updated",
	"skills/changed",
	"fs/changed",
	"model/safetyBuffering/updated",
	"item/autoApprovalReview/started",
	"item/autoApprovalReview/completed",
]);

const APPROVAL_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
]);

function asToolCall(item: Item | null): ToolCall | null {
	if (!item || !isKnownItem(item) || item.kind !== "tool_call") return null;
	return item;
}

type PendingApproval = {
	requestId: CodexRequestId;
	turnId: string;
	item: ApprovalRequest;
	options: CodexDecisionOption[];
};

type InFlightItem = {
	codexItem: CodexThreadItem;
	turnId: string;
	startedAtMs: number;
};

export type CodexAdapterOptions = SpawnCodexOptions & {
	minVersion?: string;
	clientVersion?: string;
	now?: () => number;
	mintId?: () => string;
	createTransport?(
		options: SpawnCodexOptions,
		handlers: CodexTransportHandlers,
	): CodexTransport;
};

export class CodexAdapter implements HarnessAdapter {
	private readonly queue = new EventQueue();
	private readonly itemText = new Map<string, string>();
	private readonly inFlight = new Map<string, InFlightItem>();
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	private readonly settledTurns = new Set<string>();
	private pendingTurnStart = false;
	private cancelRequested = false;
	private readonly queuedInput: unknown[][] = [];
	private client: CodexRpcClient | null = null;
	private threadId: string | null = null;
	private cwd = process.cwd();
	private modeId: string = DEFAULT_CODEX_MODE;
	private modelId: string | undefined;
	private currentTurn: Turn | null = null;
	private usage: Turn["usage"];
	private disposed = false;

	constructor(private readonly options: CodexAdapterOptions = {}) {}

	start(startOptions: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		this.cwd = startOptions.cwd;
		this.modeId = startOptions.modeId ?? DEFAULT_CODEX_MODE;
		this.modelId = startOptions.modelId;
		void this.bootstrap(startOptions);
		return this.queue.iterable();
	}

	prompt(content: UserContent[]): void {
		const input = this.toCodexInput(content);
		if (!this.threadId || !this.client) {
			this.queuedInput.push(input);
			return;
		}
		void this.startTurn(input);
	}

	cancelTurn(): void {
		if (!this.client || !this.threadId) return;
		const turn = this.currentTurn;
		if (turn?.status === "running") {
			this.interrupt(turn.id);
			return;
		}
		if (this.pendingTurnStart) this.cancelRequested = true;
	}

	private interrupt(turnId: string): void {
		this.cancelRequested = false;
		void this.client
			?.request("turn/interrupt", { threadId: this.threadId, turnId })
			.catch((error: Error) => this.emitNotice("error", error.message));
	}

	respondToApproval(approvalId: string, decision: Decision): void {
		const pending = this.pendingApprovals.get(approvalId);
		if (!pending || !this.client) return;
		this.pendingApprovals.delete(approvalId);
		this.client.respond(pending.requestId, {
			decision: codexDecision(decision, pending.options),
		});
		this.emitItem(
			{
				...pending.item,
				status: "answered",
				decision,
				completedAtMs: this.now(),
			},
			pending.turnId,
		);
	}

	setMode(modeId: string): void {
		this.modeId = modeId;
		this.emitSession({ modeId });
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.stalePendingApprovals();
		await this.client?.close();
		this.queue.close();
	}

	private async bootstrap(startOptions: HarnessStartOptions): Promise<void> {
		this.emitSession({ status: "starting" });
		try {
			const client = new CodexRpcClient({
				clientVersion: this.options.clientVersion,
				createTransport: (handlers) =>
					(this.options.createTransport ?? spawnCodexTransport)(
						{
							command: this.options.command,
							args: this.options.args,
							cwd: startOptions.cwd,
							env: this.options.env,
						},
						handlers,
					),
				onNotification: (notification) => this.handleNotification(notification),
				onServerRequest: (request) => this.handleServerRequest(request),
				onDispatchError: (error, method) =>
					this.emitNotice(
						"error",
						`codex ${method} could not be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				onExit: (code) => this.handleExit(code),
			});
			this.client = client;

			const initialize = await client.initialize();
			const version = parseCodexVersion(initialize.userAgent);
			const minimum = this.options.minVersion ?? MIN_CODEX_VERSION;
			if (!meetsMinimumVersion(version, minimum)) {
				this.emitNotice(
					"error",
					`codex ${version ?? "of an unknown version"} is not supported: upgrade to ${minimum} or newer`,
				);
				this.emitSession({ status: "dead" });
				await client.close();
				this.queue.close();
				return;
			}

			const policy = codexTurnPolicy(this.modeId);
			const response = startOptions.resume
				? await client.request("thread/resume", {
						threadId: startOptions.resume.harnessSessionId,
						cwd: startOptions.cwd,
						...policy,
					})
				: await client.request("thread/start", {
						cwd: startOptions.cwd,
						...policy,
						...(this.modelId ? { model: this.modelId } : {}),
					});
			const thread = threadStartResponseSchema.parse(response);
			this.threadId = thread.thread.id;
			this.modelId = thread.model ?? this.modelId;

			this.emitSession({
				status: "idle",
				modeId: this.modeId,
				availableModes: [...CODEX_MODES],
				...(this.modelId ? { modelId: this.modelId } : {}),
			});

			const queued = this.queuedInput.splice(0, this.queuedInput.length);
			for (const input of queued) await this.startTurn(input);
		} catch (error) {
			this.emitNotice("error", (error as Error).message);
			this.emitSession({ status: "dead" });
			this.queue.close();
		}
	}

	private async startTurn(input: unknown[]): Promise<void> {
		const client = this.client;
		if (!client || !this.threadId) return;
		this.pendingTurnStart = true;
		try {
			const response = await client.request("turn/start", {
				threadId: this.threadId,
				input,
				...codexTurnPolicy(this.modeId),
				...(this.modelId ? { model: this.modelId } : {}),
			});
			const parsed = turnLifecycleSchema
				.partial({ threadId: true })
				.safeParse(response);
			if (parsed.success && parsed.data.turn) this.emitTurn(parsed.data.turn);
		} catch (error) {
			this.emitNotice("error", (error as Error).message);
			this.emitTurnState({
				id: this.mintId(),
				status: "failed",
				error: { message: (error as Error).message },
				startedAtMs: this.now(),
				completedAtMs: this.now(),
			});
		}
	}

	private handleNotification({ method, params }: CodexNotification): void {
		if (IGNORED_METHODS.has(method)) return;

		if (method === "item/started" || method === "item/completed") {
			this.handleItemLifecycle(method, params);
			return;
		}
		if (TEXT_DELTA_METHODS.has(method)) {
			const delta = itemDeltaSchema.parse(params);
			this.itemText.set(
				delta.itemId,
				(this.itemText.get(delta.itemId) ?? "") + delta.delta,
			);
			this.emit({
				kind: "delta",
				delta: { type: "text", itemId: delta.itemId, append: delta.delta },
			});
			return;
		}
		if (method === "item/commandExecution/outputDelta") {
			const delta = itemDeltaSchema.parse(params);
			this.emit({
				kind: "delta",
				delta: { type: "terminal", itemId: delta.itemId, append: delta.delta },
			});
			return;
		}
		if (method === "turn/started" || method === "turn/completed") {
			const lifecycle = turnLifecycleSchema.parse(params);
			if (method === "turn/completed") {
				this.settleInFlight(lifecycle.turn);
			}
			this.emitTurn(lifecycle.turn);
			return;
		}
		if (method === "thread/tokenUsage/updated") {
			const update = tokenUsageUpdatedSchema.parse(params);
			this.usage = {
				inputTokens: update.tokenUsage.last.inputTokens,
				cachedInputTokens: update.tokenUsage.last.cachedInputTokens,
				outputTokens: update.tokenUsage.last.outputTokens,
				contextUsed: update.tokenUsage.total.totalTokens,
				...(update.tokenUsage.modelContextWindow == null
					? {}
					: { contextSize: update.tokenUsage.modelContextWindow }),
			};
			if (this.currentTurn) this.emitTurnState(this.currentTurn);
			return;
		}
		if (method === "turn/plan/updated") {
			const update = planUpdatedSchema.parse(params);
			this.emitItem(
				{
					id: `plan:${update.turnId}`,
					kind: "plan",
					startedAtMs: this.now(),
					entries: update.plan.map((step) => ({
						text: step.step,
						status: step.status === "inProgress" ? "in_progress" : step.status,
					})),
				},
				update.turnId,
			);
			return;
		}
		if (method === "thread/status/changed") {
			const update = threadStatusChangedSchema.parse(params);
			this.emitSession({ status: this.sessionStatus(update.status) });
			return;
		}
		if (method === "thread/settings/updated") {
			const settings = params as { threadSettings?: { model?: string } };
			const model = settings.threadSettings?.model;
			if (model && model !== this.modelId) {
				this.modelId = model;
				this.emitSession({ modelId: model });
			}
			return;
		}
		if (method === "thread/name/updated") {
			const update = params as { name?: string };
			if (update.name) this.emitSession({ title: update.name });
			return;
		}
		if (method === "error") {
			const notification = errorNotificationSchema.parse(params);
			this.emitNotice("error", notification.error.message);
			return;
		}
		if (method === "thread/compacted") {
			this.emitNotice("compaction");
			return;
		}
		if (method === "serverRequest/resolved") {
			const resolved = serverRequestResolvedSchema.parse(params);
			this.staleApprovalForRequest(resolved.requestId);
			return;
		}
		const noticeKind = NOTICE_METHODS[method];
		if (noticeKind) {
			const parsed = warningNotificationSchema.safeParse(params);
			this.emitNotice(
				noticeKind,
				parsed.success ? parsed.data.message : method,
			);
			return;
		}
		this.emitNotice("info", `Unmapped codex notification: ${method}`);
	}

	private handleItemLifecycle(method: string, params: unknown): void {
		const lifecycle = itemLifecycleSchema.parse(params);
		const completed = method === "item/completed";
		const startedAtMs =
			lifecycle.startedAtMs ??
			this.inFlight.get(lifecycle.item.id)?.startedAtMs ??
			this.now();

		if (completed) {
			this.inFlight.delete(lifecycle.item.id);
			this.itemText.delete(lifecycle.item.id);
		} else {
			this.inFlight.set(lifecycle.item.id, {
				codexItem: lifecycle.item,
				turnId: lifecycle.turnId,
				startedAtMs,
			});
		}

		const item = mapThreadItem(lifecycle.item, {
			cwd: this.cwd,
			startedAtMs,
			...(completed
				? { completedAtMs: lifecycle.completedAtMs ?? this.now() }
				: {}),
		});
		if (item) this.emitItem(item, lifecycle.turnId);
	}

	private handleServerRequest(request: CodexServerRequest): void {
		const client = this.client;
		if (!client) return;
		if (!APPROVAL_METHODS.has(request.method)) {
			client.respondWithError(
				request.id,
				`unsupported by superset chat runtime: ${request.method}`,
			);
			this.emitNotice(
				"info",
				`Unmapped codex request: ${request.method} (declined)`,
			);
			return;
		}

		const isCommand =
			request.method === "item/commandExecution/requestApproval";
		const params = isCommand
			? commandApprovalParamsSchema.parse(request.params)
			: fileChangeApprovalParamsSchema.parse(request.params);
		const suffix =
			isCommand && "approvalId" in params && params.approvalId
				? `:${params.approvalId}`
				: "";
		const approvalItemId = `approval:${params.itemId}${suffix}`;
		const options = decisionOptions(
			(request.params as { availableDecisions?: unknown }).availableDecisions,
		);
		const detail = this.approvalDetail(isCommand, params.itemId);

		const item: ApprovalRequest = {
			id: approvalItemId,
			kind: "approval_request",
			targetItemId: params.itemId,
			title: params.reason ?? this.approvalFallbackTitle(isCommand, params),
			status: "pending",
			startedAtMs: params.startedAtMs ?? this.now(),
			...(detail.length > 0 ? { detail } : {}),
			...(options.length > 0
				? {
						options: options.map(({ optionId, label }) => ({
							optionId,
							label,
						})),
					}
				: {}),
		};

		this.pendingApprovals.set(approvalItemId, {
			requestId: request.id,
			turnId: params.turnId,
			item,
			options,
		});
		this.emitItem(item, params.turnId);
		this.emitSession({ status: "awaiting_input" });
	}

	private approvalDetail(
		isCommand: boolean,
		itemId: string,
	): ApprovalRequest["detail"] & object {
		const pending = this.inFlight.get(itemId);
		if (!pending) return [];
		const mapped = mapThreadItem(pending.codexItem, {
			cwd: this.cwd,
			startedAtMs: pending.startedAtMs,
		});
		const toolCall = asToolCall(mapped);
		if (!toolCall) return [];
		const content = toolCall.content;
		return isCommand
			? content.filter((entry) => entry.type === "terminal")
			: content;
	}

	private approvalFallbackTitle(
		isCommand: boolean,
		params: { itemId: string },
	): string {
		const pending = this.inFlight.get(params.itemId);
		const mapped = pending
			? mapThreadItem(pending.codexItem, {
					cwd: this.cwd,
					startedAtMs: pending.startedAtMs,
				})
			: null;
		const toolCall = asToolCall(mapped);
		if (toolCall) return toolCall.title;
		return isCommand ? "Run command" : "Apply file change";
	}

	private settleInFlight(turn: CodexTurn): void {
		const settledAtMs = this.now();
		const status = turn.status === "failed" ? "failed" : "canceled";

		for (const [itemId, pending] of [...this.inFlight]) {
			this.inFlight.delete(itemId);
			const accumulated = this.itemText.get(itemId);
			this.itemText.delete(itemId);
			const item = mapThreadItem(
				this.withAccumulatedText(pending.codexItem, accumulated),
				{
					cwd: this.cwd,
					startedAtMs: pending.startedAtMs,
					completedAtMs: settledAtMs,
				},
			);
			if (!item) continue;
			const toolCall = asToolCall(item);
			this.emitItem(toolCall ? { ...toolCall, status } : item, pending.turnId);
		}
		this.stalePendingApprovals();
	}

	private withAccumulatedText(
		codexItem: CodexThreadItem,
		accumulated: string | undefined,
	): CodexThreadItem {
		if (!accumulated) return codexItem;
		if (codexItem.type === "agentMessage" || codexItem.type === "plan") {
			return { ...codexItem, text: accumulated };
		}
		if (codexItem.type === "reasoning") {
			return { ...codexItem, content: [accumulated] };
		}
		return codexItem;
	}

	private stalePendingApprovals(): void {
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			this.pendingApprovals.delete(approvalId);
			this.emitItem(
				{ ...pending.item, status: "stale", completedAtMs: this.now() },
				pending.turnId,
			);
		}
	}

	private staleApprovalForRequest(requestId: CodexRequestId): void {
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			if (pending.requestId !== requestId) continue;
			this.pendingApprovals.delete(approvalId);
			this.emitItem(
				{ ...pending.item, status: "stale", completedAtMs: this.now() },
				pending.turnId,
			);
		}
	}

	private handleExit(code: number | null): void {
		if (this.disposed) return;
		this.stalePendingApprovals();
		this.emitNotice(
			"error",
			`codex app-server exited (code ${code ?? "null"})`,
		);
		this.emitSession({ status: "dead" });
		this.queue.close();
	}

	private sessionStatus(status: { type: string }): SessionState["status"] {
		switch (status.type) {
			case "notLoaded":
				return "not_loaded";
			case "systemError":
				return "dead";
			case "active":
				return this.pendingApprovals.size > 0 ? "awaiting_input" : "running";
			default:
				return "idle";
		}
	}

	private emitTurn(codexTurn: CodexTurn): void {
		this.emitTurnState({
			id: codexTurn.id,
			status: codexTurn.status === "inProgress" ? "running" : codexTurn.status,
			...(codexTurn.error
				? { error: { message: codexTurn.error.message } }
				: {}),
			startedAtMs: codexTurn.startedAt
				? codexTurn.startedAt * 1000
				: (this.currentTurn?.startedAtMs ?? this.now()),
			...(codexTurn.completedAt
				? { completedAtMs: codexTurn.completedAt * 1000 }
				: {}),
		});
	}

	private emitTurnState(turn: Turn): void {
		if (turn.status === "running" && this.settledTurns.has(turn.id)) return;
		if (turn.status !== "running") this.settledTurns.add(turn.id);
		const next: Turn = {
			...turn,
			...(this.usage ? { usage: this.usage } : {}),
		};
		this.currentTurn = next;
		this.emit({ kind: "turn", turn: next });

		this.pendingTurnStart = false;
		if (turn.status !== "running") {
			this.cancelRequested = false;
			return;
		}
		if (this.cancelRequested) this.interrupt(turn.id);
	}

	private toCodexInput(content: UserContent[]): unknown[] {
		const input: unknown[] = [];
		let skippedAttachment = false;
		for (const entry of content) {
			if (entry.type === "text") {
				input.push({
					type: "text",
					text: entry.text,
					text_elements: (entry.elements ?? []).map((element) => ({
						byteRange: element.byteRange,
						placeholder: null,
					})),
				});
				continue;
			}
			skippedAttachment = true;
		}
		if (skippedAttachment) {
			this.emitNotice(
				"info",
				"Attachments are not supported by the codex harness and were omitted",
			);
		}
		return input;
	}

	private emitItem(item: Item, turnId: string): void {
		this.emit({ kind: "item", item, turnId });
	}

	private emitNotice(
		noticeKind: "info" | "error" | "compaction" | "config_change",
		text?: string,
	): void {
		this.emitItem(
			{
				id: this.mintId(),
				kind: "notice",
				noticeKind,
				startedAtMs: this.now(),
				completedAtMs: this.now(),
				...(text ? { text } : {}),
			},
			this.currentTurn?.id ?? "",
		);
	}

	private emitSession(session: Partial<SessionState>): void {
		this.emit({ kind: "session", session });
	}

	private emit(event: AdapterEvent): void {
		this.queue.push(event);
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}
}

export function createCodexAdapter(
	options: CodexAdapterOptions = {},
): HarnessAdapter {
	return new CodexAdapter(options);
}
