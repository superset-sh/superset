import "server-only";
import { env } from "@/env";
import { getGitHubRepoSlug } from "@/lib/github";
import {
	type ReleaseAssetInput,
	type ReleasePlatform,
	toReleasePlatforms,
} from "../toReleasePlatforms";

// The repo publishes desktop, CLI and canary releases side by side; only the
// `desktop-v*` tags carry app binaries.
const DESKTOP_TAG_PREFIX = "desktop-v";
const MAX_RELEASES = 12;
const REVALIDATE_SECONDS = 60 * 30;
const PER_PAGE = 30;
// The page's first job is to start a download. The catalog is secondary, so a
// slow GitHub must not hold the whole render: past this we give up and fall
// back to the platform-aware button plus a link to the releases page.
const FETCH_TIMEOUT_MS = 5000;

export interface DesktopRelease {
	/** Semver without the tag prefix, e.g. "1.25.1" */
	version: string;
	publishedAt: string;
	notesUrl: string;
	platforms: ReleasePlatform[];
}

interface GitHubRelease {
	tag_name: string;
	draft: boolean;
	published_at: string | null;
	html_url: string;
	assets: ReleaseAssetInput[];
}

// Releases are the source of truth for what actually shipped, so the page never
// advertises a platform we stopped building. A failed fetch returns an empty
// list and the page falls back to the always-current `/releases/latest` links
// rather than rendering a broken catalog.
export async function getDesktopReleases(): Promise<DesktopRelease[]> {
	const slug = getGitHubRepoSlug();
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	if (env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
	}

	try {
		const response = await fetch(
			`https://api.github.com/repos/${slug}/releases?per_page=${PER_PAGE}`,
			{
				headers,
				next: { revalidate: REVALIDATE_SECONDS },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			},
		);
		if (!response.ok) {
			console.error(
				"[marketing/download] Failed to fetch releases:",
				response.status,
			);
			return [];
		}

		const releases = (await response.json()) as GitHubRelease[];
		return releases
			.filter(
				(release) =>
					!release.draft &&
					release.tag_name.startsWith(DESKTOP_TAG_PREFIX) &&
					release.published_at !== null,
			)
			.map((release) => {
				const version = release.tag_name.slice(DESKTOP_TAG_PREFIX.length);
				return {
					version,
					publishedAt: release.published_at as string,
					notesUrl: release.html_url,
					platforms: toReleasePlatforms(release.assets, version),
				};
			})
			.filter((release) => release.platforms.length > 0)
			.slice(0, MAX_RELEASES);
	} catch (error) {
		console.error("[marketing/download] Failed to fetch releases:", error);
		return [];
	}
}
