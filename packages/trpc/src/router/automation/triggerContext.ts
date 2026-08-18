import type { SelectAutomationEvent } from "@superset/db/schema";

/**
 * Keeps a provider payload from swamping the prompt. Teams and Notion store
 * whole API objects; GitHub payloads run to tens of kilobytes.
 */
const MAX_PAYLOAD_CHARS = 24_000;

type TriggerEvent = Pick<
	SelectAutomationEvent,
	| "provider"
	| "eventType"
	| "title"
	| "url"
	| "actorLogin"
	| "ref"
	| "repositoryId"
	| "payload"
	| "receivedAt"
>;

/**
 * The prompt the agent runs is the automation's prompt verbatim, followed by a
 * machine-readable block describing what fired it. The block, not the prompt,
 * carries the event: users write "review the PR" and the agent finds which PR
 * here. Schedule runs have no event and get the prompt alone.
 */
export function promptWithTriggerContext(
	prompt: string,
	context: { automationId: string; triggerId: string | null },
	event: TriggerEvent | null,
): string {
	if (!event) return prompt;

	const payload = boundedPayload(event.payload);
	const triggerContext =
		event.provider === "webhook"
			? { webhookPayload: payload.value }
			: {
					[event.provider]: {
						eventType: event.eventType,
						title: event.title,
						url: event.url,
						actor: event.actorLogin,
						ref: event.ref,
						repositoryId: event.repositoryId,
						payload: payload.value,
					},
				};

	const info = {
		automationId: context.automationId,
		triggerId: context.triggerId,
		receivedAt: event.receivedAt.toISOString(),
		triggerContext,
		...(payload.truncated ? { payloadTruncated: true } : {}),
	};

	return [
		prompt,
		"",
		"<automation_trigger_info>",
		JSON.stringify(info, null, 2),
		"</automation_trigger_info>",
		`<timestamp>${new Date().toUTCString()}</timestamp>`,
	].join("\n");
}

function boundedPayload(payload: unknown): {
	value: unknown;
	truncated: boolean;
} {
	const serialized = JSON.stringify(payload);
	if (serialized === undefined || serialized.length <= MAX_PAYLOAD_CHARS) {
		return { value: payload, truncated: false };
	}
	return {
		value: `${serialized.slice(0, MAX_PAYLOAD_CHARS)}…`,
		truncated: true,
	};
}
