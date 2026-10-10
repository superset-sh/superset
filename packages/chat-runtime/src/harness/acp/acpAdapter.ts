import { randomUUID } from "node:crypto";
import type {
	ApprovalRequest,
	AvailableCommand,
	Decision,
	FormField,
	Item,
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
import type {
	AcpNotification,
	AcpServerRequest,
	AcpTransport,
	AcpTransportHandlers,
	SpawnAcpOptions,
} from "./rpcClient";
import { AcpRpcClient, spawnAcpTransport } from "./rpcClient";
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

export type AcpAttachment = {
	path: string;
	mimeType: string;
	data: string;
};

const SELECTION_WAIT_MS = 5000;

export type AcpAdapterOptions = SpawnAcpOptions & {
	launch?: () => Promise<Pick<SpawnAcpOptions, "command" | "args" | "env">>;
	/** Selected for a new session that asks for no mode, when the agent offers it. */
	defaultModeId?: string;
	/** How long a prompt waits for mode and option changes the agent has not answered. */
	selectionWaitMs?: number;
	resolveAttachment?: (attachmentId: string) => Promise<AcpAttachment | null>;
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
	turnId: string;
	startedAtMs: number;
};

type PendingApproval = {
	requestId: number | string;
	turnId: string;
	item: ApprovalRequest;
	fieldTypes?: Record<string, string | undefined>;
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
		{ text: string; startedAtMs: number }
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
	private queuedPrompts: UserContent[][] = [];
	private disposed = false;

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
		return this.supportsSteering && this.currentTurn?.status === "running";
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
		this.client.notify("session/cancel", { sessionId: this.sessionId });
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
		const previous = this.modeId;
		this.emitSession({ modeId });
		if (!this.client || !this.sessionId) return;
		// v2 dropped session/set_mode outright: a mode is a config option there,
		// and `config_option_update` is what told us which one.
		const pending =
			this.negotiatedVersion >= 2 && this.modeConfigId
				? this.client.request("session/set_config_option", {
						sessionId: this.sessionId,
						configId: this.modeConfigId,
						type: "id",
						value: modeId,
					})
				: this.client.request("session/set_mode", {
						sessionId: this.sessionId,
						modeId,
					});
		this.trackSelection(pending);
		void pending.catch((error: Error) => {
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
		if (this.selectionsInFlight.size === 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const confirmed = await Promise.race([
			Promise.all(this.selectionsInFlight).then(() => true),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(
					() => resolve(false),
					this.options.selectionWaitMs ?? SELECTION_WAIT_MS,
				);
			}),
		]);
		clearTimeout(timer);
		if (!confirmed) {
			this.emitNotice(
				"error",
				"The agent did not confirm a mode or model change. This turn can run with the previous setting.",
			);
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
		const request = client.request("session/set_config_option", {
			sessionId,
			configId,
			value,
			...(this.negotiatedVersion >= 2 ? { type: "id" } : {}),
		});
		this.trackSelection(request);
		request
			.then((response) => this.handleConfigOptions(response))
			.catch((error: Error) => {
				this.configOptions = previous;
				this.emitSession({
					configOptions: previous,
					...(previousModeId ? { modeId: previousModeId } : {}),
				});
				this.emitNotice("error", error.message);
			});
	}

	async stopBackgroundTask(taskId: string): Promise<boolean> {
		if (!this.client || !this.sessionId) return false;
		if (!this.backgroundTasks.canStop(taskId)) return false;
		const response = await this.client.request(AIR_ASYNC_TASK_STOP_METHOD, {
			sessionId: this.sessionId,
			asyncTaskId: taskId,
		});
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
		const response = await this.client.request("session/fork", {
			sessionId: this.sessionId,
			cwd: this.cwd,
			mcpServers: [],
		});
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
				onStderr: () => undefined,
				onDispatchError: (error, method) =>
					this.emitNotice(
						"error",
						`acp ${method} could not be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				onExit: (code) => this.handleExit(code),
			});
			this.client = client;

			const initialized = await client.request("initialize", {
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
			});

			const negotiated = acpInitializeResponseSchema.safeParse(initialized);
			if (negotiated.success) {
				this.negotiatedVersion =
					negotiated.data.protocolVersion ?? this.negotiatedVersion;
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
					response = await client.request("session/load", {
						sessionId: startOptions.resume.harnessSessionId,
						cwd: startOptions.cwd,
						mcpServers: [],
					});
					resumed = true;
				} catch (loadError) {
					// An agent that was started but never prompted has a session id and
					// no transcript behind it, so loading one answers "not found".
					// There is no conversation to lose in that case, and none to
					// recover in the other, so opening a new session is the only thing
					// left to do either way — do it, and say so quietly rather than
					// handing back an error the reader cannot act on.
					this.emitNotice(
						"info",
						"No earlier conversation to open, so this is a new one.",
					);
					console.warn("[acp] session/load failed", loadError);
					response = await client.request("session/new", {
						cwd: startOptions.cwd,
						mcpServers: [],
					});
				} finally {
					this.replaying = false;
					this.loadingSessionId = null;
					// Nothing follows the replay, so the last item it opened has no
					// later turn to flush it.
					this.flushOpenText();
				}
			} else {
				response = await client.request("session/new", {
					cwd: startOptions.cwd,
					mcpServers: [],
				});
			}

			// session/load returns null after replaying history via session/update.
			const parsed = acpNewSessionResponseSchema.safeParse(response);
			this.sessionId = parsed.success
				? parsed.data.sessionId
				: (startOptions.resume?.harnessSessionId ?? null);

			if (!this.sessionId) {
				this.emitNotice("error", "acp agent returned no session id");
				this.emitSession({ status: "dead" });
				this.queue.close();
				return;
			}

			this.emitSession({
				status: "idle",
				harnessSessionId: this.sessionId,
				...(parsed.success && parsed.data.modes?.currentModeId
					? { modeId: parsed.data.modes.currentModeId }
					: {}),
				...(parsed.success && parsed.data.modes?.availableModes
					? {
							availableModes: parsed.data.modes.availableModes.map((mode) => ({
								id: mode.id,
								label: mode.name,
							})),
						}
					: {}),
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
			this.emitNotice("error", this.authAwareMessage(error));
			this.emitSession({ status: "dead" });
			this.queue.close();
		}
	}

	private async runTurn(content: UserContent[]): Promise<void> {
		await this.selectionsApplied();
		const client = this.client;
		if (!client || !this.sessionId) return;
		const turnId = this.mintId();
		this.emitTurn({ id: turnId, status: "running", startedAtMs: this.now() });
		this.emitSession({ status: "running" });
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
		} catch (error) {
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
				this.handleMessage("agent_message", outer.data.update, turnId);
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
				if (update.data.currentModeId)
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
	): void {
		const chunk = content?.type === "text" ? (content.text ?? "") : "";
		if (!chunk) return;
		const open = this.openMessage(kind, turnId, messageId);
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
			turnId,
			startedAtMs: flushed?.startedAtMs ?? this.nextStartMs(),
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
	): void {
		const parsed = acpMessageSchema.safeParse(raw);
		if (!parsed.success) return;
		const open = this.openMessage(kind, turnId, parsed.data.messageId);
		if (parsed.data.content !== undefined)
			open.text = messageText(parsed.data.content ?? []);
		this.flushOpenText();
	}

	private flushOpenText(): void {
		if (!this.openText) return;
		const open = this.openText;
		this.openText = null;
		if (open.messageId)
			this.messages.set(open.messageId, {
				text: open.text,
				startedAtMs: open.startedAtMs,
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
			case "agent_message":
				return { ...base, kind: "agent_message", text: open.text };
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
		const content =
			update.content === undefined
				? (prior?.content ?? [])
				: this.toToolContent(update.content ?? []);
		const locations =
			update.locations === undefined
				? prior?.locations
				: (update.locations ?? undefined);
		const rawInput =
			update.rawInput === undefined ? prior?.rawInput : update.rawInput;
		const rawOutput =
			update.rawOutput === undefined ? prior?.rawOutput : update.rawOutput;
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
		const item: ToolCall = {
			id: toolCallId,
			kind: "tool_call",
			title: prior?.title ?? "Tool call",
			toolKind: prior?.toolKind ?? "other",
			toolName: prior?.toolName ?? "tool",
			status: prior?.status ?? "running",
			content: [...(prior?.content ?? []), ...this.toToolContent([content])],
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

	private toToolContent(content: AcpToolCallContent[]): ToolContent[] {
		const mapped: ToolContent[] = [];
		for (const entry of content) {
			if (entry.type === "content" && entry.content?.type === "text") {
				mapped.push({ type: "text", text: entry.content.text ?? "" });
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
		return mapped;
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
					label: option.name,
					...(option.category ? { category: option.category } : {}),
					...(typeof option.currentValue === "string"
						? { currentValue: option.currentValue }
						: {}),
					options: flattenSelectOptions(option.options ?? []),
				},
			];
		});
		const mode = this.configOptions.find(
			(option) => option.category === "mode",
		);
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
			["mode", modeId],
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
		const turnId = this.resolveTurnId();
		const targetItemId = parsed.data.toolCall?.toolCallId ?? null;
		const approvalId = `approval:${targetItemId ?? this.mintId()}`;
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			targetItemId,
			title: parsed.data.toolCall?.title ?? "Permission required",
			status: "pending",
			startedAtMs: this.nextStartMs(),
			options: parsed.data.options.map((option) => ({
				optionId: option.optionId,
				label: option.name,
				...(isApprovalOptionKind(option.kind) ? { kind: option.kind } : {}),
			})),
		};
		this.pendingApprovals.set(approvalId, {
			requestId: request.id,
			turnId,
			item,
		});
		this.emitItem(item, turnId);
		this.emitSession({ status: "awaiting_input" });
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
		if (this.disposed) return;
		this.stalePendingApprovals();
		for (const sessionId of [...this.subagents.keys()]) {
			this.finishSubagent(sessionId, "failed");
		}
		this.backgroundTasks.clear();
		this.emitNotice("error", `acp agent exited (code ${code ?? "null"})`);
		this.emitSession({ status: "dead" });
		this.queue.close();
	}

	private cancelPendingApprovals(turnId: string): void {
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			if (pending.turnId !== turnId) continue;
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

export function createAcpAdapter(options: AcpAdapterOptions): HarnessAdapter {
	return new AcpAdapter(options);
}

function flattenSelectOptions(
	entries: AcpConfigSelectOption[],
): SessionConfigOption["options"] {
	return entries.flatMap((entry) => {
		const leaves =
			entry.options ?? (entry.value ? [{ ...entry, value: entry.value }] : []);
		return leaves.map((leaf) => ({
			id: leaf.value,
			label: leaf.name,
			...(leaf.description ? { description: leaf.description } : {}),
		}));
	});
}
