import { observable } from "@trpc/server/observable";
import type { BrowserWindow } from "electron";
import { authService } from "main/lib/auth";
import { AUTH_PROVIDERS } from "shared/auth";
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
			return observable<{ isSignedIn: boolean }>((emit) => {
				const handler = (state: { isSignedIn: boolean }) => {
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
		 * Subscribe to access token (for Electric sync in renderer)
		 * Emits current token on subscribe and again when tokens refresh
		 */
		onAccessToken: publicProcedure.subscription(() => {
			return observable<{ accessToken: string | null }>((emit) => {
				const emitToken = async () => {
					try {
						const accessToken = await authService.getAccessToken();
						emit.next({ accessToken });
					} catch (err) {
						emit.error(err instanceof Error ? err : new Error(String(err)));
					}
				};

				const handler = () => {
					void emitToken();
				};

				void emitToken();

				authService.on("tokens-refreshed", handler);
				authService.on("state-changed", handler);

				return () => {
					authService.off("tokens-refreshed", handler);
					authService.off("state-changed", handler);
				};
			});
		}),

		/**
		 * Sign in with OAuth provider
		 */
		signIn: publicProcedure
			.input(z.object({ provider: z.enum(AUTH_PROVIDERS) }))
			.mutation(async ({ input }) => {
				return authService.signIn(input.provider, getWindow);
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
