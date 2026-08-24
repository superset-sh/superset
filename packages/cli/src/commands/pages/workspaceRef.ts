import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../../lib/api-client";
import { listWorkspacesOnHost } from "../../lib/host-workspaces";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveWorkspaceId({
	value,
	organizationId,
	userJwt,
	api,
}: {
	value: string;
	organizationId: string | undefined;
	userJwt: string;
	api: ApiClient;
}): Promise<string> {
	if (UUID.test(value)) return value;

	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}

	const { workspaces } = await listWorkspacesOnHost({
		organizationId,
		userJwt,
		api,
	});
	const matches = workspaces.filter(
		(workspace) => workspace.name.toLowerCase() === value.toLowerCase(),
	);
	const [match] = matches;

	if (!match) {
		throw new CLIError(
			`No workspace named "${value}" on this machine`,
			"Run `superset ws list` to see them, or pass the workspace id",
		);
	}
	if (matches.length > 1) {
		throw new CLIError(
			`More than one workspace is named "${value}"`,
			`Pass an id instead: ${matches.map((other) => other.id).join(", ")}`,
		);
	}
	return match.id;
}
