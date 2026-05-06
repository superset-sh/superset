import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Set up a v2 project on a host (clone or import existing)",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().required().desc("Project ID"),
		import: string().desc(
			"Path to an existing local repo to register as the project",
		),
		clone: string().desc(
			"Parent directory to clone the project's GitHub repo into",
		),
		relocate: boolean().desc(
			"With --import, allow re-pointing an already set-up project to a new path",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (Boolean(options.import) === Boolean(options.clone)) {
			throw new CLIError(
				"Specify exactly one of --import or --clone",
				"Use --import <path> to register an existing local repo, or --clone <parent-dir> to clone the project's GitHub repo into <parent-dir>.",
			);
		}

		if (options.relocate && !options.import) {
			throw new CLIError(
				"--relocate requires --import",
				"Pass --import <path> to relocate the existing project to a new path.",
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const result = options.import
			? await target.client.project.setup.mutate({
					projectId: options.project,
					mode: {
						kind: "import",
						repoPath: options.import,
						allowRelocate: options.relocate ?? false,
					},
				})
			: await target.client.project.setup.mutate({
					projectId: options.project,
					mode: {
						kind: "clone",
						parentDir: options.clone as string,
					},
				});

		return {
			data: result,
			message: `Project set up at ${result.repoPath} on host ${target.hostId}`,
		};
	},
});
