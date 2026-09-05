import { COMPANY } from "@superset/shared/constants";

import { cachedGrowthMetric } from "./cache";
import { fetchWithTimeout } from "./fetch";

const CACHE_KEY = "github";
const CACHE_TTL_SECONDS = 30 * 60;
const DESKTOP_TAG_PREFIX = "desktop-v";
const MAX_RELEASES = 10;

export interface GithubRelease {
	version: string;
	publishedAt: string;
	// First-time installs: the dmg, AppImage, and Windows installers people
	// download from the site or the releases page.
	installs: number;
	// The auto-updater pulls the zip, so zip downloads count existing users
	// taking the update.
	updates: number;
}

export type GithubStats =
	| {
			available: true;
			stars: number;
			forks: number;
			watchers: number;
			openIssues: number;
			releases: GithubRelease[];
			fetchedAt: string;
	  }
	| { available: false; reason: string };

interface ReleaseAsset {
	name: string;
	download_count: number;
}

interface Release {
	tag_name: string;
	draft: boolean;
	published_at: string | null;
	assets: ReleaseAsset[];
}

function repoSlug(): string {
	return new URL(COMPANY.GITHUB_URL).pathname.replace(/^\/|\/$/g, "");
}

export function classifyAsset(name: string): "install" | "update" | null {
	if (/\.(dmg|AppImage|exe|msi|deb|rpm)$/i.test(name)) return "install";
	if (/\.zip$/i.test(name)) return "update";
	return null;
}

export function summarizeReleases(releases: Release[]): GithubRelease[] {
	return releases
		.filter((r) => !r.draft && r.tag_name.startsWith(DESKTOP_TAG_PREFIX))
		.slice(0, MAX_RELEASES)
		.map((r) => {
			let installs = 0;
			let updates = 0;
			for (const asset of r.assets) {
				const kind = classifyAsset(asset.name);
				if (kind === "install") installs += asset.download_count;
				if (kind === "update") updates += asset.download_count;
			}
			return {
				version: r.tag_name.slice(DESKTOP_TAG_PREFIX.length),
				publishedAt: r.published_at ?? "",
				installs,
				updates,
			};
		});
}

async function fetchGithub(): Promise<GithubStats> {
	const slug = repoSlug();
	const headers = { Accept: "application/vnd.github+json" };
	const [repoResponse, releasesResponse] = await Promise.all([
		fetchWithTimeout(`https://api.github.com/repos/${slug}`, { headers }),
		fetchWithTimeout(
			`https://api.github.com/repos/${slug}/releases?per_page=40`,
			{ headers },
		),
	]);
	if (!repoResponse.ok) {
		return {
			available: false,
			reason: `GitHub API error (${repoResponse.status})`,
		};
	}
	const repo = (await repoResponse.json()) as {
		stargazers_count: number;
		forks_count: number;
		subscribers_count: number;
		open_issues_count: number;
	};
	const releases = releasesResponse.ok
		? ((await releasesResponse.json()) as Release[])
		: [];
	return {
		available: true,
		stars: repo.stargazers_count,
		forks: repo.forks_count,
		watchers: repo.subscribers_count,
		openIssues: repo.open_issues_count,
		releases: summarizeReleases(releases),
		fetchedAt: new Date().toISOString(),
	};
}

export function fetchGithubStats(): Promise<GithubStats> {
	return cachedGrowthMetric(CACHE_KEY, CACHE_TTL_SECONDS, fetchGithub);
}
