import { z } from "zod";
import { publicProcedure, router } from "..";
import { getAndClearPendingDeepLink } from "../../../main";

/**
 * Deep link router
 * Handles protocol://url deep linking into the application
 */
export const createDeepLinkRouter = () => {
	return router({
		getUrl: publicProcedure.query(() => {
			return getAndClearPendingDeepLink();
		}),
	});
};
