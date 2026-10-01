import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchPullRequestChecksFromGlab } from "../../../../runtime/pull-requests/utils/gitlab-query/gitlab-query";
import type { HostServiceContext } from "../../../../types";
import { normalizePullRequestChecks } from "../../pull-requests/pull-request-checks";
import { resolvePullRequestRepository } from "../../pull-requests/resolve-repository";
import type {
	PullRequestsPage,
	SearchPullRequestsInput,
} from "./search-pull-requests";

const connectionSchema = z.object({
	count: z.number(),
	pageInfo: z.object({
		hasNextPage: z.boolean(),
		endCursor: z.string().nullable(),
	}),
	nodes: z.array(
		z.object({
			iid: z.string().regex(/^[1-9]\d*$/),
			title: z.string(),
			webUrl: z.string(),
			state: z.enum(["opened", "closed", "merged", "locked"]),
			draft: z.boolean(),
			diffHeadSha: z.string().nullable(),
			updatedAt: z.string().nullable(),
			sourceBranch: z.string(),
			author: z
				.object({ username: z.string(), avatarUrl: z.string().nullable() })
				.nullable(),
			diffStatsSummary: z
				.object({ additions: z.number(), deletions: z.number() })
				.nullable(),
		}),
	),
});

const reviewedStates = "[REVIEWED, APPROVED, REQUESTED_CHANGES, UNAPPROVED]";

export async function searchGitLabPullRequests(
	ctx: HostServiceContext,
	input: SearchPullRequestsInput,
): Promise<PullRequestsPage> {
	const repo = await resolvePullRequestRepository(ctx, input.projectId);
	if (repo.provider !== "gitlab")
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Expected a GitLab repository",
		});
	const slug = `${repo.owner}/${repo.name}`;
	const page = input.page ?? 1;
	const limit = input.limit ?? 30;
	const empty = { pullRequests: [], totalCount: 0, hasNextPage: false, page };
	const raw = input.query?.trim() ?? "";
	let number = /^#?(\d+)$/.exec(raw)?.[1];
	if (/^https?:\/\//i.test(raw)) {
		const url = new URL(raw);
		const match = /^\/(.+)\/-\/merge_requests\/(\d+)\/?$/.exec(url.pathname);
		if (!match || url.host !== repo.host || match[1] !== slug)
			return { ...empty, repoMismatch: slug };
		number = match[2];
	}
	if (number && page > 1) return empty;
	// GitLab review requests name individual users, including reviewers from groups.
	if (input.review === "team-review-requested") return empty;
	const options = { cwd: repo.repoPath, hostname: repo.host };
	let viewer: string | undefined;
	if (
		input.viewerRelationship ||
		input.review?.includes("by-me") ||
		input.review?.includes("review-requested")
	) {
		viewer = z
			.object({ username: z.string() })
			.parse(await ctx.execGlab(["api", "user"], options)).username;
	}
	const filters: string[] = ["sort: UPDATED_DESC"];
	if (input.mergedOnly) filters.push("state: merged");
	else if (!input.includeClosed && !number) filters.push("state: opened");
	if (number) filters.push(`iids: [${JSON.stringify(number)}]`);
	else if (raw) filters.push(`search: ${JSON.stringify(raw)}`);
	const username = JSON.stringify(viewer);
	switch (input.review) {
		case "none":
			filters.push(
				"or: { reviewerWildcard: NONE, reviewStates: [UNREVIEWED, REVIEW_STARTED] }",
			);
			break;
		case "required":
			filters.push("reviewStates: [UNREVIEWED, REVIEW_STARTED]");
			break;
		case "approved":
			filters.push("reviewState: APPROVED");
			break;
		case "changes-requested":
			filters.push("reviewState: REQUESTED_CHANGES");
			break;
		case "reviewed-by-me":
			filters.push(
				`reviewerUsername: ${username}`,
				`reviewStates: ${reviewedStates}`,
			);
			break;
		case "not-reviewed-by-me":
			filters.push(
				`not: { reviewerUsername: ${username}, reviewStates: ${reviewedStates} }`,
			);
			break;
		case "review-requested":
			filters.push(
				`reviewerUsername: ${username}`,
				"reviewStates: [UNREVIEWED, REVIEW_STARTED]",
			);
			break;
	}
	if (input.viewerRelationship === "needs-review")
		filters.push(
			`reviewerUsername: ${username}`,
			"reviewStates: [UNREVIEWED, REVIEW_STARTED]",
		);
	if (input.viewerRelationship === "reviewed")
		filters.push(
			`reviewerUsername: ${username}`,
			`reviewStates: ${reviewedStates}`,
		);
	const authors =
		input.viewerRelationship === "authored"
			? [viewer]
			: input.author?.length
				? input.author
				: [undefined];
	const pages = await Promise.all(
		[...new Set(authors)].map(async (author): Promise<PullRequestsPage> => {
			const authorFilter = author
				? `, authorUsername: ${JSON.stringify(author)}`
				: "";
			let after: string | null = null;
			let connection: z.infer<typeof connectionSchema> | undefined;
			// ponytail: replay cursors for numeric pages; cache them if deep paging becomes common.
			for (let current = 1; current <= page; current++) {
				const query = `query { project(fullPath: ${JSON.stringify(slug)}) { mergeRequests(first: ${number ? 1 : limit}, after: ${JSON.stringify(after)}, ${filters.join(", ")}${authorFilter}) { count pageInfo { hasNextPage endCursor } nodes { iid title webUrl state draft diffHeadSha updatedAt sourceBranch author { username avatarUrl } diffStatsSummary { additions deletions } } } } }`;
				const response = z
					.object({
						errors: z.array(z.object({ message: z.string() })).optional(),
						data: z
							.object({
								project: z
									.object({ mergeRequests: connectionSchema })
									.nullable(),
							})
							.nullable()
							.optional(),
					})
					.parse(
						await ctx.execGlab(
							["api", "graphql", "-f", `query=${query}`],
							options,
						),
					);
				if (response.errors?.length)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: response.errors.map((error) => error.message).join("; "),
					});
				if (!response.data?.project)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "GitLab repository is unavailable",
					});
				connection = response.data.project.mergeRequests;
				if (current < page && !connection.pageInfo.hasNextPage)
					return { ...empty, totalCount: connection.count };
				after = connection.pageInfo.endCursor;
			}
			if (!connection) return empty;
			const pullRequests = await Promise.all(
				connection.nodes.map(async (mr) => {
					let checkResult = normalizePullRequestChecks([]);
					try {
						if (mr.diffHeadSha)
							checkResult = normalizePullRequestChecks(
								await fetchPullRequestChecksFromGlab(
									ctx.execGlab,
									repo,
									mr.diffHeadSha,
									repo.repoPath,
								),
							);
					} catch (error) {
						console.warn(
							"[searchGitLabPullRequests] Could not fetch checks",
							error,
						);
					}
					return {
						projectId: input.projectId,
						repoProvider: "gitlab" as const,
						prNumber: Number(mr.iid),
						title: mr.title,
						url: mr.webUrl,
						state:
							mr.state === "merged"
								? ("merged" as const)
								: mr.state === "closed"
									? ("closed" as const)
									: ("open" as const),
						isDraft: mr.draft,
						authorLogin: mr.author?.username ?? null,
						authorAvatarUrl: mr.author?.avatarUrl ?? null,
						updatedAt: mr.updatedAt,
						...checkResult,
						additions: mr.diffStatsSummary?.additions ?? null,
						deletions: mr.diffStatsSummary?.deletions ?? null,
						headRefName: mr.sourceBranch,
					};
				}),
			);
			return {
				pullRequests,
				totalCount: connection.count,
				hasNextPage: connection.pageInfo.hasNextPage,
				page,
			};
		}),
	);
	return {
		pullRequests: pages
			.flatMap((result) => result.pullRequests)
			.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
		totalCount: pages.reduce((sum, result) => sum + result.totalCount, 0),
		hasNextPage: pages.some((result) => result.hasNextPage),
		page,
	};
}
