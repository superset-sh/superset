import { CLIError, string } from "@superset/cli-framework";
import type { CliContext } from "../../lib/command";

export type TaskTracker = "superset" | "linear";

export const trackerOption = string()
	.enum("superset", "linear")
	.desc(
		"Work on Superset tasks or Linear issues (default: the organization's setting)",
	);

export function requireOrganizationId(ctx: CliContext): string {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return organizationId;
}

export async function resolveTracker(
	ctx: CliContext,
	requested: string | undefined,
): Promise<TaskTracker> {
	if (requested === "superset" || requested === "linear") return requested;
	const organization = await ctx.api.organization.getActive.query();
	return organization?.taskTracker ?? "superset";
}

export type ResolvedTask =
	| {
			tracker: "superset";
			task: NonNullable<
				Awaited<ReturnType<CliContext["api"]["task"]["byIdOrSlug"]["query"]>>
			>;
	  }
	| { tracker: "linear"; issueId: string };

export async function resolveTask(
	ctx: CliContext,
	idOrSlug: string,
	requested: string | undefined,
): Promise<ResolvedTask> {
	if ((await resolveTracker(ctx, requested)) === "linear") {
		return { tracker: "linear", issueId: idOrSlug };
	}
	const task = await ctx.api.task.byIdOrSlug.query(idOrSlug);
	if (!task) throw new CLIError(`Task not found: ${idOrSlug}`);
	return { tracker: "superset", task };
}
