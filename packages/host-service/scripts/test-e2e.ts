// Runs the host-service end-to-end adoption test under Electron-as-Node.
//
// Why Electron and not raw `node`: host-service uses better-sqlite3, whose
// native module is compiled against the Electron bundled Node ABI for
// production. Running the test under Electron-as-Node ensures the same
// native-module ABI as production. Raw `node` would fail with
// NODE_MODULE_VERSION mismatch.
//
// Usage: bun run test:e2e

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

type ElectronBinaryOptions = {
	existsSync?: (path: string) => boolean;
	platform?: NodeJS.Platform;
	readdirSync?: typeof fs.readdirSync;
	repoRoot?: string;
};

function getElectronBinarySuffix(platform: NodeJS.Platform): string {
	if (platform === "darwin") {
		return path.join("dist", "Electron.app", "Contents", "MacOS", "Electron");
	}
	return path.join("dist", platform === "win32" ? "electron.exe" : "electron");
}

function getBunElectronPackageDirs(
	root: string,
	readdirSync: typeof fs.readdirSync,
): string[] {
	const bunStoreDir = path.join(root, "node_modules", ".bun");

	try {
		return readdirSync(bunStoreDir, { withFileTypes: true })
			.filter(
				(entry) => entry.isDirectory() && entry.name.startsWith("electron@"),
			)
			.map((entry) =>
				path.join(bunStoreDir, entry.name, "node_modules", "electron"),
			);
	} catch {
		return [];
	}
}

export function getElectronBinaryCandidates(
	options: ElectronBinaryOptions = {},
): string[] {
	const root = options.repoRoot ?? repoRoot;
	const platform = options.platform ?? process.platform;
	const readdirSync = options.readdirSync ?? fs.readdirSync;
	const suffix = getElectronBinarySuffix(platform);
	const packageDirs = [
		path.join(root, "apps", "desktop", "node_modules", "electron"),
		path.join(root, "node_modules", "electron"),
		...getBunElectronPackageDirs(root, readdirSync),
	];

	return packageDirs.map((dir) => path.join(dir, suffix));
}

// Resolve the Electron binary from the workspace's node_modules. Bun can expose
// it either through apps/desktop/node_modules, root node_modules, or the flat
// node_modules/.bun store, depending on install strategy.
export function findElectronBinary(
	options: ElectronBinaryOptions = {},
): string {
	const existsSync = options.existsSync ?? fs.existsSync;
	const first = getElectronBinaryCandidates(options).find((candidate) =>
		existsSync(candidate),
	);

	if (!first) {
		throw new Error(
			"Electron binary not found. Run `bun install` from the repo root first.",
		);
	}

	return first;
}

export function hasNativeModuleAbiMismatch(output: string): boolean {
	return (
		output.includes("NODE_MODULE_VERSION") &&
		output.includes("ERR_DLOPEN_FAILED")
	);
}

function formatNativeModuleAbiMismatchMessage(): string {
	return [
		"",
		"[test:e2e] Electron native modules are not rebuilt for Electron's Node ABI.",
		"Run `bun run --cwd apps/desktop install:deps` from the repo root, then rerun `bun run --cwd packages/host-service test:e2e`.",
		"",
		"On Windows, install:deps requires Visual Studio Build Tools 2022 with:",
		"- MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs",
		"- Windows 10 or Windows 11 SDK",
		"",
		"If you intentionally skipped desktop native rebuilds with SUPERSET_SKIP_DESKTOP_INSTALL_DEPS, unset it before reinstalling.",
	].join("\n");
}

function isMainModule(): boolean {
	return process.argv[1]
		? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
		: false;
}

function main(): never {
	const electronBin = findElectronBinary();
	const testFile = path.resolve(
		__dirname,
		"..",
		"src/terminal/terminal.adoption.node-test.ts",
	);

	if (!fs.existsSync(testFile)) {
		console.error(`Test file missing: ${testFile}`);
		process.exit(1);
	}

	const result = childProcess.spawnSync(
		electronBin,
		[
			"--experimental-strip-types",
			"--test",
			"--test-force-exit",
			"--test-reporter=spec",
			testFile,
		],
		{
			encoding: "utf8",
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
			maxBuffer: 64 * 1024 * 1024,
		},
	);

	process.stdout.write(result.stdout ?? "");
	process.stderr.write(result.stderr ?? "");

	if (result.error) {
		console.error(`[test:e2e] Failed to run Electron: ${result.error.message}`);
		process.exit(1);
	}

	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if ((result.status ?? 1) !== 0 && hasNativeModuleAbiMismatch(output)) {
		console.error(formatNativeModuleAbiMismatchMessage());
	}

	process.exit(result.status ?? 1);
}

if (isMainModule()) {
	main();
}
