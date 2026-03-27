import { TRPCError } from "@trpc/server";
import type { BrowserWindow } from "electron";
import { app } from "electron";
import {
	DESKTOP_E2E_ARTIFACTS_DIR,
	IS_DESKTOP_TEST_MODE,
} from "lib/electron-app/test-mode";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import {
	clearDesktopTestAuthToken,
	getDesktopTestAuthState,
	seedDesktopTestAuthToken,
} from "main/lib/test-auth";
import { z } from "zod";
import { publicProcedure, router } from "../..";

function assertDesktopTestMode(): void {
	if (!IS_DESKTOP_TEST_MODE) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Desktop automation routes are only available when DESKTOP_TEST_MODE=1.",
		});
	}
}

function getWindowInfo(window: BrowserWindow | null) {
	if (!window) return null;

	return {
		title: window.getTitle(),
		url: window.webContents.getURL(),
		isFocused: window.isFocused(),
		isVisible: window.isVisible(),
		bounds: window.getBounds(),
	};
}

export const createAutomationRouter = (
	getWindow: () => BrowserWindow | null,
) => {
	return router({
		ping: publicProcedure.query(() => {
			assertDesktopTestMode();

			return {
				ok: true,
				testMode: true,
				pid: process.pid,
				appVersion: app.getVersion(),
			};
		}),

		getEnvironment: publicProcedure.query(() => {
			assertDesktopTestMode();

			return {
				testMode: true,
				nodeEnv: process.env.NODE_ENV ?? "development",
				supersetHomeDir: SUPERSET_HOME_DIR,
				artifactsDir: DESKTOP_E2E_ARTIFACTS_DIR,
			};
		}),

		getWindowInfo: publicProcedure.query(() => {
			assertDesktopTestMode();
			return getWindowInfo(getWindow());
		}),

		getAuthState: publicProcedure.query(async () => {
			assertDesktopTestMode();
			return getDesktopTestAuthState();
		}),

		seedAuthToken: publicProcedure
			.input(
				z.object({
					token: z.string().min(1),
					expiresAt: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				assertDesktopTestMode();
				return seedDesktopTestAuthToken(input);
			}),

		clearAuthToken: publicProcedure.mutation(async () => {
			assertDesktopTestMode();
			return clearDesktopTestAuthToken();
		}),
	});
};
