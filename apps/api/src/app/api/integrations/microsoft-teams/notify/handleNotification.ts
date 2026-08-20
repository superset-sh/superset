import { db } from "@superset/db/client";
import {
	getChannel,
	getChannelMessage,
	getGraphAccessToken,
	graphClient,
} from "@superset/trpc/integrations/microsoft-teams";

import {
	type IngestOutcome,
	ingestAutomationEvent,
} from "@/lib/automations/ingestAutomationEvent";
import {
	normalizeChannelCreated,
	normalizeChannelMessage,
} from "./normalizeTeamsDelivery";
import {
	type AuthenticatedConnection,
	type ChangeNotification,
	parseTeamsResource,
} from "./notifications";

/**
 * Turns one authenticated change notification into an automation event.
 *
 * The notification says only what changed; the resource is fetched, then
 * recorded with the fetched payload and matched. The dedupe on the recorded
 * row is what makes a Graph redelivery a no-op.
 */
export async function handleNotification(
	connection: AuthenticatedConnection,
	notification: ChangeNotification,
): Promise<IngestOutcome> {
	if (notification.changeType !== "created") {
		return {
			status: "skipped",
			reason: `changeType ${notification.changeType}`,
		};
	}
	const resource = parseTeamsResource(notification.resource);
	if (!resource) {
		return { status: "skipped", reason: "unrecognised resource" };
	}
	const type = (notification.resourceData?.["@odata.type"] ?? "").toLowerCase();

	const accessToken = await getGraphAccessToken(connection.id);
	if (!accessToken) return { status: "skipped", reason: "no access token" };
	const graph = graphClient(accessToken);

	if (type.endsWith(".chatmessage") && resource.messageId) {
		const message = await getChannelMessage(
			graph,
			resource.teamId,
			resource.channelId,
			resource.messageId,
			resource.replyId,
		);
		return ingestAutomationEvent(
			db,
			normalizeChannelMessage(
				connection,
				{ ...resource, messageId: resource.messageId },
				message,
			),
		);
	}

	if (type.endsWith(".channel") && !resource.messageId) {
		const channel = await getChannel(
			graph,
			resource.teamId,
			resource.channelId,
		);
		return ingestAutomationEvent(
			db,
			normalizeChannelCreated(connection, resource, channel),
		);
	}

	return { status: "skipped", reason: `unhandled resource type ${type}` };
}
