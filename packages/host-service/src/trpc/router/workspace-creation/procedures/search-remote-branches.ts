import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";

const PER_PAGE = 100;

const ghBranchSchema = z.array(
	z.object({
		name: z.string(),
		commit: z.object({ url: z.string() }).partial().optional(),
	}),
);

/**
 * Branches for a repo the user may not have checked out, read through `gh`
 * so it uses their own `gh auth login` — the same path issue and PR lookups
 * take. Cloud workspaces need this: the sandbox is the only checkout, so
 * there is no local repo for `searchBranches` to enumerate.
 */
export const searchRemoteBranches = protectedProcedure
	.input(
		z.object({
			owner: z.string().min(1),
			repo: z.string().min(1),
			query: z.string().optional(),
		}),
	)
	.query(async ({ ctx, input }) => {
		let raw: unknown;
		try {
			raw = await ctx.execGh([
				"api",
				`repos/${input.owner}/${input.repo}/branches?per_page=${PER_PAGE}`,
			]);
		} catch (error) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message:
					"Could not list branches from GitHub. Check `gh auth status` on this device.",
				cause: error,
			});
		}

		const parsed = ghBranchSchema.safeParse(raw);
		if (!parsed.success) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Unexpected branch payload from gh",
			});
		}

		const needle = input.query?.trim().toLowerCase();
		const items = parsed.data
			.map((branch) => branch.name)
			.filter((name) => (needle ? name.toLowerCase().includes(needle) : true))
			.sort((a, b) => a.localeCompare(b));

		return { items };
	});
