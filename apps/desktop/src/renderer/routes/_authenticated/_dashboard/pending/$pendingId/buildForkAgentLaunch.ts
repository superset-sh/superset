import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { PendingWorkspaceRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { buildAgentLaunchRequest } from "shared/context/buildAgentLaunchRequest";
import { buildLaunchSpec } from "shared/context/buildLaunchSpec";
import { buildLaunchContext } from "shared/context/composer";
import { defaultContributorRegistry } from "shared/context/contributors";
import type {
	AttachmentFile,
	LaunchSource,
	ResolveCtx,
} from "shared/context/types";
import {
	getFallbackAgentId,
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
} from "shared/utils/agent-settings";

export interface LoadedAttachment {
	data: string; // base64 data URL
	mediaType: string;
	filename: string;
}

export interface BuildForkAgentLaunchInputs {
	pending: Pick<
		PendingWorkspaceRow,
		"projectId" | "prompt" | "linkedIssues" | "linkedPR"
	>;
	attachments: LoadedAttachment[] | undefined;
	agentConfigs: ResolvedAgentConfig[];
}

/**
 * Build a V1-shaped AgentLaunchRequest for the "fork" intent once the
 * host-service workspace-create succeeds. Runs the V2 composer +
 * buildLaunchSpec + buildAgentLaunchRequest pipeline over whatever
 * metadata the pending row has.
 *
 * Phase 1 note: issue / PR / task bodies are not fetched over HTTP yet
 * (host-service lacks a body endpoint). The resolver returns empty
 * bodies — the agent sees the title/URL/task-slug metadata only. When
 * host-service grows a getIssueContent / getPullRequestContent /
 * getInternalTaskContent API, swap the resolver stubs here.
 */
export async function buildForkAgentLaunch(
	inputs: BuildForkAgentLaunchInputs,
): Promise<AgentLaunchRequest | null> {
	const agentId = getFallbackAgentId(inputs.agentConfigs);
	if (!agentId) return null;

	const agentConfig = indexResolvedAgentConfigs(inputs.agentConfigs).get(
		agentId,
	);
	if (!agentConfig) return null;

	const sources = buildLaunchSourcesFromPending(
		inputs.pending,
		inputs.attachments,
	);
	if (sources.length === 0) return null;

	const ctx = await buildLaunchContext(
		{
			projectId: inputs.pending.projectId,
			sources,
			agent: { id: agentId },
		},
		{
			contributors: defaultContributorRegistry,
			resolveCtx: buildResolveCtxFromPending(inputs.pending),
		},
	);
	const spec = buildLaunchSpec(ctx, agentConfig);
	if (!spec) return null;

	return buildAgentLaunchRequest(spec, agentConfig, {
		workspaceId: "pending-workspace",
		source: "new-workspace",
	});
}

export function buildLaunchSourcesFromPending(
	pending: BuildForkAgentLaunchInputs["pending"],
	attachments: LoadedAttachment[] | undefined,
): LaunchSource[] {
	const sources: LaunchSource[] = [];

	const prompt = pending.prompt?.trim();
	if (prompt) {
		sources.push({
			kind: "user-prompt",
			content: [{ type: "text", text: prompt }],
		});
	}

	for (const issue of pending.linkedIssues) {
		if (issue.source === "internal" && issue.taskId) {
			sources.push({ kind: "internal-task", id: issue.taskId });
		} else if (issue.source === "github" && issue.url) {
			sources.push({ kind: "github-issue", url: issue.url });
		}
	}

	if (pending.linkedPR?.url) {
		sources.push({ kind: "github-pr", url: pending.linkedPR.url });
	}

	for (const attachment of attachments ?? []) {
		sources.push({
			kind: "attachment",
			file: dataUrlAttachmentToBytes(attachment),
		});
	}

	return sources;
}

function dataUrlAttachmentToBytes(loaded: LoadedAttachment): AttachmentFile {
	const match = loaded.data.match(/^data:[^;]+;base64,(.+)$/);
	const base64 = match?.[1] ?? "";
	return {
		data: Uint8Array.from(Buffer.from(base64, "base64")),
		mediaType: loaded.mediaType,
		filename: loaded.filename,
	};
}

function buildResolveCtxFromPending(
	pending: BuildForkAgentLaunchInputs["pending"],
): ResolveCtx {
	return {
		projectId: pending.projectId,
		signal: new AbortController().signal,
		fetchIssue: async (url) => {
			const match = pending.linkedIssues.find(
				(i) => i.source === "github" && i.url === url,
			);
			if (!match) {
				throw Object.assign(new Error(`Issue not found: ${url}`), {
					status: 404,
				});
			}
			return {
				number: match.number ?? 0,
				url: match.url ?? url,
				title: match.title,
				body: "",
				slug: match.slug,
			};
		},
		fetchPullRequest: async (url) => {
			if (!pending.linkedPR || pending.linkedPR.url !== url) {
				throw Object.assign(new Error(`PR not found: ${url}`), {
					status: 404,
				});
			}
			return {
				number: pending.linkedPR.prNumber,
				url: pending.linkedPR.url,
				title: pending.linkedPR.title,
				body: "",
				branch: "",
			};
		},
		fetchInternalTask: async (id) => {
			const match = pending.linkedIssues.find(
				(i) => i.source === "internal" && i.taskId === id,
			);
			if (!match) {
				throw Object.assign(new Error(`Task not found: ${id}`), {
					status: 404,
				});
			}
			return {
				id,
				slug: match.slug,
				title: match.title,
				description: null,
			};
		},
	};
}
