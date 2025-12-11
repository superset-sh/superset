import { authManager } from "main/lib/auth";
import { publicProcedure, router } from "../..";

export const createAuthRouter = () => {
	return router({
		getSession: publicProcedure.query(async () => {
			return await authManager.getSession();
		}),

		startSignIn: publicProcedure.mutation(async () => {
			return await authManager.startSignIn();
		}),

		startSignUp: publicProcedure.mutation(async () => {
			return await authManager.startSignUp();
		}),

		signOut: publicProcedure.mutation(async () => {
			return await authManager.signOut();
		}),

		refreshSession: publicProcedure.mutation(async () => {
			return await authManager.refreshSession();
		}),
	});
};
