import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { shell } from "electron";
import { env } from "main/env.main";
import { getDeviceName, getHashedDeviceId } from "main/lib/device-info";
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
		getStoredToken: publicProcedure.query(() => loadToken()),

		getDeviceInfo: publicProcedure.query(() => ({
			deviceId: getHashedDeviceId(),
			deviceName: getDeviceName(),
		})),

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
		 * Subscribe to auth events. Only fires for actual changes:
		 * - New authentication (OAuth callback) -> { token, expiresAt }
		 * - Sign out -> null
		 *
		 * Does NOT emit on subscribe - use getStoredToken for initial hydration.
		 */
		onTokenChanged: publicProcedure.subscription(() => {
			return observable<{ token: string; expiresAt: string } | null>((emit) => {
				const handleSaved = (data: { token: string; expiresAt: string }) => {
					emit.next(data);
				};

				const handleCleared = () => {
					emit.next(null);
				};

				authEvents.on("token-saved", handleSaved);
				authEvents.on("token-cleared", handleCleared);

				return () => {
					authEvents.off("token-saved", handleSaved);
					authEvents.off("token-cleared", handleCleared);
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

					// Clean up expired states (10 minutes)
					const cutoff = Date.now() - 10 * 60 * 1000;
					for (const [s, ts] of stateStore) {
						if (ts < cutoff) stateStore.delete(s);
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

		signOut: publicProcedure.mutation(async () => {
			await fs.unlink(TOKEN_FILE).catch(() => {});
			authEvents.emit("token-cleared");
			return { success: true };
		}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
