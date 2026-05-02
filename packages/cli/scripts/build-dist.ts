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
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

type Target = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64";

const VALID_TARGETS: Target[] = [
	"darwin-arm64",
	"darwin-x64",
	"linux-x64",
	"linux-arm64",
];
const NODE_VERSION = "22.13.0";

/**
 * Native addon packages that must be shipped alongside the bundled
 * host-service because they contain .node files that can't be inlined.
 */
const NATIVE_PACKAGES = [
	"better-sqlite3",
	"node-pty",
	"@parcel/watcher",
	"libsql",
	"onnxruntime-node",
	"@anush008/tokenizers",
] as const;

/**
 * Platform-specific native bindings that live in optional dependencies
 * of their parent package and are only installed for the matching host.
 * `copyPackageWithDeps` only walks `dependencies`, so these need to be
 * listed explicitly per target. Linux variants pin glibc (gnu) — we don't
 * ship musl builds.
 */
const TARGET_NATIVE_PACKAGES: Record<Target, string[]> = {
	"darwin-arm64": [
		"@libsql/darwin-arm64",
		"@parcel/watcher-darwin-arm64",
		"@anush008/tokenizers-darwin-universal",
	],
	"darwin-x64": [
		"@libsql/darwin-x64",
		"@parcel/watcher-darwin-x64",
		"@anush008/tokenizers-darwin-universal",
	],
	"linux-x64": [
		"@libsql/linux-x64-gnu",
		"@parcel/watcher-linux-x64-glibc",
		"@anush008/tokenizers-linux-x64-gnu",
	],
	"linux-arm64": [
		"@libsql/linux-arm64-gnu",
		"@parcel/watcher-linux-arm64-glibc",
		"@anush008/tokenizers-linux-arm64-gnu",
	],
};

/**
 * NODE_MODULE_VERSION of the Node.js runtime we ship. Bumped alongside
 * NODE_VERSION. Used to fetch the matching better-sqlite3 prebuild from
 * GitHub releases.
 */
const NODE_ABI = "127"; // Node 22.x

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

function targetParts(target: Target): { platform: string; arch: string } {
	const [platform, arch] = target.split("-") as [string, string];
	return { platform, arch };
}

function nodeArchiveName(target: Target): string {
	const { platform, arch } = targetParts(target);
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

function findPackagePath(
	packageName: string,
	startDir: string,
	repoRoot: string,
): string | null {
	let current = startDir;
	while (current.startsWith(repoRoot)) {
		const candidate = join(current, "node_modules", packageName);
		if (existsSync(candidate)) return realpathSync(candidate);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const fallbacks = [
		join(repoRoot, "packages", "host-service", "node_modules", packageName),
		join(repoRoot, "packages", "workspace-fs", "node_modules", packageName),
		join(repoRoot, "node_modules", packageName),
	];
	for (const fallback of fallbacks) {
		if (existsSync(fallback)) return realpathSync(fallback);
	}
	// Bun isolated store fallback: node_modules/.bun/<encoded>@<ver>/node_modules/<name>
	// where scoped names have `/` encoded as `+` in the store directory.
	// If multiple versions exist, error rather than silently picking one —
	// the walker is meant to be deterministic for reproducible tarballs.
	const bunStore = join(repoRoot, "node_modules", ".bun");
	if (existsSync(bunStore)) {
		const encoded = packageName.replace("/", "+");
		const prefix = `${encoded}@`;
		const matches = readdirSync(bunStore)
			.filter((entry) => entry.startsWith(prefix))
			.map((entry) => join(bunStore, entry, "node_modules", packageName))
			.filter((candidate) => existsSync(candidate));
		if (matches.length === 1) return realpathSync(matches[0] as string);
		if (matches.length > 1) {
			throw new Error(
				`Ambiguous Bun store matches for ${packageName}: ${matches.join(", ")}`,
			);
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

function copyNativePackages(libDir: string, target: Target): void {
	const repoRoot = resolve(import.meta.dir, "../../..");
	const destModules = join(libDir, "node_modules");
	mkdirSync(destModules, { recursive: true });
	const copied = new Set<string>();

	const hostServiceDir = join(repoRoot, "packages", "host-service");
	const packages = [...NATIVE_PACKAGES, ...TARGET_NATIVE_PACKAGES[target]];
	for (const pkg of packages) {
		console.log(`[build-dist]   copying ${pkg} (+ deps)`);
		copyPackageWithDeps(pkg, hostServiceDir, repoRoot, destModules, copied);
	}
}

/**
 * Native addons need to be built against the bundled Node runtime's ABI,
 * not Electron's. Two cases:
 *
 * - On macOS, desktop's `install:deps` runs electron-rebuild during root
 *   `bun install` and clobbers the hoisted `build/Release/*.node` files
 *   with Electron-ABI builds. So we always overwrite better-sqlite3's
 *   binary with a fetched Node-ABI prebuild, and for node-pty we delete
 *   `build/Release/` so the `bindings` loader falls through to its
 *   bundled `prebuilds/<target>/pty.node`.
 * - On Linux, node-pty ships no prebuilds, so we ALWAYS need a freshly
 *   compiled `build/Release/pty.node` against the bundled Node runtime
 *   (CI does this via `npm rebuild` after `bun install --ignore-scripts`).
 *   Keep `build/Release/`.
 */
async function fixNativeBinariesForNode(
	libDir: string,
	target: Target,
): Promise<void> {
	const destModules = join(libDir, "node_modules");

	const bsqDest = join(destModules, "better-sqlite3", "build", "Release");
	const bsqVersion = JSON.parse(
		readFileSync(join(destModules, "better-sqlite3", "package.json"), "utf-8"),
	).version as string;
	const bsqUrl =
		`https://github.com/WiseLibs/better-sqlite3/releases/download/` +
		`v${bsqVersion}/better-sqlite3-v${bsqVersion}-node-v${NODE_ABI}-${target}.tar.gz`;
	console.log(`[build-dist] fetching Node-ABI better-sqlite3: ${bsqUrl}`);
	const tmp = join(homedir(), ".superset-build-cache", `bsq-${target}`);
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	const tarball = join(tmp, "bsq.tar.gz");
	await exec("curl", ["-fsSL", "-o", tarball, bsqUrl]);
	await exec("tar", ["-xzf", tarball, "-C", tmp]);
	rmSync(bsqDest, { recursive: true, force: true });
	mkdirSync(bsqDest, { recursive: true });
	cpSync(
		join(tmp, "build", "Release", "better_sqlite3.node"),
		join(bsqDest, "better_sqlite3.node"),
	);

	const { platform } = targetParts(target);
	const nodePtyBuild = join(destModules, "node-pty", "build");
	if (platform === "darwin" && existsSync(nodePtyBuild)) {
		console.log(
			"[build-dist] removing node-pty build/ so bindings falls back to prebuilds/",
		);
		rmSync(nodePtyBuild, { recursive: true, force: true });
	}
}

async function buildCli(target: Target, outputPath: string): Promise<void> {
	const cliDir = resolve(import.meta.dir, "..");
	await exec(
		"bunx",
		[
			"cli-framework",
			"build",
			`--target=bun-${target}`,
			`--outfile=${outputPath}`,
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
	copyNativePackages(join(stagingRoot, "lib"), target);

	console.log("[build-dist] fixing native binaries for Node runtime");
	await fixNativeBinariesForNode(join(stagingRoot, "lib"), target);

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
