import { createHmac } from "node:crypto";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	members,
	usersSlackUsers,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { env } from "@/env";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const token = url.searchParams.get("token");
	const sig = url.searchParams.get("sig");

	if (!token || !sig) {
		return new Response("Missing token or signature", { status: 400 });
	}

	let payload: { slackUserId: string; teamId: string; exp: number };
	try {
		const decoded = Buffer.from(token, "base64url").toString("utf-8");
		const expectedSig = createHmac("sha256", env.SLACK_SIGNING_SECRET)
			.update(decoded)
			.digest("hex");

		if (sig !== expectedSig) {
			return new Response("Invalid signature", { status: 401 });
		}

		payload = JSON.parse(decoded);

		if (Date.now() > payload.exp) {
			return new Response(
				"Link expired. Please try again from the Slack Home tab.",
				{ status: 410 },
			);
		}
	} catch {
		return new Response("Invalid token", { status: 400 });
	}

	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		// Redirect to login, then back here
		const returnUrl = encodeURIComponent(request.url);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/sign-in?redirect=${returnUrl}`,
		);
	}

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "slack"),
			eq(integrationConnections.externalOrgId, payload.teamId),
		),
	});

	if (!connection) {
		return new Response(
			"Slack workspace not connected to any Superset organization.",
			{ status: 404 },
		);
	}

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, connection.organizationId),
			eq(members.userId, session.user.id),
		),
	});

	if (!membership) {
		return new Response(
			"You are not a member of the organization connected to this Slack workspace.",
			{ status: 403 },
		);
	}

	await db
		.insert(usersSlackUsers)
		.values({
			slackUserId: payload.slackUserId,
			teamId: payload.teamId,
			userId: session.user.id,
			organizationId: connection.organizationId,
		})
		.onConflictDoUpdate({
			target: [usersSlackUsers.slackUserId, usersSlackUsers.teamId],
			set: {
				userId: session.user.id,
				organizationId: connection.organizationId,
			},
		});

	return Response.redirect(
		`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack/linked`,
	);
}
