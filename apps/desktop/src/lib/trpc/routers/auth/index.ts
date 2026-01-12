import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { type AuthSession, authService } from "main/lib/auth";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/** Auth state emitted by onAuthState subscription */
export type AuthState = (AuthSession & { token: string | null }) | null;

export const createAuthRouter = () => {
	return router({
		onAuthState: publicProcedure.subscription(() => {
			return observable<AuthState>((emit) => {
				const emitCurrent = () => {
					const sessionData = authService.getSession();
					const token = authService.getAccessToken();

					if (!sessionData) {
						emit.next(null);
						return;
					}

					emit.next({ ...sessionData, token });
				};

				emitCurrent();

				const sessionHandler = () => {
					emitCurrent();
				};
				const stateHandler = () => {
					emitCurrent();
				};

				authService.on("session-changed", sessionHandler);
				authService.on("state-changed", stateHandler);

				return () => {
					authService.off("session-changed", sessionHandler);
					authService.off("state-changed", stateHandler);
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
