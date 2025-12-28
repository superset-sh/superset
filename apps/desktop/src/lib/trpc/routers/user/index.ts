import { apiClient } from "main/lib/api-client";
import { publicProcedure, router } from "../..";

/**
 * User router - proxies to API tRPC endpoints
 */
export const createUserRouter = () => {
	return router({
		/**
		 * Get current user info
		 */
		me: publicProcedure.query(async () => {
			return apiClient.user.me.query();
		}),

		/**
		 * Get all organizations the user belongs to
		 */
		myOrganizations: publicProcedure.query(async () => {
			return apiClient.user.myOrganizations.query();
		}),
	});
};

export type UserRouter = ReturnType<typeof createUserRouter>;
