import { observable } from "@trpc/server/observable";
import type { BrowserWindow } from "electron";
import { authService } from "main/lib/auth";
import type { AuthProvider, AuthState } from "shared/auth";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Authentication router for desktop app
 * Handles sign in/out and state management
 */
export const createAuthRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		/**
		 * Get current authentication state
		 */
		getState: publicProcedure.query(() => {
			return authService.getState();
		}),

		/**
		 * Subscribe to auth state changes
		 */
		onStateChange: publicProcedure.subscription(() => {
			return observable<AuthState>((emit) => {
				const handler = (state: AuthState) => {
					emit.next(state);
				};

				// Send initial state
				emit.next(authService.getState());

				// Listen for changes
				authService.on("state-changed", handler);

				return () => {
					authService.off("state-changed", handler);
				};
			});
		}),

		/**
		 * Sign in with OAuth provider
		 */
		signIn: publicProcedure
			.input(z.object({ provider: z.enum(["google", "github"]) }))
			.mutation(async ({ input }) => {
				return authService.signIn(input.provider as AuthProvider, getWindow);
			}),

		/**
		 * Sign out
		 */
		signOut: publicProcedure.mutation(async () => {
			await authService.signOut();
			return { success: true };
		}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
