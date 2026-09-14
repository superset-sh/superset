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

type Token = typeof v2LiveActivityTokens.$inferSelect;

interface Target {
	token: Token;
	event: "start" | "update" | "end";
}

/**
 * Per phone: a running card gets an update, a phone without one gets a
 * push-to-start, and with nothing to show every running card ends. Grouping
 * by device is what keeps a second phone from being skipped just because
 * the first already has a card.
 */
function chooseTargets(tokens: Token[], fleetIsEmpty: boolean): Target[] {
	const byDevice = new Map<string, Token[]>();
	for (const token of tokens) {
		byDevice.set(token.deviceId, [
			...(byDevice.get(token.deviceId) ?? []),
			token,
		]);
	}
	const targets: Target[] = [];
	for (const deviceTokens of byDevice.values()) {
		const updates = deviceTokens.filter((token) => token.kind === "update");
		if (fleetIsEmpty) {
			targets.push(
				...updates.map((token) => ({ token, event: "end" as const })),
			);
		} else if (updates.length > 0) {
			targets.push(
				...updates.map((token) => ({ token, event: "update" as const })),
			);
		} else {
			targets.push(
				...deviceTokens
					.filter((token) => token.kind === "push_to_start")
					.map((token) => ({ token, event: "start" as const })),
			);
		}
	}
	return targets;
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

	const targets = chooseTargets(tokens, fleet.length === 0);

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
			// An ended activity's token is useless, but only once the end
			// actually reached the phone; a failed end must stay retryable.
			if (
				result.outcome === "dead-token" ||
				(event === "end" && result.outcome === "sent")
			) {
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
