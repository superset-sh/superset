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
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, join } from "node:path";

// Native modules that must exist for the app to work
const NATIVE_MODULES = [
	"better-sqlite3",
	"node-pty",
	"@ast-grep/napi",
	"libsql",
] as const;

// Dependencies of native modules that need to be copied (may be hoisted or symlinked)
const NATIVE_MODULE_DEPS = ["bindings", "file-uri-to-path"] as const;

function getWorkspaceRootNodeModulesDir(nodeModulesDir: string): string {
	return join(nodeModulesDir, "..", "..", "..", "node_modules");
}

function getBunFlatNodeModulesDir(nodeModulesDir: string): string {
	return join(
		getWorkspaceRootNodeModulesDir(nodeModulesDir),
		".bun",
		"node_modules",
	);
}

function getBunStoreDir(nodeModulesDir: string): string {
	return join(getWorkspaceRootNodeModulesDir(nodeModulesDir), ".bun");
}

function findBunStoreFolderName(
	bunStoreDir: string,
	moduleName: string,
	version: string,
): string | null {
	if (!existsSync(bunStoreDir)) return null;
	const entries = readdirSync(bunStoreDir);
	const modulePrefix = `${moduleName.replace("/", "+")}@`;
	const exactPrefix = `${modulePrefix}${version}`;
	const exactMatch = entries.find((entry) => entry.startsWith(exactPrefix));
	if (exactMatch) return exactMatch;
	return entries.find((entry) => entry.startsWith(modulePrefix)) ?? null;
}

function copyModuleIfSymlink(
	nodeModulesDir: string,
	moduleName: string,
	required: boolean,
): boolean {
	const modulePath = join(nodeModulesDir, moduleName);
	const bunFlatNodeModulesDir = getBunFlatNodeModulesDir(nodeModulesDir);
	const bunFlatModulePath = join(bunFlatNodeModulesDir, moduleName);

	if (!existsSync(modulePath)) {
		if (existsSync(bunFlatModulePath)) {
			console.log(`  ${moduleName}: materializing from Bun store index`);
			mkdirSync(dirname(modulePath), { recursive: true });
			cpSync(realpathSync(bunFlatModulePath), modulePath, { recursive: true });
			console.log(`    Copied to: ${modulePath}`);
			return true;
		}
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

function copyAstGrepPlatformPackages(nodeModulesDir: string): void {
	const astGrepNapiPath = join(nodeModulesDir, "@ast-grep", "napi");
	if (!existsSync(astGrepNapiPath)) return;

	const astGrepPkgJsonPath = join(astGrepNapiPath, "package.json");
	if (!existsSync(astGrepPkgJsonPath)) return;

	type AstGrepPackageJson = {
		optionalDependencies?: Record<string, string>;
	};
	const astGrepPkg = JSON.parse(
		readFileSync(astGrepPkgJsonPath, "utf8"),
	) as AstGrepPackageJson;
	const optionalDeps = astGrepPkg.optionalDependencies ?? {};
	const platformPackages = Object.entries(optionalDeps)
		.filter(([name]) => name.startsWith("@ast-grep/napi-"))
		.map(([name, version]) => ({ name, version }));

	if (platformPackages.length === 0) return;

	// Bun isolated installs keep package payloads in workspaceRoot/node_modules/.bun
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	let resolvedPlatformPackage = false;

	for (const platformPkg of platformPackages) {
		const destPath = join(nodeModulesDir, platformPkg.name);
		if (existsSync(destPath)) {
			resolvedPlatformPackage =
				copyModuleIfSymlink(nodeModulesDir, platformPkg.name, false) ||
				resolvedPlatformPackage;
			continue;
		}

		const bunStoreFolderName = findBunStoreFolderName(
			bunStoreDir,
			platformPkg.name,
			platformPkg.version,
		);
		if (!bunStoreFolderName) {
			console.warn(
				`  ${platformPkg.name}: no Bun store entry matched version ${platformPkg.version}`,
			);
			continue;
		}

		const sourcePath = join(
			bunStoreDir,
			bunStoreFolderName,
			"node_modules",
			platformPkg.name,
		);
		if (!existsSync(sourcePath)) {
			console.warn(
				`  ${platformPkg.name}: Bun store path missing after resolve (${sourcePath})`,
			);
			continue;
		}

		console.log(`  ${platformPkg.name}: copying from Bun store`);
		mkdirSync(dirname(destPath), { recursive: true });
		cpSync(sourcePath, destPath, { recursive: true });
		resolvedPlatformPackage = true;
	}

	if (!resolvedPlatformPackage) {
		console.error(
			"  [ERROR] No `@ast-grep/napi-` runtime package was materialized",
		);
		process.exit(1);
	}
}

function copyLibsqlDependencies(nodeModulesDir: string): void {
	const libsqlPath = join(nodeModulesDir, "libsql");
	const libsqlPkgJsonPath = join(libsqlPath, "package.json");
	if (!existsSync(libsqlPkgJsonPath)) return;

	type LibsqlPackageJson = {
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
	};
	const libsqlPkg = JSON.parse(
		readFileSync(libsqlPkgJsonPath, "utf8"),
	) as LibsqlPackageJson;
	const deps = Object.keys(libsqlPkg.dependencies ?? {});
	const optionalDeps = Object.keys(libsqlPkg.optionalDependencies ?? {});

	console.log("\nPreparing libsql runtime dependencies...");
	for (const dep of deps) {
		copyModuleIfSymlink(nodeModulesDir, dep, true);
	}

	// Copy whichever optional native platform packages Bun installed for this platform.
	for (const dep of optionalDeps) {
		copyModuleIfSymlink(nodeModulesDir, dep, false);
	}

	// Some Bun installs place optional deps under .bun/node_modules/@scope.
	// Mirror discovered @libsql optional packages if present there.
	const bunFlatLibsqlScopePath = join(
		getBunFlatNodeModulesDir(nodeModulesDir),
		"@libsql",
	);
	if (existsSync(bunFlatLibsqlScopePath)) {
		for (const entry of readdirSync(bunFlatLibsqlScopePath)) {
			if (
				!entry.includes("darwin") &&
				!entry.includes("linux") &&
				!entry.includes("win32")
			) {
				continue;
			}
			copyModuleIfSymlink(nodeModulesDir, `@libsql/${entry}`, false);
		}
	}
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

	console.log("\nPreparing ast-grep platform package...");
	copyAstGrepPlatformPackages(nodeModulesDir);
	copyLibsqlDependencies(nodeModulesDir);

	console.log("\nDone!");
}

prepareNativeModules();
