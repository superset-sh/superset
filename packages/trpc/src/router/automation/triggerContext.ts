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
>;

/**
 * The prompt the agent runs opens with a machine-readable block describing
 * what fired it, then the automation's prompt verbatim. The block, not the
 * prompt, carries the event: users write "review the PR" and the agent finds
 * which PR here. Every run gets one; a schedule run's block says when it was
 * due.
 */
export function promptWithTriggerContext(
	prompt: string,
	context: TriggerRunContext,
	event: TriggerEvent | null,
	/** Cuts the event payload further until the whole prompt fits. */
	maxLength = Number.POSITIVE_INFINITY,
): string {
	let payloadChars = MAX_PAYLOAD_CHARS;
	let result = buildPrompt(prompt, context, event, payloadChars);
	while (result.length > maxLength && payloadChars > 0) {
		payloadChars = Math.max(0, payloadChars - (result.length - maxLength) - 64);
		result = buildPrompt(prompt, context, event, payloadChars);
	}
	return result;
}

interface TriggerRunContext {
	automationId: string;
	triggerId: string | null;
	scheduledFor: Date | null;
}

function buildPrompt(
	prompt: string,
	context: TriggerRunContext,
	event: TriggerEvent | null,
	payloadChars: number,
): string {
	const payload = event
		? boundedPayload(providerPayload(event), payloadChars)
		: null;
	const triggerContext = !event
		? { schedule: { scheduledFor: context.scheduledFor?.toISOString() } }
		: event.provider === "webhook"
			? { webhookPayload: payload?.value }
			: {
					[event.provider]: withoutNulls({
						eventType: event.eventType,
						title: event.title,
						url: event.url,
						actor: event.actorLogin,
						ref: event.ref,
						repositoryId: event.repositoryId,
						payload: payload?.value,
					}),
				};

	const info = {
		automationId: context.automationId,
		triggerId: context.triggerId,
		triggerContext,
		...(payload?.truncated ? { payloadTruncated: true } : {}),
	};

	return [
		"<automation_trigger_info>",
		JSON.stringify(info, null, 2),
		"</automation_trigger_info>",
		`<timestamp>${new Date().toUTCString()}</timestamp>`,
		"",
		prompt,
	].join("\n");
}

/** Null and undefined entries carry no information the agent can act on. */
function withoutNulls<T extends Record<string, unknown>>(record: T): T {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value != null),
	) as T;
}

/**
 * What of the provider's raw payload actually reaches the prompt. A webhook
 * body is the user's own data and passes verbatim (handled by the caller);
 * Slack's envelope is mostly transport plumbing — `blocks` restates `text`,
 * `authorizations`/`api_app_id`/`event_id` identify the delivery, not the
 * message — so only the fields an agent acts on survive. Other providers
 * store API objects that are already the content and pass through until each
 * gets the same treatment.
 */
function providerPayload(event: TriggerEvent): unknown {
	if (event.provider !== "slack") return event.payload;
	const envelope = event.payload as {
		event?: {
			type?: string;
			channel?: string;
			user?: string;
			text?: string;
			ts?: string;
			thread_ts?: string;
			reaction?: string;
			item?: unknown;
			team?: string;
		};
	} | null;
	const message = envelope?.event;
	if (!message) return event.payload;
	return withoutNulls({
		type: message.type,
		channel: message.channel,
		user: message.user,
		text: message.text,
		ts: message.ts,
		threadTs: message.thread_ts,
		reaction: message.reaction,
		item: message.item,
		team: message.team,
	});
}

function boundedPayload(
	payload: unknown,
	maxChars: number,
): {
	value: unknown;
	truncated: boolean;
} {
	const serialized = JSON.stringify(payload);
	if (serialized === undefined || serialized.length <= maxChars) {
		return { value: payload, truncated: false };
	}
	return {
		value: `${serialized.slice(0, maxChars)}…`,
		truncated: true,
	};
}
