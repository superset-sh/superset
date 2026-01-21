import { db } from "@superset/db/client";
import { accounts } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

export interface PRStats {
	number: number;
	state: "OPEN" | "CLOSED" | "MERGED";
	additions: number;
	deletions: number;
	changedFiles: number;
	mergedAt: string | null;
	url: string;
}

interface GitHubGraphQLResponse {
	data?: {
		repository?: {
			pullRequests?: {
				nodes: Array<{
					number: number;
					state: "OPEN" | "CLOSED" | "MERGED";
					additions: number;
					deletions: number;
					changedFiles: number;
					mergedAt: string | null;
					url: string;
				}>;
			};
		};
	};
	errors?: Array<{ message: string }>;
}

async function getGitHubToken(userId: string): Promise<string | null> {
	const account = await db.query.accounts.findFirst({
		where: and(eq(accounts.userId, userId), eq(accounts.providerId, "github")),
	});

	return account?.accessToken ?? null;
}

export async function fetchPRForBranch({
	userId,
	repoOwner,
	repoName,
	branchName,
}: {
	userId: string;
	repoOwner: string;
	repoName: string;
	branchName: string;
}): Promise<PRStats | null> {
	const token = await getGitHubToken(userId);
	if (!token) {
		console.warn(
			`[github/pr-stats] No GitHub token found for user ${userId}`,
		);
		return null;
	}

	const query = `
		query($owner: String!, $name: String!, $head: String!) {
			repository(owner: $owner, name: $name) {
				pullRequests(headRefName: $head, first: 1, orderBy: {field: UPDATED_AT, direction: DESC}) {
					nodes {
						number
						state
						additions
						deletions
						changedFiles
						mergedAt
						url
					}
				}
			}
		}
	`;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": "Superset-PR-Tracker",
			},
			body: JSON.stringify({
				query,
				variables: {
					owner: repoOwner,
					name: repoName,
					head: branchName,
				},
			}),
		});

		if (!response.ok) {
			console.error(
				`[github/pr-stats] GitHub API error: ${response.status}`,
			);
			return null;
		}

		const result = (await response.json()) as GitHubGraphQLResponse;

		if (result.errors) {
			console.error(
				"[github/pr-stats] GraphQL errors:",
				result.errors.map((e) => e.message).join(", "),
			);
			return null;
		}

		const pr = result.data?.repository?.pullRequests?.nodes?.[0];
		if (!pr) {
			return null;
		}

		return {
			number: pr.number,
			state: pr.state,
			additions: pr.additions,
			deletions: pr.deletions,
			changedFiles: pr.changedFiles,
			mergedAt: pr.mergedAt,
			url: pr.url,
		};
	} catch (error) {
		console.error("[github/pr-stats] Failed to fetch PR:", error);
		return null;
	}
}
