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
} from "node:fs";
import { tmpdir } from "node:os";
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

function detectTarget(): string {
	const arch = process.arch === "arm64" ? "arm64" : "x64";
	if (process.platform === "darwin") return `darwin-${arch}`;
	if (process.platform === "linux") return `linux-${arch}`;
	throw new CLIError(
		`Unsupported platform: ${process.platform}/${process.arch}`,
	);
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
		const tempDir = mkdtempSync(join(tmpdir(), "superset-update-"));

		try {
			await downloadAndExtract(tarballUrl(target, pinnedVersion), tempDir);
			const newRoot = findExtractedRoot(tempDir);
			const newBin = join(newRoot, "bin", "superset");
			if (!existsSync(newBin)) {
				throw new CLIError(
					`Extracted archive missing bin/superset (expected at ${newBin})`,
				);
			}
			chmodSync(newBin, 0o755);
			const newHostBin = join(newRoot, "bin", "superset-host");
			if (existsSync(newHostBin)) chmodSync(newHostBin, 0o755);

			atomicReplace(installRoot, newRoot);

			return {
				data: {
					current: currentVersion,
					target: targetVersion,
					updated: true,
					installRoot,
				},
				message: pinnedVersion
					? `Installed ${targetVersion} (${installRoot})`
					: `Updated ${currentVersion} → ${targetVersion} (${installRoot})`,
			};
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	},
});
