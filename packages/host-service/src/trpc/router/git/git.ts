import { z } from "zod";
import { publicProcedure, router } from "../../index";

// TODO: Remove this test router in favor of product-led endpoints (i.e. workspace.create())
export const gitRouter = router({
	status: publicProcedure
		.input(z.object({ path: z.string() }))
		.query(async ({ ctx, input }) => {
			const git = await ctx.git(input.path);
			const status = await git.status();
			return {
				current: status.current,
				tracking: status.tracking,
				ahead: status.ahead,
				behind: status.behind,
				staged: status.staged,
				modified: status.modified,
				not_added: status.not_added,
				deleted: status.deleted,
				conflicted: status.conflicted,
				isClean: status.isClean(),
			};
		}),
});
