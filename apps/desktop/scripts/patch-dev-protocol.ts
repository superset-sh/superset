#!/usr/bin/env bun
/**
 * Patches the development Electron.app's Info.plist to register a
 * workspace-specific URL scheme (superset-{workspace}://) for deep linking.
 *
 * Each worktree gets a unique bundle ID and protocol scheme so macOS Launch
 * Services treats them as distinct apps and routes deep links correctly.
 *
 * Needed because app.setAsDefaultProtocolClient() only works when packaged.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { config } from "dotenv";

// override: true ensures .env values take precedence over inherited env vars
config({
	path: resolve(import.meta.dirname, "../../../.env"),
	override: true,
	quiet: true,
});

// Import directly — shared/constants.ts would trigger Zod env validation during predev
import {
	deriveWorkspaceNameFromWorktreeSegments,
	getWorkspaceName,
} from "../src/shared/worktree-id";

if (process.platform !== "darwin") {
	console.log("[patch-dev-protocol] Skipping - not macOS");
	process.exit(0);
}

if (process.env.NODE_ENV !== "development") {
	console.log("[patch-dev-protocol] Skipping - non-development mode");
	process.exit(0);
}

function deriveWorkspaceNameFromPath(): string | undefined {
	const worktreeBase = resolve(homedir(), ".superset/worktrees");
	const cwdRelative = relative(worktreeBase, process.cwd());

	if (!cwdRelative || cwdRelative.startsWith("..") || isAbsolute(cwdRelative)) {
		return undefined;
	}

	const segments = cwdRelative.split(sep).filter(Boolean);
	return deriveWorkspaceNameFromWorktreeSegments(segments);
}

const workspaceName = getWorkspaceName() ?? deriveWorkspaceNameFromPath();
if (!workspaceName) {
	console.log("[patch-dev-protocol] Skipping - workspace name not resolved");
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
} catch {}

console.log(`[patch-dev-protocol] Registering ${PROTOCOL_SCHEME}:// scheme...`);

execSync(
	`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${PLIST_PATH}"`,
);

// Remove existing URL types to avoid stale entries from previous patches
try {
	execSync(
		`/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "${PLIST_PATH}" 2>/dev/null`,
	);
} catch {}

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
