/**
 * Download Claude Code binary for bundling with the desktop app.
 *
 * This script downloads the Claude Code CLI binary from the official distribution
 * and places it in the resources/bin directory for electron-builder to package.
 *
 * Usage:
 *   bun run scripts/download-claude-binary.ts
 *
 * The binary is downloaded based on the current platform and architecture.
 */

import { createHash } from "node:crypto";
import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

const CLAUDE_DIST_BASE_URL =
	"https://storage.googleapis.com/anthropic-public-assets/claude-code";

// Map Node.js platform/arch to Claude binary names
const PLATFORM_MAP: Record<string, string> = {
	"darwin-arm64": "claude-code-darwin-arm64",
	"darwin-x64": "claude-code-darwin-x64",
	"linux-x64": "claude-code-linux-x64",
	"win32-x64": "claude-code-win32-x64.exe",
};

function getPlatformKey(): string {
	const platform = process.platform;
	const arch = process.arch;
	return `${platform}-${arch}`;
}

function getBinaryName(platformKey: string): string | null {
	return PLATFORM_MAP[platformKey] ?? null;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
	console.log(`Downloading: ${url}`);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
	}

	// Ensure parent directory exists
	const parentDir = dirname(destPath);
	if (!existsSync(parentDir)) {
		mkdirSync(parentDir, { recursive: true });
	}

	// Download to temp file first
	const tempPath = `${destPath}.tmp`;
	const fileStream = createWriteStream(tempPath);

	if (!response.body) {
		throw new Error("No response body");
	}

	// @ts-expect-error - Node.js ReadableStream compatibility
	await pipeline(response.body, fileStream);

	// Move temp file to final location
	if (existsSync(destPath)) {
		unlinkSync(destPath);
	}

	const { renameSync } = await import("node:fs");
	renameSync(tempPath, destPath);
}

function computeSha256(filePath: string): string {
	const fileBuffer = readFileSync(filePath);
	const hash = createHash("sha256");
	hash.update(fileBuffer);
	return hash.digest("hex");
}

async function fetchLatestVersion(): Promise<string> {
	const versionUrl = `${CLAUDE_DIST_BASE_URL}/latest-version.txt`;
	console.log(`Fetching latest version from: ${versionUrl}`);

	const response = await fetch(versionUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch version: ${response.status}`);
	}

	const version = (await response.text()).trim();
	console.log(`Latest Claude Code version: ${version}`);
	return version;
}

async function fetchChecksum(version: string, binaryName: string): Promise<string | null> {
	const checksumUrl = `${CLAUDE_DIST_BASE_URL}/${version}/${binaryName}.sha256`;
	console.log(`Fetching checksum from: ${checksumUrl}`);

	try {
		const response = await fetch(checksumUrl);
		if (!response.ok) {
			console.warn(`No checksum available: ${response.status}`);
			return null;
		}

		const checksum = (await response.text()).trim().split(" ")[0]; // SHA256 format: "hash  filename"
		return checksum ?? null;
	} catch {
		console.warn("Failed to fetch checksum, skipping verification");
		return null;
	}
}

async function downloadClaudeBinary() {
	const platformKey = getPlatformKey();
	const binaryName = getBinaryName(platformKey);

	if (!binaryName) {
		console.error(`Unsupported platform: ${platformKey}`);
		console.error(`Supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`);
		process.exit(1);
	}

	console.log(`Platform: ${platformKey}`);
	console.log(`Binary: ${binaryName}`);

	// Get latest version
	const version = await fetchLatestVersion();

	// Determine output path
	const resourcesDir = join(dirname(import.meta.dirname), "resources");
	const binDir = join(resourcesDir, "bin", platformKey);
	const outputFileName = process.platform === "win32" ? "claude.exe" : "claude";
	const outputPath = join(binDir, outputFileName);

	// Check if already downloaded
	if (existsSync(outputPath)) {
		console.log(`Binary already exists at: ${outputPath}`);
		const existingHash = computeSha256(outputPath);
		console.log(`Existing SHA256: ${existingHash}`);

		const expectedChecksum = await fetchChecksum(version, binaryName);
		if (expectedChecksum && existingHash === expectedChecksum) {
			console.log("Checksum matches, skipping download");
			return;
		}
		console.log("Checksum mismatch or no checksum available, re-downloading");
	}

	// Create bin directory
	if (!existsSync(binDir)) {
		mkdirSync(binDir, { recursive: true });
	}

	// Download binary
	const downloadUrl = `${CLAUDE_DIST_BASE_URL}/${version}/${binaryName}`;
	await downloadFile(downloadUrl, outputPath);

	// Verify checksum
	const expectedChecksum = await fetchChecksum(version, binaryName);
	if (expectedChecksum) {
		const actualChecksum = computeSha256(outputPath);
		if (actualChecksum !== expectedChecksum) {
			console.error(`Checksum mismatch!`);
			console.error(`Expected: ${expectedChecksum}`);
			console.error(`Actual: ${actualChecksum}`);
			rmSync(outputPath);
			process.exit(1);
		}
		console.log(`Checksum verified: ${actualChecksum}`);
	}

	// Make executable (Unix only)
	if (process.platform !== "win32") {
		chmodSync(outputPath, 0o755);
		console.log("Made binary executable");
	}

	console.log(`\nClaude binary downloaded to: ${outputPath}`);
}

downloadClaudeBinary().catch((error) => {
	console.error("Failed to download Claude binary:", error);
	process.exit(1);
});
