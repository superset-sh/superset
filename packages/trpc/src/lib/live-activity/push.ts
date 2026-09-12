import { db } from "@superset/db/client";
import {
	v2AgentStatus,
	v2LiveActivityTokens,
	v2UsersHosts,
} from "@superset/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendLiveActivityPush } from "./apns";
import { buildCardContentState } from "./card";

/** The widget's `ActivityAttributes` type; push-to-start must name it. */
const ATTRIBUTES_TYPE = "AgentActivityAttributes";

async function usersWhoSeeHost(
	organizationId: string,
	machineId: string,
): Promise<string[]> {
	const rows = await db
		.select({ userId: v2UsersHosts.userId })
		.from(v2UsersHosts)
		.where(
			and(
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, machineId),
			),
		);
	return rows.map((row) => row.userId);
}

/** Every agent on every host the user can see in the organization. */
async function fleetForUser(organizationId: string, userId: string) {
	return db
		.select({
			terminalId: v2AgentStatus.terminalId,
			workspaceId: v2AgentStatus.workspaceId,
			workspaceName: v2AgentStatus.workspaceName,
			projectId: v2AgentStatus.projectId,
			projectName: v2AgentStatus.projectName,
			state: v2AgentStatus.state,
			sinceAt: v2AgentStatus.sinceAt,
		})
		.from(v2AgentStatus)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2AgentStatus.organizationId),
				eq(v2UsersHosts.hostId, v2AgentStatus.machineId),
			),
		)
		.where(
			and(
				eq(v2AgentStatus.organizationId, organizationId),
				eq(v2UsersHosts.userId, userId),
			),
		);
}

/**
 * Rewrite one user's card on every phone that registered for it. With a
 * fleet, running activities get an update and a phone with none gets a
 * push-to-start; with no fleet, running activities end and their tokens go.
 */
export async function pushCardForUser({
	organizationId,
	userId,
	priority,
}: {
	organizationId: string;
	userId: string;
	priority: 5 | 10;
}): Promise<void> {
	const [tokens, fleet] = await Promise.all([
		db
			.select()
			.from(v2LiveActivityTokens)
			.where(
				and(
					eq(v2LiveActivityTokens.organizationId, organizationId),
					eq(v2LiveActivityTokens.userId, userId),
				),
			),
		fleetForUser(organizationId, userId),
	]);
	if (tokens.length === 0) return;

	const updates = tokens.filter((token) => token.kind === "update");
	const starters = tokens.filter((token) => token.kind === "push_to_start");
	const targets =
		fleet.length === 0
			? updates.map((token) => ({ token, event: "end" as const }))
			: updates.length > 0
				? updates.map((token) => ({ token, event: "update" as const }))
				: starters.map((token) => ({ token, event: "start" as const }));

	const results = await Promise.allSettled(
		targets.map(async ({ token, event }) => {
			const result = await sendLiveActivityPush({
				token: token.token,
				event,
				priority,
				contentState: buildCardContentState({ fleet, labels: token.labels }),
				...(event === "start"
					? {
							attributes: { type: ATTRIBUTES_TYPE, value: { machineName: "" } },
						}
					: {}),
			});
			if (result.outcome === "dead-token" || event === "end") {
				await db
					.delete(v2LiveActivityTokens)
					.where(eq(v2LiveActivityTokens.id, token.id));
			}
			if (result.outcome === "rejected") {
				console.warn(
					`[live-activity] ${event} push rejected: ${result.status} ${result.reason}`,
				);
			}
		}),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.warn("[live-activity] push failed:", result.reason);
		}
	}
}

/** After a host reported transitions: every user who can see it gets a card. */
export async function pushCardsForHost({
	organizationId,
	machineId,
	priority,
}: {
	organizationId: string;
	machineId: string;
	priority: 5 | 10;
}): Promise<void> {
	const userIds = await usersWhoSeeHost(organizationId, machineId);
	await Promise.all(
		userIds.map((userId) =>
			pushCardForUser({ organizationId, userId, priority }),
		),
	);
}

export async function deleteTokensForUser(
	organizationId: string,
	userId: string,
	tokens: string[],
): Promise<void> {
	if (tokens.length === 0) return;
	await db
		.delete(v2LiveActivityTokens)
		.where(
			and(
				eq(v2LiveActivityTokens.organizationId, organizationId),
				eq(v2LiveActivityTokens.userId, userId),
				inArray(v2LiveActivityTokens.token, tokens),
			),
		);
}
