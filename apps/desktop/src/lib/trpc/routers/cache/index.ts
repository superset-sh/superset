import { session } from "electron";
import { getMainApiUrl } from "main/lib/desktop-runtime-flags";
import { publicProcedure, router } from "../..";

export const createCacheRouter = () => {
	return router({
		clearElectricCache: publicProcedure.mutation(async () => {
			try {
				const apiUrl = getMainApiUrl();
				// Clear all storage (including HTTP cache) for the API origin only
				// This targets Electric shape responses without clearing app assets
				await session.defaultSession.clearStorageData({
					origin: apiUrl,
				});

				console.log("[cache] Cleared Electric cache for origin:", apiUrl);

				return { success: true };
			} catch (error) {
				console.error("[cache] Failed to clear Electric cache:", error);
				return {
					success: false,
					error:
						error instanceof Error ? error.message : "Failed to clear cache",
				};
			}
		}),
	});
};

export type CacheRouter = ReturnType<typeof createCacheRouter>;
