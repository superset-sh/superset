import { WebClient } from "@slack/web-api";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import { activeConnection } from "../connections";

/**
 * Joins the bot to every channel a Slack trigger watches, so saving a trigger
 * is enough to make it fire. `conversations.join` only works for public
 * channels — private ones still need a human invite, which the editor's
 * membership warning covers — and needs the `channels:join` scope, which older
 * installs lack until re-consent. Every failure mode is somebody else's normal
 * (already a member, private channel, missing scope), so this never throws:
 * it runs after the trigger set is committed and can only improve on it.
 */
export async function joinSlackTriggerChannels(
	organizationId: string,
	triggers: DraftTrigger[],
): Promise<void> {
	const channelIds = new Set<string>();
	for (const trigger of triggers) {
		if (trigger.config.kind !== "slack") continue;
		const channels = trigger.config.channels;
		if (channels.mode !== "list") continue;
		for (const id of channels.ids) channelIds.add(id);
	}
	if (channelIds.size === 0) return;

	// The callers await this bare, right after their transaction commits — a
	// throw here would reject a mutation whose write already landed.
	let client: WebClient;
	try {
		const connection = await activeConnection(organizationId, "slack", {
			accessToken: true,
		});
		if (!connection) return;
		client = new WebClient(connection.accessToken, {
			timeout: 5_000,
			retryConfig: { retries: 0 },
		});
	} catch (error) {
		console.warn(
			"[slack/joinChannels] could not load the Slack connection:",
			error instanceof Error ? error.message : error,
		);
		return;
	}

	// Chunked, not all at once: Slack rate-limits conversations.join, and a
	// pasted-in channel list can be long.
	const ids = [...channelIds];
	for (let i = 0; i < ids.length; i += 5) {
		await Promise.all(
			ids.slice(i, i + 5).map(async (channel) => {
				try {
					await client.conversations.join({ channel });
				} catch (error) {
					console.warn(
						`[slack/joinChannels] could not join ${channel}:`,
						error instanceof Error ? error.message : error,
					);
				}
			}),
		);
	}
}
