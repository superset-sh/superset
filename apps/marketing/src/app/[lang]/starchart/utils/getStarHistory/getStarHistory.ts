import "server-only";
import { env } from "@/env";
import { getGitHubRepoSlug } from "@/lib/github";

export interface StarHistoryPoint {
	/** ISO date (yyyy-mm-dd) */
	date: string;
	stars: number;
}

export interface StarHistory {
	points: StarHistoryPoint[];
	totalStars: number;
}

// GitHub has no "stars over time" endpoint. The stargazers list (ascending
// by starred_at, with the `star+json` media type) is the source of truth —
// for repos small enough we fetch every page and get every star's exact
// timestamp, giving an exact daily histogram, no approximation. REST caps
// out around 40k stars either way, so past that we fall back to
// evenly-spaced page samples and interpolate between them instead. Points
// are bucketed at DAY resolution here — the finest we can offer — and
// callers that want a coarser (e.g. weekly) view aggregate client-side.
//
// If real page data can't be fetched (bad token scope, rate limiting), we
// must NOT silently render a fabricated curve — that produces a flat line
// with a fake vertical jump at the end (every bucket counts 0 real stars,
// then the last point gets forced up to the live total). Below a success
// threshold we bail to an empty history instead, which the page renders as
// "not available" rather than a misleading chart.
const PER_PAGE = 100;
const MAX_FULL_FETCH_PAGES = 400;
const MAX_SAMPLE_PAGES = 30;
const FETCH_CONCURRENCY = 4;
const BATCH_DELAY_MS = 150;
const MIN_SUCCESS_RATE = 0.9;
const REVALIDATE_SECONDS = 60 * 60 * 6;
const DAY_MS = 24 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRepoMeta(
	slug: string,
): Promise<{ stars: number; createdAt: string } | null> {
	try {
		const response = await fetch(`https://api.github.com/repos/${slug}`, {
			headers: { Accept: "application/vnd.github.v3+json" },
			next: { revalidate: REVALIDATE_SECONDS },
		});
		if (!response.ok) {
			console.error(
				"[marketing/starchart] Failed to fetch repo metadata:",
				response.status,
			);
			return null;
		}
		const data = await response.json();
		return { stars: data.stargazers_count, createdAt: data.created_at };
	} catch (error) {
		console.error("[marketing/starchart] Error fetching repo metadata:", error);
		return null;
	}
}

// Returns null on failure (distinct from a successful-but-empty page), so
// callers can tell "no data fetched" apart from "no stars here".
async function fetchPageEntries(
	slug: string,
	page: number,
	token: string,
): Promise<string[] | null> {
	try {
		const response = await fetch(
			`https://api.github.com/repos/${slug}/stargazers?per_page=${PER_PAGE}&page=${page}`,
			{
				headers: {
					Accept: "application/vnd.github.star+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
				next: { revalidate: REVALIDATE_SECONDS },
			},
		);
		if (!response.ok) return null;
		const entries: Array<{ starred_at: string }> = await response.json();
		return entries.map((entry) => entry.starred_at);
	} catch {
		return null;
	}
}

async function fetchPages(
	slug: string,
	pages: number[],
	token: string,
): Promise<Map<number, string[] | null>> {
	const results = new Map<number, string[] | null>();
	for (let i = 0; i < pages.length; i += FETCH_CONCURRENCY) {
		const batch = pages.slice(i, i + FETCH_CONCURRENCY);
		const entries = await Promise.all(
			batch.map((page) => fetchPageEntries(slug, page, token)),
		);
		batch.forEach((page, j) => {
			results.set(page, entries[j] ?? null);
		});
		if (i + FETCH_CONCURRENCY < pages.length) await sleep(BATCH_DELAY_MS);
	}
	return results;
}

// Fetches every page, retrying failures once after a short cooldown (most
// GitHub secondary-rate-limit failures are transient). Returns the page ->
// entries map plus how many pages never succeeded even after the retry.
async function fetchPagesWithRetry(
	slug: string,
	pages: number[],
	token: string,
): Promise<{ results: Map<number, string[] | null>; failedCount: number }> {
	const results = await fetchPages(slug, pages, token);
	const failed = pages.filter((page) => results.get(page) === null);

	// Retry even a total failure — a secondary rate limit can throttle an
	// entire in-flight batch at once, which looks identical to "every page
	// failed" but is just as transient as a partial failure.
	if (failed.length > 0) {
		console.warn(
			`[marketing/starchart] Retrying ${failed.length}/${pages.length} failed stargazers pages...`,
		);
		await sleep(3000);
		const retried = await fetchPages(slug, failed, token);
		for (const [page, entries] of retried) {
			if (entries !== null) results.set(page, entries);
		}
	}

	const failedCount = pages.filter((page) => results.get(page) === null).length;
	return { results, failedCount };
}

function startOfDayUTC(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

// Exact path: every star's real timestamp, so each daily bucket is a
// ground-truth cumulative count — no interpolation.
function bucketDailyFromTimestamps(
	starredAts: string[],
	createdAt: string,
	totalStars: number,
): StarHistoryPoint[] {
	const times = starredAts
		.map((s) => new Date(s).getTime())
		.filter((t) => !Number.isNaN(t))
		.sort((a, b) => a - b);

	const dayStart = startOfDayUTC(new Date(createdAt)).getTime();
	const now = Date.now();
	const points: StarHistoryPoint[] = [];
	let index = 0;
	let cumulative = 0;
	for (let t = dayStart; t <= now; t += DAY_MS) {
		const bucketEnd = t + DAY_MS;
		while (index < times.length && (times[index] ?? Infinity) < bucketEnd) {
			cumulative++;
			index++;
		}
		points.push({
			date: new Date(t).toISOString().slice(0, 10),
			stars: cumulative,
		});
	}

	const last = points.at(-1);
	if (last) {
		// Covers stars that landed between the fetch and now, or drift from a
		// bounded (<10%) count of pages that failed even after retry.
		last.stars = Math.max(last.stars, totalStars);
	} else {
		points.push({
			date: new Date(now).toISOString().slice(0, 10),
			stars: totalStars,
		});
	}
	return points;
}

// Fallback path for repos too large to fetch every page: sample evenly
// spaced pages and linearly interpolate the cumulative curve between them.
interface Checkpoint {
	t: number;
	stars: number;
}

function samplePages(totalPages: number): number[] {
	const count = Math.min(MAX_SAMPLE_PAGES, totalPages);
	const pages = new Set<number>();
	for (let i = 0; i < count; i++) {
		pages.add(Math.round(1 + (i * (totalPages - 1)) / (count - 1)));
	}
	return Array.from(pages).sort((a, b) => a - b);
}

function interpolateAt(checkpoints: Checkpoint[], target: number): number {
	const first = checkpoints[0];
	const last = checkpoints[checkpoints.length - 1];
	if (!first || !last || target <= first.t) return first?.stars ?? 0;
	if (target >= last.t) return last.stars;

	for (let i = 1; i < checkpoints.length; i++) {
		const curr = checkpoints[i];
		const prev = checkpoints[i - 1];
		if (curr && prev && curr.t >= target) {
			if (curr.t === prev.t) return curr.stars;
			const ratio = (target - prev.t) / (curr.t - prev.t);
			return Math.round(prev.stars + ratio * (curr.stars - prev.stars));
		}
	}
	return last.stars;
}

function bucketDailyFromCheckpoints(
	checkpoints: Checkpoint[],
): StarHistoryPoint[] {
	const sorted = [...checkpoints].sort((a, b) => a.t - b.t);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return [];

	const dayStart = startOfDayUTC(new Date(first.t)).getTime();
	const points: StarHistoryPoint[] = [];
	for (let t = dayStart; t <= last.t; t += DAY_MS) {
		points.push({
			date: new Date(t).toISOString().slice(0, 10),
			stars: interpolateAt(sorted, t),
		});
	}

	const lastDate = new Date(last.t).toISOString().slice(0, 10);
	if (points.at(-1)?.date !== lastDate) {
		points.push({ date: lastDate, stars: last.stars });
	}
	return points;
}

async function getStarHistoryFallback(
	slug: string,
	meta: { stars: number; createdAt: string },
	totalPages: number,
	token: string,
): Promise<StarHistoryPoint[] | null> {
	const pages = samplePages(totalPages);
	const { results, failedCount } = await fetchPagesWithRetry(
		slug,
		pages,
		token,
	);
	if (failedCount / pages.length > 1 - MIN_SUCCESS_RATE) {
		console.error(
			`[marketing/starchart] Too many failed stargazers pages (${failedCount}/${pages.length}); skipping star history.`,
		);
		return null;
	}

	const checkpoints: Checkpoint[] = [
		{ t: new Date(meta.createdAt).getTime(), stars: 0 },
	];
	pages.forEach((page) => {
		const starredAt = results.get(page)?.at(-1);
		if (!starredAt) return;
		checkpoints.push({
			t: new Date(starredAt).getTime(),
			stars: Math.min(page * PER_PAGE, meta.stars),
		});
	});
	checkpoints.push({ t: Date.now(), stars: meta.stars });

	return bucketDailyFromCheckpoints(checkpoints);
}

export async function getStarHistory(): Promise<StarHistory | null> {
	let slug: string;
	try {
		slug = getGitHubRepoSlug();
	} catch (error) {
		console.error("[marketing/starchart] Invalid GitHub URL:", error);
		return null;
	}
	const meta = await fetchRepoMeta(slug);
	if (!meta) return null;

	// The stargazers endpoint requires an authenticated request (with at
	// least `public_repo` scope) even for public repos. Without a token,
	// still show the live total.
	const token = env.GITHUB_TOKEN;
	if (!token) {
		return { points: [], totalStars: meta.stars };
	}

	const totalPages = Math.max(1, Math.ceil(meta.stars / PER_PAGE));

	if (totalPages <= MAX_FULL_FETCH_PAGES) {
		const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
		const { results, failedCount } = await fetchPagesWithRetry(
			slug,
			pages,
			token,
		);
		if (failedCount / pages.length > 1 - MIN_SUCCESS_RATE) {
			console.warn(
				`[marketing/starchart] Too many failed stargazers pages (${failedCount}/${pages.length}); skipping star history.`,
			);
			return { points: [], totalStars: meta.stars };
		}
		const starredAts = pages.flatMap((page) => results.get(page) ?? []);
		return {
			points: bucketDailyFromTimestamps(starredAts, meta.createdAt, meta.stars),
			totalStars: meta.stars,
		};
	}

	const points = await getStarHistoryFallback(slug, meta, totalPages, token);
	return { points: points ?? [], totalStars: meta.stars };
}
