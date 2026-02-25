import type {
	ActiveSubagentState,
	ActiveToolState,
	MastraDisplayStateContract,
	ModifiedFileState,
	PendingApprovalState,
	PendingPlanApprovalState,
	PendingQuestionState,
	TaskState,
} from "../types";
import type {
	MastraChatEventEnvelope,
	MastraChatEventRow,
	MastraChatMessage,
} from "./types";

export interface MastraDisplayStateSnapshot {
	isRunning: boolean;
	currentMessage: MastraChatMessage | null;
	tokenUsage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	activeTools: Record<string, ActiveToolState>;
	toolInputBuffers: Record<string, { text: string; toolName: string }>;
	pendingApproval: PendingApprovalState | null;
	pendingQuestion: PendingQuestionState | null;
	pendingPlanApproval: PendingPlanApprovalState | null;
	activeSubagents: Record<string, ActiveSubagentState>;
	omProgress: MastraDisplayStateContract["omProgress"];
	bufferingMessages: boolean;
	bufferingObservations: boolean;
	modifiedFiles: Record<
		string,
		{ operations: string[]; firstModified: string }
	>;
	tasks: TaskState[];
	previousTasks: TaskState[];
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function extractPayloadType(payload: unknown): string | undefined {
	return asString(asObject(payload)?.type);
}

function defaultOMProgressState(): MastraDisplayStateContract["omProgress"] {
	return {
		status: "idle",
		pendingTokens: 0,
		threshold: 30_000,
		thresholdPercent: 0,
		observationTokens: 0,
		reflectionThreshold: 40_000,
		reflectionThresholdPercent: 0,
		buffered: {
			observations: {
				status: "idle",
				chunks: 0,
				messageTokens: 0,
				projectedMessageRemoval: 0,
				observationTokens: 0,
			},
			reflection: {
				status: "idle",
				inputObservationTokens: 0,
				observationTokens: 0,
			},
		},
		generationCount: 0,
		stepNumber: 0,
	};
}

function defaultDisplayState(): MastraDisplayStateContract {
	return {
		isRunning: false,
		currentMessage: null,
		tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		activeTools: new Map<string, ActiveToolState>(),
		toolInputBuffers: new Map<string, { text: string; toolName: string }>(),
		pendingApproval: null,
		pendingQuestion: null,
		pendingPlanApproval: null,
		activeSubagents: new Map<string, ActiveSubagentState>(),
		omProgress: defaultOMProgressState(),
		bufferingMessages: false,
		bufferingObservations: false,
		modifiedFiles: new Map<string, ModifiedFileState>(),
		tasks: [],
		previousTasks: [],
	};
}

function extractMessageText(message: Record<string, unknown>): string {
	const content = message.content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		const obj = asObject(part);
		if (!obj) continue;
		const type = asString(obj.type);
		if (type === "text") {
			parts.push(asString(obj.text) ?? "");
		}
	}
	return parts.join("");
}

function parseMessage(
	messageValue: unknown,
	fallbackTimestamp: string,
): MastraChatMessage | null {
	const message = asObject(messageValue);
	if (!message) return null;

	const id = asString(message.id);
	const role = asString(message.role);
	const createdAt = asString(message.createdAt) ?? fallbackTimestamp;
	if (!id) return null;
	if (role !== "assistant" && role !== "user" && role !== "system") return null;

	return {
		id,
		role,
		text: extractMessageText(message),
		createdAt,
		status: asString(message.stopReason) ? "complete" : "streaming",
		source: "harness",
	};
}

function parseTaskList(value: unknown): TaskState[] {
	if (!Array.isArray(value)) return [];
	const tasks: TaskState[] = [];
	for (const item of value) {
		const obj = asObject(item);
		if (!obj) continue;
		const content = asString(obj.content);
		const status = asString(obj.status);
		const activeForm = asString(obj.activeForm);
		if (!content || !activeForm) continue;
		if (
			status !== "pending" &&
			status !== "in_progress" &&
			status !== "completed"
		) {
			continue;
		}
		tasks.push({ content, status, activeForm });
	}
	return tasks;
}

function safeStringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function tryParseJsonObject(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function isValidEventRow(value: unknown): value is MastraChatEventRow {
	const row = asObject(value);
	if (!row) return false;
	if (asString(row.id) === undefined) return false;
	if (asString(row.timestamp) === undefined) return false;
	if (asString(row.sessionId) === undefined) return false;
	if (row.kind !== "submit" && row.kind !== "harness") return false;
	const sequenceHint = asNumber(row.sequenceHint);
	if (
		sequenceHint === undefined ||
		!Number.isInteger(sequenceHint) ||
		sequenceHint < 0
	) {
		return false;
	}
	return true;
}

function getOrCreateTool(
	state: MastraDisplayStateContract,
	toolCallId: string,
	toolName?: string,
): ActiveToolState {
	const existing = state.activeTools.get(toolCallId);
	if (existing) {
		if (toolName && existing.name !== toolName) {
			existing.name = toolName;
		}
		return existing;
	}
	const created: ActiveToolState = {
		name: toolName ?? "unknown_tool",
		args: {},
		status: "running",
	};
	state.activeTools.set(toolCallId, created);
	return created;
}

export function materializeMastraDisplayState(
	events: ReadonlyArray<MastraChatEventEnvelope>,
): MastraDisplayStateContract {
	const state = defaultDisplayState();
	let sessionId: string | null = null;

	for (const event of events) {
		if (sessionId === null) {
			sessionId = event.sessionId;
		}
		if (event.sessionId !== sessionId) {
			continue;
		}

		const payloadType = extractPayloadType(event.payload);
		const payload = asObject(event.payload);
		if (!payloadType || !payload) continue;

		if (event.kind === "submit") {
			if (payloadType === "approval_submitted") {
				state.pendingApproval = null;
			}
			if (payloadType === "question_submitted") {
				state.pendingQuestion = null;
			}
			if (payloadType === "plan_submitted") {
				state.pendingPlanApproval = null;
			}
			continue;
		}

		switch (payloadType) {
			case "agent_start":
				state.isRunning = true;
				break;
			case "agent_end":
				state.isRunning = false;
				state.currentMessage = null;
				break;
			case "message_start":
			case "message_update": {
				const message = parseMessage(payload.message, event.timestamp);
				if (message?.role === "assistant") {
					state.currentMessage = {
						...message,
						status: "streaming",
					};
				}
				break;
			}
			case "message_end": {
				const message = parseMessage(payload.message, event.timestamp);
				if (message?.role === "assistant") {
					state.currentMessage = null;
				}
				break;
			}
			case "usage_update": {
				const usage = asObject(payload.usage);
				if (!usage) break;
				state.tokenUsage.promptTokens += asNumber(usage.promptTokens) ?? 0;
				state.tokenUsage.completionTokens +=
					asNumber(usage.completionTokens) ?? 0;
				state.tokenUsage.totalTokens += asNumber(usage.totalTokens) ?? 0;
				break;
			}
			case "tool_approval_required":
				state.pendingApproval = {
					toolCallId: asString(payload.toolCallId) ?? "",
					toolName: asString(payload.toolName) ?? "unknown_tool",
					args: payload.args ?? {},
				};
				break;
			case "tool_input_start": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const toolName = asString(payload.toolName) ?? "unknown_tool";
				state.toolInputBuffers.set(toolCallId, { text: "", toolName });
				const tool = getOrCreateTool(state, toolCallId, toolName);
				tool.status = "streaming_input";
				break;
			}
			case "tool_input_delta": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const argsTextDelta = asString(payload.argsTextDelta) ?? "";
				const existing = state.toolInputBuffers.get(toolCallId) ?? {
					text: "",
					toolName: "unknown_tool",
				};
				const nextText = existing.text + argsTextDelta;
				state.toolInputBuffers.set(toolCallId, {
					text: nextText,
					toolName: existing.toolName,
				});
				const parsed = tryParseJsonObject(nextText);
				const tool = getOrCreateTool(state, toolCallId, existing.toolName);
				tool.status = "streaming_input";
				if (parsed !== undefined) {
					tool.args = parsed;
				}
				break;
			}
			case "tool_input_end": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				state.toolInputBuffers.delete(toolCallId);
				const tool = state.activeTools.get(toolCallId);
				if (tool) {
					tool.status = "running";
				}
				break;
			}
			case "tool_start": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const tool = getOrCreateTool(
					state,
					toolCallId,
					asString(payload.toolName) ?? undefined,
				);
				tool.args = payload.args ?? {};
				tool.status = "running";
				break;
			}
			case "tool_update": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const tool = getOrCreateTool(state, toolCallId);
				tool.partialResult = safeStringify(payload.partialResult);
				break;
			}
			case "shell_output": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const tool = getOrCreateTool(state, toolCallId);
				const output = asString(payload.output) ?? "";
				tool.shellOutput = `${tool.shellOutput ?? ""}${output}`;
				break;
			}
			case "tool_end": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const tool = state.activeTools.get(toolCallId);
				if (tool) {
					tool.result = payload.result;
					tool.isError = asBoolean(payload.isError) ?? false;
					tool.status = tool.isError ? "error" : "completed";
				}
				state.activeTools.delete(toolCallId);
				state.toolInputBuffers.delete(toolCallId);
				break;
			}
			case "ask_question":
				state.pendingQuestion = {
					questionId: asString(payload.questionId) ?? "",
					question: asString(payload.question) ?? "",
					options: Array.isArray(payload.options)
						? payload.options
								.map((option) => {
									const opt = asObject(option);
									if (!opt) return null;
									const label = asString(opt.label);
									if (!label) return null;
									return {
										label,
										description: asString(opt.description),
									};
								})
								.filter((option): option is NonNullable<typeof option> =>
									Boolean(option),
								)
						: undefined,
				};
				break;
			case "plan_approval_required":
				state.pendingPlanApproval = {
					planId: asString(payload.planId) ?? "",
					title: asString(payload.title),
					plan: asString(payload.plan) ?? "",
				};
				break;
			case "plan_approved":
				state.pendingPlanApproval = null;
				break;
			case "subagent_start": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				state.activeSubagents.set(toolCallId, {
					agentType: asString(payload.agentType) ?? "unknown",
					task: asString(payload.task) ?? "",
					modelId: asString(payload.modelId),
					toolCalls: [],
					textDelta: "",
					status: "running",
				});
				break;
			}
			case "subagent_text_delta": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const existing = state.activeSubagents.get(toolCallId);
				if (!existing) break;
				existing.textDelta = `${existing.textDelta}${asString(payload.textDelta) ?? ""}`;
				break;
			}
			case "subagent_tool_start": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const existing = state.activeSubagents.get(toolCallId);
				if (!existing) break;
				existing.toolCalls.push({
					name: asString(payload.subToolName) ?? "unknown",
					isError: false,
				});
				break;
			}
			case "subagent_tool_end": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				const existing = state.activeSubagents.get(toolCallId);
				if (!existing) break;
				const targetName = asString(payload.subToolName) ?? "unknown";
				const target = [...existing.toolCalls]
					.reverse()
					.find((tool) => tool.name === targetName);
				if (target) {
					target.isError = asBoolean(payload.isError) ?? false;
				}
				break;
			}
			case "subagent_end": {
				const toolCallId = asString(payload.toolCallId);
				if (!toolCallId) break;
				state.activeSubagents.delete(toolCallId);
				break;
			}
			case "task_updated": {
				state.previousTasks = [...state.tasks];
				state.tasks = parseTaskList(payload.tasks);
				break;
			}
			case "om_status": {
				const windows = asObject(payload.windows);
				const active = asObject(windows?.active);
				const activeMessages = asObject(active?.messages);
				const activeObservations = asObject(active?.observations);
				const buffered = asObject(windows?.buffered);
				const bufferedObservations = asObject(buffered?.observations);
				const bufferedReflection = asObject(buffered?.reflection);

				const pendingTokens = asNumber(activeMessages?.tokens) ?? 0;
				const threshold = asNumber(activeMessages?.threshold) ?? 0;
				const observationTokens = asNumber(activeObservations?.tokens) ?? 0;
				const reflectionThreshold =
					asNumber(activeObservations?.threshold) ?? 0;
				state.omProgress.pendingTokens = pendingTokens;
				state.omProgress.threshold = threshold;
				state.omProgress.thresholdPercent =
					threshold > 0 ? (pendingTokens / threshold) * 100 : 0;
				state.omProgress.observationTokens = observationTokens;
				state.omProgress.reflectionThreshold = reflectionThreshold;
				state.omProgress.reflectionThresholdPercent =
					reflectionThreshold > 0
						? (observationTokens / reflectionThreshold) * 100
						: 0;
				state.omProgress.buffered = {
					observations: {
						status:
							asString(bufferedObservations?.status) === "running" ||
							asString(bufferedObservations?.status) === "complete"
								? (asString(bufferedObservations?.status) as
										| "running"
										| "complete")
								: "idle",
						chunks: asNumber(bufferedObservations?.chunks) ?? 0,
						messageTokens: asNumber(bufferedObservations?.messageTokens) ?? 0,
						projectedMessageRemoval:
							asNumber(bufferedObservations?.projectedMessageRemoval) ?? 0,
						observationTokens:
							asNumber(bufferedObservations?.observationTokens) ?? 0,
					},
					reflection: {
						status:
							asString(bufferedReflection?.status) === "running" ||
							asString(bufferedReflection?.status) === "complete"
								? (asString(bufferedReflection?.status) as
										| "running"
										| "complete")
								: "idle",
						inputObservationTokens:
							asNumber(bufferedReflection?.inputObservationTokens) ?? 0,
						observationTokens:
							asNumber(bufferedReflection?.observationTokens) ?? 0,
					},
				};
				state.omProgress.generationCount =
					asNumber(payload.generationCount) ?? 0;
				state.omProgress.stepNumber = asNumber(payload.stepNumber) ?? 0;
				state.bufferingMessages =
					state.omProgress.buffered.observations.status === "running";
				state.bufferingObservations =
					state.omProgress.buffered.reflection.status === "running";
				break;
			}
			case "om_observation_start":
				state.omProgress.status = "observing";
				state.omProgress.cycleId = asString(payload.cycleId);
				break;
			case "om_observation_end":
				state.omProgress.status = "idle";
				state.omProgress.cycleId = undefined;
				state.omProgress.observationTokens =
					asNumber(payload.observationTokens) ??
					state.omProgress.observationTokens;
				state.omProgress.pendingTokens = 0;
				state.omProgress.thresholdPercent = 0;
				break;
			case "om_observation_failed":
				state.omProgress.status = "idle";
				state.omProgress.cycleId = undefined;
				break;
			case "om_reflection_start": {
				state.omProgress.status = "reflecting";
				state.omProgress.cycleId = asString(payload.cycleId);
				const tokensToReflect = asNumber(payload.tokensToReflect) ?? 0;
				state.omProgress.observationTokens = tokensToReflect;
				state.omProgress.reflectionThresholdPercent =
					state.omProgress.reflectionThreshold > 0
						? (tokensToReflect / state.omProgress.reflectionThreshold) * 100
						: 0;
				break;
			}
			case "om_reflection_end": {
				state.omProgress.status = "idle";
				state.omProgress.cycleId = undefined;
				const compressedTokens = asNumber(payload.compressedTokens) ?? 0;
				state.omProgress.observationTokens = compressedTokens;
				state.omProgress.reflectionThresholdPercent =
					state.omProgress.reflectionThreshold > 0
						? (compressedTokens / state.omProgress.reflectionThreshold) * 100
						: 0;
				break;
			}
			case "om_reflection_failed":
				state.omProgress.status = "idle";
				state.omProgress.cycleId = undefined;
				break;
			case "om_buffering_start":
				if (asString(payload.operationType) === "observation") {
					state.bufferingMessages = true;
				} else {
					state.bufferingObservations = true;
				}
				break;
			case "om_buffering_end":
			case "om_buffering_failed":
			case "om_activation":
				if (asString(payload.operationType) === "observation") {
					state.bufferingMessages = false;
				} else {
					state.bufferingObservations = false;
				}
				break;
		}
	}

	return state;
}

export function materializeMastraDisplayStateFromRows(
	rows: ReadonlyArray<MastraChatEventRow>,
): MastraDisplayStateContract {
	const events = [...rows]
		.filter(isValidEventRow)
		.sort((a, b) => {
			const byTime = a.timestamp.localeCompare(b.timestamp);
			if (byTime !== 0) return byTime;
			const bySequence = a.sequenceHint - b.sequenceHint;
			if (bySequence !== 0) return bySequence;
			return a.id.localeCompare(b.id);
		})
		.map(({ id: _id, ...event }) => event);
	return materializeMastraDisplayState(events);
}

export function serializeMastraDisplayState(
	state: MastraDisplayStateContract,
): MastraDisplayStateSnapshot {
	return {
		isRunning: state.isRunning,
		currentMessage: state.currentMessage,
		tokenUsage: state.tokenUsage,
		activeTools: Object.fromEntries(state.activeTools.entries()),
		toolInputBuffers: Object.fromEntries(state.toolInputBuffers.entries()),
		pendingApproval: state.pendingApproval,
		pendingQuestion: state.pendingQuestion,
		pendingPlanApproval: state.pendingPlanApproval,
		activeSubagents: Object.fromEntries(state.activeSubagents.entries()),
		omProgress: state.omProgress,
		bufferingMessages: state.bufferingMessages,
		bufferingObservations: state.bufferingObservations,
		modifiedFiles: Object.fromEntries(
			[...state.modifiedFiles.entries()].map(([filePath, value]) => [
				filePath,
				{
					operations: value.operations,
					firstModified: value.firstModified.toISOString(),
				},
			]),
		),
		tasks: state.tasks,
		previousTasks: state.previousTasks,
	};
}
