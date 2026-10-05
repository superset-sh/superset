import {
	fetchPullRequestFilesDiff,
	isPullRequestDiffTooLarge,
	type PullRequestDiff,
} from "@superset/shared/pull-request-diff";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { fetchPullRequestGitDiff } from "./fetch-pull-request-git-diff";

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 20;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const entries = new Map<
	string,
	{ promise: Promise<PullRequestDiff>; fetchedAt: number | null; bytes: number }
>();

export function fetchPullRequestDiff(
	repoFullName: string,
	prNumber: number,
): Promise<PullRequestDiff> {
	const key = `${repoFullName.toLowerCase()}#${prNumber}`;
	const now = Date.now();
	for (const [otherKey, entry] of entries) {
		if (entry.fetchedAt !== null && now - entry.fetchedAt >= CACHE_TTL_MS) {
			entries.delete(otherKey);
		}
	}
	const cached = entries.get(key);
	if (cached) return cached.promise;
	const promise: Promise<PullRequestDiff> = execGh(
		["pr", "diff", String(prNumber), "--repo", repoFullName],
		{ timeout: 30_000, maxBuffer: 200 * 1024 * 1024 },
	)
		.then((raw) => ({ patch: typeof raw === "string" ? raw : "" }))
		.catch(async (error: unknown) => {
			if (!isPullRequestDiffTooLarge(error)) throw error;
			const path = `repos/${repoFullName}/pulls/${prNumber}`;
			const options = { timeout: 30_000, maxBuffer: 200 * 1024 * 1024 };
			try {
				return await fetchPullRequestFilesDiff({
					readPullRequest: () => execGh(["api", path], options),
					readFiles: (page, perPage) =>
						execGh(
							["api", `${path}/files?per_page=${perPage}&page=${page}`],
							options,
						),
				});
			} catch {
				return { patch: await fetchPullRequestGitDiff(repoFullName, prNumber) };
			}
		});
	if (entries.size >= MAX_CACHE_ENTRIES) {
		for (const [otherKey, entry] of entries) {
			if (entry.fetchedAt !== null) {
				entries.delete(otherKey);
				break;
			}
		}
	}
	if (entries.size < MAX_CACHE_ENTRIES) {
		entries.set(key, { promise, fetchedAt: null, bytes: 0 });
	}
	void promise.then(
		(result) => {
			const entry = entries.get(key);
			if (entry?.promise !== promise) return;
			const bytes =
				result.patch.length * 2 +
				(result.files ?? []).reduce(
					(total, file) =>
						total +
						128 +
						2 * (file.filename.length + (file.previousFilename?.length ?? 0)),
					0,
				);
			if (bytes > MAX_CACHE_BYTES) {
				entries.delete(key);
				return;
			}
			let retainedBytes = bytes;
			for (const cached of entries.values()) retainedBytes += cached.bytes;
			for (const [otherKey, cached] of entries) {
				if (retainedBytes <= MAX_CACHE_BYTES) break;
				if (otherKey !== key && cached.fetchedAt !== null) {
					entries.delete(otherKey);
					retainedBytes -= cached.bytes;
				}
			}
			entry.bytes = bytes;
			entry.fetchedAt = Date.now();
		},
		() => {
			if (entries.get(key)?.promise === promise) entries.delete(key);
		},
	);
	return promise;
}
