import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { msg } from "@lingui/core/macro";
import { boolean, CLIError, string } from "@superset/cli-framework";
import { i18n } from "@superset/i18n";
import { acquireInstallUpdateLock } from "@superset/shared/install-update-lock";
import { command } from "../../lib/command";
import {
	env,
	isDesktopBundled,
	mixedOriginUpdateError,
	standaloneInstallHint,
} from "../../lib/env";
import { atomicReplace, backupRootFor } from "./atomic-replace";

// `cli-latest` is a rolling GH Release/tag updated by build-cli.yml on every
// CLI release. Reading from a fixed download path (rather than the global
// `/releases/latest` endpoint, which doesn't filter by tag prefix) keeps the
// CLI's update channel independent of desktop releases — which would otherwise
// shadow CLI on `/releases/latest`.
const UPDATE_BASE = env.CLI_UPDATE_BASE_URL.replace(/\/$/, "");
const ROLLING_DOWNLOAD_BASE = `${UPDATE_BASE}/cli-latest`;
const execFileAsync = promisify(execFile);

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
	if (!SEMVER_RE.test(version)) {
		throw new CLIError(
			i18n._(msg({ message: "Invalid version manifest at cli-latest" })),
		);
	}
	return version;
}

function tarballUrl(target: string, version: string): string {
	return `${UPDATE_BASE}/cli-v${version}/superset-${target}.tar.gz`;
}

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;

async function downloadAndExtract(url: string, destDir: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new CLIError(`Download failed: ${response.status}`);
	}

	mkdirSync(destDir, { recursive: true });

	const archivePath = join(destDir, ".download.tar.gz");
	try {
		await pipeline(
			Readable.fromWeb(
				response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
			),
			createWriteStream(archivePath, { flags: "wx", mode: 0o600 }),
		);
		const checksums = await fetch(
			`${url.slice(0, url.lastIndexOf("/"))}/sha256sums.txt`,
		);
		if (checksums.status !== 404) {
			if (!checksums.ok) {
				const status = checksums.status;
				throw new CLIError(
					i18n._(msg({ message: `Checksum download failed: ${status}` })),
				);
			}
			const name = new URL(url).pathname.split("/").at(-1);
			const expected = (await checksums.text())
				.split("\n")
				.map((line) => /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim()))
				.find((match) => match?.[2] === name)?.[1];
			const hash = createHash("sha256");
			for await (const chunk of createReadStream(archivePath))
				hash.update(chunk);
			if (!expected || expected.toLowerCase() !== hash.digest("hex")) {
				throw new CLIError(
					i18n._(msg({ message: "Downloaded CLI archive checksum mismatch" })),
				);
			}
		}
		const tar = spawn("tar", ["-xzf", archivePath, "-C", destDir], {
			stdio: ["ignore", "ignore", "inherit"],
		});
		await new Promise<void>((resolve, reject) => {
			tar.once("error", reject);
			tar.once("close", (code) => {
				if (code === 0) resolve();
				else reject(new CLIError(`tar exited with code ${code}`));
			});
		});
	} finally {
		rmSync(archivePath, { force: true });
	}
}

function findExtractedRoot(extractDir: string): string {
	const entries = readdirSync(extractDir);
	if (entries.length === 1) {
		const sole = join(extractDir, entries[0] ?? "");
		if (statSync(sole).isDirectory()) return sole;
	}
	return extractDir;
}

function resolveInstallRoot(): string {
	if (process.env.SUPERSET_INSTALL_ROOT) {
		return process.env.SUPERSET_INSTALL_ROOT;
	}
	const cliBin = process.execPath;
	return dirname(dirname(cliBin));
}

export default command({
	sandbox: false,
	description: "Update the Superset CLI and host service to the latest release",
	skipMiddleware: true,
	options: {
		check: boolean().desc("Only check for updates; don't install"),
		force: boolean().desc("Re-install even if already on that version"),
		version: string().desc(
			"Install a specific CLI version (e.g. 0.1.2) instead of the rolling latest",
		),
		keepBackup: boolean().desc(
			"Leave the previous install at <root>.bak so a caller restarting the host service out of the new tree can roll back",
		),
	},
	run: async ({ options }) => {
		if (isDesktopBundled()) {
			throw new CLIError(
				"This CLI is bundled with the Superset desktop app and updates together with the app.",
				standaloneInstallHint(),
			);
		}

		const originError = mixedOriginUpdateError();
		if (originError) throw new CLIError(originError);

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
		const releaseLock = acquireInstallUpdateLock(installRoot, {
			allowParent: true,
		});
		let tempDir: string | undefined;
		try {
			tempDir = mkdtempSync(`${installRoot}.update-`);
			await downloadAndExtract(tarballUrl(target, targetVersion), tempDir);
			const newRoot = findExtractedRoot(tempDir);
			const newBin = join(newRoot, "bin", "superset");
			if (!existsSync(newBin)) {
				throw new CLIError(
					`Extracted archive missing bin/superset (expected at ${newBin})`,
				);
			}
			chmodSync(newBin, 0o755);
			const versionFile = join(newRoot, "share", "version.txt");
			if (
				existsSync(versionFile) &&
				readFileSync(versionFile, "utf8").trim() !== targetVersion
			) {
				throw new CLIError(
					i18n._(msg({ message: "Downloaded CLI archive version mismatch" })),
				);
			}
			let downloadedVersion: string;
			try {
				const probe = await execFileAsync(newBin, ["--version"], {
					timeout: 10_000,
					maxBuffer: 4096,
				});
				downloadedVersion = probe.stdout.trim();
			} catch (cause) {
				throw new CLIError(
					i18n._(msg({ message: "Downloaded CLI version probe failed" })),
					String(cause),
				);
			}
			if (downloadedVersion !== targetVersion) {
				throw new CLIError(
					i18n._(
						msg({
							message: `Downloaded CLI binary version mismatch (expected ${targetVersion})`,
						}),
					),
				);
			}
			const newHostBin = join(newRoot, "bin", "superset-host");
			if (existsSync(newHostBin)) chmodSync(newHostBin, 0o755);

			atomicReplace(installRoot, newRoot, {
				keepBackup: options.keepBackup ?? false,
			});

			return {
				data: {
					current: currentVersion,
					target: targetVersion,
					updated: true,
					installRoot,
					...(options.keepBackup
						? { backupRoot: backupRootFor(installRoot) }
						: {}),
				},
				message: pinnedVersion
					? `Installed ${targetVersion} (${installRoot})`
					: `Updated ${currentVersion} → ${targetVersion} (${installRoot})`,
			};
		} finally {
			try {
				if (tempDir) rmSync(tempDir, { recursive: true, force: true });
			} finally {
				releaseLock();
			}
		}
	},
});
