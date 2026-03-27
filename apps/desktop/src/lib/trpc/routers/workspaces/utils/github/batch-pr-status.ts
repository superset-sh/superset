import type { GitHubStatus } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import { setCachedGitHubStatus } from "./cache";
import {
	formatPRData,
	getPRHeadBranchCandidates,
	shouldAcceptPRMatch,
	sortPRCandidates,
} from "./pr-resolution";
import { extractNwoFromUrl, getRepoContext } from "./repo-context";
import {
	GHGraphQLPRNodeSchema,
	type GHPRResponse,
	type RepoContext,
	normalizeGraphQLPR,
} from "./types";

export interface BatchWorkspaceEntry {
	workspaceId: string;
	worktreePath: string;
	branch: string;
	headSha?: string;
}

interface RepoGroup {
	owner: string;
	name: string;
	repoContext: RepoContext;
	entries: BatchWorkspaceEntry[];
}

interface AliasMapping {
	repoAlias: string;
	prAlias: string;
	entry: BatchWorkspaceEntry;
	group: RepoGroup;
}

const BATCH_QUERY_TIMEOUT_MS = 30_000;

const PR_FIELDS_FRAGMENT = `
number
title
url
state
isDraft
mergedAt
additions
deletions
headRefOid
headRefName
headRepository { name }
headRepositoryOwner { login }
isCrossRepository
reviewDecision
commits(last: 1) {
  nodes {
    commit {
      statusCheckRollup {
        contexts(first: 100) {
          nodes {
            __typename
            ... on CheckRun {
              name
              conclusion
              detailsUrl
              status
            }
            ... on StatusContext {
              context
              state
              targetUrl
            }
          }
        }
      }
    }
  }
}
reviewRequests(first: 20) {
  nodes {
    requestedReviewer {
      __typename
      ... on User { login }
      ... on Team { slug name }
    }
  }
}`;

/**
 * Groups workspace entries by GitHub repository using cached repo context,
 * then builds and executes a single GraphQL query for all PR statuses.
 *
 * Returns a Map keyed by workspaceId. Entries without a matching PR still
 * receive a `GitHubStatus` with `pr: null` so the caller can distinguish
 * "no PR" from "not attempted".
 */
export async function batchFetchGitHubPRStatuses(
	entries: BatchWorkspaceEntry[],
): Promise<Map<string, GitHubStatus>> {
	if (entries.length === 0) {
		return new Map();
	}

	const repoGroups = await groupByRepo(entries);
	if (repoGroups.length === 0) {
		return new Map();
	}

	const cwd = entries[0].worktreePath;

	try {
		return await executeBatchQuery(cwd, repoGroups);
	} catch (error) {
		console.warn("[GitHub] Batch PR query failed:", error);
		return new Map();
	}
}

async function groupByRepo(
	entries: BatchWorkspaceEntry[],
): Promise<RepoGroup[]> {
	const repoMap = new Map<string, RepoGroup>();

	const contextResults = await Promise.all(
		entries.map(async (entry) => {
			const ctx = await getRepoContext(entry.worktreePath).catch(() => null);
			return { entry, ctx };
		}),
	);

	for (const { entry, ctx } of contextResults) {
		if (!ctx) continue;

		const targetUrl = ctx.isFork ? ctx.upstreamUrl : ctx.repoUrl;
		const nwo = extractNwoFromUrl(targetUrl);
		if (!nwo) continue;

		const key = nwo.toLowerCase();
		let group = repoMap.get(key);
		if (!group) {
			const [owner, name] = nwo.split("/");
			if (!owner || !name) continue;
			group = { owner, name, repoContext: ctx, entries: [] };
			repoMap.set(key, group);
		}
		group.entries.push(entry);
	}

	return [...repoMap.values()];
}

/**
 * Builds a GraphQL query with aliased `repository` and `pullRequests` fields,
 * executes it via `gh api graphql`, and maps results back to workspace IDs.
 */
async function executeBatchQuery(
	cwd: string,
	repoGroups: RepoGroup[],
): Promise<Map<string, GitHubStatus>> {
	const results = new Map<string, GitHubStatus>();
	const aliasMappings: AliasMapping[] = [];

	const queryParts: string[] = [];
	for (let ri = 0; ri < repoGroups.length; ri++) {
		const group = repoGroups[ri];
		const repoAlias = `repo_${ri}`;
		const prParts: string[] = [];

		// branch candidate → prAlias for O(1) dedup lookups within this repo
		const branchToAlias = new Map<string, string>();
		let prIndex = 0;

		for (const entry of group.entries) {
			for (const branchCandidate of getPRHeadBranchCandidates(entry.branch)) {
				const existingPrAlias = branchToAlias.get(branchCandidate);
				if (existingPrAlias) {
					aliasMappings.push({
						repoAlias,
						prAlias: existingPrAlias,
						entry,
						group,
					});
					continue;
				}

				const prAlias = `pr_${prIndex++}`;
				branchToAlias.set(branchCandidate, prAlias);

				const escapedBranch = escapeGraphQLString(branchCandidate);
				prParts.push(
					`${prAlias}: pullRequests(first: 3, headRefName: "${escapedBranch}", states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${PR_FIELDS_FRAGMENT} } }`,
				);
				aliasMappings.push({ repoAlias, prAlias, entry, group });
			}
		}

		if (prParts.length > 0) {
			const escapedOwner = escapeGraphQLString(group.owner);
			const escapedName = escapeGraphQLString(group.name);
			queryParts.push(
				`${repoAlias}: repository(owner: "${escapedOwner}", name: "${escapedName}") { ${prParts.join(" ")} }`,
			);
		}
	}

	if (queryParts.length === 0) {
		return results;
	}

	const query = `{ ${queryParts.join(" ")} }`;

	let stdout: string;
	try {
		const result = await execWithShellEnv(
			"gh",
			["api", "graphql", "-f", `query=${query}`],
			{ cwd, timeout: BATCH_QUERY_TIMEOUT_MS },
		);
		stdout = result.stdout;
	} catch (error) {
		console.warn("[GitHub] Batch GraphQL query execution failed:", error);
		return results;
	}

	let parsed: { data?: Record<string, Record<string, { nodes?: unknown[] }>> };
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		console.warn("[GitHub] Failed to parse batch GraphQL response");
		return results;
	}

	if (!parsed.data) {
		return results;
	}

	// Collect all PR candidates per workspace, then pick the best match.
	const workspaceCandidates = new Map<
		string,
		{ prs: GHPRResponse[]; entry: BatchWorkspaceEntry; group: RepoGroup }
	>();

	for (const mapping of aliasMappings) {
		const repoData = parsed.data[mapping.repoAlias];
		if (!repoData) continue;

		const prConnection = repoData[mapping.prAlias];
		if (!prConnection?.nodes) continue;

		for (const rawNode of prConnection.nodes) {
			const parseResult = GHGraphQLPRNodeSchema.safeParse(rawNode);
			if (!parseResult.success) continue;

			const normalized = normalizeGraphQLPR(parseResult.data);

			if (
				!shouldAcceptPRMatch({
					localBranch: mapping.entry.branch,
					pr: normalized,
					headSha: mapping.entry.headSha,
				})
			) {
				continue;
			}

			let candidates = workspaceCandidates.get(mapping.entry.workspaceId);
			if (!candidates) {
				candidates = { prs: [], entry: mapping.entry, group: mapping.group };
				workspaceCandidates.set(mapping.entry.workspaceId, candidates);
			}
			candidates.prs.push(normalized);
		}
	}

	const now = Date.now();

	for (const [workspaceId, { prs, entry, group }] of workspaceCandidates) {
		const bestPR = sortPRCandidates(prs, entry.headSha)[0];
		if (!bestPR) continue;

		const status: GitHubStatus = {
			pr: formatPRData(bestPR),
			repoUrl: group.repoContext.repoUrl,
			upstreamUrl: group.repoContext.upstreamUrl,
			isFork: group.repoContext.isFork,
			branchExistsOnRemote: true,
			lastRefreshed: now,
		};

		results.set(workspaceId, status);
		setCachedGitHubStatus(entry.worktreePath, status);
	}

	// Workspaces with no PR match still get a status so callers can
	// distinguish "no PR" from "not in batch".
	for (const group of repoGroups) {
		for (const entry of group.entries) {
			if (results.has(entry.workspaceId)) continue;

			const status: GitHubStatus = {
				pr: null,
				repoUrl: group.repoContext.repoUrl,
				upstreamUrl: group.repoContext.upstreamUrl,
				isFork: group.repoContext.isFork,
				branchExistsOnRemote: true,
				lastRefreshed: now,
			};
			results.set(entry.workspaceId, status);
			setCachedGitHubStatus(entry.worktreePath, status);
		}
	}

	return results;
}

function escapeGraphQLString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
