import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { type GitLabConfig, integrationConnections } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { Client } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";
import { SsrfError } from "@/lib/gitlab/ssrf";
import { GitLabClient } from "../client";
import { GITLAB_DEFAULT_HOST } from "../oauth";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const bodySchema = z.object({
	organizationId: z.string().uuid(),
	groupId: z.string().min(1),
	token: z.string().min(1),
	host: z.string().min(1).default(GITLAB_DEFAULT_HOST),
});

/**
 * Connects a GitLab group via a pasted Group/Personal Access Token (the path for
 * self-managed / arbitrary hosts that skip the OAuth redirect). The host is
 * SSRF-validated and the token is verified against the group before persisting.
 */
export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}
	const { organizationId, groupId, token, host } = parsed.data;

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	try {
		// GitLabClient.create SSRF-validates the host. Verify the token can read
		// the group (and is a valid token) before we store anything.
		const client = await GitLabClient.create(host, token);
		await client.getCurrentUser();
		const group = await client.getGroup(groupId);

		const config: GitLabConfig = {
			provider: "gitlab",
			host,
			authMode: "token",
			groupPath: group.full_path,
		};

		const [connection] = await db
			.insert(integrationConnections)
			.values({
				organizationId,
				connectedByUserId: session.user.id,
				provider: "gitlab",
				accessToken: token,
				externalOrgId: String(group.id),
				externalOrgName: group.name,
				config,
			})
			.onConflictDoUpdate({
				target: [
					integrationConnections.organizationId,
					integrationConnections.provider,
				],
				set: {
					connectedByUserId: session.user.id,
					accessToken: token,
					refreshToken: null,
					tokenExpiresAt: null,
					externalOrgId: String(group.id),
					externalOrgName: group.name,
					config,
					disconnectedAt: null,
					disconnectReason: null,
					updatedAt: new Date(),
				},
			})
			.returning();

		if (!connection) {
			return Response.json({ error: "Failed to save" }, { status: 500 });
		}

		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/jobs/initial-sync`,
			body: { connectionId: connection.id, organizationId },
			retries: 3,
		});

		return Response.json({ success: true, connectionId: connection.id });
	} catch (error) {
		if (error instanceof SsrfError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		console.error("[gitlab/connect] Failed:", error);
		return Response.json(
			{ error: "Failed to validate GitLab token/group" },
			{ status: 502 },
		);
	}
}
