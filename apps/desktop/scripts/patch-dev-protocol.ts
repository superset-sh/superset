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

import { Database as BunSqliteDatabase } from "bun:sqlite";
import { execSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	readFileSync,
	readlinkSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
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

function getWorktreeSegmentsFromCwd(): string[] | undefined {
	const worktreeBase = resolve(homedir(), ".superset/worktrees");
	const cwdRelative = relative(worktreeBase, process.cwd());

	if (!cwdRelative || cwdRelative.startsWith("..") || isAbsolute(cwdRelative)) {
		return undefined;
	}

	const segments = cwdRelative.split(sep).filter(Boolean);
	return segments.length >= 2 ? segments : undefined;
}

function deriveWorkspaceNameFromSegments(
	segments: string[] | undefined,
): string | undefined {
	if (!segments) return undefined;
	return deriveWorkspaceNameFromWorktreeSegments(segments);
}

function deriveWorktreePathFromSegments(
	segments: string[] | undefined,
): string | undefined {
	if (!segments) return undefined;

	const worktreeBase = resolve(homedir(), ".superset/worktrees");

	const appsIndex = segments.lastIndexOf("apps");
	const endIndex =
		appsIndex > 1 && segments[appsIndex + 1] === "desktop"
			? appsIndex
			: segments.length;
	if (endIndex <= 1) return undefined;

	return resolve(worktreeBase, ...segments.slice(0, endIndex));
}

function getWorkspaceDisplayNameFromProdDb(
	worktreePath: string,
): string | undefined {
	const prodDbPath = resolve(homedir(), ".superset/local.db");
	if (!existsSync(prodDbPath)) return undefined;

	try {
		const prodDb = new BunSqliteDatabase(prodDbPath, {
			readonly: true,
			create: false,
		});
		try {
			const row = prodDb
				.query(
					`SELECT w.name as name
					 FROM workspaces w
					 INNER JOIN worktrees wt ON w.worktree_id = wt.id
					 WHERE wt.path = ?
					   AND w.deleting_at IS NULL
					 ORDER BY w.last_opened_at DESC
					 LIMIT 1`,
				)
				.get(worktreePath) as { name?: string } | null;
			const name = row?.name?.trim();
			return name ? name : undefined;
		} finally {
			prodDb.close();
		}
	} catch (error) {
		console.warn(
			"[patch-dev-protocol] Failed to resolve workspace display name from prod DB:",
			error,
		);
		return undefined;
	}
}

// Prefer path-derived name so stale .env values never override the active worktree.
const worktreeSegments = getWorktreeSegmentsFromCwd();
const workspaceName =
	deriveWorkspaceNameFromSegments(worktreeSegments) ?? getWorkspaceName();
if (!workspaceName) {
	console.log("[patch-dev-protocol] Skipping - workspace name not resolved");
	process.exit(0);
}
const worktreePath = deriveWorktreePathFromSegments(worktreeSegments);
const displayWorkspaceName =
	(worktreePath
		? getWorkspaceDisplayNameFromProdDb(worktreePath)
		: undefined) ?? workspaceName;
const bundleDisplayWorkspaceName =
	displayWorkspaceName.replaceAll("/", "-").trim() || workspaceName;
const PROTOCOL_SCHEME = `superset-${workspaceName}`;
const BUNDLE_ID = `com.superset.desktop.${workspaceName}`;
const ELECTRON_DIST_DIR = resolve(
	import.meta.dirname,
	"../node_modules/electron/dist",
);
const ELECTRON_APP_PATH = resolve(ELECTRON_DIST_DIR, "Electron.app");
const PLIST_PATH = resolve(ELECTRON_APP_PATH, "Contents/Info.plist");

if (!existsSync(PLIST_PATH)) {
	console.log("[patch-dev-protocol] Electron.app not found, skipping");
	process.exit(0);
}

const DISPLAY_NAME = `Superset (${bundleDisplayWorkspaceName})`;

try {
	const currentBundleId = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();
	const currentScheme = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();
	const currentName = execSync(
		`/usr/libexec/PlistBuddy -c "Print :CFBundleName" "${PLIST_PATH}" 2>/dev/null`,
		{ encoding: "utf-8" },
	).trim();

	// Also check if the .app has been renamed and path.txt is updated
	const isRenamed =
		lstatSync(ELECTRON_APP_PATH).isSymbolicLink() &&
		readlinkSync(ELECTRON_APP_PATH) === `${DISPLAY_NAME}.app`;
	const electronPkgCheck = resolve(
		import.meta.dirname,
		"../node_modules/electron",
	);
	const pathTxtCheck = resolve(electronPkgCheck, "path.txt");
	let pathTxtCorrect = false;
	try {
		pathTxtCorrect =
			readFileSync(pathTxtCheck, "utf-8").trim() ===
			`${DISPLAY_NAME}.app/Contents/MacOS/Electron`;
	} catch {}

	if (
		currentBundleId === BUNDLE_ID &&
		currentScheme === PROTOCOL_SCHEME &&
		currentName === DISPLAY_NAME &&
		isRenamed &&
		pathTxtCorrect
	) {
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

// CFBundleName exists in default Electron plist, so Set works
execSync(
	`/usr/libexec/PlistBuddy -c "Set :CFBundleName ${DISPLAY_NAME}" "${PLIST_PATH}"`,
);

// CFBundleDisplayName may not exist — delete then add to handle both cases
try {
	execSync(
		`/usr/libexec/PlistBuddy -c "Delete :CFBundleDisplayName" "${PLIST_PATH}" 2>/dev/null`,
	);
} catch {}
execSync(
	`/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string '${DISPLAY_NAME}'" "${PLIST_PATH}"`,
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

// Rename Electron.app so macOS uses our display name for the dock label.
// The plist CFBundleName is set correctly, but Electron's runtime overrides
// the in-memory value before the dock reads it. Renaming the .app bundle
// ensures macOS sees the correct name from the bundle directory itself.
// A symlink preserves backward compatibility for the `electron` npm package.
const DESIRED_APP_NAME = `${DISPLAY_NAME}.app`;
const desiredAppPath = resolve(ELECTRON_DIST_DIR, DESIRED_APP_NAME);
let actualAppPath = ELECTRON_APP_PATH;

try {
	const stats = lstatSync(ELECTRON_APP_PATH);

	if (stats.isSymbolicLink()) {
		const currentTarget = readlinkSync(ELECTRON_APP_PATH);
		if (currentTarget === DESIRED_APP_NAME) {
			// Already correctly renamed
			actualAppPath = desiredAppPath;
		} else {
			// Different workspace name from previous run — update
			const oldTargetPath = resolve(ELECTRON_DIST_DIR, currentTarget);
			unlinkSync(ELECTRON_APP_PATH);
			if (existsSync(oldTargetPath)) {
				renameSync(oldTargetPath, desiredAppPath);
			}
			symlinkSync(DESIRED_APP_NAME, ELECTRON_APP_PATH);
			actualAppPath = desiredAppPath;
		}
	} else {
		// Real directory — rename and create symlink
		if (existsSync(desiredAppPath)) {
			rmSync(desiredAppPath, { recursive: true });
		}
		renameSync(ELECTRON_APP_PATH, desiredAppPath);
		symlinkSync(DESIRED_APP_NAME, ELECTRON_APP_PATH);
		actualAppPath = desiredAppPath;
	}

	console.log(
		`[patch-dev-protocol] Renamed Electron.app to ${DESIRED_APP_NAME}`,
	);
} catch (err) {
	console.warn("[patch-dev-protocol] Failed to rename Electron.app:", err);
}

try {
	execSync(
		`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${actualAppPath}"`,
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

// Update the electron package's path.txt so electron-vite launches from the
// renamed .app directly (not through the Electron.app symlink). This ensures
// the invocation path contains the correct app name for macOS bundle resolution.
const electronPkgDir = resolve(import.meta.dirname, "../node_modules/electron");
const pathTxtPath = resolve(electronPkgDir, "path.txt");
const desiredPathTxt = `${DESIRED_APP_NAME}/Contents/MacOS/Electron`;
try {
	writeFileSync(pathTxtPath, desiredPathTxt);
	console.log(
		`[patch-dev-protocol] Updated path.txt to use ${DESIRED_APP_NAME}`,
	);
} catch (err) {
	console.warn("[patch-dev-protocol] Failed to update path.txt:", err);
}
