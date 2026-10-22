import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { readPullRequestContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import type { PromptContextBody } from "./store";

export async function fetchPrBody(args: {
	prNumber: number;
	url: string;
	organizationId: string | null;
	projectId: string;
	hostUrl: string;
}): Promise<PromptContextBody | null> {
	try {
		const result = await readPullRequestContent({
			organizationId: args.organizationId,
			repoFullName: pullRequestRefFromUrl(args.url)?.repoFullName ?? null,
			prNumber: args.prNumber,
			host: { hostUrl: args.hostUrl, projectId: args.projectId },
		});
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
