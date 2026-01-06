import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { authService } from "main/lib/auth";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Authentication router for desktop app
 * Handles sign in/out and state management
 */
export const createAuthRouter = () => {
	return router({
		getState: publicProcedure.query(() => {
			return authService.getState();
		}),

		getAccessToken: publicProcedure.query(() => {
			return authService.getAccessToken();
		}),

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
		 * Emits current token on subscribe and when auth state changes
		 */
		onAccessToken: publicProcedure.subscription(() => {
			return observable<{ accessToken: string | null }>((emit) => {
				const emitToken = async () => {
					try {
						const accessToken = await authService.getAccessToken();
						emit.next({ accessToken });
					} catch (err) {
						console.error("[auth/onAccessToken] Error getting token:", err);
						emit.error(err instanceof Error ? err : new Error(String(err)));
					}
				};

				const handler = () => {
					void emitToken();
				};

				void emitToken();

				authService.on("state-changed", handler);

				return () => {
					authService.off("state-changed", handler);
				};
			});
		}),

		onSessionChange: publicProcedure.subscription(() => {
			return observable<ReturnType<typeof authService.getSession>>((emit) => {
				const handler = (
					session: ReturnType<typeof authService.getSession>,
				) => {
					emit.next(session);
				};

				emit.next(authService.getSession());

				authService.on("session-changed", handler);

				return () => {
					authService.off("session-changed", handler);
				};
			});
		}),

		setActiveOrganization: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.mutation(async ({ input }) => {
				await authService.setActiveOrganization(input.organizationId);
				return { success: true };
			}),

		signIn: publicProcedure
			.input(z.object({ provider: z.enum(AUTH_PROVIDERS) }))
			.mutation(async ({ input }) => {
				return authService.signIn(input.provider);
			}),

		signOut: publicProcedure.mutation(async () => {
			await authService.signOut();
			return { success: true };
		}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
