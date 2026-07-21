import { CLIError } from "@superset/cli-framework";
import type {
	SidebarCommand,
	SidebarStateSnapshot,
} from "@superset/client-state";
import { executeSidebarCommand as executeClientSidebarCommand } from "@superset/client-state/store";
import type { CliContext } from "../../lib/command";
import { SUPERSET_HOME_DIR } from "../../lib/config";
import { resolveHostTarget } from "../../lib/host-target";

export interface LocalProject {
	id: string;
	name: string;
}

export interface LocalWorkspace {
	id: string;
	projectId: string;
	name: string;
}

export function getLocalResourceClient(ctx: CliContext) {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return resolveHostTarget({
		requestedHostId: undefined,
		organizationId,
		userJwt: ctx.bearer,
	}).client;
}

export async function executeSidebarCommand(
	ctx: CliContext,
	command: SidebarCommand,
): Promise<SidebarStateSnapshot> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	const user = await ctx.api.user.me.query();
	const scope = { organizationId, userId: user.id };
	const result = await executeClientSidebarCommand(
		SUPERSET_HOME_DIR,
		scope,
		command,
	);
	return result.document.state;
}

function resolveByIdOrName<T extends { id: string; name: string }>(
	kind: "Project" | "Workspace" | "Group",
	items: T[],
	input: string,
): T {
	const idMatch = items.find((item) => item.id === input);
	if (idMatch) return idMatch;
	const nameMatches = items.filter(
		(item) => item.name.toLowerCase() === input.toLowerCase(),
	);
	if (nameMatches.length === 1 && nameMatches[0]) return nameMatches[0];
	if (nameMatches.length > 1) {
		throw new CLIError(
			`${kind} name is ambiguous: ${input}`,
			`Use one of these IDs: ${nameMatches.map((item) => item.id).join(", ")}`,
		);
	}
	throw new CLIError(
		`${kind} not found: ${input}`,
		"Run: superset sidebar list",
	);
}

export function resolveProject(projects: LocalProject[], input: string) {
	return resolveByIdOrName("Project", projects, input);
}

export function resolveWorkspace(workspaces: LocalWorkspace[], input: string) {
	return resolveByIdOrName("Workspace", workspaces, input);
}

export function resolveGroup(
	state: SidebarStateSnapshot,
	input: string,
	projectId?: string,
) {
	return resolveByIdOrName(
		"Group",
		state.groups.filter(
			(group) => projectId === undefined || group.projectId === projectId,
		),
		input,
	);
}
