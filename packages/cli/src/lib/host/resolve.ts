import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../api-client";

export interface ResolvedHost {
	id: string;
	name: string;
	online: boolean;
	wakeCommand: string | null;
}

/** Resolve a host by name or id within the active organization. */
export async function resolveHost(
	api: ApiClient,
	organizationId: string,
	nameOrId: string,
): Promise<ResolvedHost> {
	const hosts = await api.host.list.query({ organizationId });
	const [host, ...rest] = hosts.filter(
		(h) => h.id === nameOrId || h.name === nameOrId,
	);
	if (!host) {
		throw new CLIError(
			`Host not found: ${nameOrId}`,
			"Run: superset hosts list",
		);
	}
	if (rest.length > 0) {
		throw new CLIError(
			`Multiple hosts named "${nameOrId}"`,
			"Use the host id instead (see: superset hosts list).",
		);
	}
	return {
		id: host.id,
		name: host.name,
		online: host.online,
		wakeCommand: host.wakeCommand,
	};
}
