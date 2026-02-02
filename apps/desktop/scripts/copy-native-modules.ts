/**
 * Prepare native modules for electron-builder.
 *
 * With Bun 1.3+ isolated installs, node_modules contains symlinks to packages
 * stored in node_modules/.bun/. electron-builder cannot follow these symlinks
 * when creating asar archives.
 *
 * This script:
 * 1. Detects if native modules are symlinks
 * 2. Replaces symlinks with actual file copies
 * 3. electron-builder can then properly package and unpack them
 *
 * This is safe because bun install will recreate the symlinks on next install.
 */

import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	realpathSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// Native modules that must exist for the app to work
// Made optional for Windows builds where native compilation may fail
const NATIVE_MODULES = ["better-sqlite3", "node-pty"] as const;

// Dependencies of native modules that need to be copied (may be hoisted or symlinked)
const NATIVE_MODULE_DEPS = ["bindings", "file-uri-to-path"] as const;

const desktopDir = dirname(import.meta.dirname);
const desktopNodeModulesDir = join(desktopDir, "node_modules");
const repoRootDir = resolve(desktopDir, "..", "..");
const repoNodeModulesDir = join(repoRootDir, "node_modules");
const bunStoreDir = join(repoNodeModulesDir, ".bun");

const OPTIONAL_PLATFORM_MODULES = ["@lydell/node-pty-win32-x64"] as const;

function findBunModulePath(moduleName: string): string | null {
	if (!existsSync(bunStoreDir)) return null;

	const bunPrefix = moduleName.startsWith("@")
		? moduleName.replace("/", "+")
		: moduleName;
	const matches = readdirSync(bunStoreDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith(`${bunPrefix}@`))
		.map((entry) => entry.name)
		.sort((a, b) => b.localeCompare(a));

	if (matches.length === 0) return null;

	return join(bunStoreDir, matches[0], "node_modules", moduleName);
}

function copyModuleIfSymlink(
	nodeModulesDir: string,
	moduleName: string,
	required: boolean,
): boolean {
	const modulePath = join(nodeModulesDir, moduleName);

	if (!existsSync(modulePath)) {
		if (required) {
			// On Windows, native modules may not compile - warn but don't fail
			console.warn(`  [WARN] ${moduleName} not found at ${modulePath} - continuing without it`);
			return false;
		}
		console.log(`  ${moduleName}: not found (skipping)`);
		return false;
	}

	const stats = lstatSync(modulePath);

	if (stats.isSymbolicLink()) {
		// Resolve symlink to get real path
		const realPath = realpathSync(modulePath);
		console.log(`  ${moduleName}: symlink -> replacing with real files`);
		console.log(`    Real path: ${realPath}`);

		// Remove the symlink/junction safely on Windows
		rmSync(modulePath, { recursive: true, force: true });

		// Copy the actual files
		cpSync(realPath, modulePath, { recursive: true });

		console.log(`    Copied to: ${modulePath}`);
	} else {
		console.log(`  ${moduleName}: already real directory (not a symlink)`);
	}

	return true;
}

function prepareNativeModules() {
	console.log("Preparing native modules for electron-builder...");

	// bun creates symlinks for direct dependencies in the workspace's node_modules.
	// If the workspace doesn't have its own node_modules, fall back to the repo root.
	if (!existsSync(desktopNodeModulesDir)) {
		mkdirSync(desktopNodeModulesDir, { recursive: true });
	}

	function ensureLocalModuleCopy(moduleName: string, required: boolean) {
		const desktopModulePath = join(desktopNodeModulesDir, moduleName);
		if (existsSync(desktopModulePath)) {
			return copyModuleIfSymlink(desktopNodeModulesDir, moduleName, required);
		}

		const repoModulePath = join(repoNodeModulesDir, moduleName);
		if (!existsSync(repoModulePath)) {
			const bunModulePath = findBunModulePath(moduleName);
			if (bunModulePath && existsSync(bunModulePath)) {
				console.log(`  ${moduleName}: copying from bun store`);
				mkdirSync(dirname(desktopModulePath), { recursive: true });
				cpSync(bunModulePath, desktopModulePath, { recursive: true });
				return true;
			}
			if (required) {
				console.warn(
					`  [WARN] ${moduleName} not found in desktop or repo node_modules - continuing without it`,
				);
				return false;
			}
			console.log(`  ${moduleName}: not found (skipping)`);
			return false;
		}

		const repoStats = lstatSync(repoModulePath);
		const sourcePath = repoStats.isSymbolicLink()
			? realpathSync(repoModulePath)
			: repoModulePath;
		console.log(`  ${moduleName}: copying from repo node_modules`);
		cpSync(sourcePath, desktopModulePath, { recursive: true });
		return true;
	}

	// Copy native modules (not required on Windows if compilation failed)
	for (const moduleName of NATIVE_MODULES) {
		ensureLocalModuleCopy(moduleName, false);
	}

	// Copy native module dependencies (not required but needed if present)
	console.log("\nPreparing native module dependencies...");
	for (const moduleName of NATIVE_MODULE_DEPS) {
		ensureLocalModuleCopy(moduleName, false);
	}

	console.log("\nPreparing platform-specific optional modules...");
	for (const moduleName of OPTIONAL_PLATFORM_MODULES) {
		ensureLocalModuleCopy(moduleName, false);
	}

	console.log("\nDone!");
}

prepareNativeModules();
