import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { execGh } from "../../workspace-creation/utils/exec-gh";

export const getDiffByRepo = protectedProcedure
	.input(
		z.object({
			repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
			prNumber: z.number().int().positive(),
		}),
	)
	.query(async ({ input }) => {
		try {
			const patch = await execGh(
				["pr", "diff", String(input.prNumber), "--repo", input.repoFullName],
				{ timeout: 30_000, maxBuffer: 200 * 1024 * 1024 },
			);
			return { patch: typeof patch === "string" ? patch : "" };
		} catch (cause) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch diff for ${input.repoFullName}#${input.prNumber}`,
				cause,
			});
		}
	});
