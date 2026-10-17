import { randomUUID } from "node:crypto";
import type {
	ApprovalRequest,
	AvailableCommand,
	Decision,
	FormField,
	Item,
	ItemAttachment,
	Plan,
	SessionConfigOption,
	SessionState,
	ToolCall,
	ToolContent,
	ToolKind,
	Turn,
	UserContent,
} from "@superset/chat/protocol";
import { AGENT_DEFAULT_MODE } from "@superset/chat/protocol";
import { z } from "zod";
import { BackgroundTasks } from "../backgroundTasks";
import { EventQueue } from "../eventQueue";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../types";
import {
	AIR_ASYNC_TASK_STOP_METHOD,
	AIR_CLIENT_META,
	airAsyncTaskProgressSchema,
	airAsyncTaskSpawnedSchema,
	airAsyncTaskStateSchema,
	airSubagentSpawnedSchema,
	airSubagentStateSchema,
	isSubagentControlCall,
	isTerminalAirState,
} from "./air";
import {
	type AcpImageSource,
	imageSourceOf,
	withoutImageData,
} from "./imageBlocks";
import { imageDimensions } from "./imageDimensions";
import type {
	AcpNotification,
	AcpServerRequest,
	AcpTransport,
	AcpTransportHandlers,
	SpawnAcpOptions,
} from "./rpcClient";
import {
	AcpRpcClient,
	AcpRpcError,
	AcpTimeoutError,
	spawnAcpTransport,
} from "./rpcClient";
import type { AcpConfigSelectOption, AcpElicitationProperty } from "./wire";
import {
	ACP_STEERING_METHOD,
	type AcpContentBlock,
	type AcpToolCallContent,
	acpAvailableCommandsUpdateSchema,
	acpConfigOptionUpdateSchema,
	acpContentBlockSchema,
	acpCreateElicitationParamsSchema,
	acpInitializeResponseSchema,
	acpMessageSchema,
	acpNewSessionResponseSchema,
	acpPlanSchema,
	acpPlanUpdateSchema,
	acpPromptResponseSchema,
	acpRequestPermissionParamsSchema,
	acpSessionInfoUpdateSchema,
	acpSessionNotificationSchema,
	acpSessionUpdateSchema,
	acpStateUpdateSchema,
	acpSteeringResponseSchema,
	acpSubagentUpdateSchema,
	acpToolCallContentChunkSchema,
	acpToolCallUpdateSchema,
	acpUsageUpdateSchema,
} from "./wire";

/**
 * The newest protocol version this adapter speaks. ACP negotiates: the agent
 * replies with this version when it supports it, or with the newest it does,
 * and `negotiatedVersion` is what the session actually runs on. Asking for
 * more than an agent knows is safe and is how the fleet moves forward.
 */
const LATEST_PROTOCOL_VERSION = 2;

/** Who `initialize` says we are; v2 requires a name and a version. */
const CLIENT_INFO = { name: "superset", version: "1.0.0" };

const TOOL_KIND_BY_ACP: Record<string, ToolKind> = {
	read: "read",
	edit: "edit",
	delete: "delete",
	move: "move",
	search: "search",
	execute: "execute",
	think: "think",
	fetch: "fetch",
	switch_mode: "other",
	other: "other",
};

function unconfirmedSelectionMessage(error: AcpTimeoutError): string {
	return `${error.message}. The agent can still apply the change, so the selection stays as you set it.`;
}

function commandCategory(
	category: unknown,
): Pick<AvailableCommand, "category"> {
	return category === "native" || category === "mcp" ? { category } : {};
}

function toolKind(kind: string | undefined): ToolKind {
	return (kind && TOOL_KIND_BY_ACP[kind]) || "other";
}

function toolStatus(status: string | undefined): ToolCall["status"] {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		// v2 added `cancelled` alongside `pending`, which is still pre-run.
		case "cancelled":
			return "canceled";
		default:
			return "running";
	}
}

function toolCallSettled(status: string | null | undefined): boolean {
	return (
		status === "completed" || status === "failed" || status === "cancelled"
	);
}

function planEntryStatus(status: string): Plan["entries"][number]["status"] {
	if (status === "in_progress" || status === "completed") return status;
	return "pending";
}

function planEntryItems(
	entries: ReadonlyArray<{ content: string; status: string }>,
): Plan["entries"] {
	return entries.map((entry) => ({
		text: entry.content,
		status: planEntryStatus(entry.status),
	}));
}

function messageText(content: readonly AcpContentBlock[]): string {
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}

/**
 * v2's `state_update` reports the agent's foreground work, which is a session
 * status rather than the mode `current_mode_update` carried in v1. Custom and
 * `unknown` states leave the status alone.
 */
const SESSION_STATUS_BY_ACP_STATE: Record<string, SessionState["status"]> = {
	running: "running",
	idle: "idle",
	requires_action: "awaiting_input",
};

const GATEWAY_MODEL_PREFIX = "vercel-ai-gateway/";

// pdev sends `_meta.piAcp.model` as an id or a { provider, modelId } pair.
function resolvedModelOf(raw: unknown): string | undefined {
	const meta = (raw as { _meta?: unknown })._meta;
	const piAcp =
		typeof meta === "object" &&
		meta !== null &&
		typeof (meta as Record<string, unknown>).piAcp === "object"
			? ((meta as Record<string, unknown>).piAcp as Record<string, unknown>)
			: undefined;
	const reported = piAcp?.model;
	const id =
		typeof reported === "string"
			? reported
			: typeof reported === "object" &&
					reported !== null &&
					typeof (reported as Record<string, unknown>).modelId === "string"
				? (reported as Record<string, unknown>).modelId
				: undefined;
	if (typeof id !== "string" || id === "") return undefined;
	return id.startsWith(GATEWAY_MODEL_PREFIX)
		? id.slice(GATEWAY_MODEL_PREFIX.length)
		: id;
}

export type AcpAttachment = {
	path: string;
	mimeType: string;
	data: string;
};

/** `path` is relative to the session cwd. */
export type AcpStoredImage = { path: string };

export type AcpImageStoreContext = {
	sessionId: string;
	referenceId: string;
	replaying: boolean;
};

const STARTUP_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;
const STDERR_TAIL_CHARS = 4000;
const ASK_MODE_ID = "default";
const QUESTION_FIELD_ID = "answer";
const SHELL_POLL_MS = 2000;
const CLIENT_APPROVAL_MODES = [
	{ id: ASK_MODE_ID, label: "Ask for approval" },
	{ id: "auto", label: "Approve for me" },
	{ id: "bypassPermissions", label: "Full access" },
];

function sessionMissing(error: unknown): boolean {
	return (
		error instanceof AcpRpcError &&
		(error.code === -32002 ||
			/unknown sessionid|session not found|no conversation found|no rollout found/i.test(
				error.message,
			))
	);
}

export type AcpAdapterOptions = SpawnAcpOptions & {
	launch?: () => Promise<Pick<SpawnAcpOptions, "command" | "args" | "env">>;
	/** Selected for a new session that asks for no mode, when the agent offers it. */
	defaultModeId?: string;
	clientApprovalModes?: boolean;
	shellPollMs?: number;
	startupTimeoutMs?: number;
	requestTimeoutMs?: number;
	resolveAttachment?: (attachmentId: string) => Promise<AcpAttachment | null>;
	/** Without it, images the agent sends are dropped. */
	storeImage?: (
		image: AcpImageSource,
		cwd: string,
		context?: AcpImageStoreContext,
	) => AcpStoredImage | null;
	onSpawn?: (pid: number) => void;
	backgroundDetailIntervalMs?: number;
	now?: () => number;
	mintId?: () => string;
	createTransport?(
		options: SpawnAcpOptions,
		handlers: AcpTransportHandlers,
	): AcpTransport;
};

type OpenText = {
	itemId: string;
	kind: "agent_message" | "reasoning" | "user_message";
	/** v2's message identity; v1 chunks carry none and group by kind and turn. */
	messageId: string | null;
	text: string;
	attachments: ItemAttachment[];
	turnId: string;
	startedAtMs: number;
	model?: string;
};

type PendingApproval = {
	requestId: number | string;
	turnId: string;
	item: ApprovalRequest;
	fieldTypes?: Record<string, string | undefined>;
	selectsOption?: boolean;
	otherOptionId?: string;
};

type AcpSessionModes = NonNullable<
	ReturnType<typeof acpNewSessionResponseSchema.parse>["modes"]
>;

/**
 * Bridges an Agent Client Protocol subprocess (Claude Code / Codex ACP
 * adapters) into the chat runtime. A chat turn maps to one `session/prompt`
 * round trip; ACP `session/update` notifications stream into chat items and
 * deltas; `session/request_permission` becomes an approval item.
 */
const APPROVAL_OPTION_KINDS = new Set([
	"allow_once",
	"allow_always",
	"reject_once",
	"reject_always",
]);

const MAIN_AGENT_ACTIVITY = new Set([
	"agent_message_chunk",
	"agent_thought_chunk",
	"agent_message",
	"agent_thought",
	"tool_call",
	"tool_call_update",
	"tool_call_content_chunk",
	"plan",
	"plan_update",
]);

function isApprovalOptionKind(
	kind: string | undefined,
): kind is "allow_once" | "allow_always" | "reject_once" | "reject_always" {
	return kind !== undefined && APPROVAL_OPTION_KINDS.has(kind);
}

type AcpEnumOption = { const: string; title?: string; description?: string };

function enumOptions(
	values: string[] | undefined,
	names?: string[],
): AcpEnumOption[] | undefined {
	return values?.map((value, index) => ({
		const: value,
		title: names?.[index] ?? value,
	}));
}

function formField(
	id: string,
	property: AcpElicitationProperty,
	required: boolean,
): FormField {
	const base = {
		id,
		...(property.title ? { title: property.title } : {}),
		...(property.description ? { description: property.description } : {}),
		...(required ? { required } : {}),
	};
	if (property.type === "boolean") return { ...base, input: "boolean" };
	const choices: AcpEnumOption[] | undefined =
		property.type === "array"
			? (property.items?.anyOf ?? enumOptions(property.items?.enum))
			: (property.oneOf ?? enumOptions(property.enum, property.enumNames));
	if (!choices) {
		if (property.type === "integer") return { ...base, input: "integer" };
		if (property.type === "number") return { ...base, input: "number" };
		return { ...base, input: "text" };
	}
	return {
		...base,
		input: property.type === "array" ? "multi" : "single",
		options: choices.map((choice) => ({
			value: choice.const,
			label: choice.title ?? choice.const,
			...(choice.description ? { description: choice.description } : {}),
		})),
	};
}

function formContent(
	values: Record<string, string | string[]>,
	fieldTypes: Record<string, string | undefined>,
): Record<string, unknown> {
	const content: Record<string, unknown> = {};
	for (const [id, value] of Object.entries(values)) {
		const type = fieldTypes[id];
		if (Array.isArray(value)) content[id] = value;
		else if (type === "boolean") content[id] = value === "true";
		else if (type === "number" || type === "integer")
			content[id] = Number(value);
		else content[id] = value;
	}
	return content;
}

function formErrors(
	values: Record<string, string | string[]>,
	fields: readonly FormField[],
	fieldTypes: Record<string, string | undefined>,
): string[] {
	const errors: string[] = [];
	for (const field of fields) {
		const value = values[field.id];
		const empty =
			value === undefined ||
			(Array.isArray(value) ? value.length === 0 : value.trim() === "");
		if (empty) {
			if (field.required) errors.push(field.id);
			continue;
		}
		const type = fieldTypes[field.id];
		if (type !== "number" && type !== "integer") continue;
		const parsed = Number(value);
		if (
			typeof value !== "string" ||
			!Number.isFinite(parsed) ||
			(type === "integer" && !Number.isInteger(parsed))
		) {
			errors.push(field.id);
		}
	}
	return errors;
}

export class AcpAdapter implements HarnessAdapter {
	private readonly queue = new EventQueue();
	private readonly toolCalls = new Map<string, ToolCall>();
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	/**
	 * Text and start of each v2 message that has already flushed, so a later
	 * chunk or whole-message patch for the same id reopens the item it had
	 * rather than a second one beside it.
	 */
	private readonly messages = new Map<
		string,
		{
			text: string;
			attachments: ItemAttachment[];
			startedAtMs: number;
			model?: string;
		}
	>();
	private readonly subagents = new Map<
		string,
		{ item: ToolCall; turnId: string }
	>();
	private readonly finishedSubagents = new Set<string>();
	/**
	 * The adapter drops a task's updates once the subagent that started it
	 * finishes, so the task ends with its subagent.
	 */
	private readonly subagentTasks = new Map<string, Set<string>>();
	private readonly backgroundTasks: BackgroundTasks;
	/** Start of each named v2 plan, so a revision keeps its place in the order. */
	private readonly planItems = new Map<string, number>();
	private client: AcpRpcClient | null = null;
	private sessionId: string | null = null;
	private loadingSessionId: string | null = null;
	private cwd = process.cwd();
	private openText: OpenText | null = null;
	private currentTurn: Turn | null = null;
	private historyTurnId: string | null = null;
	private lastStartMs = 0;
	/** What `initialize` settled on; v2 features stay dark below it. */
	private negotiatedVersion = 1;
	private agentCapabilities: Record<string, unknown> = {};
	private supportsSteering = false;
	private cycleEnded = false;
	private steeredCyclePending = false;
	private readonly backgroundTaskTurns = new Map<string, string | undefined>();
	private awaitingBackground = false;
	/** The v2 config option that stands in for v1's session mode, once seen. */
	private modeConfigId: string | null = null;
	private modeId: string | undefined;
	private readonly selectionsInFlight = new Set<Promise<void>>();
	private configOptions: SessionConfigOption[] = [];
	private replaying = false;
	private agentName: string | null = null;
	private unkeyedImageSequence = 0;
	private queuedPrompts: UserContent[][] = [];
	private disposed = false;
	private dead = false;
	private stderrTail = "";
	private customAnswer: string | null = null;
	private heldTurnId: string | null = null;
	private readonly shellPids = new Map<string, number>();
	private shellPoll: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly options: AcpAdapterOptions) {
		this.backgroundTasks = new BackgroundTasks(
			(tasks) => {
				const live = new Set(tasks.map((task) => task.id));
				for (const id of this.backgroundTaskTurns.keys()) {
					if (!live.has(id)) this.backgroundTaskTurns.delete(id);
				}
				for (const id of live) {
					if (!this.backgroundTaskTurns.has(id)) {
						this.backgroundTaskTurns.set(id, this.currentTurn?.id);
					}
				}
				this.emitSession({ backgroundTasks: tasks });
				this.syncAwaitingBackground();
			},
			(taskId, detail) =>
				this.emit({
					kind: "delta",
					delta: { type: "background", itemId: taskId, append: detail },
				}),
			options.backgroundDetailIntervalMs,
		);
	}

	start(startOptions: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		this.cwd = startOptions.cwd;
		void this.bootstrap(startOptions);
		return this.queue.iterable();
	}

	prompt(content: UserContent[]): void {
		if (!this.client || !this.sessionId) {
			this.queuedPrompts.push(content);
			return;
		}
		void this.runTurn(content);
	}

	canSteer(): boolean {
		return (
			this.supportsSteering &&
			this.currentTurn?.status === "running" &&
			this.heldTurnId !== this.currentTurn.id
		);
	}

	async steer(content: UserContent[]): Promise<boolean> {
		const client = this.client;
		const sessionId = this.sessionId;
		if (!client || !sessionId || !this.canSteer()) return false;
		const response = await client.request(ACP_STEERING_METHOD, {
			sessionId,
			prompt: await this.toAcpPrompt(content),
			_meta: { steering: { idleBehavior: "promptRequired" } },
		});
		const outcome = acpSteeringResponseSchema.safeParse(response).data?.outcome;
		if (outcome === "injected") {
			this.steeredCyclePending = true;
			this.cycleEnded = false;
			this.syncAwaitingBackground();
		}
		return outcome === "injected" || outcome === "startedNewTurn";
	}

	cancelTurn(): void {
		if (!this.client || !this.sessionId) return;
		if (this.currentTurn?.status !== "running") return;
		if (this.heldTurnId === this.currentTurn.id) {
			this.heldTurnId = null;
			this.emitTurn({
				...this.currentTurn,
				status: "interrupted",
				completedAtMs: this.now(),
			});
			this.emitSession({ status: "idle" });
			return;
		}
		this.client.notify("session/cancel", { sessionId: this.sessionId });
		if (this.cancelPendingApprovals(this.currentTurn.id)) {
			this.emitSession({ status: "running" });
		}
	}

	respondToApproval(approvalId: string, decision: Decision): void {
		const pending = this.pendingApprovals.get(approvalId);
		if (!pending || !this.client) return;
		if (
			decision.type === "form" &&
			pending.item.form &&
			formErrors(
				decision.values,
				pending.item.form.fields,
				pending.fieldTypes ?? {},
			).length > 0
		) {
			this.emitNotice(
				"error",
				"That answer is missing a required field or has an invalid number, so it was not sent.",
			);
			return;
		}
		this.pendingApprovals.delete(approvalId);
		this.client.respond(
			pending.requestId,
			this.approvalOutcome(pending, decision),
		);
		if (this.currentTurn?.status !== "running") this.sendCustomAnswer();
		this.emitItem(
			{
				...pending.item,
				status: "answered",
				decision,
				completedAtMs: this.now(),
			},
			pending.turnId,
		);
		this.emitSession({ status: "running" });
	}

	setMode(modeId: string): void {
		if (this.options.clientApprovalModes) {
			if (!isClientApprovalMode(modeId)) return;
			this.emitSession({ modeId });
			if (autoApproves(modeId)) this.approvePendingPermissions();
			return;
		}
		const previous = this.modeId;
		this.emitSession({ modeId });
		if (!this.client || !this.sessionId) return;
		// v2 dropped session/set_mode outright: a mode is a config option there,
		// and `config_option_update` is what told us which one.
		const pending =
			this.negotiatedVersion >= 2 && this.modeConfigId
				? this.client.request(
						"session/set_config_option",
						{
							sessionId: this.sessionId,
							configId: this.modeConfigId,
							type: "id",
							value: modeId,
						},
						this.requestTimeoutMs(),
					)
				: this.client.request(
						"session/set_mode",
						{ sessionId: this.sessionId, modeId },
						this.requestTimeoutMs(),
					);
		this.trackSelection(pending);
		void pending.catch((error: Error) => {
			if (error instanceof AcpTimeoutError) {
				this.emitNotice("error", unconfirmedSelectionMessage(error));
				return;
			}
			if (previous && this.modeId === modeId) {
				this.emitSession({ modeId: previous });
			}
			this.emitNotice("error", error.message);
		});
	}

	private trackSelection(request: Promise<unknown>): void {
		const settled = request.then(
			() => undefined,
			() => undefined,
		);
		this.selectionsInFlight.add(settled);
		void settled.then(() => this.selectionsInFlight.delete(settled));
	}

	/** An agent may run a prompt before it applies a mode or model it was just sent. */
	private async selectionsApplied(): Promise<void> {
		while (this.selectionsInFlight.size > 0) {
			await Promise.all(this.selectionsInFlight);
		}
	}

	setConfigOption(configId: string, value: string): void {
		const client = this.client;
		const sessionId = this.sessionId;
		if (!client || !sessionId) return;
		const previous = this.configOptions;
		const previousModeId =
			configId === this.modeConfigId ? this.modeId : undefined;
		this.configOptions = previous.map((option) =>
			option.id === configId ? { ...option, currentValue: value } : option,
		);
		this.emitSession({
			configOptions: this.configOptions,
			...(configId === this.modeConfigId ? { modeId: value } : {}),
		});
		const request = client.request(
			"session/set_config_option",
			{
				sessionId,
				configId,
				value,
				...(this.negotiatedVersion >= 2 ? { type: "id" } : {}),
			},
			this.requestTimeoutMs(),
		);
		this.trackSelection(request);
		request
			.then((response) => this.handleConfigOptions(response))
			.catch((error: Error) => {
				if (error instanceof AcpTimeoutError) {
					this.emitNotice("error", unconfirmedSelectionMessage(error));
					return;
				}
				this.configOptions = previous;
				this.emitSession({
					configOptions: previous,
					...(previousModeId ? { modeId: previousModeId } : {}),
				});
				this.emitNotice("error", error.message);
			});
	}

	async stopBackgroundTask(taskId: string): Promise<boolean> {
		const shellPid = this.shellPids.get(taskId);
		if (shellPid !== undefined) return stopProcessGroup(shellPid);
		if (!this.client || !this.sessionId) return false;
		if (!this.backgroundTasks.canStop(taskId)) return false;
		const response = await this.client.request(
			AIR_ASYNC_TASK_STOP_METHOD,
			{ sessionId: this.sessionId, asyncTaskId: taskId },
			this.requestTimeoutMs(),
		);
		return (response as { stopped?: unknown } | null)?.stopped === true;
	}

	/**
	 * session/fork is unstable but reachable on v1, and both shipped adapters
	 * advertise it. The agent copies its own session; the caller decides what to
	 * attach to the id that comes back.
	 */
	async fork(): Promise<string | null> {
		if (!this.client || !this.sessionId) return null;
		if (!this.supportsSessionCapability("fork")) return null;
		const response = await this.client.request(
			"session/fork",
			{ sessionId: this.sessionId, cwd: this.cwd, mcpServers: [] },
			this.requestTimeoutMs(),
		);
		const parsed = acpNewSessionResponseSchema.safeParse(response);
		return parsed.success ? parsed.data.sessionId : null;
	}

	/** What `initialize` said this agent can do to a session. */
	private supportsSessionCapability(name: string): boolean {
		const caps = this.agentCapabilities.sessionCapabilities;
		return Boolean(
			caps && typeof caps === "object" && name in (caps as object),
		);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.stalePendingApprovals();
		this.backgroundTasks.dispose();
		if (this.shellPoll) clearInterval(this.shellPoll);
		await this.client?.close();
		this.queue.close();
	}

	private async bootstrap(startOptions: HarnessStartOptions): Promise<void> {
		this.emitSession({ status: "starting" });
		try {
			const launch = await this.options.launch?.();
			if (this.disposed) return;
			const client = new AcpRpcClient({
				createTransport: (handlers) => {
					const transport = (this.options.createTransport ?? spawnAcpTransport)(
						{
							command: launch?.command ?? this.options.command,
							args: launch?.args ?? this.options.args,
							cwd: startOptions.cwd,
							env: launch?.env ?? this.options.env,
						},
						handlers,
					);
					if (transport.pid !== undefined)
						this.options.onSpawn?.(transport.pid);
					return transport;
				},
				onNotification: (notification) => this.handleNotification(notification),
				onServerRequest: (request) => this.handleServerRequest(request),
				onStderr: (chunk) => {
					this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
				},
				onDispatchError: (error, method) =>
					this.emitNotice(
						"error",
						`acp ${method} could not be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				onExit: (code) => this.handleExit(code),
			});
			this.client = client;

			const startupTimeoutMs =
				this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
			const initialized = await client.request(
				"initialize",
				{
					protocolVersion: LATEST_PROTOCOL_VERSION,
					// v2 requires `info` and renamed `clientCapabilities` to
					// `capabilities`, so both names go out and one request serves either
					// side of the bump.
					info: CLIENT_INFO,
					// v2 moved fs and terminal out of client capabilities entirely.
					// Without form elicitation, claude-agent-acp drops AskUserQuestion.
					capabilities: { elicitation: { form: {} }, _meta: AIR_CLIENT_META },
					// Do not advertise fs/terminal: the agent falls back to its own
					// Read/Edit/Bash tools, which run headless in the workspace.
					clientCapabilities: {
						fs: { readTextFile: false, writeTextFile: false },
						terminal: false,
						elicitation: { form: {} },
						_meta: AIR_CLIENT_META,
					},
				},
				startupTimeoutMs,
			);

			const negotiated = acpInitializeResponseSchema.safeParse(initialized);
			if (negotiated.success) {
				this.negotiatedVersion =
					negotiated.data.protocolVersion ?? this.negotiatedVersion;
				this.agentName = negotiated.data.agentInfo?.name ?? null;
				this.agentCapabilities =
					negotiated.data.capabilities ??
					negotiated.data.agentCapabilities ??
					{};
				this.supportsSteering =
					negotiated.data._meta?.steering?.supported === true;
			}

			let response: unknown;
			let resumed = false;
			if (startOptions.resume) {
				this.replaying = true;
				this.loadingSessionId = startOptions.resume.harnessSessionId;
				try {
					response = await client.request(
						"session/load",
						{
							sessionId: startOptions.resume.harnessSessionId,
							cwd: startOptions.cwd,
							mcpServers: [],
						},
						startupTimeoutMs,
					);
					resumed = true;
				} catch (loadError) {
					// A session that was started but never prompted has no transcript,
					// so the agent answers "not found". Any other failure keeps the
					// conversation, and a new session would hide it from the agent.
					if (!sessionMissing(loadError)) {
						throw new Error(
							`Could not reopen this conversation. ${(loadError as Error).message}`,
						);
					}
					this.emitNotice(
						"info",
						"No earlier conversation to open, so this is a new one.",
					);
					console.warn("[acp] session/load failed", loadError);
					response = await client.request(
						"session/new",
						{ cwd: startOptions.cwd, mcpServers: [] },
						startupTimeoutMs,
					);
				} finally {
					this.replaying = false;
					this.loadingSessionId = null;
					// Nothing follows the replay, so the last item it opened has no
					// later turn to flush it.
					this.flushOpenText();
				}
			} else {
				response = await client.request(
					"session/new",
					{ cwd: startOptions.cwd, mcpServers: [] },
					startupTimeoutMs,
				);
			}

			// session/load returns null after replaying history via session/update.
			const parsed = acpNewSessionResponseSchema.safeParse(response);
			this.sessionId = parsed.success
				? parsed.data.sessionId
				: (startOptions.resume?.harnessSessionId ?? null);

			if (!this.sessionId) {
				this.emitNotice("error", "acp agent returned no session id");
				this.dead = true;
				this.emitSession({ status: "dead" });
				this.queue.close();
				this.closeAfterFailure();
				return;
			}

			this.emitSession({
				status: "idle",
				harnessSessionId: this.sessionId,
				...(this.options.clientApprovalModes
					? {
							modeId:
								[this.modeId, this.startModeId(startOptions, resumed)].find(
									isClientApprovalMode,
								) ?? ASK_MODE_ID,
							availableModes: CLIENT_APPROVAL_MODES,
						}
					: {
							...(parsed.success && parsed.data.modes?.currentModeId
								? { modeId: parsed.data.modes.currentModeId }
								: {}),
							...(parsed.success && parsed.data.modes?.availableModes
								? {
										availableModes: parsed.data.modes.availableModes.map(
											(mode) => ({
												id: mode.id,
												label: mode.name,
											}),
										),
									}
								: {}),
						}),
			});
			this.handleConfigOptions(response);
			this.applyStartSelections(
				startOptions,
				parsed.success ? parsed.data.modes : undefined,
				resumed,
			);

			const queued = this.queuedPrompts.splice(0, this.queuedPrompts.length);
			for (const content of queued) await this.runTurn(content);
		} catch (error) {
			this.emitNotice("error", this.withStderr(this.authAwareMessage(error)));
			this.dead = true;
			this.emitSession({ status: "dead" });
			this.queue.close();
			this.closeAfterFailure();
		}
	}

	private async runTurn(content: UserContent[]): Promise<void> {
		if (!this.client || !this.sessionId) return;
		const turnId = this.mintId();
		this.emitTurn({ id: turnId, status: "running", startedAtMs: this.now() });
		this.emitSession({ status: "running" });
		this.heldTurnId = turnId;
		await this.selectionsApplied();
		if (this.heldTurnId !== turnId) return;
		this.heldTurnId = null;
		const client = this.client;
		if (!client || !this.sessionId || this.currentTurn?.id !== turnId) return;
		try {
			const response = await client.request("session/prompt", {
				sessionId: this.sessionId,
				prompt: await this.toAcpPrompt(content),
			});
			this.flushOpenText();
			const stopReason =
				acpPromptResponseSchema.safeParse(response).data?.stopReason;
			this.emitTurn({
				id: turnId,
				status: stopReason === "cancelled" ? "interrupted" : "completed",
				startedAtMs: this.currentTurn?.startedAtMs ?? this.now(),
				completedAtMs: this.now(),
			});
			if (stopReason === "refusal")
				this.emitNotice("info", "The agent declined to continue.");
			this.cancelPendingApprovals(turnId);
			this.emitSession({ status: "idle" });
			this.sendCustomAnswer();
		} catch (error) {
			this.customAnswer = null;
			this.flushOpenText();
			this.cancelPendingApprovals(turnId);
			this.emitTurn({
				id: turnId,
				status: "failed",
				error: { message: (error as Error).message },
				startedAtMs: this.currentTurn?.startedAtMs ?? this.now(),
				completedAtMs: this.now(),
			});
			this.emitNotice("error", (error as Error).message);
			this.emitSession({ status: "idle" });
		}
	}

	private handleNotification({ method, params }: AcpNotification): void {
		if (method === "$/cancel_request") {
			this.dropCancelledRequest(params);
			return;
		}
		if (method !== "session/update") return;
		const outer = acpSessionNotificationSchema.safeParse(params);
		if (!outer.success) return;
		const update = acpSessionUpdateSchema.safeParse(outer.data.update);
		if (!update.success) return;
		const raw = outer.data.update as { content?: unknown };
		const variant = update.data.sessionUpdate;

		// Live, a user message echoes a prompt the runtime already recorded. In a
		// session/load replay it does not: those turns were typed at the CLI and
		// this session has never seen them, so dropping them starts the transcript
		// at the agent's first reply. Each one opens a turn of its own, or the
		// whole replay lands in one group whose order comes down to item id.
		if (variant === "user_message_chunk" || variant === "user_message") {
			if (!this.replaying) return;
			if (this.openText?.kind !== "user_message") {
				this.flushOpenText();
				// emitTurn leaves the history turn as `currentTurn`, which
				// resolveTurnId answers with first — both have to go for the next
				// resolve to mint a fresh turn.
				this.currentTurn = null;
				this.historyTurnId = null;
			}
			const replayTurnId = this.resolveTurnId();
			if (variant === "user_message")
				this.handleMessage("user_message", outer.data.update, replayTurnId);
			else
				this.appendText(
					"user_message",
					this.contentBlock(raw.content),
					replayTurnId,
					this.messageIdOf(outer.data.update),
				);
			return;
		}

		switch (variant) {
			case "async_task_spawned":
				this.handleAsyncTaskSpawned(outer.data.sessionId, outer.data.update);
				return;
			case "async_task_progress":
				this.handleAsyncTaskProgress(outer.data.update);
				return;
			case "async_task_state_update":
				this.handleAsyncTaskState(outer.data.update);
				return;
			case "subagent_spawned":
				this.handleSubagentSpawned(outer.data.update);
				return;
			case "subagent_state_update":
				this.handleSubagentState(outer.data.update);
				return;
			case "subagent_update":
				this.handleSubagentUpdate(outer.data.update);
				return;
			case "session_info_update": {
				if (this.isForeignSession(outer.data.sessionId)) return;
				const info = acpSessionInfoUpdateSchema.safeParse(outer.data.update);
				if (info.success && info.data.title)
					this.emitSession({ title: info.data.title });
				return;
			}
		}

		if (
			this.isForeignSession(outer.data.sessionId) ||
			this.subagents.has(outer.data.sessionId) ||
			this.finishedSubagents.has(outer.data.sessionId)
		) {
			this.handleSubagentActivity(outer.data.sessionId, outer.data.update);
			return;
		}

		if (variant === "usage_update") {
			const usage = acpUsageUpdateSchema.safeParse(outer.data.update);
			if (usage.success && usage.data.cost !== undefined) this.flushOpenText();
			if (
				usage.success &&
				usage.data.cost !== undefined &&
				!this.steeredCyclePending
			) {
				this.cycleEnded = true;
				this.syncAwaitingBackground();
			}
			return;
		}
		if (MAIN_AGENT_ACTIVITY.has(variant)) {
			this.steeredCyclePending = false;
			if (this.cycleEnded) {
				this.cycleEnded = false;
				this.syncAwaitingBackground();
			}
		}

		const turnId = this.resolveTurnId();

		switch (variant) {
			case "agent_message_chunk":
				this.appendText(
					"agent_message",
					this.contentBlock(raw.content),
					turnId,
					this.messageIdOf(outer.data.update),
					resolvedModelOf(outer.data.update),
				);
				return;
			case "agent_thought_chunk":
				this.appendText(
					"reasoning",
					this.contentBlock(raw.content),
					turnId,
					this.messageIdOf(outer.data.update),
				);
				return;
			case "agent_message":
				this.handleMessage(
					"agent_message",
					outer.data.update,
					turnId,
					resolvedModelOf(outer.data.update),
				);
				return;
			case "agent_thought":
				this.handleMessage("reasoning", outer.data.update, turnId);
				return;
			// v1 opened a tool call with `tool_call` and amended it with
			// `tool_call_update`; v2 dropped the former and made the latter upsert,
			// which is what handleToolCall has always done.
			case "tool_call":
			case "tool_call_update":
				this.handleToolCall(outer.data.update, turnId);
				return;
			case "tool_call_content_chunk":
				this.handleToolCallContentChunk(outer.data.update, turnId);
				return;
			case "plan":
				this.handlePlan(outer.data.update, turnId);
				return;
			case "plan_update":
				this.handlePlanUpdate(outer.data.update, turnId);
				return;
			case "available_commands_update":
				this.handleAvailableCommands(outer.data.update);
				return;
			case "current_mode_update":
				if (update.data.currentModeId && !this.options.clientApprovalModes)
					this.emitSession({ modeId: update.data.currentModeId });
				return;
			case "config_option_update":
				this.handleConfigOptions(outer.data.update);
				return;
			case "state_update":
				this.handleStateUpdate(outer.data.update);
				return;
			default:
				return;
		}
	}

	private isForeignSession(sessionId: string): boolean {
		const own = this.sessionId ?? this.loadingSessionId;
		return own !== null && sessionId !== own;
	}

	private messageIdOf(raw: unknown): string | null {
		const messageId = (raw as { messageId?: unknown }).messageId;
		return typeof messageId === "string" && messageId !== "" ? messageId : null;
	}

	private handleAvailableCommands(raw: unknown): void {
		const parsed = acpAvailableCommandsUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		this.emitSession({
			availableCommands: parsed.data.availableCommands
				// A nameless command has nothing for the menu to invoke.
				.filter((command) => command.name.trim() !== "")
				.map((command) => ({
					name: command.name,
					...(command.description ? { description: command.description } : {}),
					...(command.input?.hint ? { hint: command.input.hint } : {}),
					...commandCategory(command._meta?.command_category),
				})),
		});
	}

	private contentBlock(raw: unknown): AcpContentBlock | undefined {
		const parsed = acpContentBlockSchema.safeParse(raw);
		return parsed.success ? parsed.data : undefined;
	}

	private appendText(
		kind: OpenText["kind"],
		content: AcpContentBlock | undefined,
		turnId: string,
		messageId: string | null = null,
		model: string | undefined = undefined,
	): void {
		if (kind === "agent_message" && content && content.type !== "text") {
			const attachment = this.attachmentOf(
				content,
				messageId ? `message:${messageId}` : undefined,
			);
			if (!attachment) return;
			const open = this.openMessage(kind, turnId, messageId);
			if (model) open.model = model;
			open.attachments.push(attachment);
			this.emitItem(this.textItem(open, "open"), turnId);
			return;
		}
		const chunk = content?.type === "text" ? (content.text ?? "") : "";
		if (!chunk) return;
		const open = this.openMessage(kind, turnId, messageId);
		if (kind === "agent_message" && model) open.model = model;
		open.text += chunk;
		if (kind === "user_message") return;
		this.emit({
			kind: "delta",
			delta: { type: "text", itemId: open.itemId, append: chunk },
		});
	}

	/**
	 * The open text item this content belongs to, started if it is not already.
	 * v1 groups by kind and turn; v2 names the message, and a new name starts a
	 * new item even within the same kind and turn.
	 */
	private openMessage(
		kind: OpenText["kind"],
		turnId: string,
		messageId: string | null,
	): OpenText {
		const open = this.openText;
		if (
			open &&
			open.kind === kind &&
			open.turnId === turnId &&
			open.messageId === messageId
		)
			return open;
		this.flushOpenText();
		// A v2 message can be appended to or patched after it flushed, so it
		// reopens on the id and text it already had.
		const flushed = messageId ? this.messages.get(messageId) : undefined;
		const next: OpenText = {
			itemId: messageId
				? `${kind}:${turnId}:${messageId}`
				: `${kind}:${turnId}:${this.mintId()}`,
			kind,
			messageId,
			text: flushed?.text ?? "",
			attachments: [...(flushed?.attachments ?? [])],
			turnId,
			startedAtMs: flushed?.startedAtMs ?? this.nextStartMs(),
			...(kind === "agent_message"
				? {
						model:
							flushed?.model ??
							(this.replaying ? undefined : this.currentModelLabel()),
					}
				: {}),
		};
		this.openText = next;
		// A user message has no text field to stream into, so it is recorded
		// once, whole, when it flushes.
		if (kind !== "user_message")
			this.emitItem(this.textItem(next, "open"), turnId);
		return next;
	}

	/**
	 * A whole v2 message, which patches the item its chunks produced: omitted
	 * content leaves what was streamed alone, null and [] clear it, and an array
	 * replaces it.
	 */
	private handleMessage(
		kind: OpenText["kind"],
		raw: unknown,
		turnId: string,
		model: string | undefined = undefined,
	): void {
		const parsed = acpMessageSchema.safeParse(raw);
		if (!parsed.success) return;
		const open = this.openMessage(kind, turnId, parsed.data.messageId);
		if (kind === "agent_message" && model) open.model = model;
		if (parsed.data.content !== undefined) {
			open.text = messageText(parsed.data.content ?? []);
			open.attachments =
				kind === "agent_message"
					? this.attachmentsOf(
							parsed.data.content ?? [],
							`message:${parsed.data.messageId}`,
						)
					: [];
		}
		this.flushOpenText();
	}

	private flushOpenText(): void {
		if (!this.openText) return;
		const open = this.openText;
		this.openText = null;
		if (open.messageId)
			this.messages.set(open.messageId, {
				text: open.text,
				attachments: open.attachments,
				startedAtMs: open.startedAtMs,
				...(open.model ? { model: open.model } : {}),
			});
		this.emitItem(this.textItem(open, "flushed"), open.turnId);
	}

	private textItem(open: OpenText, state: "open" | "flushed"): Item {
		const base = {
			id: open.itemId,
			startedAtMs: open.startedAtMs,
			...(state === "flushed" ? { completedAtMs: this.now() } : {}),
		};
		switch (open.kind) {
			case "agent_message": {
				const { model } = open;
				return {
					...base,
					kind: "agent_message",
					text: open.text,
					...(open.attachments.length > 0
						? { attachments: open.attachments }
						: {}),
					...(model ? { model } : {}),
				};
			}
			case "user_message":
				return {
					...base,
					kind: "user_message",
					content: [{ type: "text", text: open.text }],
				};
			default:
				return { ...base, kind: "reasoning", text: open.text };
		}
	}

	private currentModelLabel(): string | undefined {
		const option = this.configOptions.find(
			(entry) => entry.category === "model",
		);
		return option?.options.find((entry) => entry.id === option.currentValue)
			?.label;
	}

	private optionLabel(name: string): string {
		return this.isPdevAgent() ? name.replace(/^pdev\//, "") : name;
	}

	private isPdevAgent(): boolean {
		return this.agentName === "paradev" || this.agentName === "pdev";
	}

	private handleToolCall(raw: unknown, turnId: string): void {
		const parsed = acpToolCallUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flushOpenText();
		const update = parsed.data;
		const prior = this.toolCalls.get(update.toolCallId);
		if (
			!prior &&
			!update.title &&
			update.status !== "failed" &&
			isSubagentControlCall(raw)
		)
			return;
		// Patch semantics in both versions: an omitted field leaves the stored
		// value alone, and v2 added null to clear it.
		const body =
			update.content === undefined
				? null
				: this.toolBody(update.content ?? [], update.toolCallId);
		const content = body ? body.content : (prior?.content ?? []);
		const attachments = body ? body.attachments : (prior?.attachments ?? []);
		const locations =
			update.locations === undefined
				? prior?.locations
				: (update.locations ?? undefined);
		const rawInput =
			update.rawInput === undefined
				? prior?.rawInput
				: withoutImageData(update.rawInput);
		const rawOutput =
			update.rawOutput === undefined
				? prior?.rawOutput
				: withoutImageData(update.rawOutput);
		const claudeCode = update._meta?.claudeCode;
		const mcpMatch = claudeCode?.toolName?.match(/^mcp__(.+?)__(.+)$/);
		const mcpSource = claudeCode?.mcpServer?.source ?? prior?.mcpServer?.source;
		const mcpServer: ToolCall["mcpServer"] = mcpMatch
			? {
					name: mcpMatch[1] as string,
					tool: mcpMatch[2] as string,
					...(mcpSource ? { source: mcpSource } : {}),
				}
			: prior?.mcpServer;
		const item: ToolCall = {
			id: update.toolCallId,
			kind: "tool_call",
			title: update.title ?? prior?.title ?? "Tool call",
			toolKind: update.kind
				? toolKind(update.kind)
				: (prior?.toolKind ?? "other"),
			toolName:
				update.name ??
				claudeCode?.toolName ??
				update.kind ??
				prior?.toolName ??
				"tool",
			status: update.status
				? toolStatus(update.status)
				: (prior?.status ?? "running"),
			content,
			...(attachments.length > 0 ? { attachments } : {}),
			...(locations?.length ? { locations } : {}),
			startedAtMs: prior?.startedAtMs ?? this.nextStartMs(),
			...(toolCallSettled(update.status)
				? { completedAtMs: this.now() }
				: prior?.completedAtMs !== undefined
					? { completedAtMs: prior.completedAtMs }
					: {}),
			...(rawInput !== undefined ? { rawInput } : {}),
			...(rawOutput !== undefined ? { rawOutput } : {}),
			...(mcpServer ? { mcpServer } : {}),
		};
		this.toolCalls.set(update.toolCallId, item);
		this.emitItem(item, turnId);
		if (!this.replaying) {
			this.trackBackgroundShell(item);
		}
	}

	private trackBackgroundShell(item: ToolCall): void {
		const details = piShellDetailsSchema.safeParse(
			(item.rawOutput as { details?: unknown } | undefined)?.details,
		);
		if (!details.success) return;
		const { shellId, status, pid } = details.data;
		if (status !== "running") {
			this.endBackgroundShell(shellId);
			return;
		}
		if (this.backgroundTasks.has(shellId)) return;
		const input = piShellInputSchema.safeParse(item.rawInput);
		this.backgroundTasks.start({
			id: shellId,
			kind: "process",
			name:
				(input.success && (input.data.description || input.data.command)) ||
				shellId,
			canStop: pid !== undefined,
			startedAtMs: this.now(),
		});
		if (pid === undefined) return;
		this.shellPids.set(shellId, pid);
		this.shellPoll ??= setInterval(() => {
			for (const [id, shellPid] of this.shellPids) {
				if (!processAlive(shellPid)) this.endBackgroundShell(id);
			}
		}, this.options.shellPollMs ?? SHELL_POLL_MS);
	}

	private endBackgroundShell(shellId: string): void {
		this.shellPids.delete(shellId);
		this.backgroundTasks.end(shellId);
		if (this.shellPids.size === 0 && this.shellPoll) {
			clearInterval(this.shellPoll);
			this.shellPoll = null;
		}
	}

	/**
	 * v2 streams tool output a content item at a time, appending to whatever the
	 * tool call already holds. A chunk may name a call no update has opened yet,
	 * so it opens one.
	 */
	private handleToolCallContentChunk(raw: unknown, turnId: string): void {
		const parsed = acpToolCallContentChunkSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flushOpenText();
		const { toolCallId, content } = parsed.data;
		const prior = this.toolCalls.get(toolCallId);
		const body = this.toolBody([content], toolCallId);
		const attachments = [...(prior?.attachments ?? []), ...body.attachments];
		const item: ToolCall = {
			id: toolCallId,
			kind: "tool_call",
			title: prior?.title ?? "Tool call",
			toolKind: prior?.toolKind ?? "other",
			toolName: prior?.toolName ?? "tool",
			status: prior?.status ?? "running",
			content: [...(prior?.content ?? []), ...body.content],
			...(attachments.length > 0 ? { attachments } : {}),
			...(prior?.locations?.length ? { locations: prior.locations } : {}),
			startedAtMs: prior?.startedAtMs ?? this.nextStartMs(),
			...(prior?.completedAtMs !== undefined
				? { completedAtMs: prior.completedAtMs }
				: {}),
			...(prior?.rawInput !== undefined ? { rawInput: prior.rawInput } : {}),
			...(prior?.rawOutput !== undefined ? { rawOutput: prior.rawOutput } : {}),
			...(prior?.mcpServer ? { mcpServer: prior.mcpServer } : {}),
		};
		this.toolCalls.set(toolCallId, item);
		this.emitItem(item, turnId);
	}

	private toolBody(
		content: AcpToolCallContent[],
		toolCallId: string,
	): {
		content: ToolContent[];
		attachments: ItemAttachment[];
	} {
		const mapped: ToolContent[] = [];
		const attachments: ItemAttachment[] = [];
		for (const entry of content) {
			if (entry.type === "content" && entry.content?.type === "text") {
				mapped.push({ type: "text", text: entry.content.text ?? "" });
			} else if (entry.type === "content") {
				const attachment = this.attachmentOf(
					entry.content,
					`tool:${toolCallId}`,
				);
				if (attachment) attachments.push(attachment);
			} else if (
				entry.type === "diff" &&
				entry.path &&
				entry.newText !== undefined
			) {
				mapped.push({
					type: "diff",
					path: entry.path,
					oldText: entry.oldText ?? null,
					newText: entry.newText,
				});
			} else if (entry.type === "diff") {
				// v2 reports a diff as structured changes plus patch text rather than
				// the before and after of one file, which is all a diff item can
				// hold, so the patch is shown as the text it already is.
				const patch =
					entry.patch?.text ??
					(entry.changes ?? [])
						.map((change) => `${change.operation ?? "modify"} ${change.path}`)
						.join("\n");
				if (patch) mapped.push({ type: "text", text: patch });
			} else if (entry.type === "terminal" && entry.terminalId) {
				mapped.push({ type: "text", text: `[terminal ${entry.terminalId}]` });
			}
		}
		return { content: mapped, attachments };
	}

	private attachmentsOf(
		content: readonly AcpContentBlock[],
		referenceId: string,
	): ItemAttachment[] {
		return content.flatMap((block) => {
			const attachment = this.attachmentOf(block, referenceId);
			return attachment ? [attachment] : [];
		});
	}

	private attachmentOf(
		block: AcpContentBlock | undefined,
		referenceId?: string,
	): ItemAttachment | null {
		const source = imageSourceOf(block);
		if (!source) return null;
		const sessionId = this.sessionId ?? this.loadingSessionId;
		const context =
			source.kind === "file" && sessionId
				? {
						sessionId,
						referenceId: referenceId ?? `image:${this.unkeyedImageSequence++}`,
						replaying: this.replaying,
					}
				: undefined;
		let stored: AcpStoredImage | null = null;
		try {
			stored = this.options.storeImage?.(source, this.cwd, context) ?? null;
		} catch (error) {
			console.warn("[acp] could not keep an image the agent sent", error);
		}
		if (!stored) return null;
		const dimensions =
			source.kind === "bytes" ? imageDimensions(source.bytes) : null;
		return {
			type: "image",
			path: stored.path,
			mimeType: source.mimeType,
			...(source.name ? { alt: source.name } : {}),
			...(dimensions ?? {}),
		};
	}

	private handlePlan(raw: unknown, turnId: string): void {
		const parsed = acpPlanSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flushOpenText();
		this.emitItem(
			{
				id: `plan:${turnId}`,
				kind: "plan",
				startedAtMs: this.nextStartMs(),
				entries: planEntryItems(parsed.data.entries),
			},
			turnId,
		);
	}

	/**
	 * v2 replaced `plan` with a named plan carrying one of several bodies, and
	 * only the entry list maps to a plan item — a `file` or `markdown` body has
	 * no entries and is left alone.
	 */
	private handlePlanUpdate(raw: unknown, turnId: string): void {
		const parsed = acpPlanUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		const { planId, entries } = parsed.data.plan;
		if (!entries) return;
		this.flushOpenText();
		const prior = this.planItems.get(planId);
		const startedAtMs = prior ?? this.nextStartMs();
		this.planItems.set(planId, startedAtMs);
		this.emitItem(
			{
				id: `plan:${turnId}:${planId}`,
				kind: "plan",
				startedAtMs,
				entries: planEntryItems(entries),
			},
			turnId,
		);
	}

	private handleStateUpdate(raw: unknown): void {
		const parsed = acpStateUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		const status = SESSION_STATUS_BY_ACP_STATE[parsed.data.state];
		if (status) this.emitSession({ status });
	}

	/**
	 * A child session the parent spawned. v2 requires no client capability to
	 * receive these — understanding them is baseline — and this surfaces the
	 * announcement as a note; a child-session view is a later slice.
	 */
	private handleSubagentUpdate(raw: unknown): void {
		const parsed = acpSubagentUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		const { sessionId, title, description, state } = parsed.data;
		if (this.finishedSubagents.has(sessionId)) return;
		if (!this.subagents.has(sessionId)) {
			this.startSubagent(sessionId, title, description);
		}
		if (state && isTerminalAirState(state.state)) {
			this.finishSubagent(sessionId, state.state);
		}
	}

	private handleSubagentSpawned(raw: unknown): void {
		const parsed = airSubagentSpawnedSchema.safeParse(raw);
		if (!parsed.success) return;
		const { subagentSessionId, name, task } = parsed.data;
		if (
			this.subagents.has(subagentSessionId) ||
			this.finishedSubagents.has(subagentSessionId)
		)
			return;
		this.startSubagent(subagentSessionId, name, task);
	}

	private handleSubagentState(raw: unknown): void {
		const parsed = airSubagentStateSchema.safeParse(raw);
		if (!parsed.success || !isTerminalAirState(parsed.data.state)) return;
		this.finishSubagent(parsed.data.subagentSessionId, parsed.data.state);
	}

	private startSubagent(
		sessionId: string,
		name: string | null | undefined,
		task: string | null | undefined,
	): void {
		this.flushOpenText();
		const title = name || task || "";
		const startedAtMs = this.nextStartMs();
		const item: ToolCall = {
			id: `subagent:${sessionId}`,
			kind: "tool_call",
			title,
			toolKind: "think",
			toolName: "subagent",
			status: "running",
			content: task ? [{ type: "text", text: task }] : [],
			startedAtMs,
			subagent: true,
		};
		const turnId = this.resolveTurnId();
		this.subagents.set(sessionId, { item, turnId });
		this.emitItem(item, turnId);
		this.backgroundTasks.start({
			id: item.id,
			kind: "subagent",
			name: title,
			canStop: false,
			startedAtMs,
		});
	}

	private finishSubagent(sessionId: string, state: string): void {
		const run = this.subagents.get(sessionId);
		if (!run) return;
		this.subagents.delete(sessionId);
		this.finishedSubagents.add(sessionId);
		this.backgroundTasks.end(run.item.id);
		for (const taskId of this.subagentTasks.get(sessionId) ?? [])
			this.backgroundTasks.end(taskId);
		this.subagentTasks.delete(sessionId);
		this.emitItem(
			{
				...run.item,
				status:
					state === "failed" || state === "disconnected"
						? "failed"
						: state === "cancelled" || state === "stopped"
							? "canceled"
							: "completed",
				completedAtMs: this.now(),
			},
			run.turnId,
		);
	}

	private handleSubagentActivity(sessionId: string, raw: unknown): void {
		const run = this.subagents.get(sessionId);
		const update = acpToolCallUpdateSchema.safeParse(raw);
		if (!run || !update.success || !update.data.title) return;
		this.backgroundTasks.update(run.item.id, { detail: update.data.title });
	}

	private handleAsyncTaskSpawned(sessionId: string, raw: unknown): void {
		const parsed = airAsyncTaskSpawnedSchema.safeParse(raw);
		if (!parsed.success) return;
		const { asyncTaskId, name, description, canStop } = parsed.data;
		if (this.finishedSubagents.has(sessionId)) return;
		if (this.subagents.has(sessionId)) {
			const tasks = this.subagentTasks.get(sessionId) ?? new Set<string>();
			this.subagentTasks.set(sessionId, tasks.add(asyncTaskId));
		}
		this.backgroundTasks.start({
			id: asyncTaskId,
			kind: "process",
			name: name || description || "",
			canStop: canStop ?? false,
			startedAtMs: this.now(),
		});
	}

	private handleAsyncTaskProgress(raw: unknown): void {
		const parsed = airAsyncTaskProgressSchema.safeParse(raw);
		if (!parsed.success) return;
		const { asyncTaskId, summary } = parsed.data;
		if (summary) this.backgroundTasks.update(asyncTaskId, { detail: summary });
	}

	private handleAsyncTaskState(raw: unknown): void {
		const parsed = airAsyncTaskStateSchema.safeParse(raw);
		if (!parsed.success || !isTerminalAirState(parsed.data.state)) return;
		this.backgroundTasks.end(parsed.data.asyncTaskId);
	}

	private handleConfigOptions(raw: unknown): void {
		const parsed = acpConfigOptionUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		this.configOptions = parsed.data.configOptions.flatMap((option) => {
			const id = option.configId ?? option.id;
			if (!id || (option.type && option.type !== "select")) return [];
			return [
				{
					id,
					label: this.optionLabel(option.name),
					...(option.category ? { category: option.category } : {}),
					...(typeof option.currentValue === "string"
						? { currentValue: option.currentValue }
						: {}),
					options: flattenSelectOptions(option.options ?? [], (name) =>
						this.optionLabel(name),
					),
				},
			];
		});
		const mode = this.options.clientApprovalModes
			? undefined
			: this.configOptions.find((option) => option.category === "mode");
		if (mode) this.modeConfigId = mode.id;
		this.emitSession({
			configOptions: this.configOptions,
			...(mode?.currentValue ? { modeId: mode.currentValue } : {}),
			...(mode?.options.length
				? {
						availableModes: mode.options.map((option) => ({
							id: option.id,
							label: option.label,
						})),
					}
				: {}),
		});
	}

	private startModeId(
		startOptions: HarnessStartOptions,
		resumed: boolean,
	): string | undefined {
		if (startOptions.modeId === AGENT_DEFAULT_MODE) return undefined;
		if (startOptions.modeId) return startOptions.modeId;
		return resumed ? undefined : this.options.defaultModeId;
	}

	private applyStartSelections(
		startOptions: HarnessStartOptions,
		sessionModes: AcpSessionModes | undefined,
		resumed: boolean,
	): void {
		const modeId = this.startModeId(startOptions, resumed);
		for (const [category, value] of [
			["model", startOptions.modelId],
			["mode", this.options.clientApprovalModes ? undefined : modeId],
		] as const) {
			const option = this.configOptions.find(
				(entry) => entry.category === category,
			);
			if (
				value &&
				option &&
				option.currentValue !== value &&
				option.options.some((entry) => entry.id === value)
			) {
				this.setConfigOption(option.id, value);
			}
		}
		if (
			modeId &&
			!this.modeConfigId &&
			sessionModes?.currentModeId !== modeId &&
			sessionModes?.availableModes?.some((mode) => mode.id === modeId)
		) {
			this.setMode(modeId);
		}
	}

	private handleServerRequest(request: AcpServerRequest): void {
		if (request.method === "elicitation/create") {
			this.handleElicitation(request);
			return;
		}
		if (request.method !== "session/request_permission") {
			this.client?.respondWithError(
				request.id,
				-32601,
				`unsupported: ${request.method}`,
			);
			return;
		}
		const parsed = acpRequestPermissionParamsSchema.safeParse(request.params);
		if (!parsed.success) {
			this.client?.respondWithError(
				request.id,
				-32602,
				"invalid permission request",
			);
			return;
		}
		const allow = parsed.data.options.find((option) =>
			/^allow\b/i.test(option.name),
		);
		const title = parsed.data.toolCall?.title ?? "Permission required";
		const asking = [...this.toolCalls.values()].some(
			(call) => call.status === "running" && call.title === "ask_user_question",
		);
		const permission = !asking && Boolean(allow) && /^allow\b/i.test(title);
		if (
			this.options.clientApprovalModes &&
			permission &&
			allow &&
			autoApproves(this.modeId)
		) {
			this.client?.respond(request.id, {
				outcome: { outcome: "selected", optionId: allow.optionId },
			});
			return;
		}
		const question = this.options.clientApprovalModes === true && !permission;
		const other = parsed.data.options.find((option) =>
			/^other\b/i.test(option.name),
		);
		const choices = parsed.data.options.filter((option) => option !== other);
		const headed = title.match(/^([^:\n]{1,40}):\s+([\s\S]+)$/);
		const header = headed?.[1];
		const questionText = headed?.[2] ?? title;
		const turnId = this.resolveTurnId();
		const targetItemId = parsed.data.toolCall?.toolCallId ?? null;
		const approvalId = `approval:${targetItemId ?? this.mintId()}`;
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			targetItemId,
			title,
			status: "pending",
			startedAtMs: this.nextStartMs(),
			...(question
				? {
						form: {
							message: questionText,
							fields: [
								{
									id: QUESTION_FIELD_ID,
									...(header ? { title: header } : {}),
									input: "single" as const,
									options: choices.map((option) => ({
										value: option.optionId,
										label: option.name,
									})),
								},
								...(other
									? [
											{
												id: `${QUESTION_FIELD_ID}_custom`,
												title: "Other",
												description: "Type your own answer (optional).",
												input: "text" as const,
											},
										]
									: []),
							],
						},
					}
				: {
						options: parsed.data.options.map((option) => ({
							optionId: option.optionId,
							label: option.name,
							...(this.options.clientApprovalModes
								? { kind: optionKindFromLabel(option.name) }
								: isApprovalOptionKind(option.kind)
									? { kind: option.kind }
									: {}),
						})),
					}),
		};
		this.pendingApprovals.set(approvalId, {
			requestId: request.id,
			turnId,
			item,
			...(question ? { selectsOption: true } : {}),
			...(question && other ? { otherOptionId: other.optionId } : {}),
		});
		this.emitItem(item, turnId);
		this.emitSession({ status: "awaiting_input" });
	}

	private sendCustomAnswer(): void {
		const text = this.customAnswer;
		if (!text) return;
		this.customAnswer = null;
		void this.runTurn([{ type: "text", text }]);
	}

	private approvePendingPermissions(): void {
		for (const [approvalId, pending] of this.pendingApprovals) {
			if (!pending.item.form) {
				this.respondToApproval(approvalId, { type: "accept" });
			}
		}
	}

	private handleElicitation(request: AcpServerRequest): void {
		const parsed = acpCreateElicitationParamsSchema.safeParse(request.params);
		if (!parsed.success || (parsed.data.mode ?? "form") !== "form") {
			this.client?.respondWithError(
				request.id,
				-32602,
				"invalid elicitation request",
			);
			return;
		}
		const turnId = this.resolveTurnId();
		const targetItemId = parsed.data.toolCallId ?? null;
		const approvalId = `elicitation:${this.mintId()}`;
		const properties = parsed.data.requestedSchema?.properties ?? {};
		const required = new Set(parsed.data.requestedSchema?.required ?? []);
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			targetItemId,
			title: parsed.data.message,
			status: "pending",
			startedAtMs: this.nextStartMs(),
			form: {
				message: parsed.data.message,
				fields: Object.entries(properties).map(([id, property]) =>
					formField(id, property, required.has(id)),
				),
			},
		};
		this.pendingApprovals.set(approvalId, {
			requestId: request.id,
			turnId,
			item,
			fieldTypes: Object.fromEntries(
				Object.entries(properties).map(([id, property]) => [id, property.type]),
			),
		});
		this.emitItem(item, turnId);
		this.emitSession({ status: "awaiting_input" });
	}

	private approvalOutcome(
		pending: PendingApproval,
		decision: Decision,
	): unknown {
		if (pending.selectsOption) {
			const typed =
				decision.type === "form"
					? decision.values[`${QUESTION_FIELD_ID}_custom`]
					: null;
			if (typeof typed === "string" && typed.trim() && pending.otherOptionId) {
				this.customAnswer = typed.trim();
				return {
					outcome: { outcome: "selected", optionId: pending.otherOptionId },
				};
			}
			const optionId =
				decision.type === "form" ? decision.values[QUESTION_FIELD_ID] : null;
			return typeof optionId === "string"
				? { outcome: { outcome: "selected", optionId } }
				: { outcome: { outcome: "cancelled" } };
		}
		if (pending.item.form) {
			if (decision.type === "form") {
				return {
					action: "accept",
					content: formContent(decision.values, pending.fieldTypes ?? {}),
				};
			}
			if (decision.type === "cancel") return { action: "cancel" };
			return { action: "decline" };
		}
		if (decision.type === "cancel" || decision.type === "form")
			return { outcome: { outcome: "cancelled" } };
		if (decision.type === "option") {
			return { outcome: { outcome: "selected", optionId: decision.optionId } };
		}
		// accept / accept_for_session / decline: pick the option whose id best
		// matches the intent, else the first option.
		const reject = decision.type === "decline";
		const options = pending.item.options ?? [];
		const match = options.find((option) =>
			reject
				? /reject|deny|no/i.test(option.optionId) ||
					/reject|deny|no/i.test(option.label)
				: /allow|accept|yes|approve/i.test(option.optionId) ||
					/allow|accept|yes|approve/i.test(option.label),
		);
		const optionId = match?.optionId ?? options[0]?.optionId;
		return optionId
			? { outcome: { outcome: "selected", optionId } }
			: { outcome: { outcome: "cancelled" } };
	}

	private async toAcpPrompt(content: UserContent[]): Promise<unknown[]> {
		const blocks: unknown[] = [];
		const dropped: string[] = [];
		const takesImages =
			(
				this.agentCapabilities as {
					promptCapabilities?: { image?: boolean };
				}
			).promptCapabilities?.image === true;

		for (const entry of content) {
			if (entry.type === "text") {
				blocks.push({ type: "text", text: entry.text });
				continue;
			}
			const attachment = await this.options
				.resolveAttachment?.(entry.attachmentId)
				.catch(() => null);
			if (!attachment) {
				dropped.push(entry.name);
				continue;
			}
			if (takesImages && attachment.mimeType.startsWith("image/")) {
				blocks.push({
					type: "image",
					mimeType: attachment.mimeType,
					data: attachment.data,
				});
				continue;
			}
			blocks.push({
				type: "resource_link",
				uri: `file://${attachment.path}`,
				name: entry.name,
				mimeType: attachment.mimeType,
			});
		}

		if (dropped.length > 0) {
			this.emitNotice(
				"info",
				`Could not read ${dropped.join(", ")}, so ${dropped.length === 1 ? "it was" : "they were"} left out of this message.`,
			);
		}
		return blocks;
	}

	private handleExit(code: number | null): void {
		if (this.disposed || this.dead) return;
		this.dead = true;
		this.stalePendingApprovals();
		for (const sessionId of [...this.subagents.keys()]) {
			this.finishSubagent(sessionId, "failed");
		}
		this.backgroundTasks.clear();
		const message = `acp agent exited (code ${code ?? "null"})`;
		if (this.stderrTail) console.warn(`[acp] ${message}\n${this.stderrTail}`);
		if (this.currentTurn?.status === "running") {
			this.flushOpenText();
			this.emitTurn({
				...this.currentTurn,
				status: "failed",
				error: { message },
				completedAtMs: this.now(),
			});
		}
		this.emitNotice("error", this.withStderr(message));
		this.emitSession({ status: "dead" });
		this.queue.close();
	}

	private closeAfterFailure(): void {
		this.client
			?.close()
			.catch((error) => console.warn("[acp] could not close the agent", error));
	}

	private withStderr(message: string): string {
		const tail = this.stderrTail.trim();
		return tail ? `${message}\n\n${tail}` : message;
	}

	private requestTimeoutMs(): number {
		return this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
	}

	private cancelPendingApprovals(turnId: string): boolean {
		let cancelled = false;
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			if (pending.turnId !== turnId) continue;
			cancelled = true;
			this.pendingApprovals.delete(approvalId);
			this.client?.respond(
				pending.requestId,
				this.approvalOutcome(pending, { type: "cancel" }),
			);
			this.emitItem(
				{ ...pending.item, status: "stale", completedAtMs: this.now() },
				pending.turnId,
			);
		}
		return cancelled;
	}

	private dropCancelledRequest(params: unknown): void {
		const requestId = (params as { requestId?: unknown } | undefined)
			?.requestId;
		let dropped = false;
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			if (pending.requestId !== requestId) continue;
			this.pendingApprovals.delete(approvalId);
			dropped = true;
			this.emitItem(
				{ ...pending.item, status: "stale", completedAtMs: this.now() },
				pending.turnId,
			);
		}
		if (
			dropped &&
			this.pendingApprovals.size === 0 &&
			this.currentTurn?.status === "running"
		) {
			this.emitSession({ status: "running" });
		}
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

	private authAwareMessage(error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		if (/auth/i.test(message)) {
			return `${message}. Run the agent's login in a terminal (e.g. \`claude /login\`), then reopen this chat.`;
		}
		return message;
	}

	/**
	 * A non-empty turn id for every emitted item — the chat protocol rejects an
	 * empty one. Items that arrive outside a prompt turn (history replayed by
	 * `session/load`, or a notice during bootstrap) are grouped under a single
	 * synthetic "history" turn so they still have a home.
	 */
	/**
	 * A replay arrives faster than the millisecond clock ticks, and items that
	 * share a start are ordered by item id — which is random. Strictly
	 * increasing starts keep the transcript in the order it happened.
	 */
	private nextStartMs(): number {
		const startedAtMs = Math.max(this.now(), this.lastStartMs + 1);
		this.lastStartMs = startedAtMs;
		return startedAtMs;
	}

	private resolveTurnId(): string {
		if (this.currentTurn) return this.currentTurn.id;
		if (!this.historyTurnId) {
			this.historyTurnId = this.mintId();
			// A replay outruns the clock, and turns that share a millisecond sort by
			// turn id — which is random. Keep the starts strictly increasing so the
			// transcript comes back in the order it happened.
			const startedAtMs = this.nextStartMs();
			this.emitTurn({
				id: this.historyTurnId,
				status: "completed",
				startedAtMs,
				completedAtMs: startedAtMs,
			});
		}
		return this.historyTurnId;
	}

	private emitTurn(turn: Turn): void {
		if (turn.status !== "running" || turn.id !== this.currentTurn?.id) {
			this.cycleEnded = false;
			this.steeredCyclePending = false;
		}
		this.currentTurn = turn;
		this.emit({ kind: "turn", turn });
		this.syncAwaitingBackground();
	}

	private syncAwaitingBackground(): void {
		const awaiting =
			this.supportsSteering &&
			this.currentTurn?.status === "running" &&
			this.cycleEnded &&
			[...this.backgroundTaskTurns.values()].includes(this.currentTurn.id);
		if (awaiting === this.awaitingBackground) return;
		this.awaitingBackground = awaiting;
		this.emitSession({ awaitingBackground: awaiting });
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
				startedAtMs: this.nextStartMs(),
				completedAtMs: this.now(),
				...(text ? { text } : {}),
			},
			this.resolveTurnId(),
		);
	}

	private emitSession(session: Partial<SessionState>): void {
		if (session.modeId) this.modeId = session.modeId;
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

function isClientApprovalMode(modeId: string | undefined): modeId is string {
	return CLIENT_APPROVAL_MODES.some((mode) => mode.id === modeId);
}

function autoApproves(modeId: string | undefined): boolean {
	return modeId === "auto" || modeId === "bypassPermissions";
}

function optionKindFromLabel(
	label: string,
): "allow_once" | "allow_always" | "reject_once" {
	if (/^(deny|reject|no)\b/i.test(label)) return "reject_once";
	if (/always|session/i.test(label)) return "allow_always";
	return "allow_once";
}

const piShellDetailsSchema = z.looseObject({
	shellId: z.string().min(1),
	status: z.string(),
	pid: z.number().int().positive().optional(),
});

const piShellInputSchema = z.looseObject({
	command: z.string().optional(),
	description: z.string().optional(),
});

function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function stopProcessGroup(pid: number): boolean {
	for (const target of [-pid, pid]) {
		try {
			process.kill(target, "SIGTERM");
			return true;
		} catch {}
	}
	return false;
}

export function createAcpAdapter(options: AcpAdapterOptions): HarnessAdapter {
	return new AcpAdapter(options);
}

function flattenSelectOptions(
	entries: AcpConfigSelectOption[],
	labelOf: (name: string) => string,
): SessionConfigOption["options"] {
	return entries.flatMap((entry) => {
		const leaves =
			entry.options ?? (entry.value ? [{ ...entry, value: entry.value }] : []);
		return leaves.map((leaf) => ({
			id: leaf.value,
			label: labelOf(leaf.name),
			...(leaf.description ? { description: leaf.description } : {}),
		}));
	});
}
