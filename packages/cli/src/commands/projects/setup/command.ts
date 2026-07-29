import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Adopt an existing project on a host (clone its repo or import a folder)",
	args: [positional("id").desc("Project UUID to adopt")],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().desc("Project UUID to adopt"),
		path: string().desc(
			"Existing local repo path on the target host (alias for --import)",
		),
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
		if (options.project !== undefined && args.id !== undefined) {
			throw new CLIError(
				"Project ID specified twice",
				"Use either --project <projectId> or the positional project ID, not both.",
			);
		}
		const projectId = (options.project ?? args.id) as string | undefined;
		if (!projectId) {
			throw new CLIError(
				"Project ID required",
				"Pass --project <projectId>, or provide the project ID as the first argument.",
			);
		}
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.path && options.import) {
			throw new CLIError(
				"Pass either --path or --import, not both",
				"--path is an alias for --import.",
			);
		}
		const importPath = options.path ?? options.import;
		if (Boolean(options.parentDir) === Boolean(importPath)) {
			throw new CLIError(
				"Specify exactly one of --parent-dir or --path",
				"Use --parent-dir <path> to clone, or --path <path> to register an existing folder.",
			);
		}
		if (options.allowRelocate && !importPath) {
			throw new CLIError(
				"--allow-relocate only applies to --path",
				"Drop --allow-relocate, or switch to --path <path>.",
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
					repoPath: importPath as string,
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
