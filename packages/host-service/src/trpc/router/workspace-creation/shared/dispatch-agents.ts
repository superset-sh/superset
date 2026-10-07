import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../../types";
import { type AgentRunResult, runAgentInWorkspace } from "../../agents";
import type { ExpectedGitlabBoundDelivery } from "../../workspaces/create-gitlab-checkout";

export const agentLaunchSchema = z
	.object({
		agent: z.string().min(1),
		prompt: z.string(),
		attachmentIds: z.array(z.string().uuid()).optional(),
		model: z.string().optional(),
		effort: z.string().optional(),
		mode: z.string().optional(),
	})
	.refine(
		(value) =>
			value.prompt.length > 0 || (value.attachmentIds?.length ?? 0) > 0,
		{ message: "Agent launch requires a prompt or attachments" },
	);

export type AgentLaunchResult =
	| ({ ok: true } & AgentRunResult)
	| { ok: false; error: string };

export async function dispatchSugarAgents(
	ctx: HostServiceContext,
	workspaceId: string,
	launches: z.infer<typeof agentLaunchSchema>[],
	expectedDelivery?: ExpectedGitlabBoundDelivery,
	runAgent: typeof runAgentInWorkspace = runAgentInWorkspace,
): Promise<AgentLaunchResult[]> {
	if (launches.length === 0) return [];
	return Promise.all(
		launches.map(async (entry) => {
			try {
				const result = await runAgent(
					ctx,
					{
						workspaceId,
						agent: entry.agent,
						prompt: entry.prompt,
						attachmentIds: entry.attachmentIds,
						model: entry.model,
						effort: entry.effort,
						mode: entry.mode,
						...(expectedDelivery
							? { expectedPullRequest: expectedDelivery.expectedPullRequest }
							: {}),
					},
					expectedDelivery?.initialWorkspace,
				);
				return { ok: true as const, ...result };
			} catch (err) {
				if (
					expectedDelivery &&
					err instanceof TRPCError &&
					(["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT"].includes(
						err.code,
					) ||
						(err.cause &&
							"deliveryRefused" in err.cause &&
							err.cause.deliveryRefused === true))
				)
					throw err;
				return {
					ok: false as const,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}),
	);
}
