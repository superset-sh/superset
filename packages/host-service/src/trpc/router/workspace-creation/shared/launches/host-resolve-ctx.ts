import type { ResolveCtx } from "@superset/launch-context";
import type { HostServiceContext } from "../../../../../types";
import {
	fetchGithubIssueContent,
	fetchGithubPullRequestContent,
} from "../github-content";

/**
 * Build a ResolveCtx that fetches issue/PR/task bodies via:
 * - host's gh-CLI helpers for GitHub issues/PRs (cached)
 * - cloud-API `task.byId` for internal Superset tasks
 *
 * Each fetch degrades on failure: returns title-only content with
 * empty body / null description, logs a warning, never throws past
 * the contributor. This matches the renderer's
 * `buildResolveCtxFromPending` semantics — a missing body is never
 * fatal to the launch.
 */
export function buildHostResolveCtx(input: {
	ctx: HostServiceContext;
	projectId: string;
	signal?: AbortSignal;
	githubIssueUrls: string[];
	linkedPrUrl?: string;
}): ResolveCtx {
	const { ctx, projectId, githubIssueUrls, linkedPrUrl } = input;
	const signal = input.signal ?? new AbortController().signal;

	return {
		projectId,
		signal,

		fetchIssue: async (url) => {
			if (!githubIssueUrls.includes(url)) {
				throw Object.assign(new Error(`Issue not found: ${url}`), {
					status: 404,
				});
			}
			const issueNumber = parseIssueNumberFromUrl(url);
			if (issueNumber === null) {
				return { number: 0, url, title: "", body: "", slug: "" };
			}
			try {
				const data = await fetchGithubIssueContent(
					ctx,
					projectId,
					issueNumber,
				);
				return {
					number: data.number,
					url: data.url,
					title: data.title,
					body: data.body,
					slug: slugifyTitle(data.title),
				};
			} catch (err) {
				console.warn(
					`[launches] fetchGithubIssueContent failed for #${issueNumber}, using title-only`,
					err,
				);
				return { number: issueNumber, url, title: "", body: "", slug: "" };
			}
		},

		fetchPullRequest: async (url) => {
			if (linkedPrUrl !== url) {
				throw Object.assign(new Error(`PR not found: ${url}`), {
					status: 404,
				});
			}
			const prNumber = parsePrNumberFromUrl(url);
			if (prNumber === null) {
				return { number: 0, url, title: "", body: "", branch: "" };
			}
			try {
				const data = await fetchGithubPullRequestContent(
					ctx,
					projectId,
					prNumber,
				);
				return {
					number: data.number,
					url: data.url,
					title: data.title,
					body: data.body,
					branch: data.branch,
				};
			} catch (err) {
				console.warn(
					`[launches] fetchGithubPullRequestContent failed for #${prNumber}, using title-only`,
					err,
				);
				return { number: prNumber, url, title: "", body: "", branch: "" };
			}
		},

		fetchInternalTask: async (id) => {
			try {
				const task = await ctx.api.task.byId.query(id);
				if (task) {
					return {
						id: task.id,
						slug: slugifyTitle(task.title),
						title: task.title,
						description: task.description ?? null,
					};
				}
			} catch (err) {
				console.warn(
					`[launches] task.byId failed for ${id}, using title-only`,
					err,
				);
			}
			return { id, slug: "", title: "", description: null };
		},
	};
}

/** `https://github.com/owner/repo/issues/123` → 123 */
function parseIssueNumberFromUrl(url: string): number | null {
	const match = url.match(/\/issues\/(\d+)(?:[/?#]|$)/);
	const n = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** `https://github.com/owner/repo/pull/45` → 45 */
function parsePrNumberFromUrl(url: string): number | null {
	const match = url.match(/\/pull\/(\d+)(?:[/?#]|$)/);
	const n = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : null;
}

function slugifyTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}
