import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { shell, systemPreferences } from "electron";
import { publicProcedure, router } from "..";

function checkFullDiskAccess(): boolean {
	try {
		// Safari bookmarks are TCC-protected — readable only with Full Disk Access
		const tccProtectedPath = path.join(
			homedir(),
			"Library/Safari/Bookmarks.plist",
		);
		fs.accessSync(tccProtectedPath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

function checkAccessibility(): boolean {
	return systemPreferences.isTrustedAccessibilityClient(false);
}

export const createPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(() => {
			return {
				fullDiskAccess: checkFullDiskAccess(),
				accessibility: checkAccessibility(),
			};
		}),

		requestFullDiskAccess: publicProcedure.mutation(async () => {
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
			);
		}),

		requestAccessibility: publicProcedure.mutation(async () => {
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
			);
		}),

		requestAppleEvents: publicProcedure.mutation(async () => {
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
			);
		}),

		// No deep link exists for Local Network — open the general Privacy & Security pane
		requestLocalNetwork: publicProcedure.mutation(async () => {
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension",
			);
		}),
	});
};

export type PermissionsRouter = ReturnType<typeof createPermissionsRouter>;
