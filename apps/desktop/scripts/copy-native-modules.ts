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

const NATIVE_MODULES = ["better-sqlite3", "node-pty"] as const;

function prepareNativeModules() {
	console.log("Preparing native modules for electron-builder...");

	const nodeModulesDir = join(dirname(import.meta.dirname), "node_modules");

	for (const moduleName of NATIVE_MODULES) {
		const modulePath = join(nodeModulesDir, moduleName);

		if (!existsSync(modulePath)) {
			console.error(`  [ERROR] ${moduleName} not found at ${modulePath}`);
			process.exit(1);
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
	}

	console.log("Done!");
}

prepareNativeModules();
