import { type Stats, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireBridge } from "../../../runtime/browser-bridge/require-bridge";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";

/**
 * The desktop opens whatever path it is handed, so the check that the path
 * names a file on this host happens here, where the filesystem is.
 */
function assertOpenableFile(path: string): void {
	if (!isAbsolute(path)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Paths must be absolute: ${path}`,
		});
	}
	let stats: Stats;
	try {
		stats = statSync(path);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ENOTDIR") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `No such file: ${path}`,
			});
		}
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Cannot read ${path}: ${code ?? (err instanceof Error ? err.message : String(err))}`,
		});
	}
	if (stats.isDirectory()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Is a directory, not a file: ${path}`,
		});
	}
	if (!stats.isFile()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Not a regular file: ${path}`,
		});
	}
}

export const filesRouter = router({
	open: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				paths: z.array(z.string().min(1)).min(1),
				line: z.number().int().min(1).optional(),
				target: z.enum(["current-tab", "new-tab"]).default("current-tab"),
			}),
		)
		.mutation(({ ctx, input }) => {
			const bridge = requireBridge(ctx);
			const workspace = getLocalWorkspace(ctx.db, input.workspaceId);
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			for (const path of input.paths) assertOpenableFile(path);
			return bridge.openFile({
				workspaceId: input.workspaceId,
				projectId: workspace.projectId,
				paths: input.paths,
				line: input.line,
				target: input.target,
			});
		}),
});
