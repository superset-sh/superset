import { publicProcedure, router } from "../../index";

export const healthRouter = router({
	check: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),
});
