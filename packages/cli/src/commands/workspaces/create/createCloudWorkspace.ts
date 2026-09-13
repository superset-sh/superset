import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";
import { resolveCloudEnvironment } from "../../../lib/cloud-workspaces";

/** What `ws create` parsed; the host-only flags are here only to be refused. */
export interface CloudCreateOptions {
	name?: string;
	checkout?: string;
	branch?: string;
	agent?: string;
	prompt?: string;
	model?: string;
	effort?: string;
	environment?: string;
	host?: string;
	local?: boolean;
	project?: string;
	pr?: number;
	task?: string;
	baseBranch?: string;
	skipBranchPrefix?: boolean;
	tag?: string[];
	attachment?: string[];
	command?: string;
}

/**
 * Create a cloud sandbox. Provisioning is a background job, so this returns
 * with the row still in `provisioning` — `ws list --cloud` watches it.
 */
export async function createCloudWorkspace(args: {
	api: ApiClient;
	organizationId: string;
	options: CloudCreateOptions;
}): Promise<{ data: unknown; message: string }> {
	const { api, organizationId, options } = args;

	// A sandbox's checkout is its workspace: no project, worktree or host.
	for (const [flag, value] of [
		["--checkout", options.checkout],
		["--host", options.host],
		["--local", options.local || undefined],
		["--project", options.project],
		["--pr", options.pr],
		["--task", options.task],
		["--base-branch", options.baseBranch],
		["--skip-branch-prefix", options.skipBranchPrefix || undefined],
		["--tag", options.tag?.length ? options.tag : undefined],
		[
			"--attachment",
			options.attachment?.length ? options.attachment : undefined,
		],
		["--command", options.command],
	] as const) {
		if (value !== undefined) {
			throw new CLIError(
				`${flag} does not apply to --cloud`,
				"A cloud sandbox clones the repository itself — it has no project, worktree or host to target",
			);
		}
	}

	// Same pairing rules as the host path.
	for (const [flag, value] of [
		["--prompt", options.prompt],
		["--model", options.model],
		["--effort", options.effort],
	] as const) {
		if (value !== undefined && !options.agent) {
			throw new CLIError(
				`${flag} requires --agent`,
				"Pass --agent <id> alongside it, or drop the flag for a sandbox that comes up idle",
			);
		}
	}
	if (options.agent && !options.prompt) {
		throw new CLIError(
			"--agent requires --prompt",
			"Pass --prompt <text> alongside --agent",
		);
	}

	const environments = await api.environment.list.query({ organizationId });
	const environment = resolveCloudEnvironment(
		environments,
		options.environment,
	);

	const row = await api.cloudWorkspace.create.mutate({
		organizationId,
		environmentId: environment.id,
		...(options.name ? { name: options.name } : {}),
		...(options.branch ? { branch: options.branch } : {}),
		...(options.agent ? { agent: options.agent } : {}),
		...(options.prompt ? { prompt: options.prompt } : {}),
		...(options.model ? { model: options.model } : {}),
		...(options.effort ? { effort: options.effort } : {}),
	});

	return {
		data: row,
		message: `Provisioning cloud workspace ${row.id} on branch ${row.branch} (environment: ${environment.name})`,
	};
}
