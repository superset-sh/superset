import { authManager } from "main/lib/auth";
import { publicProcedure, router } from "../..";

export const createAuthRouter = () => {
	return router({
		getSession: publicProcedure.query(() => {
			return authManager.getSession();
		}),

		startSignIn: publicProcedure.mutation(async () => {
			return authManager.startSignIn();
		}),

		startSignUp: publicProcedure.mutation(async () => {
			return authManager.startSignUp();
		}),

		signOut: publicProcedure.mutation(async () => {
			return authManager.signOut();
		}),

		refreshSession: publicProcedure.mutation(async () => {
			return authManager.refreshSession();
		}),
	});
};
