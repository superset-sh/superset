import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "../../../env";

type Priority = "urgent" | "high" | "medium" | "low" | "none";
type LinearTokenResponse = {
	access_token?: string;
	error?: string;
	error_description?: string;
	expires_in?: number;
	refresh_token?: string;
};

const LINEAR_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export function mapPriorityToLinear(priority: Priority): number {
	switch (priority) {
		case "urgent":
			return 1;
		case "high":
			return 2;
		case "medium":
			return 3;
		case "low":
			return 4;
		default:
			return 0;
	}
}

export function mapPriorityFromLinear(linearPriority: number): Priority {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}

function needsLinearTokenRefresh(
	connection: Pick<SelectIntegrationConnection, "tokenExpiresAt">,
): boolean {
	if (!connection.tokenExpiresAt) {
		return false;
	}

	return (
		connection.tokenExpiresAt.getTime() <=
		Date.now() + LINEAR_TOKEN_REFRESH_SKEW_MS
	);
}

async function refreshLinearConnection(
	connection: SelectIntegrationConnection,
): Promise<SelectIntegrationConnection> {
	if (!connection.refreshToken) {
		throw new Error(
			"Linear connection expired and cannot be refreshed. Reconnect Linear.",
		);
	}

	const response = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: connection.refreshToken,
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
		}),
	});

	const tokenData = (await response.json()) as LinearTokenResponse;

	if (!response.ok || !tokenData.access_token) {
		throw new Error(
			tokenData.error_description ??
				tokenData.error ??
				`Failed to refresh Linear token (${response.status})`,
		);
	}

	const tokenExpiresAt = tokenData.expires_in
		? new Date(Date.now() + tokenData.expires_in * 1000)
		: null;

	const [updatedConnection] = await db
		.update(integrationConnections)
		.set({
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token ?? connection.refreshToken,
			tokenExpiresAt,
			updatedAt: new Date(),
		})
		.where(eq(integrationConnections.id, connection.id))
		.returning();

	if (!updatedConnection) {
		throw new Error("Failed to persist refreshed Linear token");
	}

	return updatedConnection;
}

export async function getLinearConnection(
	organizationId: string,
): Promise<SelectIntegrationConnection | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		return null;
	}

	if (!needsLinearTokenRefresh(connection)) {
		return connection;
	}

	return refreshLinearConnection(connection);
}

export async function getLinearClient(
	organizationId: string,
): Promise<LinearClient | null> {
	const connection = await getLinearConnection(organizationId);

	if (!connection) {
		return null;
	}

	return new LinearClient({ accessToken: connection.accessToken });
}
