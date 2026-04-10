/**
 * Builds a standalone Superset CLI distribution tarball.
 *
 * Bundle layout (extracts into ~/superset/):
 *   bin/superset                 — Bun-compiled CLI binary
 *   bin/superset-host            — Shell wrapper to run the host-service
 *   lib/node                     — Standalone Node.js runtime
 *   lib/host-service.js          — Bundled host-service entry
 *   lib/node_modules/            — Full native addon packages (JS wrappers + bindings)
 *     better-sqlite3/
 *     node-pty/
 *     @parcel/watcher/
 *     @parcel/watcher-<target>/
 *   share/migrations/            — Drizzle migration SQL files
 *
 * Usage:
 *   bun run scripts/build-dist.ts --target=darwin-arm64
 *   bun run scripts/build-dist.ts --target=darwin-x64
 *   bun run scripts/build-dist.ts --target=linux-x64
 */
import { spawn } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

type Target = "darwin-arm64" | "linux-x64";

const VALID_TARGETS: Target[] = ["darwin-arm64", "linux-x64"];
const NODE_VERSION = "22.13.0";

/**
 * Native addon packages that must be shipped alongside the bundled
 * host-service because they contain .node files that can't be inlined.
 */
const NATIVE_PACKAGES = [
	"better-sqlite3",
	"node-pty",
	"@parcel/watcher",
] as const;

function parseArgs(): { target: Target } {
	const targetArg = process.argv.find((a) => a.startsWith("--target="));
	if (!targetArg) {
		console.error("Missing required --target=<platform-arch>");
		console.error(`Valid targets: ${VALID_TARGETS.join(", ")}`);
		process.exit(1);
	}
	const target = targetArg.slice("--target=".length) as Target;
	if (!VALID_TARGETS.includes(target)) {
		console.error(`Invalid target: ${target}`);
		console.error(`Valid targets: ${VALID_TARGETS.join(", ")}`);
		process.exit(1);
	}
	return { target };
}

function nodeArchiveName(target: Target): string {
	const arch = target === "darwin-arm64" ? "arm64" : "x64";
	const platform = target === "darwin-arm64" ? "darwin" : "linux";
	return `node-v${NODE_VERSION}-${platform}-${arch}`;
}

function nodeDownloadUrl(target: Target): string {
	return `https://nodejs.org/dist/v${NODE_VERSION}/${nodeArchiveName(target)}.tar.gz`;
}

async function exec(cmd: string, args: string[], cwd?: string): Promise<void> {
	return new Promise((res, rej) => {
		const child = spawn(cmd, args, {
			cwd,
			stdio: "inherit",
		});
		child.on("exit", (code) => {
			if (code === 0) res();
			else rej(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
		});
		child.on("error", rej);
	});
}

async function downloadAndExtractNode(
	target: Target,
	destDir: string,
): Promise<string> {
	const cacheDir = join(homedir(), ".superset-build-cache");
	if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

	const archiveName = nodeArchiveName(target);
	const archivePath = join(cacheDir, `${archiveName}.tar.gz`);
	const extractedPath = join(cacheDir, archiveName);

	if (!existsSync(archivePath)) {
		console.log(`[build-dist] downloading ${nodeDownloadUrl(target)}`);
		await exec("curl", ["-fsSL", "-o", archivePath, nodeDownloadUrl(target)]);
	}

	if (!existsSync(extractedPath)) {
		console.log(`[build-dist] extracting Node.js for ${target}`);
		await exec("tar", ["-xzf", archivePath, "-C", cacheDir]);
	}

	const sourceBinary = join(extractedPath, "bin", "node");
	const destBinary = join(destDir, "node");
	cpSync(sourceBinary, destBinary);
	chmodSync(destBinary, 0o755);
	return destBinary;
}

/**
 * Read version for a package from the host-service's resolved node_modules.
 * We use `npm ls` / manual lookup from `package.json` — simplest is to find the
 * package in bun's `.bun/` store and parse its version from the directory name.
 */
function findPackagePath(
	packageName: string,
	startDir: string,
	repoRoot: string,
): string | null {
	const { realpathSync } = require("node:fs");
	// Walk up from startDir looking for node_modules/<packageName>
	let current = startDir;
	while (current.startsWith(repoRoot)) {
		const candidate = join(current, "node_modules", packageName);
		if (existsSync(candidate)) {
			return realpathSync(candidate);
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	// Fallback: common locations
	const fallbacks = [
		join(repoRoot, "packages", "host-service", "node_modules", packageName),
		join(repoRoot, "packages", "workspace-fs", "node_modules", packageName),
		join(repoRoot, "node_modules", packageName),
	];
	for (const fallback of fallbacks) {
		if (existsSync(fallback)) {
			return realpathSync(fallback);
		}
	}
	return null;
}

function copyPackageWithDeps(
	packageName: string,
	startDir: string,
	repoRoot: string,
	destModules: string,
	copied: Set<string>,
): void {
	if (copied.has(packageName)) return;
	copied.add(packageName);

	const sourcePath = findPackagePath(packageName, startDir, repoRoot);
	if (!sourcePath) {
		throw new Error(
			`Package not found: ${packageName}. Run 'bun install' first.`,
		);
	}

	const destPath = join(destModules, packageName);
	mkdirSync(dirname(destPath), { recursive: true });
	cpSync(sourcePath, destPath, { recursive: true, dereference: true });

	// Recursively copy runtime dependencies
	const packageJsonPath = join(sourcePath, "package.json");
	if (existsSync(packageJsonPath)) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		const deps = Object.keys(pkg.dependencies ?? {});
		for (const dep of deps) {
			copyPackageWithDeps(dep, sourcePath, repoRoot, destModules, copied);
		}
	}
}

function copyNativePackages(libDir: string): void {
	const repoRoot = resolve(import.meta.dir, "../../..");
	const destModules = join(libDir, "node_modules");
	mkdirSync(destModules, { recursive: true });
	const copied = new Set<string>();

	const hostServiceDir = join(repoRoot, "packages", "host-service");
	for (const pkg of NATIVE_PACKAGES) {
		console.log(`[build-dist]   copying ${pkg} (+ deps)`);
		copyPackageWithDeps(pkg, hostServiceDir, repoRoot, destModules, copied);
	}

	// better-sqlite3, node-pty, and @parcel/watcher each load their native
	// binding from build/Release/ as a fallback when the platform-specific
	// npm sub-package isn't available. Since those sub-packages are optional
	// and we're shipping the build output, we don't need to copy them.
}

async function buildCli(target: Target, outputPath: string): Promise<void> {
	const relayUrl = process.env.RELAY_URL || "https://relay.superset.sh";
	const cloudApiUrl = process.env.CLOUD_API_URL || "https://api.superset.sh";

	const cliDir = resolve(import.meta.dir, "..");
	await exec(
		"bun",
		[
			"build",
			"--compile",
			`--target=bun-${target}`,
			"--define",
			`process.env.RELAY_URL="${relayUrl}"`,
			"--define",
			`process.env.CLOUD_API_URL="${cloudApiUrl}"`,
			"src/bin.ts",
			"--outfile",
			outputPath,
		],
		cliDir,
	);
}

async function buildHostService(): Promise<string> {
	const hostServiceDir = resolve(import.meta.dir, "../../host-service");
	await exec("bun", ["run", "build:host"], hostServiceDir);
	return join(hostServiceDir, "dist", "host-service.js");
}

function writeHostWrapper(binDir: string): void {
	const wrapper = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_PATH="$SCRIPT_DIR/../lib/node_modules"
exec "$SCRIPT_DIR/../lib/node" "$SCRIPT_DIR/../lib/host-service.js" "$@"
`;
	const wrapperPath = join(binDir, "superset-host");
	writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
	chmodSync(wrapperPath, 0o755);
}

async function main(): Promise<void> {
	const { target } = parseArgs();
	const cliDir = resolve(import.meta.dir, "..");
	const stagingRoot = join(cliDir, "dist", `superset-${target}`);

	if (existsSync(stagingRoot)) rmSync(stagingRoot, { recursive: true });
	mkdirSync(join(stagingRoot, "bin"), { recursive: true });
	mkdirSync(join(stagingRoot, "lib"), { recursive: true });
	mkdirSync(join(stagingRoot, "share"), { recursive: true });

	console.log(`[build-dist] target: ${target}`);
	console.log(`[build-dist] staging: ${stagingRoot}`);

	console.log("[build-dist] building CLI binary");
	await buildCli(target, join(stagingRoot, "bin", "superset"));

	console.log("[build-dist] building host-service bundle");
	const hostServiceBundle = await buildHostService();
	cpSync(hostServiceBundle, join(stagingRoot, "lib", "host-service.js"));

	console.log("[build-dist] fetching Node.js");
	await downloadAndExtractNode(target, join(stagingRoot, "lib"));

	console.log("[build-dist] copying native addon packages");
	copyNativePackages(join(stagingRoot, "lib"));

	console.log("[build-dist] copying migrations");
	const migrationsSrc = resolve(import.meta.dir, "../../host-service/drizzle");
	cpSync(migrationsSrc, join(stagingRoot, "share", "migrations"), {
		recursive: true,
	});

	console.log("[build-dist] writing host wrapper");
	writeHostWrapper(join(stagingRoot, "bin"));

	const tarball = join(cliDir, "dist", `superset-${target}.tar.gz`);
	console.log(`[build-dist] creating ${tarball}`);
	// Tar from inside the staging dir so contents extract directly to the
	// install target (no top-level superset-<target>/ wrapper).
	await exec("tar", ["-czf", tarball, "-C", stagingRoot, "."]);

	console.log(`[build-dist] done: ${tarball}`);
}

await main();
