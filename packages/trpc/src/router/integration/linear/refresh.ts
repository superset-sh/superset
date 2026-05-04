import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { REFRESH_BUFFER_MS, REFRESH_TOKEN_TIMEOUT_MS } from "./constants";
import { getLinearClient, markConnectionDisconnected } from "./utils";

export const linearTokenResponseSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
});

export type LinearTokenResponse = z.infer<typeof linearTokenResponseSchema>;

type RefreshResult =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

export async function refreshLinearToken(
	connectionId: string,
): Promise<RefreshResult> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				refreshToken: integrationConnections.refreshToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				disconnectedAt: integrationConnections.disconnectedAt,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);

		if (!connection?.refreshToken) return { disconnected: true };
		if (connection.disconnectedAt) return { disconnected: true };

		if (
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken: connection.accessToken };
		}

		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			REFRESH_TOKEN_TIMEOUT_MS,
		);
		let response: Response;
		try {
			response = await fetch("https://api.linear.app/oauth/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				signal: controller.signal,
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: connection.refreshToken,
					client_id: env.LINEAR_CLIENT_ID,
					client_secret: env.LINEAR_CLIENT_SECRET,
				}),
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as {
				error?: string;
			};
			if (body?.error === "invalid_grant") {
				await tx
					.update(integrationConnections)
					.set({
						disconnectedAt: new Date(),
						disconnectReason: "invalid_grant",
					})
					.where(eq(integrationConnections.id, connectionId));
				return { disconnected: true };
			}
			throw new Error(
				`Linear token refresh failed: ${response.status} ${response.statusText}`,
			);
		}

		const data = linearTokenResponseSchema.parse(await response.json());
		const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

		await tx
			.update(integrationConnections)
			.set({
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				tokenExpiresAt,
				disconnectedAt: null,
				disconnectReason: null,
			})
			.where(eq(integrationConnections.id, connectionId));

		return { disconnected: false, accessToken: data.access_token };
	});
}

export async function callLinear<T>(
	organizationId: string,
	fn: (client: LinearClient) => Promise<T>,
): Promise<T | null> {
	const client = await getLinearClient(organizationId);
	if (!client) return null;

	try {
		return await fn(client);
	} catch (error) {
		if (!isLinearAuthError(error)) throw error;

		const connection = await db.query.integrationConnections.findFirst({
			where: and(
				eq(integrationConnections.organizationId, organizationId),
				eq(integrationConnections.provider, "linear"),
			),
		});
		if (!connection) return null;
		if (!connection.refreshToken) {
			await markConnectionDisconnected(connection.id, "no_refresh_token");
			return null;
		}

		const result = await refreshLinearToken(connection.id);
		if (result.disconnected) return null;

		try {
			return await fn(new LinearClient({ accessToken: result.accessToken }));
		} catch (retryError) {
			if (isLinearAuthError(retryError)) return null;
			throw retryError;
		}
	}
}

export function isLinearAuthError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as {
		type?: string;
		errors?: Array<{ extensions?: { code?: string } }>;
		status?: number;
	};
	if (candidate.type === "AuthenticationError") return true;
	if (candidate.status === 401) return true;
	if (
		candidate.errors?.some(
			(item) => item.extensions?.code === "AUTHENTICATION_ERROR",
		)
	) {
		return true;
	}
	return false;
}
