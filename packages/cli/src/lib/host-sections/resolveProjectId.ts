import { CLIError } from "@superset/cli-framework";
import type { CliContext } from "../command";
import { isUuid } from "./resolveByIdOrName";

/** Resolve `--project` input (uuid or case-insensitive name) to an id. */
export async function resolveProjectId(
	ctx: CliContext,
	organizationId: string,
	projectInput: string,
): Promise<string> {
	if (isUuid(projectInput)) return projectInput;

	const projects = await ctx.api.v2Project.list
		.query({ organizationId })
		.catch(() => [] as Array<{ id: string; name: string }>);
	const wanted = projectInput.toLowerCase();
	const project = projects.find(
		(candidate) => candidate.name.toLowerCase() === wanted,
	);
	if (!project) {
		throw new CLIError(
			`Project not found: ${projectInput}`,
			projects.length === 0
				? "Project names resolve via the cloud API — pass --project <uuid> when offline"
				: "Run: superset projects list",
		);
	}
	return project.id;
}
