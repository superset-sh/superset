import {
	boolean,
	CLIError,
	number,
	positional,
	string,
} from "@superset/cli-framework";
import { TRPCClientError } from "@trpc/client";
import { command } from "../../../lib/command";
import { resolveFilePaths } from "./utils/resolveFilePaths";
import { resolveFilesTarget } from "./utils/resolveFilesTarget";

/** A cloud sandbox or a standalone `superset start` host has no desktop bridge. */
function hasNoDesktop(error: unknown): error is TRPCClientError<never> {
	return (
		error instanceof TRPCClientError &&
		error.data?.code === "PRECONDITION_FAILED"
	);
}

/** A host-service released before `files.open` existed answers with tRPC's own not-found. */
function isMissingProcedure(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		error.data?.code === "NOT_FOUND" &&
		/procedure/i.test(error.message)
	);
}

export default command({
	description:
		"Open files in file panes of a workspace, beside the active pane of its active tab",
	args: [
		positional("paths")
			.required()
			.variadic()
			.desc(
				"Files to open; relative paths resolve against the current directory",
			),
	],
	options: {
		workspace: string().desc(
			"Workspace ID (default: the workspace whose worktree contains the current directory)",
		),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		local: boolean().desc("The workspace is on this machine"),
		line: number().int().min(1).desc("Scroll to this line (single file only)"),
		newTab: boolean().desc(
			"Open in a new tab instead of splitting beside the active pane",
		),
	},
	run: async ({ ctx, args, options }) => {
		const paths = resolveFilePaths(args.paths as string[], process.cwd());
		if (options.line !== undefined && paths.length > 1) {
			throw new CLIError(
				"--line applies to a single file",
				"Pass one path with --line, or drop --line to open several files",
			);
		}
		const target = await resolveFilesTarget(
			ctx,
			{
				workspace: options.workspace ?? undefined,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			process.cwd(),
		);
		let paneIds: string[];
		try {
			({ paneIds } = await target.client.files.open.mutate({
				workspaceId: target.workspaceId,
				paths,
				line: options.line ?? undefined,
				target: options.newTab ? "new-tab" : "current-tab",
			}));
		} catch (error) {
			if (isMissingProcedure(error)) {
				throw new CLIError(
					`Host ${target.hostId} runs a Superset without \`files open\``,
					"Update the Superset desktop app on that machine, then retry",
				);
			}
			if (hasNoDesktop(error)) {
				throw new CLIError(
					error.message,
					"File panes live in the desktop app: pass --local for this machine, or --host <id> for a machine running it",
				);
			}
			throw error;
		}
		return {
			data: { workspaceId: target.workspaceId, paths, paneIds },
			message: [
				`Opened ${paths.length === 1 ? paths[0] : `${paths.length} files`} in workspace ${target.workspaceId}`,
				...paneIds.map((paneId) => `pane: ${paneId}`),
			].join("\n"),
		};
	},
});
