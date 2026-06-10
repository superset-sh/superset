import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { env } from "../../lib/env";

// `cli-latest` is a rolling GH Release/tag updated by build-cli.yml on every
// CLI release. Reading from a fixed download path (rather than the global
// `/releases/latest` endpoint, which doesn't filter by tag prefix) keeps the
// CLI's update channel independent of desktop releases — which would otherwise
// shadow CLI on `/releases/latest`.
const ROLLING_DOWNLOAD_BASE =
	"https://github.com/superset-sh/superset/releases/download/cli-latest";

export function detectTargetFor(
	platform: NodeJS.Platform,
	arch: NodeJS.Architecture,
): string {
	const normalizedArch = arch === "arm64" ? "arm64" : "x64";
	if (platform === "darwin") return `darwin-${normalizedArch}`;
	if (platform === "linux") return `linux-${normalizedArch}`;
	if (platform === "win32" && normalizedArch === "x64") return "win32-x64";
	throw new CLIError(`Unsupported platform: ${platform}/${arch}`);
}

function detectTarget(): string {
	return detectTargetFor(process.platform, process.arch);
}

export function isCliSelfUpdateSupported(
	platform: NodeJS.Platform = process.platform,
): boolean {
	return platform !== "win32";
}

function getCurrentVersion(): string {
	return env.VERSION;
}

async function fetchLatestVersion(): Promise<string> {
	const response = await fetch(`${ROLLING_DOWNLOAD_BASE}/version.txt`, {
		redirect: "follow",
	});
	if (!response.ok) {
		throw new CLIError(
			`Failed to fetch latest CLI version: ${response.status} ${response.statusText}`,
		);
	}
	const version = (await response.text()).trim();
	if (!version) {
		throw new CLIError("Empty version manifest at cli-latest");
	}
	return version;
}

function tarballUrl(target: string, version?: string): string {
	if (!version) {
		return `${ROLLING_DOWNLOAD_BASE}/superset-${target}.tar.gz`;
	}
	return `https://github.com/superset-sh/superset/releases/download/cli-v${version}/superset-${target}.tar.gz`;
}

export function cliBinaryNameForTarget(target: string): string {
	return target.startsWith("win32-") ? "superset.exe" : "superset";
}

function hostBinaryNameForTarget(target: string): string {
	return target.startsWith("win32-") ? "superset-host.cmd" : "superset-host";
}

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;

async function downloadAndExtract(url: string, destDir: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new CLIError(`Download failed: ${response.status}`);
	}

	mkdirSync(destDir, { recursive: true });

	const tar = spawn("tar", ["-xzf", "-", "-C", destDir], {
		stdio: ["pipe", "ignore", "inherit"],
	});

	await pipeline(
		Readable.fromWeb(
			response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
		),
		tar.stdin,
	);

	await new Promise<void>((resolve, reject) => {
		tar.once("error", reject);
		tar.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new CLIError(`tar exited with code ${code}`));
		});
	});
}

function findExtractedRoot(extractDir: string): string {
	const entries = readdirSync(extractDir);
	if (entries.length === 1) {
		const sole = join(extractDir, entries[0] ?? "");
		if (statSync(sole).isDirectory()) return sole;
	}
	return extractDir;
}

function atomicReplace(installRoot: string, newRoot: string): void {
	const backupRoot = `${installRoot}.bak`;
	if (existsSync(backupRoot)) {
		rmSync(backupRoot, { recursive: true, force: true });
	}
	if (existsSync(installRoot)) {
		renameSync(installRoot, backupRoot);
	}
	try {
		renameSync(newRoot, installRoot);
	} catch (error) {
		if (existsSync(backupRoot)) {
			renameSync(backupRoot, installRoot);
		}
		throw error;
	}
	rmSync(backupRoot, { recursive: true, force: true });
}

function batchSetValue(value: string): string {
	return value.replaceAll("%", "%%").replaceAll("\r", "").replaceAll("\n", "");
}

export function buildWindowsDeferredReplaceScript({
	installRoot,
	newRoot,
	tempDir,
	parentPid,
}: {
	installRoot: string;
	newRoot: string;
	tempDir: string;
	parentPid: number;
}): string {
	const backupRoot = `${installRoot}.bak`;
	return `@echo off
setlocal
set "PARENT_PID=${parentPid}"
set "INSTALL_ROOT=${batchSetValue(installRoot)}"
set "NEW_ROOT=${batchSetValue(newRoot)}"
set "BACKUP_ROOT=${batchSetValue(backupRoot)}"
set "TEMP_DIR=${batchSetValue(tempDir)}"

:wait
tasklist.exe /FI "PID eq %PARENT_PID%" /FO CSV /NH | findstr /C:"\\"%PARENT_PID%\\"" >nul 2>nul
if not errorlevel 1 (
  timeout.exe /T 1 /NOBREAK >nul
  goto wait
)

if exist "%BACKUP_ROOT%" rmdir /S /Q "%BACKUP_ROOT%"
if exist "%INSTALL_ROOT%" move /Y "%INSTALL_ROOT%" "%BACKUP_ROOT%" >nul || goto fail
move /Y "%NEW_ROOT%" "%INSTALL_ROOT%" >nul || goto restore
if exist "%BACKUP_ROOT%" rmdir /S /Q "%BACKUP_ROOT%"
if exist "%TEMP_DIR%" rmdir /S /Q "%TEMP_DIR%"
del "%~f0" >nul 2>nul
exit /B 0

:restore
if exist "%BACKUP_ROOT%" if not exist "%INSTALL_ROOT%" move /Y "%BACKUP_ROOT%" "%INSTALL_ROOT%" >nul

:fail
echo Superset CLI update failed. >&2
exit /B 1
`;
}

function scheduleWindowsDeferredReplace({
	installRoot,
	newRoot,
	tempDir,
}: {
	installRoot: string;
	newRoot: string;
	tempDir: string;
}): string {
	const scriptPath = `${installRoot}.update-${process.pid}.cmd`;
	writeFileSync(
		scriptPath,
		buildWindowsDeferredReplaceScript({
			installRoot,
			newRoot,
			tempDir,
			parentPid: process.pid,
		}),
	);
	const child = spawn("cmd.exe", ["/d", "/s", "/c", `"${scriptPath}"`], {
		detached: true,
		stdio: "ignore",
		windowsVerbatimArguments: true,
	});
	child.unref();
	return scriptPath;
}

function resolveInstallRoot(): string {
	if (process.env.SUPERSET_INSTALL_ROOT) {
		return process.env.SUPERSET_INSTALL_ROOT;
	}
	const cliBin = process.execPath;
	return dirname(dirname(cliBin));
}

export default command({
	description: "Update the Superset CLI and host service to the latest release",
	skipMiddleware: true,
	options: {
		check: boolean().desc("Only check for updates; don't install"),
		force: boolean().desc("Re-install even if already on that version"),
		version: string().desc(
			"Install a specific CLI version (e.g. 0.1.2) instead of the rolling latest",
		),
	},
	run: async ({ options }) => {
		if (!isCliSelfUpdateSupported()) {
			throw new CLIError(
				"`superset update` is not available on Windows",
				"Use Superset desktop's built-in updater for Windows installs.",
			);
		}

		const target = detectTarget();
		const currentVersion = getCurrentVersion();
		if (currentVersion === "0.0.0-dev") {
			throw new CLIError(
				"`superset update` is only available in built binaries",
				"You're running a dev build (`bun run dev`). Re-run with the released binary.",
			);
		}

		const pinnedVersion = options.version?.replace(/^cli-v/, "");
		if (pinnedVersion && !SEMVER_RE.test(pinnedVersion)) {
			throw new CLIError(
				`Invalid --version: ${options.version}`,
				"Expected a semver like 0.1.2 (or cli-v0.1.2).",
			);
		}

		const targetVersion = pinnedVersion ?? (await fetchLatestVersion());
		const upToDate = !options.force && currentVersion === targetVersion;

		if (options.check) {
			return {
				data: {
					current: currentVersion,
					target: targetVersion,
					upToDate,
					pinned: !!pinnedVersion,
				},
				message: upToDate
					? `Up to date (${currentVersion}).`
					: pinnedVersion
						? `Will install pinned ${targetVersion} (currently ${currentVersion}).`
						: `Update available: ${currentVersion} → ${targetVersion}`,
			};
		}

		if (upToDate) {
			return {
				data: {
					current: currentVersion,
					target: targetVersion,
					updated: false,
				},
				message: `Already on ${currentVersion}.`,
			};
		}

		const installRoot = resolveInstallRoot();
		// Stage as a sibling of the install root so the final renameSync()
		// is an intra-filesystem move. tmpdir() is frequently a separate
		// mount (tmpfs on Linux) — renaming across it fails with EXDEV.
		const tempDir = mkdtempSync(`${installRoot}.update-`);
		let preserveTempDir = false;

		try {
			await downloadAndExtract(tarballUrl(target, pinnedVersion), tempDir);
			const newRoot = findExtractedRoot(tempDir);
			const newBin = join(newRoot, "bin", cliBinaryNameForTarget(target));
			if (!existsSync(newBin)) {
				throw new CLIError(
					`Extracted archive missing bin/${cliBinaryNameForTarget(target)} (expected at ${newBin})`,
				);
			}
			if (process.platform !== "win32") {
				chmodSync(newBin, 0o755);
				const newHostBin = join(
					newRoot,
					"bin",
					hostBinaryNameForTarget(target),
				);
				if (existsSync(newHostBin)) chmodSync(newHostBin, 0o755);
			}

			let deferredScript: string | undefined;
			if (process.platform === "win32") {
				deferredScript = scheduleWindowsDeferredReplace({
					installRoot,
					newRoot,
					tempDir,
				});
				preserveTempDir = true;
			} else {
				atomicReplace(installRoot, newRoot);
			}

			return {
				data: {
					current: currentVersion,
					target: targetVersion,
					updated: true,
					installRoot,
					deferred: !!deferredScript,
					deferredScript,
				},
				message: pinnedVersion
					? process.platform === "win32"
						? `Staged ${targetVersion}; it will install after this process exits (${installRoot})`
						: `Installed ${targetVersion} (${installRoot})`
					: process.platform === "win32"
						? `Staged update ${currentVersion} → ${targetVersion}; it will install after this process exits (${installRoot})`
						: `Updated ${currentVersion} → ${targetVersion} (${installRoot})`,
			};
		} finally {
			if (!preserveTempDir) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		}
	},
});
