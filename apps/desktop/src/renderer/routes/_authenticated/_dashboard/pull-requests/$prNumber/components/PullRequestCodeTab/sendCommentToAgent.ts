import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import {
	type AgentPromptFileSide,
	formatAgentPromptWithFileContext,
} from "renderer/hooks/host-service/useSendToTerminalAgent";
import { normalizeTerminalCommand } from "renderer/lib/terminal/launch-command";
import type { AgentTarget } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/AgentCommentComposer/hooks/useDiffCommentTarget";
import type {
	SubmitArgs,
	SubmitHandle,
} from "renderer/stores/workspace-creates";

export interface SendCommentToAgentDeps {
	hostId: string | null;
	projectId: string;
	prNumber: number;
	/**
	 * Read when the send runs, not when the composer rendered. A create whose
	 * agent failed to launch still leaves a workspace checked out on this PR,
	 * and the next send must reuse it instead of checking the PR out again —
	 * unless it has since been archived, which this must not hand back.
	 */
	getLinkedWorkspaceId: () => string | null;
	writeTerminalInput: (args: {
		workspaceId: string;
		terminalId: string;
		data: string;
	}) => Promise<unknown>;
	runAgent: (args: {
		workspaceId: string;
		agent: string;
		prompt: string;
	}) => Promise<unknown>;
	submitWorkspaceCreate: (args: SubmitArgs) => SubmitHandle;
	/** Records a workspace this send created, a failed agent launch included. */
	onWorkspaceCreated: (workspaceId: string) => void;
}

export interface SendCommentToAgentInput {
	comment: string;
	target: AgentTarget;
	path: string;
	startLine: number;
	endLine: number;
	side: AgentPromptFileSide;
}

/**
 * Mirrors DiffPane's split between "send to an existing terminal" and "create a
 * new agent session", but the PR tab has no fixed workspace to launch a new
 * session *in* — when no workspace is linked to this PR yet, "new" means
 * spinning up a whole PR-checkout workspace (via the same useWorkspaceCreates
 * path "Start Workspace" uses) with the prompt baked into its first agent
 * launch, not just a fresh terminal in one that already exists.
 */
export async function sendCommentToAgent(
	deps: SendCommentToAgentDeps,
	input: SendCommentToAgentInput,
): Promise<void> {
	const text = formatAgentPromptWithFileContext({
		comment: input.comment,
		file: {
			path: input.path,
			startLine: input.startLine,
			endLine: input.endLine,
			side: input.side,
		},
	});
	const linkedWorkspaceId = deps.getLinkedWorkspaceId();

	if (input.target.kind === "existing") {
		if (!linkedWorkspaceId) {
			throw new Error("No workspace open for this session");
		}
		await deps.writeTerminalInput({
			workspaceId: linkedWorkspaceId,
			terminalId: input.target.terminalId,
			data: normalizeTerminalCommand(sanitizePromptForPty(text)),
		});
		return;
	}

	if (linkedWorkspaceId) {
		await deps.runAgent({
			workspaceId: linkedWorkspaceId,
			agent: input.target.configId,
			prompt: text,
		});
		return;
	}

	if (!deps.hostId) {
		throw new Error("No host available to create a workspace");
	}
	const { completed } = deps.submitWorkspaceCreate({
		hostId: deps.hostId,
		snapshot: {
			id: crypto.randomUUID(),
			projectId: deps.projectId,
			pr: deps.prNumber,
			agents: [{ agent: input.target.configId, prompt: text }],
		},
	});
	const outcome = await completed;
	// Report the workspace before throwing: an agent that never launched leaves
	// the checkout behind, and a retry that did not know about it would create a
	// second one.
	if (outcome.workspaceId !== undefined) {
		deps.onWorkspaceCreated(outcome.workspaceId);
	}
	if (!outcome.ok) throw new Error(outcome.error);
}
