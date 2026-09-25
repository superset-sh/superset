import type { Client } from "@microsoft/microsoft-graph-client";
import type { Team } from "@microsoft/microsoft-graph-types";
import type { TriggerOptionSource } from "../trigger-options";
import {
	findTeamsConnection,
	getGraphAccessToken,
	graphClient,
	isGraphAuthError,
} from "./graph";
import { listChannels, listTeams, listUsers } from "./resources";

/** How many teams' channel lists are fetched at once when building the
 * channel picker. Graph throttles per app per tenant; a tenant with hundreds
 * of teams is walked in batches rather than all at once. */
const CHANNEL_FETCH_CONCURRENCY = 5;

async function graphFor(organizationId: string): Promise<Client | null> {
	const connection = await findTeamsConnection(organizationId);
	if (!connection) return null;
	const accessToken = await getGraphAccessToken(connection.id);
	if (!accessToken) return null;
	return graphClient(accessToken);
}

function byLabel<T extends { label: string }>(a: T, b: T) {
	return a.label.localeCompare(b.label);
}

const teams: TriggerOptionSource = async ({ organizationId }) => {
	const graph = await graphFor(organizationId);
	if (!graph) return [];
	const list = await listTeams(graph);
	return list
		.flatMap((team) =>
			team.id ? [{ id: team.id, label: team.displayName ?? team.id }] : [],
		)
		.sort(byLabel);
};

const channels: TriggerOptionSource = async ({ organizationId }) => {
	const graph = await graphFor(organizationId);
	if (!graph) return [];
	const list = (await listTeams(graph)).filter(
		(team): team is Team & { id: string } => Boolean(team.id),
	);
	const options: Array<{ id: string; label: string }> = [];
	for (let i = 0; i < list.length; i += CHANNEL_FETCH_CONCURRENCY) {
		const batch = list.slice(i, i + CHANNEL_FETCH_CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map(async (team) => {
				const teamChannels = await listChannels(graph, team.id);
				return teamChannels.flatMap((channel) =>
					channel.id
						? [
								{
									id: channel.id,
									// Channel names repeat across teams ("General" is in every
									// one), so the picker shows which team a channel belongs to.
									label: `${team.displayName ?? team.id} › ${channel.displayName ?? channel.id}`,
								},
							]
						: [],
				);
			}),
		);
		for (const result of results) {
			if (result.status === "fulfilled") options.push(...result.value);
			else {
				console.error(
					"[microsoft-teams] listing channels failed for a team",
					result.reason,
				);
			}
		}
	}
	return options.sort(byLabel);
};

const people: TriggerOptionSource = async ({ organizationId }) => {
	const graph = await graphFor(organizationId);
	if (!graph) return [];
	try {
		const users = await listUsers(graph);
		return users
			.flatMap((user) =>
				user.id
					? [
							{
								id: user.id,
								label:
									user.displayName ??
									user.mail ??
									user.userPrincipalName ??
									user.id,
							},
						]
					: [],
			)
			.sort(byLabel);
	} catch (error) {
		// The tenant consented before User.ReadBasic.All was asked for: an
		// empty picker, not a red editor.
		if (!isGraphAuthError(error)) throw error;
		console.warn("[microsoft-teams] listing people refused:", error);
		return [];
	}
};

export const microsoftTeamsTriggerOptions = { teams, channels, people };
