import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { createProgress, sweepStaleProgress } from "../progress";

export const getProgress = protectedProcedure
	.input(z.object({ pendingId: z.string() }))
	.query(({ input }) => {
		sweepStaleProgress();
		const entry = createProgress.get(input.pendingId);
		return entry ? { steps: entry.steps } : null;
	});
