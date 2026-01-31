#!/usr/bin/env bun
/**
 * Patches the development Electron.app's Info.plist to register
 * the superset-dev:// URL scheme for deep linking.
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

// Import directly from shared package to avoid env.ts validation during predev script
// (The desktop's shared/constants.ts imports env.ts which validates env vars at import time)
const PROTOCOL_SCHEMES = {
	DEV: "superset-dev",
	PROD: "superset",
} as const;

// Only needed on macOS
if (process.platform !== "darwin") {
	console.log("[patch-dev-protocol] Skipping - not macOS");
	process.exit(0);
}

const PROTOCOL_SCHEME = PROTOCOL_SCHEMES.DEV;
const BUNDLE_ID = "com.superset.desktop.dev";
const ELECTRON_APP_PATH = resolve(
	import.meta.dirname,
	"../node_modules/electron/dist/Electron.app",
);
const PLIST_PATH = resolve(ELECTRON_APP_PATH, "Contents/Info.plist");

if (!existsSync(PLIST_PATH)) {
	console.log("[patch-dev-protocol] Electron.app not found, skipping");
	process.exit(0);
}

// Check if already patched
try {
	const result = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();

	if (result === PROTOCOL_SCHEME) {
		console.log(
			`[patch-dev-protocol] ${PROTOCOL_SCHEME}:// already registered`,
		);
		process.exit(0);
	}
} catch {
	// Not patched yet, continue
}

console.log(`[patch-dev-protocol] Registering ${PROTOCOL_SCHEME}:// scheme...`);

// Set unique bundle ID to avoid conflicts with other Electron apps
try {
	execSync(
		`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${PLIST_PATH}"`,
	);
} catch {
	// Ignore errors
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
	try {
		execSync(`/usr/libexec/PlistBuddy -c "${cmd}" "${PLIST_PATH}" 2>/dev/null`);
	} catch {
		// Ignore errors (e.g., key already exists)
	}
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
