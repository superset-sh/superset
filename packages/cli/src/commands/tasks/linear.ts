import { CLIError } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import {
	findLinearStateId,
	findLinearTeam,
	findLinearUserId,
	LinearLookupError,
} from "@superset/trpc/linear-lookup";
import type { CliContext } from "../../lib/command";

type LinearWorkspace = RouterOutputs["integration"]["linear"]["workspace"];
type LinearTeam = LinearWorkspace["teams"][number];
type LinearIssue =
	RouterOutputs["integration"]["linear"]["issues"]["issues"][number];

export function linearWorkspace(ctx: CliContext, organizationId: string) {
	return ctx.api.integration.linear.workspace.query({ organizationId });
}

function withHint<T>(lookup: () => T): T {
	try {
		return lookup();
	} catch (error) {
		if (error instanceof LinearLookupError) {
			throw new CLIError(error.message, error.hint);
		}
		throw error;
	}
}

export function linearTeam(
	workspace: LinearWorkspace,
	value: string | undefined,
): LinearTeam {
	return withHint(() => findLinearTeam(workspace, value, "--team"));
}

export function linearStateId(team: LinearTeam, value: string): string {
	return withHint(() => findLinearStateId(team, value));
}

export function linearUserId(
	workspace: LinearWorkspace,
	value: string,
): string {
	return withHint(() => findLinearUserId(workspace, value));
}

export function rejectUnsupported(options: Record<string, unknown>) {
	const passed = Object.entries(options)
		.filter(([, value]) => value != null && value !== false)
		.map(
			([name]) => `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
		);
	if (passed.length > 0) {
		throw new CLIError(
			`Not supported for Linear issues: ${passed.join(", ")}`,
			"Pass --tracker superset to work on Superset tasks",
		);
	}
}

export function linearIssueRow(issue: LinearIssue) {
	return {
		id: issue.id,
		slug: issue.identifier,
		title: issue.title,
		status: issue.state.name,
		priority: issue.priority,
		assignee: issue.assignee?.displayName ?? "—",
		project: issue.project?.name ?? "—",
		team: issue.team.key,
		url: issue.url,
		branch: issue.branchName,
	};
}
