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

import { execSync } from "node:child_process";
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

// Target architecture for cross-compilation. When set, platform-specific
// packages for this arch are fetched from npm if not already present.
// Set via TARGET_ARCH env var (e.g., TARGET_ARCH=x64).
const TARGET_ARCH = process.env.TARGET_ARCH || process.arch;
const TARGET_PLATFORM = process.env.TARGET_PLATFORM || process.platform;

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

/**
 * Fetch an npm package tarball and extract it to destPath.
 * Used when cross-compiling and the target platform package isn't in the Bun store.
 */
function fetchNpmPackage(
	packageName: string,
	version: string,
	destPath: string,
): boolean {
	// npm tarball URL: @scope/pkg/-/pkg-version.tgz (filename uses pkg name without scope)
	const barePackageName = packageName.includes("/")
		? packageName.split("/")[1]
		: packageName;
	const url = `https://registry.npmjs.org/${packageName}/-/${barePackageName}-${version}.tgz`;
	console.log(`  ${packageName}: fetching from npm (${version})`);
	try {
		mkdirSync(destPath, { recursive: true });
		execSync(
			`curl -sL "${url}" | tar xz -C "${destPath}" --strip-components=1`,
			{
				stdio: "pipe",
			},
		);
		console.log(`    Extracted to: ${destPath}`);
		return true;
	} catch (err) {
		console.error(
			`  [ERROR] Failed to fetch ${packageName}@${version}: ${err}`,
		);
		return false;
	}
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

	// Determine which platform package we need for the target arch
	const targetPlatformSuffix = `${TARGET_PLATFORM === "darwin" ? "darwin" : TARGET_PLATFORM === "win32" ? "win32" : "linux"}-${TARGET_ARCH}`;
	const targetPkg = platformPackages.find((pkg) =>
		pkg.name.includes(targetPlatformSuffix),
	);

	// Bun isolated installs keep package payloads in workspaceRoot/node_modules/.bun
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	let resolvedTargetPackage = false;

	for (const platformPkg of platformPackages) {
		const isTargetPkg = targetPkg && platformPkg.name === targetPkg.name;
		const destPath = join(nodeModulesDir, platformPkg.name);
		if (existsSync(destPath)) {
			const copied = copyModuleIfSymlink(
				nodeModulesDir,
				platformPkg.name,
				false,
			);
			if (isTargetPkg && copied) resolvedTargetPackage = true;
			continue;
		}

		const bunStoreFolderName = findBunStoreFolderName(
			bunStoreDir,
			platformPkg.name,
			platformPkg.version,
		);
		if (bunStoreFolderName) {
			const sourcePath = join(
				bunStoreDir,
				bunStoreFolderName,
				"node_modules",
				platformPkg.name,
			);
			if (existsSync(sourcePath)) {
				console.log(`  ${platformPkg.name}: copying from Bun store`);
				mkdirSync(dirname(destPath), { recursive: true });
				cpSync(sourcePath, destPath, { recursive: true });
				if (isTargetPkg) resolvedTargetPackage = true;
				continue;
			}
		}

		// If this is the target platform package and it's not in the Bun store,
		// fetch it from npm (cross-compilation scenario)
		if (isTargetPkg) {
			if (fetchNpmPackage(platformPkg.name, platformPkg.version, destPath)) {
				resolvedTargetPackage = true;
				continue;
			}
		}

		console.warn(
			`  ${platformPkg.name}: not found in Bun store or node_modules`,
		);
	}

	if (!resolvedTargetPackage) {
		console.error(
			`  [ERROR] Target platform package ${targetPkg?.name ?? `@ast-grep/napi-${targetPlatformSuffix}`} was not materialized`,
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
	const optionalDeps = libsqlPkg.optionalDependencies ?? {};

	console.log("\nPreparing libsql runtime dependencies...");
	for (const dep of deps) {
		copyModuleIfSymlink(nodeModulesDir, dep, true);
	}

	// Copy whichever optional native platform packages Bun installed for this platform.
	for (const dep of Object.keys(optionalDeps)) {
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

	// Cross-compilation: ensure the target platform's @libsql package is present
	const targetSuffix = `${TARGET_PLATFORM}-${TARGET_ARCH}`;
	const targetLibsqlPkgs = Object.entries(optionalDeps).filter(([name]) =>
		name.includes(targetSuffix),
	);
	for (const [name, version] of targetLibsqlPkgs) {
		const destPath = join(nodeModulesDir, name);
		if (!existsSync(destPath)) {
			fetchNpmPackage(name, version, destPath);
		}
	}
}

function prepareNativeModules() {
	console.log("Preparing native modules for electron-builder...");
	console.log(
		`  Target: ${TARGET_PLATFORM}/${TARGET_ARCH} (host: ${process.platform}/${process.arch})`,
	);

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
