import type { Client } from "@microsoft/microsoft-graph-client";
import type { Subscription } from "@microsoft/microsoft-graph-types";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	type MicrosoftTeamsConfig,
	type MicrosoftTeamsSubscription,
} from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";
import { env } from "../../../env";
import { GraphError, getGraphAccessToken, graphClient } from "./graph";

/**
 * Graph change-notification subscriptions for a Teams connection.
 *
 * Two per connection, both tenant-wide: every channel message and every
 * channel. Tenant-wide rather than per team so a trigger on a team created
 * after the connection still fires, and so there is one thing to renew.
 *
 * Subscriptions expire. Graph allows three days for these resources; they are
 * requested for two and renewed once they are within half a day, so a missed
 * cron tick costs nothing and a Graph outage has hours to recover in.
 */

const SUBSCRIPTION_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
export const RENEW_WITHIN_MS = 12 * 60 * 60 * 1000;

export type SubscriptionKey = keyof MicrosoftTeamsConfig["subscriptions"];

/**
 * `/teams/getAllMessages` with no `model` query parameter runs in Graph's
 * evaluation mode, capped at 500 messages per app per tenant per month. Going
 * past that means choosing a payment model (`?model=A` needs E5 licences,
 * `?model=B` bills per message to an Azure subscription), which is a
 * commercial decision rather than a code one — the resource is a constant so
 * that decision changes one line.
 */
export const TEAMS_SUBSCRIPTION_RESOURCES: Record<
	SubscriptionKey,
	{ resource: string; changeType: string }
> = {
	channelMessages: { resource: "/teams/getAllMessages", changeType: "created" },
	channels: { resource: "/teams/getAllChannels", changeType: "created" },
};

export function teamsNotificationUrls() {
	const base = `${env.NEXT_PUBLIC_API_URL}/api/integrations/microsoft-teams`;
	return {
		notificationUrl: `${base}/notify`,
		lifecycleNotificationUrl: `${base}/lifecycle`,
	};
}

function storedSubscription(
	subscription: Subscription,
): MicrosoftTeamsSubscription {
	if (!subscription.id || !subscription.expirationDateTime) {
		throw new Error("Graph subscription response carries no id or expiry");
	}
	return { id: subscription.id, expiresAt: subscription.expirationDateTime };
}

async function createSubscription(
	graph: Client,
	key: SubscriptionKey,
	clientState: string,
): Promise<MicrosoftTeamsSubscription> {
	const { resource, changeType } = TEAMS_SUBSCRIPTION_RESOURCES[key];
	const created: Subscription = await graph.api("/subscriptions").post({
		changeType,
		resource,
		...teamsNotificationUrls(),
		expirationDateTime: new Date(
			Date.now() + SUBSCRIPTION_LIFETIME_MS,
		).toISOString(),
		clientState,
		includeResourceData: false,
	});
	return storedSubscription(created);
}

async function renewSubscription(
	graph: Client,
	subscriptionId: string,
): Promise<MicrosoftTeamsSubscription> {
	const renewed: Subscription = await graph
		.api(`/subscriptions/${encodeURIComponent(subscriptionId)}`)
		.patch({
			expirationDateTime: new Date(
				Date.now() + SUBSCRIPTION_LIFETIME_MS,
			).toISOString(),
		});
	return storedSubscription(renewed);
}

export type EnsureResult = {
	connectionId: string;
	subscriptions: MicrosoftTeamsConfig["subscriptions"];
	/** Per subscription, why it could not be created or renewed. */
	failures: Partial<Record<SubscriptionKey, string>>;
};

/**
 * Creates what is missing and renews what is close to expiring, for one
 * connection. `force` renews regardless of the remaining time — what a
 * `reauthorizationRequired` lifecycle event asks for.
 *
 * Under the connection lock, because the cron, the consent callback and the
 * lifecycle route can all arrive at once and each would otherwise create its
 * own subscription and overwrite the others' ids.
 */
export async function ensureTeamsSubscriptions(
	connectionId: string,
	options: { force?: boolean; only?: SubscriptionKey[] } = {},
): Promise<EnsureResult | null> {
	const accessToken = await getGraphAccessToken(connectionId);
	if (!accessToken) return null;
	const graph = graphClient(accessToken);

	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({ config: integrationConnections.config })
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);
		const config = connection?.config;
		if (!config || config.provider !== "microsoft_teams") return null;

		const subscriptions = { ...config.subscriptions };
		const failures: EnsureResult["failures"] = {};
		const keys =
			options.only ??
			(Object.keys(TEAMS_SUBSCRIPTION_RESOURCES) as SubscriptionKey[]);

		for (const key of keys) {
			const existing = subscriptions[key];
			const remaining = existing
				? new Date(existing.expiresAt).getTime() - Date.now()
				: -1;
			if (existing && !options.force && remaining > RENEW_WITHIN_MS) continue;

			try {
				if (existing) {
					try {
						subscriptions[key] = await renewSubscription(graph, existing.id);
						continue;
					} catch (error) {
						// Graph forgot it — it expired, or the tenant removed it. A new
						// one is the only way forward.
						if (!(error instanceof GraphError && error.statusCode === 404)) {
							throw error;
						}
					}
				}
				subscriptions[key] = await createSubscription(
					graph,
					key,
					config.clientState,
				);
			} catch (error) {
				failures[key] =
					error instanceof Error ? error.message : "Unknown error";
			}
		}

		const next: MicrosoftTeamsConfig = { ...config, subscriptions };
		await tx
			.update(integrationConnections)
			.set({ config: next, updatedAt: new Date() })
			.where(eq(integrationConnections.id, connectionId));

		return { connectionId, subscriptions, failures };
	});
}

/** Removes the connection's subscriptions from Graph. Best effort: a missing
 * one is already gone, and a token failure means the tenant already revoked
 * the app, which takes its subscriptions with it. */
export async function deleteTeamsSubscriptions(
	connectionId: string,
): Promise<void> {
	const [connection] = await db
		.select({ config: integrationConnections.config })
		.from(integrationConnections)
		.where(eq(integrationConnections.id, connectionId))
		.limit(1);
	const config = connection?.config;
	if (!config || config.provider !== "microsoft_teams") return;

	let accessToken: string | null = null;
	try {
		accessToken = await getGraphAccessToken(connectionId);
	} catch {
		return;
	}
	if (!accessToken) return;
	const graph = graphClient(accessToken);

	await Promise.all(
		Object.values(config.subscriptions).map(async (subscription) => {
			try {
				await graph
					.api(`/subscriptions/${encodeURIComponent(subscription.id)}`)
					.delete();
			} catch (error) {
				if (error instanceof GraphError && error.statusCode === 404) return;
				console.error(
					"[microsoft-teams] failed to delete subscription",
					subscription.id,
					error,
				);
			}
		}),
	);
}
