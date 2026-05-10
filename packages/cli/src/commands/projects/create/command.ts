import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Create a project on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		name: string().required().desc("Project name"),
		clone: string().desc(
			"Git remote URL to clone (requires --parent-dir). Mutually exclusive with --import",
		),
		parentDir: string().desc(
			"Parent directory the cloned repo lands in (required with --clone)",
		),
		import: string().desc(
			"Existing local repo path on the target host. Mutually exclusive with --clone",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (Boolean(options.clone) === Boolean(options.import)) {
			throw new CLIError(
				"Specify exactly one of --clone or --import",
				"Use --clone <url> --parent-dir <path> or --import <path>",
			);
		}
		if (options.clone && !options.parentDir) {
			throw new CLIError(
				"--clone requires --parent-dir",
				"Pass --parent-dir <path> alongside --clone",
			);
		}
		if (options.import && options.parentDir) {
			throw new CLIError(
				"--parent-dir cannot be used with --import",
				"--import takes the full repo path",
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

		const mode = options.clone
			? {
					kind: "clone" as const,
					parentDir: options.parentDir as string,
					url: options.clone,
				}
			: {
					kind: "importLocal" as const,
					repoPath: options.import as string,
				};

		const result = await target.client.project.create.mutate({
			name: options.name,
			mode,
		});

		return {
			data: result,
			message: `Created project "${options.name}" on host ${target.hostId}`,
		};
	},
});
