export type PageVisibility = "just_me" | "org" | "everyone";

const PAGE_VISIBILITIES: readonly string[] = ["just_me", "org", "everyone"];

export interface PageManifestAsset {
	key: string;
	contentType: string;
}

export interface PageManifestVersion {
	key: string;
	contentType: string;
	/** Relative path → the file it resolves to, for directory publishes. */
	assets?: Record<string, PageManifestAsset>;
}

/**
 * Everything the usercontent origin needs to serve a page, written by the API
 * on every change so a request never depends on the API being up.
 */
export interface PageManifest {
	v: 1;
	pageId: string;
	slug: string;
	visibility: PageVisibility;
	sharedVersion: number | null;
	latestVersion: number | null;
	versions: Record<string, PageManifestVersion>;
}

function isVersionNumber(value: unknown): value is number | null {
	return value === null || (Number.isInteger(value) && (value as number) > 0);
}

export function parsePageManifest(text: string): PageManifest | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!raw || typeof raw !== "object") return null;
	const candidate = raw as Record<string, unknown>;
	if (
		candidate.v !== 1 ||
		typeof candidate.pageId !== "string" ||
		typeof candidate.slug !== "string" ||
		typeof candidate.visibility !== "string" ||
		!PAGE_VISIBILITIES.includes(candidate.visibility) ||
		!isVersionNumber(candidate.sharedVersion) ||
		!isVersionNumber(candidate.latestVersion) ||
		!candidate.versions ||
		typeof candidate.versions !== "object"
	) {
		return null;
	}
	const versions: Record<string, PageManifestVersion> = {};
	for (const [version, entry] of Object.entries(
		candidate.versions as Record<string, unknown>,
	)) {
		if (!entry || typeof entry !== "object") return null;
		const { key, contentType, assets } = entry as Record<string, unknown>;
		if (typeof key !== "string" || typeof contentType !== "string") {
			return null;
		}
		const parsed: PageManifestVersion = { key, contentType };
		if (assets !== undefined) {
			if (!assets || typeof assets !== "object") return null;
			const parsedAssets: Record<string, PageManifestAsset> = {};
			for (const [path, asset] of Object.entries(
				assets as Record<string, unknown>,
			)) {
				if (!asset || typeof asset !== "object") return null;
				const a = asset as Record<string, unknown>;
				if (typeof a.key !== "string" || typeof a.contentType !== "string") {
					return null;
				}
				parsedAssets[path] = { key: a.key, contentType: a.contentType };
			}
			parsed.assets = parsedAssets;
		}
		versions[version] = parsed;
	}
	return {
		v: 1,
		pageId: candidate.pageId,
		slug: candidate.slug,
		visibility: candidate.visibility as PageVisibility,
		sharedVersion: candidate.sharedVersion,
		latestVersion: candidate.latestVersion,
		versions,
	};
}

export function servedVersionOf(manifest: PageManifest): number | null {
	return manifest.sharedVersion ?? manifest.latestVersion;
}
