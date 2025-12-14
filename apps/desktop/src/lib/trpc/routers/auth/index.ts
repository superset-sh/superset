import { observable } from "@trpc/server/observable";
import type { BrowserWindow } from "electron";
import { authService } from "main/lib/auth";
import type { AuthProvider, AuthState } from "shared/auth";
import { z } from "zod";
import { publicProcedure, router } from "../..";

// API URL for testing - defaults to production, can be overridden
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.superset.sh";

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

		/**
		 * Test API call - verifies auth token works with the API
		 */
		testApiCall: publicProcedure.mutation(async () => {
			const token = await authService.getAccessToken();

			if (!token) {
				return { success: false, error: "Not authenticated" };
			}

			try {
				// Call the API's user.me endpoint via tRPC HTTP
				const response = await fetch(`${API_URL}/api/trpc/user.me`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					const text = await response.text();
					return {
						success: false,
						error: `API returned ${response.status}: ${text.slice(0, 100)}`,
					};
				}

				const data = await response.json();
				return { success: true, data };
			} catch (err) {
				return {
					success: false,
					error: err instanceof Error ? err.message : "Unknown error",
				};
			}
		}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
