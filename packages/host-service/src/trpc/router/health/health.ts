import os from "node:os";
import { publicProcedure, router } from "../../index";

const processStartedAt = Date.now();

export const healthRouter = router({
	check: publicProcedure.query(() => {
		return { status: "ok" as const };
	}),

	info: publicProcedure.query(({ ctx }) => {
		return {
			platform: os.platform(),
			arch: os.arch(),
			nodeVersion: process.version,
			uptime: process.uptime(),
			serviceVersion: ctx.serviceVersion ?? null,
			protocolVersion: ctx.protocolVersion ?? null,
			organizationId: process.env.ORGANIZATION_ID ?? null,
			startedAt: processStartedAt,
		};
	}),
});
