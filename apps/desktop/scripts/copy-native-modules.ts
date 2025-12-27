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

import { cpSync, existsSync, lstatSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

// Native modules that must exist for the app to work
const NATIVE_MODULES = ["better-sqlite3", "node-pty"] as const;

// Dependencies of native modules that need to be copied (may be hoisted or symlinked)
const NATIVE_MODULE_DEPS = ["bindings", "file-uri-to-path"] as const;

function copyModuleIfSymlink(
	nodeModulesDir: string,
	moduleName: string,
	required: boolean,
): boolean {
	const modulePath = join(nodeModulesDir, moduleName);

	if (!existsSync(modulePath)) {
		if (required) {
			console.error(`  [ERROR] ${moduleName} not found at ${modulePath}`);
			process.exit(1);
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

		// Remove the symlink
		rmSync(modulePath);

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

	// bun creates symlinks for direct dependencies in the workspace's node_modules
	const nodeModulesDir = join(dirname(import.meta.dirname), "node_modules");

	// Copy required native modules
	for (const moduleName of NATIVE_MODULES) {
		copyModuleIfSymlink(nodeModulesDir, moduleName, true);
	}

	// Copy native module dependencies (not required but needed if present)
	console.log("\nPreparing native module dependencies...");
	for (const moduleName of NATIVE_MODULE_DEPS) {
		copyModuleIfSymlink(nodeModulesDir, moduleName, false);
	}

	console.log("\nDone!");
}

prepareNativeModules();
