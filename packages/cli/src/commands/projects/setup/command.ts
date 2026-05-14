import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Adopt an existing project on a host (clone its repo or import a folder)",
	args: [positional("id").required().desc("Project UUID to adopt")],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		parentDir: string().desc(
			"Parent directory to clone the project's repo into (clone mode)",
		),
		import: string().desc(
			"Existing local repo path on the target host (import mode)",
		),
		allowRelocate: boolean().desc(
			"Permit re-importing at a different path if the project is already set up here",
		),
	},
	run: async ({ ctx, args, options }) => {
		const projectId = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (Boolean(options.parentDir) === Boolean(options.import)) {
			throw new CLIError(
				"Specify exactly one of --parent-dir or --import",
				"Use --parent-dir <path> to clone, or --import <path> to register an existing folder",
			);
		}
		if (options.allowRelocate && !options.import) {
			throw new CLIError(
				"--allow-relocate only applies to --import",
				"Drop --allow-relocate, or switch to --import <path>",
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

		const mode = options.parentDir
			? {
					kind: "clone" as const,
					parentDir: options.parentDir,
				}
			: {
					kind: "import" as const,
					repoPath: options.import as string,
					allowRelocate: options.allowRelocate ?? false,
				};

		const result = await target.client.project.setup.mutate({
			projectId,
			mode,
		});

		return {
			data: result,
			message: `Set up project ${projectId} on host ${target.hostId}`,
		};
	},
});
