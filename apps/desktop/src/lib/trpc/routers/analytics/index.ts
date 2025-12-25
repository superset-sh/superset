import { setUserId } from "main/lib/analytics";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createAnalyticsRouter = () => {
	return router({
		setUserId: publicProcedure
			.input(z.object({ userId: z.string().nullable() }))
			.mutation(({ input }) => {
				setUserId(input.userId);
			}),
	});
};

export type AnalyticsRouter = ReturnType<typeof createAnalyticsRouter>;
