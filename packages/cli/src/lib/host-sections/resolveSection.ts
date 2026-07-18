import type { HostServiceClient } from "../host-target";
import { resolveByIdOrName } from "./resolveByIdOrName";

export type HostSectionRow = Awaited<
	ReturnType<HostServiceClient["sections"]["list"]["query"]>
>[number];

/** Resolve a group on a host by UUID or unique case-insensitive name. */
export async function resolveSection(
	client: HostServiceClient,
	nameOrId: string,
	projectId?: string,
): Promise<HostSectionRow> {
	const sections = await client.sections.list.query(
		projectId ? { projectId } : undefined,
	);
	return resolveByIdOrName(sections, nameOrId, {
		entity: "Group",
		notFoundHint: "Run: superset workspaces groups list",
		ambiguousHint: "Pass the group id instead, or scope with --project",
	});
}
