/**
 * Pure derivations for the Phase 1 parity dev panel.
 *
 * Compares the new chat store slice for a session against the legacy
 * tRPC `listMessages` result and summarises counts + divergences so we
 * can spot adapter gaps during dogfooding.
 */

import type { Message, Part } from "@superset/chat/shared";

export interface StoreSlice {
	messages: Message[];
	parts: Record<string, Part[]>;
}

export interface LegacyLikeMessage {
	id: string;
	role: string;
	content: Array<{ type: string }>;
}

export interface ParitySummary {
	/** Total messages in the new store for this session. */
	newMessages: number;
	/** User / assistant split in the new store. */
	newUser: number;
	newAssistant: number;
	/** Total messages in legacy tRPC output. */
	legacyMessages: number;
	/** User / assistant split in legacy. */
	legacyUser: number;
	legacyAssistant: number;
	/** Total parts derived by the new store. */
	newParts: number;
	/** Total legacy content items across all messages. */
	legacyContent: number;
	/** Messages that appear in legacy but not in the new store (by id). */
	missingInNew: string[];
	/** Messages that appear in the new store but not in legacy (by id). */
	extraInNew: string[];
}

export function deriveParitySummary(input: {
	slice: StoreSlice | null;
	legacy: LegacyLikeMessage[] | null;
}): ParitySummary {
	const newMessages = input.slice?.messages ?? [];
	const legacyMessages = input.legacy ?? [];

	const newIds = new Set(newMessages.map((m) => m.id));
	const legacyIds = new Set(legacyMessages.map((m) => m.id));

	const missingInNew = legacyMessages
		.filter((m) => !newIds.has(m.id))
		.map((m) => m.id);
	const extraInNew = newMessages
		.filter((m) => !legacyIds.has(m.id))
		.map((m) => m.id);

	const newUser = newMessages.filter((m) => m.role === "user").length;
	const newAssistant = newMessages.filter((m) => m.role === "assistant").length;
	const legacyUser = legacyMessages.filter((m) => m.role === "user").length;
	const legacyAssistant = legacyMessages.filter(
		(m) => m.role === "assistant",
	).length;

	const newParts = Object.values(input.slice?.parts ?? {}).reduce(
		(sum, list) => sum + list.length,
		0,
	);
	const legacyContent = legacyMessages.reduce(
		(sum, m) => sum + m.content.length,
		0,
	);

	return {
		newMessages: newMessages.length,
		newUser,
		newAssistant,
		legacyMessages: legacyMessages.length,
		legacyUser,
		legacyAssistant,
		newParts,
		legacyContent,
		missingInNew,
		extraInNew,
	};
}

/** True if counts and id sets fully align. */
export function isInParity(summary: ParitySummary): boolean {
	return (
		summary.newMessages === summary.legacyMessages &&
		summary.missingInNew.length === 0 &&
		summary.extraInNew.length === 0
	);
}
