import type { HostServiceClient } from "../host-target";
import { resolveByIdOrName } from "./resolveByIdOrName";

export type HostWorkspaceListRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

/** Resolve a workspace within a project by UUID or unique case-insensitive name. */
export async function resolveProjectWorkspace(
	client: HostServiceClient,
	projectId: string,
	nameOrId: string,
): Promise<HostWorkspaceListRow> {
	const rows = (await client.workspace.list.query()).filter(
		(row) => row.projectId === projectId,
	);
	return resolveByIdOrName(rows, nameOrId, {
		entity: "Workspace",
		ambiguousHint: "Pass the workspace id instead",
	});
}
