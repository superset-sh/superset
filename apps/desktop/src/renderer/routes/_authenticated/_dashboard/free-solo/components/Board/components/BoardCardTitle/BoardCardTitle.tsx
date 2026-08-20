import { TerminalSquare } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { BoardCard as BoardCardModel } from "renderer/stores/free-solo-board";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

interface BoardCardTitleProps {
	card: BoardCardModel;
	/** From the host's own session list, threaded down by Board. This
	 *  component renders outside WorkspaceProvider (it's the card frame's
	 *  title, not its content), so the workspace tab's title source isn't in
	 *  scope — and Board already holds the fan-out that carries it. Undefined
	 *  while the host hasn't answered, or for a session it doesn't name. */
	sessionTitle?: string | null;
}

/** Two cards from two projects have to be tellable apart at a glance, and two
 *  from the *same* workspace only differ by their session — so the title
 *  carries project, workspace, and session title. */
export function BoardCardTitle({ card, sessionTitle }: BoardCardTitleProps) {
	const { workspaces } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const workspace = workspaces.find((item) => item.id === card.workspaceId);
	// Host projects are keyed by `projectKey`, which is what a workspace's
	// `projectId` points at (see useAccessibleV2Workspaces). A workspace with
	// no project is a scratch session.
	const projectName = workspace?.projectId
		? projects.find((project) => project.projectKey === workspace.projectId)
				?.name
		: "Session";

	// One `useTerminalAgentBindings` subscription per card, not two: the
	// board can hold up to MAX_CARDS live cards at once (unlike the
	// workspace pane view `TerminalPaneIcon` was built for, where only a
	// few panes are ever mounted), so both the icon and the status below are
	// derived from this single binding lookup rather than reusing
	// `TerminalPaneIcon` — which would open its own independent
	// `useTerminalAgentBindings` subscription for the same data.
	const bindings = useTerminalAgentBindings(card.workspaceId);
	const binding = bindings.get(card.terminalId);
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);
	const isDark = useIsDarkTheme();
	const agentStatus = binding
		? deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: terminalSeenAt[card.terminalId],
			})
		: undefined;
	const agentIconSrc = binding
		? getPresetIcon(binding.agentId, isDark)
		: undefined;

	return (
		<div className="flex min-w-0 items-center gap-1.5 text-xs">
			{binding && (
				<>
					{agentIconSrc ? (
						<img
							src={agentIconSrc}
							alt=""
							className="size-3.5 shrink-0"
							draggable={false}
						/>
					) : (
						<TerminalSquare className="size-3.5 shrink-0" />
					)}
					{agentStatus && agentStatus !== "idle" && (
						<StatusIndicator status={agentStatus} className="shrink-0" />
					)}
				</>
			)}
			<span className="shrink-0 text-muted-foreground">{projectName}</span>
			{/* Both of these truncate, so flex shrinks whichever is longer
			    hardest rather than starving the session title outright. */}
			<span className="truncate font-medium">{workspace?.name}</span>
			{sessionTitle && (
				<span className="truncate text-muted-foreground">{sessionTitle}</span>
			)}
		</div>
	);
}
