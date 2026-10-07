import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { buildChatSessionHandoffPrompt } from "@superset/shared/terminal-session-handoff";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { queuePendingChatHandoff } from "renderer/stores/workspace-creates/queuePendingChatHandoff";
import { useWorkspace } from "../../../../../../../providers/WorkspaceProvider";

export type ChatForkSource = {
	agentId: string;
	agentLabel: string;
	/** The conversation as text, for the branch that cannot resume it. */
	transcript: string;
};

/**
 * Branching a chat into a worktree of its own.
 *
 * The agent cannot help here: it keys its stored sessions to a project
 * directory, so `session/fork` into another worktree is refused and
 * `--resume` would be too. The new worktree gets a fresh session told what
 * happened instead — the same handoff the terminal uses to move a session
 * between agents, built from the chat's own journal rather than scraped pty
 * bytes.
 */
export function useForkChat(workspaceId: string): {
	forkToWorktree: (source: ChatForkSource) => Promise<void>;
	canForkToWorktree: boolean;
} {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const collections = useCollections();
	const navigate = useNavigate();
	// Navigation waits for the handoff to be queued: the target page drains the
	// queue when its layout hydrates, and arriving first would find nothing.
	const createWorkspace = useCreateWorkspace({ skipNavigation: true });
	const projectId = workspace.projectId;

	const forkToWorktree = useCallback(
		async (source: ChatForkSource) => {
			if (!projectId) {
				toast.error(
					t({ message: "This workspace has no project to branch from" }),
				);
				return;
			}
			try {
				const created = await createWorkspace.mutateAsync({
					projectId,
					name: t`${workspace.name} branch`,
					// Branches from this workspace, so the conversation's committed
					// work is already there. Uncommitted work is not, which is what
					// the handoff prompt tells the agent to check for.
					sourceWorkspaceId: workspaceId,
				});
				queuePendingChatHandoff(
					collections,
					{ id: created.workspace.id, projectId },
					{
						agentId: source.agentId,
						prompt: buildChatSessionHandoffPrompt({
							transcript: source.transcript,
							sourceAgentLabel: source.agentLabel,
							sourceWorktree: workspace.name,
						}),
					},
				);
				navigateToWorkspace(created.workspace.id, navigate);
			} catch (error) {
				toast.error(t({ message: "Couldn't branch into a new worktree" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[
			createWorkspace,
			collections,
			navigate,
			projectId,
			workspaceId,
			workspace.name,
			t,
		],
	);

	return { forkToWorktree, canForkToWorktree: projectId !== null };
}
