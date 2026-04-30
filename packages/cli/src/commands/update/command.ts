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
import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { env } from "../../lib/env";

const RELEASES_API =
	"https://api.github.com/repos/superset-sh/superset/releases";

interface GitHubRelease {
	tag_name: string;
	name: string;
	prerelease: boolean;
	draft: boolean;
	assets: Array<{ name: string; browser_download_url: string }>;
}

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

async function fetchLatestRelease(): Promise<GitHubRelease> {
	const response = await fetch(`${RELEASES_API}/latest`, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!response.ok) {
		throw new CLIError(
			`Failed to fetch latest release: ${response.status} ${response.statusText}`,
		);
	}
	const release = (await response.json()) as GitHubRelease;
	if (!release.tag_name?.startsWith("cli-v")) {
		throw new CLIError(
			"No CLI release found. Latest tag is not a `cli-v*` release.",
		);
	}
	return release;
}

function findAsset(release: GitHubRelease, target: string) {
	const asset = release.assets.find(
		(a) => a.name === `superset-${target}.tar.gz`,
	);
	if (!asset) {
		throw new CLIError(
			`Release ${release.tag_name} has no asset for ${target}`,
			`Available: ${release.assets.map((a) => a.name).join(", ")}`,
		);
	}
	return asset;
}

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
		force: boolean().desc("Re-install even if already on the latest version"),
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
		const release = await fetchLatestRelease();
		const latestVersion = release.tag_name.replace(/^cli-v/, "");

		const upToDate = !options.force && currentVersion === latestVersion;

		if (options.check) {
			return {
				data: {
					current: currentVersion,
					latest: latestVersion,
					upToDate,
				},
				message: upToDate
					? `Up to date (${currentVersion}).`
					: `Update available: ${currentVersion} → ${latestVersion}`,
			};
		}

		if (upToDate) {
			return {
				data: {
					current: currentVersion,
					latest: latestVersion,
					updated: false,
				},
				message: `Already on ${currentVersion}.`,
			};
		}

		const asset = findAsset(release, target);
		const installRoot = resolveInstallRoot();
		const tempDir = mkdtempSync(join(tmpdir(), "superset-update-"));

		try {
			await downloadAndExtract(asset.browser_download_url, tempDir);
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
					latest: latestVersion,
					updated: true,
					installRoot,
				},
				message: `Updated ${currentVersion} → ${latestVersion} (${installRoot})`,
			};
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	},
});
