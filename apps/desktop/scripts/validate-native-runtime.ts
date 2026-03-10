/**
 * Build-time guard for native runtime dependencies.
 *
 * This fails early when:
 * 1) libsql internals are accidentally bundled into dist/main (dynamic require risk)
 * 2) @parcel/watcher internals are accidentally bundled into dist/main
 * 3) required native runtime packages are missing from apps/desktop/node_modules
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");

function fail(message: string): never {
	console.error(`[validate:native-runtime] ${message}`);
	process.exit(1);
}

function assertExists(path: string, reason: string): void {
	if (!existsSync(path)) {
		fail(`${reason}\nMissing path: ${path}`);
	}
}

function validateLibsqlNotBundled(): void {
	const sourceMapPath = join(projectRoot, "dist", "main", "index.js.map");
	assertExists(
		sourceMapPath,
		"Main bundle sourcemap not found. Run `bun run compile:app` first.",
	);

	const sourceMap = readFileSync(sourceMapPath, "utf8");
	if (sourceMap.includes("node_modules/.bun/libsql@")) {
		fail(
			[
				"Detected bundled `libsql` sources in dist/main/index.js.map.",
				"This usually causes runtime dynamic require failures in packaged apps.",
				"Ensure `libsql` stays in `rollupOptions.external` for the main process.",
			].join("\n"),
		);
	}

	const distMainDir = join(projectRoot, "dist", "main");
	assertExists(
		distMainDir,
		"Main bundle output not found. Run `bun run compile:app` first.",
	);

	const jsFiles = collectFiles(distMainDir).filter((filePath) =>
		filePath.endsWith(".js"),
	);
	for (const filePath of jsFiles) {
		const content = readFileSync(filePath, "utf8");
		const hasDynamicLibsqlRequirePattern = /@libsql\/\$\{target\}/.test(
			content,
		);
		if (
			hasDynamicLibsqlRequirePattern ||
			content.includes("commonjsRequire(`@libsql/")
		) {
			fail(
				[
					"Detected dynamic `@libsql/<platform>` require logic in bundled JS output.",
					"This indicates libsql internals were bundled instead of externalized.",
					`Offending file: ${filePath}`,
				].join("\n"),
			);
		}
	}

	console.log(
		"[validate:native-runtime] OK: libsql is externalized from main bundle",
	);
}

function validateParcelWatcherNotBundled(): void {
	const sourceMapPath = join(projectRoot, "dist", "main", "index.js.map");
	assertExists(
		sourceMapPath,
		"Main bundle sourcemap not found. Run `bun run compile:app` first.",
	);

	const sourceMap = readFileSync(sourceMapPath, "utf8");
	if (sourceMap.includes("node_modules/.bun/@parcel+watcher@")) {
		fail(
			[
				"Detected bundled `@parcel/watcher` sources in dist/main/index.js.map.",
				"This usually causes runtime dynamic require failures in packaged apps.",
				"Ensure `@parcel/watcher` stays in `rollupOptions.external` for the main process.",
			].join("\n"),
		);
	}

	const distMainDir = join(projectRoot, "dist", "main");
	assertExists(
		distMainDir,
		"Main bundle output not found. Run `bun run compile:app` first.",
	);

	const jsFiles = collectFiles(distMainDir).filter((filePath) =>
		filePath.endsWith(".js"),
	);

	for (const filePath of jsFiles) {
		const content = readFileSync(filePath, "utf8");
		if (
			content.includes('commonjsRequire("@parcel/watcher-') ||
			content.includes("commonjsRequire(`@parcel/watcher-") ||
			content.includes('Could not dynamically require "@parcel/watcher-')
		) {
			fail(
				[
					"Detected bundled dynamic `@parcel/watcher-<platform>` require logic in dist/main output.",
					"This indicates watcher internals were bundled instead of externalized.",
					`Offending file: ${filePath}`,
				].join("\n"),
			);
		}
	}

	console.log(
		"[validate:native-runtime] OK: @parcel/watcher is not bundled into the main output",
	);
}

function validateWorkspacePackagesBundled(): void {
	const distMainDir = join(projectRoot, "dist", "main");
	assertExists(
		distMainDir,
		"Main bundle output not found. Run `bun run compile:app` first.",
	);

	const jsFiles = collectFiles(distMainDir).filter((filePath) =>
		filePath.endsWith(".js"),
	);

	for (const filePath of jsFiles) {
		const content = readFileSync(filePath, "utf8");
		const match = content.match(/require\(["']@superset\/[^"']+["']\)/);
		if (match) {
			fail(
				[
					"Detected externalized workspace package require in dist/main output.",
					"Workspace packages should be bundled for the desktop main process.",
					`Offending file: ${filePath}`,
					`Match: ${match[0]}`,
				].join("\n"),
			);
		}
	}

	console.log(
		"[validate:native-runtime] OK: workspace packages are bundled into the main output",
	);
}

function collectFiles(rootDir: string): string[] {
	const entries = readdirSync(rootDir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(fullPath));
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

function getPlatformLibsqlCandidates(): string[] {
	const targetArch = process.env.TARGET_ARCH || process.arch;
	const targetPlatform = process.env.TARGET_PLATFORM || process.platform;

	if (targetPlatform === "darwin") {
		return [
			targetArch === "arm64" ? "@libsql/darwin-arm64" : "@libsql/darwin-x64",
		];
	}

	if (targetPlatform === "linux") {
		if (targetArch === "arm64") {
			return ["@libsql/linux-arm64-gnu", "@libsql/linux-arm64-musl"];
		}
		if (targetArch === "arm") {
			return ["@libsql/linux-arm-gnueabihf", "@libsql/linux-arm-musleabihf"];
		}
		return ["@libsql/linux-x64-gnu", "@libsql/linux-x64-musl"];
	}

	if (targetPlatform === "win32") {
		return ["@libsql/win32-x64-msvc"];
	}

	return [];
}

function getPlatformAstGrepCandidates(): string[] {
	const targetArch = process.env.TARGET_ARCH || process.arch;
	const targetPlatform = process.env.TARGET_PLATFORM || process.platform;

	if (targetPlatform === "darwin") {
		return [
			targetArch === "arm64"
				? "@ast-grep/napi-darwin-arm64"
				: "@ast-grep/napi-darwin-x64",
		];
	}

	if (targetPlatform === "linux") {
		if (targetArch === "arm64") {
			return ["@ast-grep/napi-linux-arm64-gnu"];
		}
		return ["@ast-grep/napi-linux-x64-gnu", "@ast-grep/napi-linux-x64-musl"];
	}

	if (targetPlatform === "win32") {
		return ["@ast-grep/napi-win32-x64-msvc"];
	}

	return [];
}

function validateNativeModulesPrepared(): void {
	const nodeModulesDir = join(projectRoot, "node_modules");
	assertExists(
		nodeModulesDir,
		"node_modules not found. Run `bun install` and `bun run copy:native-modules` first.",
	);

	const requiredModules = [
		"@parcel/watcher/package.json",
		"libsql/package.json",
		"@neon-rs/load/package.json",
		"detect-libc/package.json",
		"is-glob/package.json",
		"is-extglob/package.json",
		"picomatch/package.json",
		"node-addon-api/package.json",
	];
	for (const modulePath of requiredModules) {
		assertExists(
			join(nodeModulesDir, modulePath),
			"Required native runtime dependency is missing.",
		);
	}

	const platformCandidates = getPlatformLibsqlCandidates();
	if (platformCandidates.length === 0) {
		console.warn(
			`[validate:native-runtime] Skipping platform-specific @libsql check for ${process.platform}/${process.arch}`,
		);
		return;
	}

	const hasPlatformPackage = platformCandidates.some((pkg) =>
		existsSync(join(nodeModulesDir, pkg, "package.json")),
	);
	if (!hasPlatformPackage) {
		fail(
			[
				"Missing platform-specific @libsql package.",
				`Expected one of: ${platformCandidates.join(", ")}`,
				"Run `bun run copy:native-modules` and ensure optional dependencies are materialized.",
			].join("\n"),
		);
	}

	console.log(
		`[validate:native-runtime] OK: platform libsql package present (${platformCandidates.join(" | ")})`,
	);

	// Validate @ast-grep/napi platform package
	const astGrepCandidates = getPlatformAstGrepCandidates();
	if (astGrepCandidates.length > 0) {
		const hasAstGrepPlatformPackage = astGrepCandidates.some((pkg) =>
			existsSync(join(nodeModulesDir, pkg, "package.json")),
		);
		if (!hasAstGrepPlatformPackage) {
			fail(
				[
					"Missing platform-specific @ast-grep/napi package.",
					`Expected one of: ${astGrepCandidates.join(", ")}`,
					"Run `bun run copy:native-modules` and ensure optional dependencies are materialized.",
				].join("\n"),
			);
		}
		console.log(
			`[validate:native-runtime] OK: platform ast-grep package present (${astGrepCandidates.join(" | ")})`,
		);
	}
}

function getPlatformParcelWatcherCandidates(): string[] {
	if (process.platform === "darwin") {
		return [
			process.arch === "arm64"
				? "@parcel/watcher-darwin-arm64"
				: "@parcel/watcher-darwin-x64",
		];
	}

	if (process.platform === "linux") {
		if (process.arch === "arm64") {
			return [
				"@parcel/watcher-linux-arm64-glibc",
				"@parcel/watcher-linux-arm64-musl",
			];
		}
		if (process.arch === "arm") {
			return [
				"@parcel/watcher-linux-arm-glibc",
				"@parcel/watcher-linux-arm-musl",
			];
		}
		return [
			"@parcel/watcher-linux-x64-glibc",
			"@parcel/watcher-linux-x64-musl",
		];
	}

	if (process.platform === "win32") {
		if (process.arch === "arm64") {
			return ["@parcel/watcher-win32-arm64"];
		}
		if (process.arch === "ia32") {
			return ["@parcel/watcher-win32-ia32"];
		}
		return ["@parcel/watcher-win32-x64"];
	}

	if (process.platform === "android") {
		return ["@parcel/watcher-android-arm64"];
	}

	if (process.platform === "freebsd") {
		return ["@parcel/watcher-freebsd-x64"];
	}

	return [];
}

function validateParcelWatcherPrepared(): void {
	const nodeModulesDir = join(projectRoot, "node_modules");
	const platformCandidates = getPlatformParcelWatcherCandidates();
	if (platformCandidates.length === 0) {
		console.warn(
			`[validate:native-runtime] Skipping platform-specific @parcel/watcher check for ${process.platform}/${process.arch}`,
		);
		return;
	}

	const hasPlatformPackage = platformCandidates.some((pkg) =>
		existsSync(join(nodeModulesDir, pkg, "package.json")),
	);
	if (!hasPlatformPackage) {
		fail(
			[
				"Missing platform-specific @parcel/watcher package.",
				`Expected one of: ${platformCandidates.join(", ")}`,
				"Run `bun run copy:native-modules` and ensure optional dependencies are materialized.",
			].join("\n"),
		);
	}

	console.log(
		`[validate:native-runtime] OK: platform parcel watcher package present (${platformCandidates.join(" | ")})`,
	);
}

function main(): void {
	validateWorkspacePackagesBundled();
	validateLibsqlNotBundled();
	validateParcelWatcherNotBundled();
	validateNativeModulesPrepared();
	validateParcelWatcherPrepared();
	console.log("[validate:native-runtime] All checks passed");
}

main();
