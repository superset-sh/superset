import { db } from "@superset/db/client";
import { userIdentities, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * The Superset user behind a Slack user, and their Slack-specific settings.
 *
 * Replaces `users__slack_users`, which was one table per provider. A Slack user
 * id is only unique within a workspace, so the team id is the identity's scope
 * rather than part of the id.
 */
export async function findSlackUserLink(params: {
	organizationId: string;
	slackUserId: string;
	teamId: string;
}): Promise<
	| {
			userId: string;
			modelPreference?: string;
			user: { name: string; email: string };
	  }
	| undefined
> {
	const [row] = await db
		.select({
			userId: userIdentities.userId,
			metadata: userIdentities.metadata,
			name: users.name,
			email: users.email,
		})
		.from(userIdentities)
		.innerJoin(users, eq(users.id, userIdentities.userId))
		.where(
			and(
				// Scoped: the unique constraint includes the organization, so a
				// Slack user id and team alone no longer identify one row.
				eq(userIdentities.organizationId, params.organizationId),
				eq(userIdentities.provider, "slack"),
				eq(userIdentities.externalId, params.slackUserId),
				eq(userIdentities.externalScopeId, params.teamId),
			),
		)
		.limit(1);

	if (!row) return undefined;

	return {
		userId: row.userId,
		modelPreference:
			row.metadata?.provider === "slack"
				? row.metadata.modelPreference
				: undefined,
		user: { name: row.name, email: row.email },
	};
}
