import {
	closeSync,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { BIN_DIR } from "./agent-setup/paths";

export const BUNDLED_CLI_SHIM_MARKER = "# Superset bundled CLI shim v1";
const SHIM_HEADER_BYTES = 2048;
const require = createRequire(import.meta.url);

export type BundledCliInstallStatus = "installed" | "missing" | "skipped";

interface InstallBundledCliShimOptions {
	binDir?: string;
	bundledCliPath?: string | null;
	devCliPackageDir?: string | null;
	platform?: NodeJS.Platform;
}

export function getBundledCliBinaryName(
	platform: NodeJS.Platform = process.platform,
): string {
	return platform === "win32" ? "superset.exe" : "superset";
}

export function getBundledCliShimName(
	platform: NodeJS.Platform = process.platform,
): string {
	return platform === "win32" ? "superset.cmd" : "superset";
}

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quoteCmdLiteral(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

export function buildBundledCliShim(
	bundledCliPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	if (platform === "win32") {
		return `@echo off\r\nrem ${BUNDLED_CLI_SHIM_MARKER}\r\n${quoteCmdLiteral(
			bundledCliPath,
		)} %*\r\n`;
	}

	return `#!/bin/sh
${BUNDLED_CLI_SHIM_MARKER}
exec ${quoteShellLiteral(bundledCliPath)} "$@"
`;
}

export function buildDevCliShim(cliPackageDir: string): string {
	return `#!/bin/sh
${BUNDLED_CLI_SHIM_MARKER}
exec bun run --cwd ${quoteShellLiteral(cliPackageDir)} dev "$@"
`;
}

function getBundledCliCandidates(platform: NodeJS.Platform): string[] {
	const app = require("electron").app as Electron.App;
	const binaryName = getBundledCliBinaryName(platform);
	const candidates = [
		app.isPackaged
			? path.join(process.resourcesPath, "resources/bin", binaryName)
			: null,
		path.join(__dirname, "../resources/bin", binaryName),
		path.join(app.getAppPath(), "dist/resources/bin", binaryName),
		path.resolve(app.getAppPath(), "../../packages/cli/dist", binaryName),
	];

	return candidates.filter((candidate): candidate is string => !!candidate);
}

export function resolveBundledCliPath(
	platform: NodeJS.Platform = process.platform,
): string | null {
	return (
		getBundledCliCandidates(platform).find((candidate) =>
			existsSync(candidate),
		) ?? null
	);
}

function getDevCliPackageDirCandidates(): string[] {
	const app = require("electron").app as Electron.App;
	return [
		path.resolve(app.getAppPath(), "../../packages/cli"),
		path.resolve(process.cwd(), "packages/cli"),
	];
}

export function resolveDevCliPackageDir(): string | null {
	const app = require("electron").app as Electron.App;
	if (app.isPackaged) return null;
	return (
		getDevCliPackageDirCandidates().find((candidate) =>
			existsSync(path.join(candidate, "package.json")),
		) ?? null
	);
}

function shouldReplaceShim(shimPath: string): boolean {
	if (!existsSync(shimPath)) return true;

	const stat = lstatSync(shimPath);
	if (!stat.isFile()) return false;

	const fd = openSync(shimPath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(SHIM_HEADER_BYTES, stat.size));
		const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
		return buffer
			.toString("utf-8", 0, bytesRead)
			.includes(BUNDLED_CLI_SHIM_MARKER);
	} finally {
		closeSync(fd);
	}
}

export function installBundledCliShim(
	options: InstallBundledCliShimOptions = {},
): BundledCliInstallStatus {
	const platform = options.platform ?? process.platform;
	const bundledCliPath =
		options.bundledCliPath ?? resolveBundledCliPath(platform);
	const hasBundledCli = !!bundledCliPath && existsSync(bundledCliPath);
	const devCliPackageDir = hasBundledCli
		? null
		: options.devCliPackageDir === undefined
			? resolveDevCliPackageDir()
			: options.devCliPackageDir;

	if (!hasBundledCli && !devCliPackageDir) {
		console.debug("[bundled-cli] No bundled CLI binary found");
		return "missing";
	}

	const binDir = options.binDir ?? BIN_DIR;
	const shimPath = path.join(binDir, getBundledCliShimName(platform));
	if (!shouldReplaceShim(shimPath)) {
		console.warn(
			`[bundled-cli] Skipping ${shimPath}; an unmanaged file already exists`,
		);
		return "skipped";
	}

	mkdirSync(binDir, { recursive: true });
	if (existsSync(shimPath)) {
		unlinkSync(shimPath);
	}
	const shim = hasBundledCli
		? buildBundledCliShim(bundledCliPath, platform)
		: buildDevCliShim(devCliPackageDir as string);
	writeFileSync(shimPath, shim, { mode: platform === "win32" ? 0o644 : 0o755 });

	console.log(`[bundled-cli] Installed Superset CLI shim at ${shimPath}`);
	return "installed";
}
