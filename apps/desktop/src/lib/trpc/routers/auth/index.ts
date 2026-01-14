import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { shell } from "electron";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	authEvents,
	loadToken,
	saveToken,
	stateStore,
	TOKEN_FILE,
} from "./utils/auth-functions";

export const createAuthRouter = () => {
	return router({
		/**
		 * Get initial token from encrypted disk storage.
		 * Called once on app startup for hydration.
		 */
		getStoredToken: publicProcedure.query(async () => {
			return await loadToken();
		}),

		/**
		 * Persist token to encrypted disk storage.
		 * Called when renderer saves token to localStorage.
		 */
		persistToken: publicProcedure
			.input(
				z.object({
					token: z.string(),
					expiresAt: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await saveToken(input);
				return { success: true };
			}),

		/**
		 * Subscribe to token changes from deep link callbacks.
		 * CRITICAL: Notifies renderer when OAuth callback saves new token.
		 * Without this, renderer wouldn't know to update localStorage after OAuth.
		 */
		onTokenChanged: publicProcedure.subscription(() => {
			return observable<{ token: string; expiresAt: string } | null>((emit) => {
				// Emit initial token on subscription
				loadToken().then((initial) => {
					if (initial.token && initial.expiresAt) {
						emit.next({ token: initial.token, expiresAt: initial.expiresAt });
					}
				});

				const handler = (data: { token: string; expiresAt: string }) => {
					emit.next(data);
				};

				authEvents.on("token-saved", handler);

				return () => {
					authEvents.off("token-saved", handler);
				};
			});
		}),

		/**
		 * Start OAuth sign-in flow.
		 * Opens browser for OAuth, token delivered via deep link callback.
		 */
		signIn: publicProcedure
			.input(z.object({ provider: z.enum(AUTH_PROVIDERS) }))
			.mutation(async ({ input }) => {
				try {
					const state = crypto.randomBytes(32).toString("base64url");
					stateStore.set(state, Date.now());

					// Clean up old states (older than 10 minutes)
					const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
					for (const [s, ts] of stateStore) {
						if (ts < tenMinutesAgo) stateStore.delete(s);
					}

					const connectUrl = new URL(
						`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/connect`,
					);
					connectUrl.searchParams.set("provider", input.provider);
					connectUrl.searchParams.set("state", state);
					await shell.openExternal(connectUrl.toString());
					return { success: true };
				} catch (err) {
					return {
						success: false,
						error:
							err instanceof Error ? err.message : "Failed to open browser",
					};
				}
			}),

		/**
		 * Sign out - clears token from disk.
		 * Renderer should also clear localStorage and call authClient.signOut().
		 */
		signOut: publicProcedure.mutation(async () => {
			console.log("[auth] Clearing token");
			try {
				await fs.unlink(TOKEN_FILE);
			} catch {}
			return { success: true };
		}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
