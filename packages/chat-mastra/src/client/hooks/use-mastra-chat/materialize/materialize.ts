import type {
	MastraChatError,
	MastraChatEventEnvelope,
	MastraChatEventRow,
	MastraChatMaterializedState,
	MastraChatMessage,
} from "./types";

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function extractPayloadType(payload: unknown): string | undefined {
	return asString(asObject(payload)?.type);
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

function ensureMessage(
	messages: MastraChatMessage[],
	messageIndexById: Map<string, number>,
	next: MastraChatMessage,
): void {
	const existingIndex = messageIndexById.get(next.id);
	if (existingIndex === undefined) {
		messageIndexById.set(next.id, messages.length);
		messages.push(next);
		return;
	}

	messages[existingIndex] = {
		...messages[existingIndex],
		...next,
	};
}

function createError(timestamp: string, payload: unknown): MastraChatError {
	const payloadObj = asObject(payload);
	const errorObj = asObject(payloadObj?.error);
	const message =
		asString(errorObj?.message) ??
		asString(payloadObj?.message) ??
		"Unknown Mastra error";

	return {
		timestamp,
		message,
		raw: payload,
	};
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

export function materializeMastraChatState(
	events: ReadonlyArray<MastraChatEventEnvelope>,
): MastraChatMaterializedState {
	const state: MastraChatMaterializedState = {
		sessionId: null,
		epoch: 0,
		sequenceResetCount: 0,
		isRunning: false,
		messages: [],
		controls: [],
		errors: [],
		auxiliaryEvents: [],
	};

	let lastSequenceHint: number | undefined;
	const messageIndexById = new Map<string, number>();

	for (const [index, event] of events.entries()) {
		const payloadType = extractPayloadType(event.payload);
		if (state.sessionId === null) {
			state.sessionId = event.sessionId;
		}
		if (state.sessionId !== null && event.sessionId !== state.sessionId) {
			continue;
		}

		if (
			typeof lastSequenceHint === "number" &&
			event.sequenceHint < lastSequenceHint
		) {
			state.sequenceResetCount += 1;
		}
		lastSequenceHint = event.sequenceHint;
		state.epoch = state.sequenceResetCount + 1;

		if (event.kind === "submit") {
			if (payloadType === "user_message_submitted") {
				const payloadObj = asObject(event.payload);
				const data = asObject(payloadObj?.data);
				const clientMessageId = asString(data?.clientMessageId);
				const messageId = clientMessageId ?? `user-${event.timestamp}-${index}`;
				const text = asString(data?.content) ?? "";

				ensureMessage(state.messages, messageIndexById, {
					id: messageId,
					role: "user",
					text,
					createdAt: event.timestamp,
					status: "complete",
					source: "submit",
				});
				continue;
			}

			if (payloadType === "control_submitted") {
				const payloadObj = asObject(event.payload);
				const data = asObject(payloadObj?.data);
				state.controls.push({
					action: asString(data?.action) ?? "unknown",
					submittedAt: event.timestamp,
					wasRunning: state.isRunning,
				});
				continue;
			}

			state.auxiliaryEvents.push({
				timestamp: event.timestamp,
				type: payloadType ?? "submit_unknown",
				raw: event.payload,
			});
			continue;
		}

		if (payloadType === "agent_start") {
			state.isRunning = true;
			continue;
		}

		if (payloadType === "agent_end") {
			const payloadObj = asObject(event.payload);
			state.isRunning = false;
			state.lastAgentEndReason = asString(payloadObj?.reason);
			continue;
		}

		if (
			payloadType === "message_start" ||
			payloadType === "message_update" ||
			payloadType === "message_end"
		) {
			const payloadObj = asObject(event.payload);
			const messageObj = asObject(payloadObj?.message);
			if (!messageObj) continue;

			const id =
				asString(messageObj.id) ?? `assistant-${event.timestamp}-${index}`;
			const role = asString(messageObj.role);
			const createdAt = asString(messageObj.createdAt) ?? event.timestamp;
			const status = payloadType === "message_end" ? "complete" : "streaming";

			ensureMessage(state.messages, messageIndexById, {
				id,
				role:
					role === "user" || role === "system" || role === "assistant"
						? role
						: "assistant",
				text: extractMessageText(messageObj),
				createdAt,
				status,
				source: "harness",
			});
			continue;
		}

		if (payloadType === "usage_update") {
			const payloadObj = asObject(event.payload);
			const usage = asObject(payloadObj?.usage);
			if (!usage) continue;
			state.usage = {
				promptTokens: asNumber(usage.promptTokens) ?? 0,
				completionTokens: asNumber(usage.completionTokens) ?? 0,
				totalTokens: asNumber(usage.totalTokens) ?? 0,
			};
			continue;
		}

		if (payloadType === "error") {
			state.errors.push(createError(event.timestamp, event.payload));
			continue;
		}

		state.auxiliaryEvents.push({
			timestamp: event.timestamp,
			type: payloadType ?? "harness_unknown",
			raw: event.payload,
		});
	}

	return state;
}

export function materializeMastraChatStateFromRows(
	rows: ReadonlyArray<MastraChatEventRow>,
): MastraChatMaterializedState {
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

	return materializeMastraChatState(events);
}
