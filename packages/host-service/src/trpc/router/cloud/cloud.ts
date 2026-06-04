import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../index";

// TODO: Remove this test router in favor of product-led endpoints
export const cloudRouter = router({
	whoami: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.api) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Cloud API not configured (no auth token)",
			});
		}

		const user = await ctx.api.user.me.query();
		return user;
	}),
});
