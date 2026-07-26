import type { HostServiceClient } from "../host-target";
import { resolveByIdOrName } from "./resolveByIdOrName";

/**
 * Resolve `--project` input (uuid or case-insensitive name) to an id, against
 * the target host's own project list — projects are host-owned, so a name only
 * means something relative to a host.
 */
export async function resolveProjectId(
	client: HostServiceClient,
	projectInput: string,
): Promise<string> {
	const projects = await client.project.list.query();
	return resolveByIdOrName(projects, projectInput, {
		entity: "Project",
		notFoundHint: "Run: superset projects list",
		ambiguousHint: "Pass the project id instead",
	}).id;
}
