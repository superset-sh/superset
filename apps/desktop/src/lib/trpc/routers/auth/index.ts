import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { shell } from "electron";
import { env } from "main/env.main";
import { getDeviceName, getHashedDeviceId } from "main/lib/device-info";
import { getHostServiceManager } from "main/lib/host-service-manager";
import { PLATFORM, PROTOCOL_SCHEME } from "shared/constants";
import { env as sharedEnv } from "shared/env.shared";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	authEvents,
	loadAllAccounts,
	loadToken,
	removeAccount,
	saveToken,
	setActiveAccount,
	stateStore,
	TOKEN_FILE,
	updateAccountMeta,
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
					userId: z.string().optional(),
					email: z.string().optional(),
					name: z.string().optional(),
					image: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await saveToken(input);
				return { success: true };
			}),

		/**
		 * Get all stored accounts (multi-account support).
		 * Returns an array of { userId, email, name, image } for each stored account.
		 * The first entry is the active account.
		 */
		getAllAccounts: publicProcedure.query(async () => {
			const accounts = await loadAllAccounts();
			return accounts.map((a) => ({
				userId: a.userId,
				email: a.email ?? null,
				name: a.name ?? null,
				image: a.image ?? null,
				isActive: a === accounts[0],
			}));
		}),

		/**
		 * Switch to a different stored account.
		 */
		switchAccount: publicProcedure
			.input(z.object({ userId: z.string() }))
			.mutation(async ({ input }) => {
				const result = await setActiveAccount(input.userId);
				if (!result) {
					return { success: false, error: "Account not found" };
				}
				return { success: true };
			}),

		/**
		 * Remove a specific account from storage.
		 * If it was the active account, switches to the next one.
		 */
		removeAccount: publicProcedure
			.input(z.object({ userId: z.string() }))
			.mutation(async ({ input }) => {
				const removed = await removeAccount(input.userId);
				return { success: removed };
			}),

		/**
		 * Update account metadata (called after session fetch to populate email/name/image).
		 */
		updateAccountMeta: publicProcedure
			.input(
				z.object({
					userId: z.string(),
					email: z.string().optional(),
					name: z.string().optional(),
					image: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await updateAccountMeta(input);
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
		 * Opens browser for OAuth, token delivered via deep link on macOS
		 * or localhost callback on Linux (where deep links are unreliable).
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
					connectUrl.searchParams.set("protocol", PROTOCOL_SCHEME);
					// Only send local_callback on Linux where deep links are unreliable
					if (PLATFORM.IS_LINUX) {
						connectUrl.searchParams.set(
							"local_callback",
							`http://127.0.0.1:${sharedEnv.DESKTOP_NOTIFICATIONS_PORT}/auth/callback`,
						);
					}
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
		 * Sign out the active account or all accounts.
		 */
		signOut: publicProcedure
			.input(z.object({ all: z.boolean().optional() }).optional())
			.mutation(async ({ input }) => {
				const signOutAll = input?.all ?? true;

				if (signOutAll) {
					getHostServiceManager().stopAll();
					await fs.unlink(TOKEN_FILE).catch(() => {});
					authEvents.emit("token-cleared");
				} else {
					// Sign out active account only
					const accounts = await loadAllAccounts();
					if (accounts.length > 0) {
						await removeAccount(accounts[0].userId);
						if (accounts.length <= 1) {
							getHostServiceManager().stopAll();
						}
					}
				}
				return { success: true };
			}),
	});
};

export type AuthRouter = ReturnType<typeof createAuthRouter>;
