import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getPullRequestReadInput } from "renderer/lib/github/getPullRequestReadInput";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { parseGitLabIssueUrl } from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import type { GitLabIssueReference } from "renderer/stores/new-workspace-draft";
import type { PromptContextBody } from "./store";

export async function fetchPrBody(args: {
	prNumber: number;
	expectedUrl?: string;
	projectId: string;
	hostUrl: string;
}): Promise<PromptContextBody | null> {
	try {
		const ref = args.expectedUrl
			? pullRequestRefFromUrl(args.expectedUrl)
			: null;
		if (args.expectedUrl && (!ref || ref.number !== args.prNumber)) return null;
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result = await client.pullRequests.getContent.query({
			...getPullRequestReadInput(ref ?? undefined, args.projectId),
			projectId: args.projectId,
			prNumber: args.prNumber,
		});
		if (ref?.provider === "gitlab") {
			const returned = pullRequestRefFromUrl(result.url);
			if (!returned || !isSamePullRequest(ref, returned)) return null;
		}
		const text = (result.body ?? "").trim();
		return text ? { text } : null;
	} catch (err) {
		console.error("[promptContext] fetchPrBody failed", { args, err });
		return null;
	}
}

export async function fetchGitHubIssueBody(args: {
	issueNumber: number;
	projectId: string;
	hostUrl: string;
}): Promise<PromptContextBody | null> {
	try {
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result = await client.issues.getContent.query({
			projectId: args.projectId,
			issueNumber: args.issueNumber,
		});
		const text = (result.body ?? "").trim();
		return text ? { text } : null;
	} catch (err) {
		console.error("[promptContext] fetchGitHubIssueBody failed", { args, err });
		return null;
	}
}

export async function fetchInternalTaskBody(args: {
	taskId: string;
}): Promise<PromptContextBody | null> {
	try {
		const result = await apiTrpcClient.task.byId.query(args.taskId);
		const text = (result?.description ?? "").trim();
		return text ? { text } : null;
	} catch (err) {
		console.error("[promptContext] fetchInternalTaskBody failed", {
			args,
			err,
		});
		return null;
	}
}

export async function fetchLinearIssueBody(args: {
	organizationId: string;
	identifier: string;
}): Promise<PromptContextBody | null> {
	try {
		const result = await apiTrpcClient.integration.linear.issue.query({
			organizationId: args.organizationId,
			issueId: args.identifier,
		});
		const text = (result.description ?? "").trim();
		return text ? { text } : null;
	} catch (err) {
		console.error("[promptContext] fetchLinearIssueBody failed", {
			args,
			err,
		});
		return null;
	}
}

export async function fetchGitLabIssueBody(
	args: GitLabIssueReference & { hostUrl: string },
): Promise<PromptContextBody | null> {
	try {
		const expected = parseGitLabIssueUrl(args.expectedIssueUrl);
		if (
			!expected ||
			expected.issueNumber !== args.issueNumber ||
			expected.host !== args.host ||
			expected.owner !== args.owner ||
			expected.repo !== args.repo
		)
			return null;
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result = await client.issues.getContent.query({
			projectId: args.projectId,
			issueNumber: args.issueNumber,
			expectedIssueUrl: args.expectedIssueUrl,
		});
		const returned = parseGitLabIssueUrl(result.url);
		if (
			!("provider" in result) ||
			result.provider !== "gitlab" ||
			result.expectedIssueUrl !== args.expectedIssueUrl ||
			result.number !== args.issueNumber ||
			typeof result.body !== "string" ||
			!returned ||
			returned.host !== expected.host ||
			returned.owner !== expected.owner ||
			returned.repo !== expected.repo ||
			returned.issueNumber !== expected.issueNumber
		)
			return null;
		return { text: result.body.trim() };
	} catch (err) {
		console.error("[promptContext] fetchGitLabIssueBody failed", { args, err });
		return null;
	}
}
