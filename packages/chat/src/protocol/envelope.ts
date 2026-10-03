import { z } from "zod";
import { cursorSchema } from "./cursor";
import { itemSchema } from "./items";

export const sessionStatusSchema = z.enum([
	"starting",
	"running",
	"awaiting_input",
	"idle",
	"not_loaded",
	"offline",
	"dead",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

const selectOptionSchema = z.looseObject({
	id: z.string().min(1),
	label: z.string(),
});

export const sessionConfigOptionSchema = z.looseObject({
	id: z.string().min(1),
	label: z.string(),
	category: z.string().optional(),
	currentValue: z.string().optional(),
	options: z.array(
		z.looseObject({
			id: z.string().min(1),
			label: z.string(),
			description: z.string().optional(),
		}),
	),
});
export type SessionConfigOption = z.infer<typeof sessionConfigOptionSchema>;

/** A command the agent offers for this session, for the composer's `/` menu. */
export const availableCommandSchema = z.looseObject({
	name: z.string().min(1),
	description: z.string().optional(),
	hint: z.string().optional(),
});
export type AvailableCommand = z.infer<typeof availableCommandSchema>;

export const sessionStateSchema = z.looseObject({
	status: sessionStatusSchema,
	harness: z.string().min(1),
	title: z.string().optional(),
	modeId: z.string().optional(),
	modelId: z.string().optional(),
	availableModes: z.array(selectOptionSchema).optional(),
	availableModels: z.array(selectOptionSchema).optional(),
	availableCommands: z.array(availableCommandSchema).optional(),
	configOptions: z.array(sessionConfigOptionSchema).optional(),
	/**
	 * The agent-side session this chat is bound to. It is not always the id the
	 * caller asked to resume: a load that finds no transcript falls back to a new
	 * session, and the caller has to know which one it ended up on.
	 */
	harnessSessionId: z.string().optional(),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const turnSchema = z.looseObject({
	id: z.string().min(1),
	status: z.enum(["running", "completed", "failed", "interrupted"]),
	error: z.looseObject({ message: z.string() }).optional(),
	usage: z
		.looseObject({
			inputTokens: z.number().nonnegative(),
			cachedInputTokens: z.number().nonnegative(),
			outputTokens: z.number().nonnegative(),
			contextUsed: z.number().nonnegative().optional(),
			contextSize: z.number().nonnegative().optional(),
			costUsd: z.number().nonnegative().optional(),
		})
		.optional(),
	startedAtMs: z.number(),
	completedAtMs: z.number().optional(),
});
export type Turn = z.infer<typeof turnSchema>;
export type Usage = NonNullable<Turn["usage"]>;

export const durableEventSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("item"),
		item: itemSchema,
		turnId: z.string().min(1),
	}),
	z.looseObject({ type: z.literal("turn"), turn: turnSchema }),
	z.looseObject({ type: z.literal("session"), session: sessionStateSchema }),
]);
export type DurableEvent = z.infer<typeof durableEventSchema>;

export const deltaChannelSchema = z.enum(["text", "tool_input", "terminal"]);
export type DeltaChannel = z.infer<typeof deltaChannelSchema>;

export const deltaSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("text"),
		itemId: z.string().min(1),
		append: z.string(),
	}),
	z.looseObject({
		type: z.literal("tool_input"),
		itemId: z.string().min(1),
		append: z.string(),
	}),
	z.looseObject({
		type: z.literal("terminal"),
		itemId: z.string().min(1),
		append: z.string(),
	}),
]);
export type Delta = z.infer<typeof deltaSchema>;

export const RESET_REASONS = [
	"invalid_cursor",
	"epoch_changed",
	"journal_missing",
	"session_not_found",
] as const;

export const resetSchema = z.looseObject({
	reason: z.string().min(1),
});
export type Reset = z.infer<typeof resetSchema>;

const envelopeBaseFields = {
	v: z.literal(1),
	sessionId: z.string().min(1),
	ts: z.number(),
};

export const envelopeSchema = z.union([
	z.looseObject({
		...envelopeBaseFields,
		cursor: cursorSchema,
		event: durableEventSchema,
	}),
	z.looseObject({ ...envelopeBaseFields, delta: deltaSchema }),
	z.looseObject({ ...envelopeBaseFields, reset: resetSchema }),
]);
export type Envelope = z.infer<typeof envelopeSchema>;

export type DurableEnvelope = Extract<Envelope, { event: DurableEvent }>;
export type DeltaEnvelope = Extract<Envelope, { delta: Delta }>;
export type ResetEnvelope = Extract<Envelope, { reset: Reset }>;

export function isDurableEnvelope(
	envelope: Envelope,
): envelope is DurableEnvelope {
	return "event" in envelope;
}

export function isDeltaEnvelope(envelope: Envelope): envelope is DeltaEnvelope {
	return "delta" in envelope;
}

export function isResetEnvelope(envelope: Envelope): envelope is ResetEnvelope {
	return "reset" in envelope;
}
