import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { assertGitLabHostSupport } from "renderer/lib/host-service-gitlab";
import type { PromptContextBody } from "./store";

export async function fetchPrBody(args: {
	prNumber: number;
	projectId: string;
	hostUrl: string;
	provider?: "github" | "gitlab";
	instance?: string;
	repoPath?: string;
}): Promise<PromptContextBody | null> {
	try {
		if (args.provider === "gitlab") await assertGitLabHostSupport(args.hostUrl);
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result =
			args.provider === "gitlab"
				? await client.pullRequests.getContent.query({
						provider: "gitlab",
						projectId: args.projectId,
						prNumber: args.prNumber,
						instance: args.instance ?? "",
						repoPath: args.repoPath ?? "",
					})
				: await client.pullRequests.getContent.query({
						projectId: args.projectId,
						prNumber: args.prNumber,
					});
		const text = (result.body ?? "").trim();
		return text ? { text } : null;
	} catch (err) {
		console.error("[promptContext] fetchPrBody failed", { args, err });
		return null;
	}
}

export async function fetchRepositoryIssueBody(args: {
	provider: "github" | "gitlab";
	issueNumber: number;
	projectId: string;
	hostUrl: string;
	instance?: string;
	repoPath?: string;
}): Promise<PromptContextBody | null> {
	try {
		if (args.provider === "gitlab") await assertGitLabHostSupport(args.hostUrl);
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result =
			args.provider === "gitlab"
				? await client.issues.getContent.query({
						provider: "gitlab",
						projectId: args.projectId,
						issueNumber: args.issueNumber,
						instance: args.instance ?? "",
						repoPath: args.repoPath ?? "",
					})
				: await client.issues.getContent.query({
						projectId: args.projectId,
						issueNumber: args.issueNumber,
					});
		const text = (result.body ?? "").trim();
		return { text };
	} catch (err) {
		console.error("[promptContext] fetchRepositoryIssueBody failed", {
			args,
			err,
		});
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
