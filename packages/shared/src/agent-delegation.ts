import { z } from "zod";

export const agentDelegationModeSchema = z.enum(["native", "workspaces"]);

export type AgentDelegationMode = z.infer<typeof agentDelegationModeSchema>;

export interface WorkspaceDelegationContext {
	workspaceId: string;
	agent: string;
}

/**
 * Hidden agent guidance used by Superset's UserPromptSubmit hook.
 *
 * This must never be prepended to the user's prompt. Hook-capable agents
 * receive it as additional/developer context only when the owning workspace
 * has fan-out enabled.
 */
export function buildWorkspaceDelegationInstructions({
	workspaceId,
	agent,
}: WorkspaceDelegationContext): string {
	return `Superset workspace fan-out is enabled. When the user asks for subagents, delegation, fan-out, or parallel agents, do not use hidden/native subagent tools. Create one persistent visible Superset subworkspace per independent task by running:

superset workspaces create-subworkspace --parent ${JSON.stringify(workspaceId)} --name "<name>" --agent ${JSON.stringify(agent)} --delegation-mode workspaces --prompt "<complete standalone task prompt>" --json

Use the same agent configuration for each child. The command is local and requires no Superset MCP or cloud login. If it fails, report the failure and stop instead of falling back to native subagents. Each child shares the parent workspace checkout and branch, so coordinate edits and never create or switch branches/worktrees.`;
}
