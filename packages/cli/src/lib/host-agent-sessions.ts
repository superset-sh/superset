import type { ApiClient } from "./api-client";
import { type HostServiceClient, queryHostTargets } from "./host-target";

export type HostAgentSession = Awaited<
	ReturnType<HostServiceClient["terminalAgents"]["list"]["query"]>
>[number];

export interface HostAgentSessionMatch {
	session: HostAgentSession;
	hostId: string;
	hostName: string;
	client: HostServiceClient;
}

interface ListOptions {
	api: ApiClient;
	organizationId: string;
	userJwt: string;
	hostId?: string;
}

export async function listHostAgentSessions(options: ListOptions): Promise<{
	matches: HostAgentSessionMatch[];
	warnings: string[];
}> {
	const { results, warnings } = await queryHostTargets(options, (client) =>
		client.terminalAgents.list.query(),
	);
	const matches: HostAgentSessionMatch[] = [];
	for (const result of results) {
		for (const session of result.value) {
			matches.push({
				session,
				hostId: result.hostId,
				hostName: result.hostName,
				client: result.client,
			});
		}
	}
	return { matches, warnings };
}
