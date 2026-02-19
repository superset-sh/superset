import { execFile } from "node:child_process";
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

function checkAppleEvents(): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(
			"osascript",
			["-e", 'tell application "System Events" to return 1'],
			(err) => resolve(!err),
		);
	});
}

export const createPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(async () => {
			return {
				fullDiskAccess: checkFullDiskAccess(),
				accessibility: checkAccessibility(),
				appleEvents: await checkAppleEvents(),
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

		requestLocalNetwork: publicProcedure.mutation(async () => {
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
			);
		}),
	});
};

export type PermissionsRouter = ReturnType<typeof createPermissionsRouter>;
