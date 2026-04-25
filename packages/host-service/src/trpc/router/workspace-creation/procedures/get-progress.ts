import { protectedProcedure } from "../../../index";
import { getProgressInputSchema } from "../schemas";
import {
	getProgress as getCreateProgress,
	sweepStaleProgress,
} from "../shared/progress-store";

export const getProgress = protectedProcedure
	.input(getProgressInputSchema)
	.query(({ input }) => {
		sweepStaleProgress();
		const steps = getCreateProgress(input.pendingId);
		return steps ? { steps } : null;
	});
