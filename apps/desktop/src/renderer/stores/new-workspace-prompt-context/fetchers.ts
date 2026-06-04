import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PromptContextBody } from "./store";

export async function fetchPrBody(args: {
	prNumber: number;
	projectId: string;
	hostUrl: string;
}): Promise<PromptContextBody | null> {
	try {
		const client = getHostServiceClientByUrl(args.hostUrl);
		const result = await client.pullRequests.getContent.query({
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
