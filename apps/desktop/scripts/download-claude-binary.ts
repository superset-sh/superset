/**
 * Download Claude Code binary for bundling with the desktop app.
 *
 * This script downloads the Claude Code CLI binary from the official distribution
 * and places it in the resources/bin directory for electron-builder to package.
 *
 * Usage:
 *   bun run scripts/download-claude-binary.ts
 *   bun run scripts/download-claude-binary.ts --all     # Download all platforms
 *   bun run scripts/download-claude-binary.ts --version=2.1.17  # Specific version
 *
 * The binary is downloaded based on the current platform and architecture.
 */

import { createHash } from "node:crypto";
import {
	chmodSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import https from "node:https";
import { dirname, join } from "node:path";

// Claude Code distribution base URL (same as 1code uses)
const DIST_BASE =
	"https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

// Platform mappings
const PLATFORMS: Record<string, { dir: string; binary: string }> = {
	"darwin-arm64": { dir: "darwin-arm64", binary: "claude" },
	"darwin-x64": { dir: "darwin-x64", binary: "claude" },
	"linux-arm64": { dir: "linux-arm64", binary: "claude" },
	"linux-x64": { dir: "linux-x64", binary: "claude" },
	"win32-x64": { dir: "win32-x64", binary: "claude.exe" },
};

interface PlatformManifest {
	checksum: string;
	size: number;
}

interface Manifest {
	version: string;
	platforms: Record<string, PlatformManifest>;
}

function getPlatformKey(): string {
	return `${process.platform}-${process.arch}`;
}

/**
 * Fetch JSON from URL
 */
function fetchJson<T>(url: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const request = (requestUrl: string) => {
			https
				.get(requestUrl, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						const location = res.headers.location;
						if (location) {
							return request(location);
						}
						return reject(new Error("Redirect without location"));
					}
					if (res.statusCode !== 200) {
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					let data = "";
					res.on("data", (chunk) => {
						data += chunk;
					});
					res.on("end", () => resolve(JSON.parse(data) as T));
					res.on("error", reject);
				})
				.on("error", reject);
		};
		request(url);
	});
}

/**
 * Fetch text from URL
 */
function fetchText(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const request = (requestUrl: string) => {
			https
				.get(requestUrl, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						const location = res.headers.location;
						if (location) {
							return request(location);
						}
						return reject(new Error("Redirect without location"));
					}
					if (res.statusCode !== 200) {
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					let data = "";
					res.on("data", (chunk) => {
						data += chunk;
					});
					res.on("end", () => resolve(data));
					res.on("error", reject);
				})
				.on("error", reject);
		};
		request(url);
	});
}

/**
 * Download file with progress
 */
function downloadFile(url: string, destPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		// Ensure parent directory exists
		const parentDir = dirname(destPath);
		if (!existsSync(parentDir)) {
			mkdirSync(parentDir, { recursive: true });
		}

		const file = createWriteStream(destPath);

		const request = (requestUrl: string) => {
			https
				.get(requestUrl, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						const location = res.headers.location;
						if (location) {
							return request(location);
						}
						return reject(new Error("Redirect without location"));
					}

					if (res.statusCode !== 200) {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						return reject(new Error(`HTTP ${res.statusCode}`));
					}

					const totalSize = Number.parseInt(
						res.headers["content-length"] || "0",
						10,
					);
					let downloaded = 0;
					let lastPercent = 0;

					res.on("data", (chunk: Buffer) => {
						downloaded += chunk.length;
						if (totalSize > 0) {
							const percent = Math.floor((downloaded / totalSize) * 100);
							if (percent !== lastPercent && percent % 10 === 0) {
								process.stdout.write(`\r  Progress: ${percent}%`);
								lastPercent = percent;
							}
						}
					});

					res.pipe(file);

					file.on("finish", () => {
						file.close();
						process.stdout.write("\r  Progress: 100%\n");
						resolve();
					});

					res.on("error", (err) => {
						file.close();
						if (existsSync(destPath)) unlinkSync(destPath);
						reject(err);
					});
				})
				.on("error", (err) => {
					file.close();
					if (existsSync(destPath)) unlinkSync(destPath);
					reject(err);
				});
		};

		request(url);
	});
}

/**
 * Calculate SHA256 hash of file
 */
function calculateSha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}

/**
 * Get latest version from GCS bucket
 */
async function getLatestVersion(): Promise<string> {
	console.log("Fetching latest Claude Code version...");

	try {
		const version = await fetchText(`${DIST_BASE}/latest`);
		return version.trim();
	} catch (error) {
		console.warn(
			`Failed to fetch latest version: ${error instanceof Error ? error.message : error}`,
		);
	}

	// Fallback to known version
	return "2.1.17";
}

/**
 * Download binary for a specific platform
 */
async function downloadPlatform(
	version: string,
	platformKey: string,
	manifest: Manifest,
): Promise<boolean> {
	const platform = PLATFORMS[platformKey];
	if (!platform) {
		console.error(`Unknown platform: ${platformKey}`);
		return false;
	}

	const resourcesDir = join(dirname(import.meta.dirname), "resources");
	const targetDir = join(resourcesDir, "bin", platformKey);
	const targetPath = join(targetDir, platform.binary);

	// Create directory
	mkdirSync(targetDir, { recursive: true });

	// Get expected hash from manifest
	const platformManifest = manifest.platforms[platform.dir];
	if (!platformManifest) {
		console.error(`No manifest entry for ${platform.dir}`);
		return false;
	}

	const expectedHash = platformManifest.checksum;
	const downloadUrl = `${DIST_BASE}/${version}/${platform.dir}/${platform.binary}`;

	console.log(`\nDownloading Claude Code for ${platformKey}...`);
	console.log(`  URL: ${downloadUrl}`);
	console.log(`  Size: ${(platformManifest.size / 1024 / 1024).toFixed(1)} MB`);

	// Check if already downloaded with correct hash
	if (existsSync(targetPath)) {
		const existingHash = await calculateSha256(targetPath);
		if (existingHash === expectedHash) {
			console.log("  Already downloaded and verified");
			return true;
		}
		console.log("  Existing file has wrong hash, re-downloading...");
	}

	// Download
	await downloadFile(downloadUrl, targetPath);

	// Verify hash
	const actualHash = await calculateSha256(targetPath);
	if (actualHash !== expectedHash) {
		console.error("  Hash mismatch!");
		console.error(`    Expected: ${expectedHash}`);
		console.error(`    Actual:   ${actualHash}`);
		rmSync(targetPath);
		return false;
	}
	console.log(`  Verified SHA256: ${actualHash.substring(0, 16)}...`);

	// Make executable (Unix)
	if (process.platform !== "win32") {
		chmodSync(targetPath, 0o755);
	}

	console.log(`  Saved to: ${targetPath}`);
	return true;
}

async function main() {
	const args = process.argv.slice(2);
	const downloadAll = args.includes("--all");
	const versionArg = args.find((a) => a.startsWith("--version="));
	const specifiedVersion = versionArg?.split("=")[1];

	console.log("Claude Code Binary Downloader");
	console.log("=============================\n");

	// Get version
	const version = specifiedVersion || (await getLatestVersion());
	console.log(`Version: ${version}`);

	// Fetch manifest
	const manifestUrl = `${DIST_BASE}/${version}/manifest.json`;
	console.log(`Fetching manifest: ${manifestUrl}`);

	let manifest: Manifest;
	try {
		manifest = await fetchJson<Manifest>(manifestUrl);
	} catch (error) {
		console.error(
			`Failed to fetch manifest: ${error instanceof Error ? error.message : error}`,
		);
		process.exit(1);
	}

	// Determine which platforms to download
	let platformsToDownload: string[];
	if (downloadAll) {
		platformsToDownload = Object.keys(PLATFORMS);
	} else {
		// Current platform only
		const currentPlatform = getPlatformKey();
		if (!PLATFORMS[currentPlatform]) {
			console.error(`Unsupported platform: ${currentPlatform}`);
			console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`);
			process.exit(1);
		}
		platformsToDownload = [currentPlatform];
	}

	console.log(`\nPlatforms to download: ${platformsToDownload.join(", ")}`);

	// Create bin directory
	const resourcesDir = join(dirname(import.meta.dirname), "resources");
	const binDir = join(resourcesDir, "bin");
	mkdirSync(binDir, { recursive: true });

	// Write version file
	writeFileSync(
		join(binDir, "VERSION"),
		`${version}\n${new Date().toISOString()}\n`,
	);

	// Download each platform
	let success = true;
	for (const platform of platformsToDownload) {
		const result = await downloadPlatform(version, platform, manifest);
		if (!result) success = false;
	}

	if (success) {
		console.log("\n✓ All downloads completed successfully!");
	} else {
		console.error("\n✗ Some downloads failed");
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
