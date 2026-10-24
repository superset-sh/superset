import { randomUUID } from "node:crypto";
import type {
	ApprovalRequest,
	AvailableCommand,
	Decision,
	DiscoverSessionsResult,
	FormField,
	Item,
	ItemAttachment,
	SessionConfigOption,
	SessionState,
	SubagentStatus,
	ToolCall,
	Turn,
	UserContent,
} from "@superset/chat/protocol";
import { AGENT_DEFAULT_MODE, isHiddenText } from "@superset/chat/protocol";
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
	airForkPointMeta,
	airSubagentSpawnedSchema,
	airSubagentStateSchema,
	isSubagentControlCall,
	isTerminalAirState,
} from "./air";
import { type AcpImageSource, imageSourceOf } from "./imageBlocks";
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
import { messageIdOf, SessionStream } from "./sessionStream";
import type { AcpConfigSelectOption, AcpElicitationProperty } from "./wire";
import {
	ACP_STEERING_METHOD,
	type AcpContentBlock,
	type AcpSubagentUpdate,
	acpAvailableCommandsUpdateSchema,
	acpConfigOptionUpdateSchema,
	acpContentBlockSchema,
	acpCreateElicitationParamsSchema,
	acpInitializeResponseSchema,
	acpListSessionsResponseSchema,
	acpNewSessionResponseSchema,
	acpPromptResponseSchema,
	acpRequestPermissionParamsSchema,
	acpSessionInfoUpdateSchema,
	acpSessionMessageChunkSchema,
	acpSessionMessageSchema,
	acpSessionNotificationSchema,
	acpSessionUpdateSchema,
	acpStateUpdateSchema,
	acpSteeringResponseSchema,
	acpSubagentUpdateSchema,
	acpToolCallUpdateSchema,
	acpUsageUpdateSchema,
	SUBAGENT_BACKGROUND_METHOD,
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

function unconfirmedSelectionMessage(error: AcpTimeoutError): string {
	return `${error.message}. The agent can still apply the change, so the selection stays as you set it.`;
}

function commandCategory(
	category: unknown,
): Pick<AvailableCommand, "category"> {
	return category === "native" || category === "mcp" ? { category } : {};
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

const ACTIVE_SUBAGENT_STATES = new Set(["requires_action", "unknown"]);

const SUBAGENT_STATUS_BY_END_STATE: Record<string, SubagentStatus> = {
	failed: "failed",
	disconnected: "failed",
	cancelled: "stopped",
	stopped: "stopped",
};

function subagentStatusOfEnd({
	state,
	stopReason,
}: {
	state: string;
	stopReason?: string | null;
}): SubagentStatus {
	if (state !== "idle") return SUBAGENT_STATUS_BY_END_STATE[state] ?? "idle";
	if (stopReason === "error") return "failed";
	return stopReason === "cancelled" ? "stopped" : "idle";
}

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

type AcpStateUpdate = z.infer<typeof acpStateUpdateSchema>;

type V2Turn = {
	id: string;
	inserted: boolean;
	idle?: AcpStateUpdate & { seq: number };
};

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
const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_INVALID_PARAMS = -32602;
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
	forkAtMessage?: boolean;
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

type SubagentRun = {
	item: ToolCall;
	turnId: string;
	stream: SessionStream;
	parentSessionId: string;
	parentTaskId?: string;
	steers: Set<{ echoes: Set<string>; shared: boolean }>;
};

type SubagentControls = {
	canStop: boolean;
	canSteer: boolean;
	canBackground: boolean;
};

const NO_SUBAGENT_CONTROLS: SubagentControls = {
	canStop: false,
	canSteer: false,
	canBackground: false,
};

const TOOL_CALL_STATUS_BY_SUBAGENT_STATUS = {
	running: "running",
	idle: "completed",
	stopped: "canceled",
	failed: "failed",
} as const satisfies Record<SubagentStatus, ToolCall["status"]>;

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
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	private readonly main: SessionStream;
	private readonly subagents = new Map<string, SubagentRun>();
	private readonly finishedSubagents = new Set<string>();
	/**
	 * The adapter drops a task's updates once the subagent that started it
	 * finishes, so the task ends with its subagent.
	 */
	private readonly subagentTasks = new Map<string, Set<string>>();
	private readonly backgroundTasks: BackgroundTasks;
	private client: AcpRpcClient | null = null;
	/** Shared by `start` and native discovery so a list never spawns a second agent. */
	private connection: Promise<void> | null = null;
	private sessionId: string | null = null;
	private loadingSessionId: string | null = null;
	private cwd = process.cwd();
	private currentTurn: Turn | null = null;
	private historyTurnId: string | null = null;
	private v2Turn: V2Turn | null = null;
	private readonly insertions = new Map<string, number>();
	private insertionSeq = 0;
	private lastIdleSeq = 0;
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
	private quietReplay = false;
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
		this.main = new SessionStream({
			idPrefix: "",
			scopeIdsByTurn: true,
			streamUserMessages: false,
			emitItem: (item, turnId) => this.emitItem(item, turnId),
			emitTextDelta: (itemId, append) => this.emitTextDelta(itemId, append),
			attachmentOf: (block, referenceId) =>
				this.attachmentOf(block, referenceId),
			reportedModel: resolvedModelOf,
			defaultModel: () =>
				this.replaying || this.isPdevAgent()
					? undefined
					: this.currentModelLabel(),
			onNotify: (level, text) => {
				if (level === "error" && text) this.emitNotice("error", text);
			},
			nextStartMs: () => this.nextStartMs(),
			now: () => this.now(),
			mintId: () => this.mintId(),
		});
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
					type: "delta",
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
			(this.supportsSteering || this.v2TurnIsCurrent()) &&
			this.currentTurn?.status === "running" &&
			this.heldTurnId !== this.currentTurn.id
		);
	}

	async steer(content: UserContent[]): Promise<boolean> {
		const client = this.client;
		const sessionId = this.sessionId;
		if (!client || !sessionId || !this.canSteer()) return false;
		const v2TurnId = this.v2TurnIsCurrent() ? this.v2Turn?.id : undefined;
		if (v2TurnId) {
			const response = await client.request("session/prompt", {
				sessionId,
				prompt: await this.toAcpPrompt(content),
			});
			const parsed = acpPromptResponseSchema.safeParse(response).data;
			if (parsed?.messageId !== undefined && parsed.stopReason === undefined) {
				this.steerInserted(v2TurnId, parsed.messageId);
				return true;
			}
			return parsed?.stopReason !== undefined;
		}
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
			this.emitSession({ status: this.statusAfterApprovals() });
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
		this.emitSession({ status: this.statusAfterApprovals() });
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
		const subagentSessionId = this.subagentSessionOf(taskId);
		const run = subagentSessionId && this.subagents.get(subagentSessionId);
		if (subagentSessionId) {
			if (!run || run.item.canStop !== true) return false;
			this.client.notify("session/cancel", { sessionId: subagentSessionId });
			this.cancelSubagentApprovals(subagentSessionId, run);
			return true;
		}
		if (!this.backgroundTasks.canStop(taskId)) return false;
		const response = await this.client.request(
			AIR_ASYNC_TASK_STOP_METHOD,
			{ sessionId: this.sessionId, asyncTaskId: taskId },
			this.requestTimeoutMs(),
		);
		return (response as { stopped?: unknown } | null)?.stopped === true;
	}

	async steerSubagent(
		taskId: string,
		content: UserContent[],
	): Promise<boolean> {
		const client = this.client;
		const subagentSessionId = this.subagentSessionOf(taskId);
		const run = subagentSessionId && this.subagents.get(subagentSessionId);
		if (!client || !subagentSessionId || !run || run.item.canSteer !== true)
			return false;
		const steer = { echoes: new Set<string>(), shared: run.steers.size > 0 };
		for (const other of run.steers) other.shared = true;
		run.steers.add(steer);
		try {
			await client.request("session/prompt", {
				sessionId: subagentSessionId,
				prompt: await this.toAcpPrompt(content),
			});
			return true;
		} catch (error) {
			if (
				error instanceof AcpRpcError &&
				error.code === JSON_RPC_INVALID_REQUEST
			)
				return !steer.shared && steer.echoes.size > 0;
			throw error;
		} finally {
			run.steers.delete(steer);
		}
	}

	async backgroundSubagent(taskId: string): Promise<boolean> {
		const client = this.client;
		const subagentSessionId = this.subagentSessionOf(taskId);
		if (
			!client ||
			!subagentSessionId ||
			this.subagents.get(subagentSessionId)?.item.canBackground !== true
		)
			return false;
		try {
			await client.request(
				SUBAGENT_BACKGROUND_METHOD,
				{ sessionId: subagentSessionId },
				this.requestTimeoutMs(),
			);
			return true;
		} catch (error) {
			if (
				error instanceof AcpRpcError &&
				(error.code === JSON_RPC_INVALID_REQUEST ||
					error.code === JSON_RPC_INVALID_PARAMS)
			)
				return false;
			throw error;
		}
	}

	private subagentSessionOf(taskId: string): string | undefined {
		return [...this.subagents].find(([, run]) => run.item.id === taskId)?.[0];
	}

	/**
	 * session/fork is unstable but reachable on v1, and both shipped adapters
	 * advertise it. The agent copies its own session; the caller decides what to
	 * attach to the id that comes back.
	 */
	async fork(cut?: { upToMessageId: string }): Promise<string | null> {
		if (!this.client || !this.sessionId) return null;
		if (!this.supportsSessionCapability("fork")) return null;
		if (cut && !this.options.forkAtMessage) return null;
		const response = await this.client.request(
			"session/fork",
			{
				sessionId: this.sessionId,
				cwd: this.cwd,
				mcpServers: [],
				...(cut ? { _meta: airForkPointMeta(cut.upToMessageId) } : {}),
			},
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

	/**
	 * v1 advertises `sessionCapabilities.list` (null means absent). v2 makes
	 * `session/list` a baseline method of any `capabilities.session` object.
	 */
	private supportsSessionList(): boolean {
		const caps = this.agentCapabilities.sessionCapabilities;
		if (caps && typeof caps === "object" && "list" in caps) {
			const list = (caps as { list?: unknown }).list;
			if (list !== undefined && list !== null) return true;
		}
		if (this.negotiatedVersion < 2) return false;
		const session = this.agentCapabilities.session;
		return session !== null && typeof session === "object";
	}

	/**
	 * Lists the agent's own sessions. Initializes when this adapter has not
	 * started, and never sends `session/new`.
	 */
	async discoverSessions(input: {
		cwd: string;
		cursor?: string;
	}): Promise<DiscoverSessionsResult> {
		if (this.disposed) throw new Error("acp adapter is disposed");
		await this.ensureConnected(input.cwd);
		if (this.disposed || !this.client) {
			throw new Error("acp adapter is disposed");
		}
		if (!this.supportsSessionList()) {
			return { supported: false, sessions: [] };
		}
		const response = await this.client.request(
			"session/list",
			{
				cwd: input.cwd,
				...(input.cursor ? { cursor: input.cursor } : {}),
			},
			this.requestTimeoutMs(),
		);
		return listedSessions(response);
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

	private ensureConnected(cwd: string): Promise<void> {
		if (!this.connection) {
			this.connection = this.initializeAgent(cwd);
		}
		return this.connection;
	}

	/** Spawns the agent and runs `initialize` only. Does not open a session. */
	private async initializeAgent(cwd: string): Promise<void> {
		const launch = await this.options.launch?.();
		if (this.disposed) return;
		const client = new AcpRpcClient({
			createTransport: (handlers) => {
				const transport = (this.options.createTransport ?? spawnAcpTransport)(
					{
						command: launch?.command ?? this.options.command,
						args: launch?.args ?? this.options.args,
						cwd,
						env: launch?.env ?? this.options.env,
					},
					handlers,
				);
				if (transport.pid !== undefined) this.options.onSpawn?.(transport.pid);
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
		if (this.disposed) {
			await client.close();
			return;
		}

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
			this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS,
		);
		if (this.disposed) return;

		const negotiated = acpInitializeResponseSchema.safeParse(initialized);
		if (!negotiated.success) return;
		this.negotiatedVersion =
			negotiated.data.protocolVersion ?? this.negotiatedVersion;
		this.agentName =
			negotiated.data.agentInfo?.name ?? negotiated.data.info?.name ?? null;
		this.agentCapabilities =
			negotiated.data.capabilities ?? negotiated.data.agentCapabilities ?? {};
		this.supportsSteering = negotiated.data._meta?.steering?.supported === true;
	}

	private async bootstrap(startOptions: HarnessStartOptions): Promise<void> {
		this.emitSession({ status: "starting" });
		try {
			await this.ensureConnected(startOptions.cwd);
			if (this.disposed || !this.client) return;
			const client = this.client;
			const startupTimeoutMs =
				this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;

			let response: unknown;
			let resumed = false;
			if (startOptions.resume) {
				this.replaying = true;
				this.quietReplay = startOptions.resume.quiet === true;
				this.loadingSessionId = startOptions.resume.harnessSessionId;
				const resumeMethod =
					this.negotiatedVersion >= 2 ? "session/resume" : "session/load";
				try {
					response = await client.request(
						resumeMethod,
						{
							sessionId: startOptions.resume.harnessSessionId,
							cwd: startOptions.cwd,
							mcpServers: [],
							...(this.negotiatedVersion >= 2
								? { replayFrom: { type: "start" } }
								: {}),
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
					console.warn(`[acp] ${resumeMethod} failed`, loadError);
					response = await client.request(
						"session/new",
						{ cwd: startOptions.cwd, mcpServers: [] },
						startupTimeoutMs,
					);
				} finally {
					if (this.quietReplay) this.main.discardOpen();
					this.replaying = false;
					this.quietReplay = false;
					this.loadingSessionId = null;
					// Nothing follows the replay, so the last item it opened has no
					// later turn to flush it.
					this.main.flush();
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
		this.emitTurn({
			id: turnId,
			status: "running",
			startedAtMs: this.nextStartMs(),
		});
		this.emitSession({ status: "running" });
		this.heldTurnId = turnId;
		await this.selectionsApplied();
		if (this.heldTurnId !== turnId) return;
		this.heldTurnId = null;
		const client = this.client;
		if (!client || !this.sessionId || this.currentTurn?.id !== turnId) return;
		const v2 = this.negotiatedVersion >= 2;
		if (v2) this.v2Turn = { id: turnId, inserted: false };
		try {
			const response = await client.request("session/prompt", {
				sessionId: this.sessionId,
				prompt: await this.toAcpPrompt(content),
			});
			const parsed = acpPromptResponseSchema.safeParse(response).data;
			if (
				v2 &&
				parsed?.messageId !== undefined &&
				parsed.stopReason === undefined
			) {
				this.promptInserted(turnId, parsed.messageId);
				return;
			}
			if (this.v2Turn?.id === turnId) this.v2Turn = null;
			this.finishTurn(turnId, parsed?.stopReason);
		} catch (error) {
			if (this.v2Turn?.id === turnId) this.v2Turn = null;
			this.failTurn(turnId, (error as Error).message);
		}
	}

	private v2TurnIsCurrent(): boolean {
		return this.v2Turn !== null && this.v2Turn.id === this.currentTurn?.id;
	}

	private insertedAfterLastIdle(messageId: string): boolean {
		const insertedAt = this.insertions.get(messageId);
		this.insertions.delete(messageId);
		return insertedAt === undefined || insertedAt > this.lastIdleSeq;
	}

	private promptInserted(turnId: string, messageId: string): void {
		const turn = this.v2Turn;
		if (turn?.id !== turnId) return;
		turn.inserted = true;
		const idle = turn.idle;
		turn.idle = undefined;
		if (!idle) return;
		const insertedAt = this.insertions.get(messageId);
		this.insertions.delete(messageId);
		if (insertedAt !== undefined && insertedAt > idle.seq) return;
		this.endV2Turn(turnId, idle);
	}

	private steerInserted(turnId: string, messageId: string): void {
		const insertedAfterLastIdle = this.insertedAfterLastIdle(messageId);
		if (this.v2Turn?.id === turnId || this.currentTurn?.id !== turnId) return;
		if (this.currentTurn.status === "running" || !insertedAfterLastIdle) return;
		const id = this.mintId();
		this.emitTurn({ id, status: "running", startedAtMs: this.now() });
		this.emitSession({ status: "running" });
		this.v2Turn = { id, inserted: true };
	}

	private endV2Turn(turnId: string, idle: AcpStateUpdate): void {
		this.v2Turn = null;
		if (idle.stopReason === "error")
			this.failTurn(
				turnId,
				idle.error?.message ?? "The agent stopped with an error.",
			);
		else this.finishTurn(turnId, idle.stopReason ?? undefined);
	}

	private finishTurn(turnId: string, stopReason: string | undefined): void {
		this.main.flush();
		this.emitTurn({
			id: turnId,
			status: stopReason === "cancelled" ? "interrupted" : "completed",
			startedAtMs: this.currentTurn?.startedAtMs ?? this.now(),
			completedAtMs: this.now(),
		});
		if (stopReason === "refusal")
			this.emitNotice("info", "The agent declined to continue.");
		this.cancelPendingApprovals(turnId);
		this.emitSession({ status: this.statusAfterApprovals() });
		this.sendCustomAnswer();
	}

	private failTurn(turnId: string, message: string): void {
		this.customAnswer = null;
		this.main.flush();
		this.cancelPendingApprovals(turnId);
		this.emitTurn({
			id: turnId,
			status: "failed",
			error: { message },
			startedAtMs: this.currentTurn?.startedAtMs ?? this.now(),
			completedAtMs: this.now(),
		});
		this.emitNotice("error", message);
		this.emitSession({ status: this.statusAfterApprovals() });
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
		const variant = update.data.sessionUpdate;

		// Live, a user message echoes a prompt the runtime already recorded. In a
		// session/load replay it does not: those turns were typed at the CLI and
		// this session has never seen them, so dropping them starts the transcript
		// at the agent's first reply. Each one opens a turn of its own, or the
		// whole replay lands in one group whose order comes down to item id.
		const childSession =
			this.subagents.has(outer.data.sessionId) ||
			this.finishedSubagents.has(outer.data.sessionId);
		if (
			!childSession &&
			(variant === "user_message_chunk" || variant === "user_message")
		) {
			if (!this.replaying) {
				const messageId = messageIdOf(outer.data.update);
				if (
					messageId &&
					this.negotiatedVersion >= 2 &&
					outer.data.sessionId === this.sessionId &&
					!this.insertions.has(messageId)
				)
					this.insertions.set(messageId, ++this.insertionSeq);
				return;
			}
			if (isHiddenUserMessage(outer.data.update)) return;
			if (this.main.openKind() !== "user_message") {
				this.main.flush();
				// emitTurn leaves the history turn as `currentTurn`, which
				// resolveTurnId answers with first — both have to go for the next
				// resolve to mint a fresh turn.
				this.currentTurn = null;
				this.historyTurnId = null;
			}
			this.main.handleUpdate(variant, outer.data.update, this.resolveTurnId());
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
				this.handleSubagentSpawned(outer.data.update, outer.data.sessionId);
				return;
			case "subagent_state_update":
				this.handleSubagentState(outer.data.update);
				return;
			case "subagent_update":
				this.handleSubagentUpdate(outer.data.update, outer.data.sessionId);
				return;
			case "session_info_update": {
				if (this.isForeignSession(outer.data.sessionId)) return;
				const info = acpSessionInfoUpdateSchema.safeParse(outer.data.update);
				if (info.success && info.data.title)
					this.emitSession({ title: info.data.title });
				return;
			}
		}

		if (this.isForeignSession(outer.data.sessionId) || childSession) {
			this.handleSubagentActivity(
				outer.data.sessionId,
				variant,
				outer.data.update,
			);
			return;
		}

		if (variant === "usage_update") {
			const usage = acpUsageUpdateSchema.safeParse(outer.data.update);
			if (usage.success && usage.data.cost !== undefined) this.main.flush();
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
			case "agent_thought_chunk":
			case "agent_message":
			case "agent_thought":
			case "tool_call_content_chunk":
			case "plan":
			case "plan_update":
				this.main.handleUpdate(variant, outer.data.update, turnId);
				return;
			case "tool_call":
			case "tool_call_update":
				this.handleToolCall(outer.data.update, turnId);
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
		const update = parsed.data;
		this.main.flush();
		if (
			!this.main.toolCall(update.toolCallId) &&
			!update.title &&
			update.status !== "failed" &&
			isSubagentControlCall(raw)
		)
			return;
		const item = this.main.handleUpdate("tool_call_update", raw, turnId);
		if (item && !this.replaying) this.trackBackgroundShell(item);
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

	private handleStateUpdate(raw: unknown): void {
		const parsed = acpStateUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		if (parsed.data.state === "idle") {
			this.lastIdleSeq = this.insertionSeq;
			const turn = this.v2Turn;
			if (turn && !turn.inserted) {
				turn.idle = { ...parsed.data, seq: this.insertionSeq };
				return;
			}
			if (turn) {
				this.endV2Turn(turn.id, parsed.data);
				return;
			}
		}
		if (
			parsed.data.state === "requires_action" &&
			this.options.clientApprovalModes
		)
			return;
		const status = SESSION_STATUS_BY_ACP_STATE[parsed.data.state];
		if (status) this.emitSession({ status });
	}

	/**
	 * A child session the parent spawned. The announcing session ids the
	 * parent: a subagent announcing its own child nests the grandchild under
	 * the subagent's item.
	 */
	private handleSubagentUpdate(raw: unknown, parentSessionId: string): void {
		const parsed = acpSubagentUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		const { sessionId, title, description, state, capabilities } = parsed.data;
		if (this.finishedSubagents.has(sessionId)) return;
		const meta = parsed.data._meta?.["sh.superset"];
		const controls =
			capabilities === undefined
				? undefined
				: this.subagentControls(capabilities);
		const run = this.subagents.get(sessionId);
		if (!run) {
			this.startSubagent(
				sessionId,
				meta?.name ?? title,
				description,
				parentSessionId,
				{
					toolCallId: meta?.toolCallId,
					...this.subagentControls(capabilities ?? null),
					...(meta?.status ? { subagentStatus: meta.status } : {}),
				},
			);
		} else if (!meta?.status && controls) {
			this.setSubagentItem(run, { ...run.item, ...controls });
			this.backgroundTasks.update(run.item.id, controls);
		}
		if (meta?.status) {
			this.applySubagentStatus(
				sessionId,
				meta.status,
				meta.name,
				controls,
				capabilities,
			);
			return;
		}
		if (
			state &&
			!ACTIVE_SUBAGENT_STATES.has(state.state) &&
			isTerminalAirState(state.state)
		) {
			this.finishSubagent(sessionId, subagentStatusOfEnd(state));
		}
	}

	private subagentControls(
		capabilities: AcpSubagentUpdate["capabilities"],
	): SubagentControls {
		const extension = capabilities?._meta?.["sh.superset"];
		return {
			canStop: capabilities?.cancel != null,
			canSteer: !this.replaying && extension?.prompt != null,
			canBackground: !this.replaying && extension?.background != null,
		};
	}

	private setSubagentItem(run: SubagentRun, item: ToolCall): void {
		const changed = JSON.stringify(item) !== JSON.stringify(run.item);
		run.item = item;
		if (changed) this.emitItem(item, run.turnId);
	}

	private applySubagentStatus(
		sessionId: string,
		status: SubagentStatus,
		name: string | undefined,
		controls: SubagentControls | undefined,
		capabilities: AcpSubagentUpdate["capabilities"],
	): void {
		const run = this.subagents.get(sessionId);
		if (!run) return;
		const title = name ?? run.item.title;
		const item = { ...run.item, ...controls, title };
		if (status === "running") {
			const { completedAtMs: _completedAtMs, ...running } = item;
			this.setSubagentItem(run, {
				...running,
				status: "running",
				subagentStatus: status,
			});
			if (this.backgroundTasks.has(run.item.id))
				this.backgroundTasks.update(run.item.id, {
					name: title,
					subagentStatus: status,
					...this.controlsOf(run.item),
				});
			else this.startSubagentTask(run, this.now());
			return;
		}
		const open =
			(status === "idle" || status === "failed") &&
			!this.replaying &&
			(capabilities === undefined
				? run.item.canSteer === true
				: capabilities?._meta?.["sh.superset"] != null);
		const idleControls = controls
			? {}
			: { canStop: false, canBackground: false };
		this.endSubagent(
			sessionId,
			run,
			{
				...item,
				...(open ? idleControls : NO_SUBAGENT_CONTROLS),
				status: TOOL_CALL_STATUS_BY_SUBAGENT_STATUS[status],
				subagentStatus: status,
				completedAtMs: this.now(),
			},
			open,
		);
	}

	private controlsOf(item: ToolCall): Partial<SubagentControls> {
		return {
			...(item.canStop !== undefined ? { canStop: item.canStop } : {}),
			...(item.canSteer !== undefined ? { canSteer: item.canSteer } : {}),
			...(item.canBackground !== undefined
				? { canBackground: item.canBackground }
				: {}),
		};
	}

	private startSubagentTask(run: SubagentRun, startedAtMs: number): void {
		this.backgroundTasks.start({
			id: run.item.id,
			kind: "subagent",
			name: run.item.title,
			canStop: run.item.canStop ?? false,
			...this.controlsOf(run.item),
			...(run.item.subagentStatus
				? { subagentStatus: run.item.subagentStatus }
				: {}),
			startedAtMs,
			...(run.parentTaskId ? { parentId: run.parentTaskId } : {}),
		});
	}

	private endSubagentTasks(sessionId: string): void {
		for (const taskId of this.subagentTasks.get(sessionId) ?? [])
			this.backgroundTasks.end(taskId);
		this.subagentTasks.delete(sessionId);
	}

	private handleSubagentSpawned(raw: unknown, parentSessionId: string): void {
		const parsed = airSubagentSpawnedSchema.safeParse(raw);
		if (!parsed.success) return;
		const { subagentSessionId, name, task } = parsed.data;
		if (
			this.subagents.has(subagentSessionId) ||
			this.finishedSubagents.has(subagentSessionId)
		)
			return;
		this.startSubagent(subagentSessionId, name, task, parentSessionId);
	}

	private handleSubagentState(raw: unknown): void {
		const parsed = airSubagentStateSchema.safeParse(raw);
		if (!parsed.success || !isTerminalAirState(parsed.data.state)) return;
		const { subagentSessionId } = parsed.data;
		this.finishSubagent(subagentSessionId, subagentStatusOfEnd(parsed.data));
	}

	private startSubagent(
		sessionId: string,
		name: string | null | undefined,
		task: string | null | undefined,
		parentSessionId: string,
		rfd?: {
			toolCallId?: string;
			canStop: boolean;
			canSteer: boolean;
			canBackground: boolean;
			subagentStatus?: SubagentStatus;
		},
	): void {
		const parent = this.subagents.get(parentSessionId);
		(parent?.stream ?? this.main).flush();
		const title = name || task || "";
		const startedAtMs = this.nextStartMs();
		const toolCallId = rfd?.toolCallId;
		const parentItemId = !toolCallId
			? parent?.item.id
			: parent
				? parent.stream.toolItemId(toolCallId)
				: this.isForeignSession(parentSessionId)
					? undefined
					: toolCallId;
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
			...(rfd
				? {
						canStop: rfd.canStop,
						canSteer: rfd.canSteer,
						canBackground: rfd.canBackground,
					}
				: {}),
			...(rfd?.subagentStatus ? { subagentStatus: rfd.subagentStatus } : {}),
			...(parentItemId ? { parentItemId } : {}),
		};
		const turnId = this.resolveTurnId();
		const stream = new SessionStream({
			idPrefix: `sub:${sessionId}:`,
			scopeIdsByTurn: false,
			parentItemId: item.id,
			streamUserMessages: true,
			emitItem: (child, childTurnId) => this.emitItem(child, childTurnId),
			emitTextDelta: (itemId, append) =>
				this.emitTextDelta(itemId, append, item.id),
			attachmentOf: (block, referenceId) =>
				this.attachmentOf(
					block,
					referenceId ? `sub:${sessionId}:${referenceId}` : undefined,
				),
			nextStartMs: () => this.nextStartMs(),
			now: () => this.now(),
			mintId: () => this.mintId(),
		});
		const run: SubagentRun = {
			item,
			turnId,
			stream,
			parentSessionId,
			...(parent ? { parentTaskId: parent.item.id } : {}),
			steers: new Set(),
		};
		this.subagents.set(sessionId, run);
		this.emitItem(item, turnId);
		this.startSubagentTask(run, startedAtMs);
	}

	private finishSubagent(sessionId: string, status: SubagentStatus): void {
		const run = this.subagents.get(sessionId);
		if (!run) return;
		const item = {
			...run.item,
			...(run.item.canSteer === undefined ? {} : NO_SUBAGENT_CONTROLS),
		};
		this.endSubagent(
			sessionId,
			run,
			run.item.subagentStatus === "idle"
				? item
				: {
						...item,
						status: TOOL_CALL_STATUS_BY_SUBAGENT_STATUS[status],
						...(run.item.subagentStatus ? { subagentStatus: status } : {}),
						completedAtMs: this.now(),
					},
		);
	}

	private endSubagent(
		sessionId: string,
		run: SubagentRun,
		item: ToolCall,
		open = false,
	): void {
		run.stream.flush();
		this.cancelSubagentApprovals(sessionId, run);
		this.endSubagentTasks(sessionId);
		this.backgroundTasks.end(run.item.id);
		if (!open) {
			this.subagents.delete(sessionId);
			this.finishedSubagents.add(sessionId);
		}
		this.setSubagentItem(run, item);
	}

	private handleSubagentActivity(
		sessionId: string,
		variant: string,
		raw: unknown,
	): void {
		const run = this.subagents.get(sessionId);
		if (!run) return;
		if (variant === "session_message" || variant === "session_message_chunk") {
			this.handleSessionMessage(run, sessionId, variant, raw);
			return;
		}
		const echo = messageIdOf(raw);
		if (
			echo &&
			(variant === "user_message" || variant === "user_message_chunk")
		)
			for (const steer of run.steers) steer.echoes.add(echo);
		run.stream.handleUpdate(variant, raw, run.turnId);
		if (variant !== "tool_call" && variant !== "tool_call_update") return;
		const update = acpToolCallUpdateSchema.safeParse(raw);
		if (update.success && update.data.title) {
			this.backgroundTasks.update(run.item.id, { detail: update.data.title });
		}
	}

	private handleSessionMessage(
		run: SubagentRun,
		childSessionId: string,
		variant: "session_message" | "session_message_chunk",
		raw: unknown,
	): void {
		const parsed = (
			variant === "session_message"
				? acpSessionMessageSchema
				: acpSessionMessageChunkSchema
		).safeParse(raw);
		if (
			!parsed.success ||
			parsed.data.recipientSessionId !== childSessionId ||
			parsed.data.senderSessionId === childSessionId
		)
			return;
		const childVariant =
			variant === "session_message" ? "user_message" : "user_message_chunk";
		if (parsed.data.senderSessionId === run.parentSessionId)
			run.stream.handleParentMessage(childVariant, parsed.data, run.turnId);
		else run.stream.handleUpdate(childVariant, parsed.data, run.turnId);
	}

	private handleAsyncTaskSpawned(sessionId: string, raw: unknown): void {
		const parsed = airAsyncTaskSpawnedSchema.safeParse(raw);
		if (!parsed.success) return;
		const { asyncTaskId, name, description, canStop } = parsed.data;
		if (this.finishedSubagents.has(sessionId)) return;
		const owner = this.subagents.get(sessionId);
		if (owner) {
			const tasks = this.subagentTasks.get(sessionId) ?? new Set<string>();
			this.subagentTasks.set(sessionId, tasks.add(asyncTaskId));
		}
		this.backgroundTasks.start({
			id: asyncTaskId,
			kind: "process",
			name: name || description || "",
			canStop: canStop ?? false,
			startedAtMs: this.now(),
			...(owner ? { parentId: owner.item.id } : {}),
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
		const title =
			parsed.data.title ??
			parsed.data.toolCall?.title ??
			parsed.data.subject?.toolCall?.title ??
			"Permission required";
		const description = parsed.data.description;
		const asking = [...this.main.allToolCalls()].some(
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
		const placement = this.approvalPlacement(
			parsed.data.sessionId,
			parsed.data.toolCall?.toolCallId,
		);
		const approvalId = `approval:${placement.targetItemId ?? this.mintId()}`;
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			...placement,
			title,
			...(description && description !== title
				? { detail: [{ type: "text" as const, text: description }] }
				: {}),
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
		this.raiseApproval({
			requestId: request.id,
			turnId,
			item,
			...(question ? { selectsOption: true } : {}),
			...(question && other ? { otherOptionId: other.optionId } : {}),
		});
	}

	private approvalPlacement(
		sessionId: string | null | undefined,
		toolCallId: string | null | undefined,
	): Pick<ApprovalRequest, "targetItemId" | "parentItemId"> {
		const owner = sessionId ? this.subagents.get(sessionId) : undefined;
		return {
			targetItemId: toolCallId
				? (owner?.stream.toolItemId(toolCallId) ?? toolCallId)
				: null,
			...(owner ? { parentItemId: owner.item.id } : {}),
		};
	}

	private raiseApproval(pending: PendingApproval): void {
		this.pendingApprovals.set(pending.item.id, pending);
		this.emitItem(pending.item, pending.turnId);
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
		const approvalId = `elicitation:${this.mintId()}`;
		const properties = parsed.data.requestedSchema?.properties ?? {};
		const required = new Set(parsed.data.requestedSchema?.required ?? []);
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			...this.approvalPlacement(parsed.data.sessionId, parsed.data.toolCallId),
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
		this.raiseApproval({
			requestId: request.id,
			turnId,
			item,
			fieldTypes: Object.fromEntries(
				Object.entries(properties).map(([id, property]) => [id, property.type]),
			),
		});
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
			this.main.flush();
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
		const liveRuns = new Set(
			[...this.subagents.values()].map((run) => run.item.id),
		);
		return this.cancelApprovals(
			(pending) =>
				pending.turnId === turnId &&
				!liveRuns.has(pending.item.parentItemId ?? ""),
		);
	}

	private cancelSubagentApprovals(sessionId: string, run: SubagentRun): void {
		const sessions = new Set([sessionId]);
		const runItems = new Set([run.item.id]);
		let grew = true;
		while (grew) {
			grew = false;
			for (const [childId, child] of this.subagents) {
				if (sessions.has(childId) || !sessions.has(child.parentSessionId))
					continue;
				sessions.add(childId);
				runItems.add(child.item.id);
				grew = true;
			}
		}
		if (
			this.cancelApprovals((pending) =>
				runItems.has(pending.item.parentItemId ?? ""),
			)
		)
			this.emitSession({ status: this.statusAfterApprovals() });
	}

	private statusAfterApprovals(): SessionState["status"] {
		if (this.pendingApprovals.size > 0) return "awaiting_input";
		return this.currentTurn?.status === "running" ? "running" : "idle";
	}

	private cancelApprovals(
		matches: (pending: PendingApproval) => boolean,
	): boolean {
		let cancelled = false;
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			if (!matches(pending)) continue;
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
		if (dropped && this.pendingApprovals.size === 0) {
			this.emitSession({ status: this.statusAfterApprovals() });
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
		this.emit({ type: "turn", turn });
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
		this.emit({ type: "item", item, turnId });
	}

	private emitTextDelta(
		itemId: string,
		append: string,
		parentItemId?: string,
	): void {
		this.emit({
			type: "delta",
			delta: {
				type: "text",
				itemId,
				append,
				...(parentItemId ? { parentItemId } : {}),
			},
		});
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
		this.emit({ type: "session", session });
	}

	private emit(event: AdapterEvent): void {
		if (
			this.quietReplay &&
			(event.type === "item" || event.type === "turn" || event.type === "delta")
		)
			return;
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

function isHiddenUserMessage(raw: unknown): boolean {
	const content = (raw as { content?: unknown } | null)?.content;
	const block = acpContentBlockSchema.safeParse(
		Array.isArray(content) ? content[0] : content,
	);
	return (
		block.success &&
		block.data.text !== undefined &&
		isHiddenText(block.data.text)
	);
}

function listedSessions(response: unknown): DiscoverSessionsResult {
	const parsed = acpListSessionsResponseSchema.safeParse(response);
	if (!parsed.success) {
		throw new Error("acp session/list returned an unreadable page");
	}
	const nextCursor = parsed.data.nextCursor || undefined;
	return {
		supported: true,
		sessions: parsed.data.sessions.map((session) => ({
			sessionId: session.sessionId,
			cwd: session.cwd,
			...(session.title ? { title: session.title } : {}),
			...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
		})),
		...(nextCursor ? { nextCursor } : {}),
	};
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
