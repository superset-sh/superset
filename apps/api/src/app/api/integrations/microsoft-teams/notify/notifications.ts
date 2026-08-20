import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

/**
 * What Graph POSTs to a notification URL, and how it is authenticated.
 *
 * Without resource data there is no signed token on a notification: the only
 * proof it came from Graph is the `clientState` the subscription was created
 * with, echoed back on every delivery. So a notification is looked up by
 * tenant, and its clientState compared to the connection's before anything
 * else is done with it.
 */

export const changeNotificationSchema = z.object({
	subscriptionId: z.string(),
	clientState: z.string().optional(),
	tenantId: z.string(),
	changeType: z.string(),
	resource: z.string(),
	resourceData: z
		.object({
			"@odata.type": z.string().optional(),
			"@odata.id": z.string().optional(),
			id: z.string().optional(),
		})
		.passthrough()
		.optional(),
	subscriptionExpirationDateTime: z.string().optional(),
});
export type ChangeNotification = z.infer<typeof changeNotificationSchema>;

export const lifecycleNotificationSchema = z.object({
	subscriptionId: z.string(),
	clientState: z.string().optional(),
	tenantId: z.string(),
	lifecycleEvent: z.string(),
	subscriptionExpirationDateTime: z.string().optional(),
});
export type LifecycleNotification = z.infer<typeof lifecycleNotificationSchema>;

export function collectionSchema<T extends z.ZodTypeAny>(item: T) {
	return z.object({ value: z.array(item) });
}

/**
 * Graph validates a notification URL by POSTing `?validationToken=` and
 * expecting the token back as text/plain within 10 seconds. It does this on
 * subscription create and again on renew, so both routes answer it.
 */
export function validationResponse(request: Request): Response | null {
	const token = new URL(request.url).searchParams.get("validationToken");
	if (token === null) return null;
	return new Response(token, {
		status: 200,
		headers: { "Content-Type": "text/plain" },
	});
}

function equalClientState(expected: string, provided: string | undefined) {
	if (provided === undefined) return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(provided);
	return a.length === b.length && timingSafeEqual(a, b);
}

export type AuthenticatedConnection = {
	id: string;
	organizationId: string;
	tenantId: string;
	clientState: string;
	subscriptions: Record<string, { id: string; expiresAt: string } | undefined>;
};

/** An active Teams connection by id, in the shape the handlers take. */
export async function loadConnection(
	connectionId: string,
): Promise<AuthenticatedConnection | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, connectionId),
			eq(integrationConnections.provider, "microsoft_teams"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: {
			id: true,
			organizationId: true,
			externalOrgId: true,
			config: true,
		},
	});
	if (
		!connection ||
		!connection.externalOrgId ||
		connection.config?.provider !== "microsoft_teams"
	) {
		return null;
	}
	return {
		id: connection.id,
		organizationId: connection.organizationId,
		tenantId: connection.externalOrgId,
		clientState: connection.config.clientState,
		subscriptions: connection.config.subscriptions,
	};
}

/**
 * The connection a notification belongs to, or a reason it was refused. Refused
 * notifications are still acknowledged to Graph — a 4xx would only make it
 * retry something that will never verify.
 */
export async function authenticateNotification(notification: {
	tenantId: string;
	clientState?: string;
}): Promise<
	| { ok: true; connection: AuthenticatedConnection }
	| { ok: false; reason: string }
> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "microsoft_teams"),
			eq(integrationConnections.externalOrgId, notification.tenantId),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: {
			id: true,
			organizationId: true,
			externalOrgId: true,
			config: true,
		},
	});
	if (!connection || connection.config?.provider !== "microsoft_teams") {
		return { ok: false, reason: "unknown tenant" };
	}
	if (
		!equalClientState(connection.config.clientState, notification.clientState)
	) {
		return { ok: false, reason: "clientState mismatch" };
	}
	return {
		ok: true,
		connection: {
			id: connection.id,
			organizationId: connection.organizationId,
			tenantId: notification.tenantId,
			clientState: connection.config.clientState,
			subscriptions: connection.config.subscriptions,
		},
	};
}

/**
 * The ids inside a Teams resource path:
 * `teams('{team}')/channels('{channel}')[/messages('{message}')[/replies('{reply}')]]`.
 */
export function parseTeamsResource(resource: string): {
	teamId: string;
	channelId: string;
	messageId?: string;
	replyId?: string;
} | null {
	const match =
		/^teams\('([^']+)'\)\/channels\('([^']+)'\)(?:\/messages\('([^']+)'\)(?:\/replies\('([^']+)'\))?)?$/.exec(
			resource,
		);
	if (!match) return null;
	const [, teamId, channelId, messageId, replyId] = match;
	if (!teamId || !channelId) return null;
	return { teamId, channelId, messageId, replyId };
}
