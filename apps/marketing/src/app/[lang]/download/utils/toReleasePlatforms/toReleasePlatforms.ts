export type DownloadOs = "macOS" | "Windows" | "Linux";

const OS_ORDER: readonly DownloadOs[] = ["macOS", "Windows", "Linux"];

/** Stable id for an artifact, so callers match on this and not on prose */
export type ReleaseAssetKey =
	| "mac-arm64"
	| "mac-x64"
	| "linux-appimage-arm64"
	| "linux-appimage-x64"
	| "linux-deb"
	| "linux-rpm"
	| "windows-x64"
	| "windows-arm64";

export interface ReleaseAsset {
	key: ReleaseAssetKey;
	/** Human label for the artifact, e.g. "Mac (Apple Silicon)" */
	label: string;
	url: string;
	sizeBytes: number;
}

export interface ReleasePlatform {
	os: DownloadOs;
	assets: ReleaseAsset[];
}

export interface ReleaseAssetInput {
	name: string;
	size: number;
	browser_download_url: string;
}

interface Classified {
	os: DownloadOs;
	key: ReleaseAssetKey;
	label: string;
	/** Sort key within a platform column; installers before archives */
	order: number;
}

function archLabel(name: string): string {
	return /arm64|aarch64/i.test(name) ? "arm64" : "x64";
}

// Maps a release asset filename to the row it becomes. Returning null drops the
// asset. Three kinds never reach the page: update manifests and checksums; the
// unversioned "latest" aliases, which resolve to the very same files already
// listed and would otherwise duplicate every row; and the `-mac.zip` archives,
// which exist for electron-updater and are not what a person should install.
export function classifyAsset(
	name: string,
	version: string,
): Classified | null {
	if (/\.(yml|yaml|blockmap|sig|sha256|txt)$/i.test(name)) return null;
	if (/-mac\.zip$/i.test(name)) return null;
	if (!name.includes(version)) return null;

	const isArm = /arm64|aarch64/i.test(name);

	if (name.endsWith(".dmg")) {
		return {
			os: "macOS",
			key: isArm ? "mac-arm64" : "mac-x64",
			label: isArm ? "Mac (Apple Silicon)" : "Mac (Intel)",
			order: isArm ? 0 : 1,
		};
	}
	if (name.endsWith(".AppImage")) {
		return {
			os: "Linux",
			key: isArm ? "linux-appimage-arm64" : "linux-appimage-x64",
			label: `Linux AppImage (${archLabel(name)})`,
			order: 0,
		};
	}
	if (name.endsWith(".deb")) {
		return {
			os: "Linux",
			key: "linux-deb",
			label: `Linux .deb (${archLabel(name)})`,
			order: 1,
		};
	}
	if (name.endsWith(".rpm")) {
		return {
			os: "Linux",
			key: "linux-rpm",
			label: `Linux RPM (${archLabel(name)})`,
			order: 2,
		};
	}
	if (name.endsWith(".exe")) {
		return {
			os: "Windows",
			key: isArm ? "windows-arm64" : "windows-x64",
			label: `Windows (${archLabel(name)})`,
			order: 0,
		};
	}

	return null;
}

export function toReleasePlatforms(
	assets: readonly ReleaseAssetInput[],
	version: string,
): ReleasePlatform[] {
	const byOs = new Map<DownloadOs, (ReleaseAsset & { order: number })[]>();

	for (const asset of assets) {
		const classified = classifyAsset(asset.name, version);
		if (!classified) continue;
		const bucket = byOs.get(classified.os) ?? [];
		bucket.push({
			key: classified.key,
			label: classified.label,
			url: asset.browser_download_url,
			sizeBytes: asset.size,
			order: classified.order,
		});
		byOs.set(classified.os, bucket);
	}

	return OS_ORDER.filter((os) => byOs.has(os)).map((os) => ({
		os,
		assets: (byOs.get(os) ?? [])
			.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
			.map(({ order: _order, ...asset }) => asset),
	}));
}
