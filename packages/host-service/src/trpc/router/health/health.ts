import os from "node:os";
import { publicProcedure, router } from "../../index";

export const healthRouter = router({
	check: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),

	info: publicProcedure.query(() => {
		return {
			platform: os.platform(),
			arch: os.arch(),
			nodeVersion: process.version,
			uptime: process.uptime(),
		};
	}),
});
