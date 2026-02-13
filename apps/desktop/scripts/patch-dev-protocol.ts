#!/usr/bin/env bun
/**
 * Patches the development Electron.app's Info.plist to register a
 * workspace-specific URL scheme (superset-{workspace}://) for deep linking.
 *
 * Each worktree gets a unique bundle ID and protocol scheme so macOS Launch
 * Services treats them as distinct apps and routes deep links correctly.
 *
 * This is needed because on macOS, app.setAsDefaultProtocolClient()
 * only works when the app is packaged. In development, we need to
 * manually add the URL scheme to the Electron binary's Info.plist.
 *
 * Runs automatically as part of `bun dev`.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Import getWorkspaceName directly (not shared/constants.ts which imports env.ts
// and would trigger Zod validation of env vars not yet available during predev)
import { getWorkspaceName } from "../src/shared/worktree-id";

// Only needed on macOS
if (process.platform !== "darwin") {
	console.log("[patch-dev-protocol] Skipping - not macOS");
	process.exit(0);
}

// Workspace-aware protocol scheme and bundle ID for multi-worktree isolation
const workspaceName = getWorkspaceName();
if (!workspaceName) {
	console.log(
		"[patch-dev-protocol] Skipping - SUPERSET_WORKSPACE_NAME not set",
	);
	process.exit(0);
}
const PROTOCOL_SCHEME = `superset-${workspaceName}`;
const BUNDLE_ID = `com.superset.desktop.${workspaceName}`;
const ELECTRON_APP_PATH = resolve(
	import.meta.dirname,
	"../node_modules/electron/dist/Electron.app",
);
const PLIST_PATH = resolve(ELECTRON_APP_PATH, "Contents/Info.plist");

if (!existsSync(PLIST_PATH)) {
	console.log("[patch-dev-protocol] Electron.app not found, skipping");
	process.exit(0);
}

// Check if already correctly patched (right bundle ID + right scheme)
try {
	const currentBundleId = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();
	const currentScheme = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();

	if (currentBundleId === BUNDLE_ID && currentScheme === PROTOCOL_SCHEME) {
		console.log(
			`[patch-dev-protocol] ${PROTOCOL_SCHEME}:// already registered`,
		);
		process.exit(0);
	}
} catch {
	// Not patched yet, continue
}

console.log(`[patch-dev-protocol] Registering ${PROTOCOL_SCHEME}:// scheme...`);

// Set unique bundle ID so macOS treats each worktree's Electron as a distinct app
execSync(
	`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${PLIST_PATH}"`,
);

// Remove any existing URL types to avoid stale/duplicate entries from previous patches
try {
	execSync(
		`/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "${PLIST_PATH}" 2>/dev/null`,
	);
} catch {
	// Doesn't exist yet, that's fine
}

// Add URL scheme to Info.plist
const commands = [
	`Add :CFBundleURLTypes array`,
	`Add :CFBundleURLTypes:0 dict`,
	`Add :CFBundleURLTypes:0:CFBundleURLName string 'Superset Dev'`,
	`Add :CFBundleURLTypes:0:CFBundleURLSchemes array`,
	`Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string '${PROTOCOL_SCHEME}'`,
	`Add :CFBundleURLTypes:0:CFBundleTypeRole string 'Editor'`,
];

for (const cmd of commands) {
	execSync(`/usr/libexec/PlistBuddy -c "${cmd}" "${PLIST_PATH}"`);
}

// Register with Launch Services
try {
	execSync(
		`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${ELECTRON_APP_PATH}"`,
	);
	console.log(
		`[patch-dev-protocol] Registered ${PROTOCOL_SCHEME}:// with Launch Services`,
	);
} catch (err) {
	console.warn(
		"[patch-dev-protocol] Failed to register with Launch Services:",
		err,
	);
}
