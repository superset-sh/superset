import { db } from "@superset/db/client";
import {
	automationEvents,
	type SelectIntegrationConnection,
} from "@superset/db/schema";
import type { GmailMatchableEvent } from "@superset/shared/automation-matching";
import {
	type GmailMessage,
	getMessage,
	getProfile,
	googleConfigOf,
	headerValue,
	listAddedMessages,
	messageHasAttachment,
	parseAddresses,
	patchGmailState,
} from "@superset/trpc/integrations/google";
import { and, eq, inArray } from "drizzle-orm";
import {
	ingestAutomationEvent,
	type NormalizedDelivery,
} from "@/lib/automations/ingestAutomationEvent";

/** Labels that mean the message left this mailbox rather than arrived in it. */
const OUTGOING_LABELS = new Set(["SENT", "DRAFT"]);

export type MailboxSyncResult = {
	/** No history id to diff from yet, or the stored one was too old. */
	baseline: boolean;
	added: number;
	recorded: number;
	matched: number;
};

/**
 * Records every message that arrived since the stored history id.
 *
 * The push from Pub/Sub carries a history id too, but Google's guidance is to
 * ignore it and always continue from the last one processed, so a dropped
 * push costs nothing. A history id Gmail no longer holds (404) resets from
 * the profile; whatever arrived in the gap is not replayed.
 */
export async function syncMailbox(
	connection: SelectIntegrationConnection,
): Promise<MailboxSyncResult> {
	const state = googleConfigOf(connection.config).gmail;
	if (!state?.historyId) {
		const profile = await getProfile(connection.id);
		await patchGmailState(connection.id, { historyId: profile.historyId });
		return { baseline: true, added: 0, recorded: 0, matched: 0 };
	}

	const result = await listAddedMessages(connection.id, state.historyId);
	if (result.expired) {
		const profile = await getProfile(connection.id);
		await patchGmailState(connection.id, { historyId: profile.historyId });
		return { baseline: true, added: 0, recorded: 0, matched: 0 };
	}

	// Which of these were already recorded, so the fetch below is skipped for
	// them. Without this, a history walk that cannot finish inside the
	// function's time budget re-fetches every message on every push and the
	// checkpoint write at the bottom never runs — the cursor wedges at its old
	// value, each new email costs a full re-scan, and the re-scan only grows.
	// One indexed query makes a re-walk nearly free, so runs complete and the
	// cursor advances again.
	const known = new Set<string>();
	for (let i = 0; i < result.messages.length; i += 500) {
		const chunk = result.messages.slice(i, i + 500).map((m) => m.id);
		const rows = await db
			.select({ id: automationEvents.externalEventId })
			.from(automationEvents)
			.where(
				and(
					eq(automationEvents.integrationConnectionId, connection.id),
					eq(automationEvents.provider, "gmail"),
					inArray(automationEvents.externalEventId, chunk),
				),
			);
		for (const row of rows) known.add(row.id);
	}

	let recorded = 0;
	let matched = 0;
	for (const added of result.messages) {
		if (known.has(added.id)) continue;
		if (added.labelIds.some((label) => OUTGOING_LABELS.has(label))) continue;
		const message = await getMessage(connection.id, added.id);
		if (!message) continue;
		if ((message.labelIds ?? []).some((label) => OUTGOING_LABELS.has(label))) {
			continue;
		}
		const outcome = await ingestAutomationEvent(
			db,
			normalizeMessage(connection, message),
		);
		if (outcome.status === "duplicate") continue;
		recorded += 1;
		if (outcome.status === "dispatched") matched += outcome.matched;
	}

	await patchGmailState(connection.id, { historyId: result.historyId });
	return {
		baseline: false,
		added: result.messages.length,
		recorded,
		matched,
	};
}

/**
 * Headers and label ids are all a trigger filters on, and all that is stored:
 * the body stays in the mailbox.
 */
export function normalizeMessage(
	connection: SelectIntegrationConnection,
	message: GmailMessage,
): NormalizedDelivery {
	const from = headerValue(message, "From");
	const to = headerValue(message, "To");
	const cc = headerValue(message, "Cc");
	const subject = headerValue(message, "Subject");
	const fromAddress = parseAddresses(from)[0] ?? null;
	const matchable: GmailMatchableEvent = {
		provider: "gmail",
		eventType: "message.received",
		actorId: fromAddress,
		actorLogin: fromAddress,
		// The body stays in the mailbox; the subject is the filterable text.
		body: null,
		fromAddress,
		toAddresses: [...parseAddresses(to), ...parseAddresses(cc)],
		subject,
		labelIds: message.labelIds ?? [],
		hasAttachment: messageHasAttachment(message),
	};

	return {
		event: {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "gmail",
			eventType: "message.received",
			externalEventId: message.id,
			resourceKey: `gmail:${connection.id}:${message.threadId}`,
			title: subject ?? "(no subject)",
			url: `https://mail.google.com/mail/#all/${message.threadId}`,
			actorLogin: matchable.fromAddress,
			actorIsExternal: null,
			payload: {
				id: message.id,
				threadId: message.threadId,
				historyId: message.historyId ?? null,
				internalDate: message.internalDate ?? null,
				labelIds: matchable.labelIds,
				from,
				fromAddress: matchable.fromAddress,
				to,
				cc,
				toAddresses: matchable.toAddresses,
				subject,
				date: headerValue(message, "Date"),
				messageId: headerValue(message, "Message-ID"),
				hasAttachment: matchable.hasAttachment,
			},
		},
		// The connection is one member's mailbox, so only that member's
		// automations may match its messages.
		dispatch: { event: matchable, ownerUserId: connection.connectedByUserId },
	};
}
