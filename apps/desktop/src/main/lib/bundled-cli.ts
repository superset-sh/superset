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
import path from "node:path";
import { app } from "electron";
import { BIN_DIR } from "./agent-setup/paths";

export const BUNDLED_CLI_SHIM_MARKER = "# Superset bundled CLI shim v1";
const SHIM_HEADER_BYTES = 2048;

export type BundledCliInstallStatus = "installed" | "missing" | "skipped";

interface InstallBundledCliShimOptions {
	binDir?: string;
	bundledCliPath?: string | null;
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

function getBundledCliCandidates(platform: NodeJS.Platform): string[] {
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

	if (!bundledCliPath || !existsSync(bundledCliPath)) {
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
	writeFileSync(shimPath, buildBundledCliShim(bundledCliPath, platform), {
		mode: platform === "win32" ? 0o644 : 0o755,
	});

	console.log(`[bundled-cli] Installed Superset CLI shim at ${shimPath}`);
	return "installed";
}
