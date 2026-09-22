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
import { getBinDir } from "@superset/agent-setup/paths";
import { app } from "electron";

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

/**
 * A dev build talks to a dev stack, and the binary defaults to production, so
 * the addresses travel in the shim rather than being compiled into the CLI.
 */
function devStackAddresses(): Array<[string, string]> {
	if (app.isPackaged) return [];
	const api = process.env.NEXT_PUBLIC_API_URL;
	const web = process.env.NEXT_PUBLIC_WEB_URL;
	return [
		...(api ? ([["SUPERSET_API_URL", api]] as Array<[string, string]>) : []),
		...(web ? ([["SUPERSET_WEB_URL", web]] as Array<[string, string]>) : []),
	];
}

export function buildBundledCliShim(
	bundledCliPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const addresses = devStackAddresses();
	if (platform === "win32") {
		const sets = addresses
			.map(([key, value]) => `set ${key}=${value}\r\n`)
			.join("");
		return `@echo off\r\nrem ${BUNDLED_CLI_SHIM_MARKER}\r\n${sets}${quoteCmdLiteral(
			bundledCliPath,
		)} %*\r\n`;
	}

	const exports = addresses
		.map(([key, value]) => `export ${key}=${quoteShellLiteral(value)}\n`)
		.join("");
	return `#!/bin/sh
${BUNDLED_CLI_SHIM_MARKER}
${exports}exec ${quoteShellLiteral(bundledCliPath)} "$@"
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

	const binDir = options.binDir ?? getBinDir();
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
