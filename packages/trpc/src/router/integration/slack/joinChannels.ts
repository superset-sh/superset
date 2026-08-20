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

	const connection = await activeConnection(organizationId, "slack", {
		accessToken: true,
	});
	if (!connection) return;
	const client = new WebClient(connection.accessToken, {
		timeout: 5_000,
		retryConfig: { retries: 0 },
	});

	await Promise.all(
		[...channelIds].map(async (channel) => {
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
