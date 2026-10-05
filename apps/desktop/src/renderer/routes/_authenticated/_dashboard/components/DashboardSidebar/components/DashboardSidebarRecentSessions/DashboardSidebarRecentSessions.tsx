import { useLingui } from "@lingui/react/macro";
import {
	formatCompactRelativeTime,
	formatDateTime,
} from "@superset/i18n/format";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import {
	type RecentAgentSession,
	useRecentAgentSessions,
} from "renderer/hooks/host-service/useRecentAgentSessions";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useOpenSessionIntent } from "renderer/stores/open-session-intent";

/** A conversation with no readable transcript falls back to where it ran. */
function workspaceLabel(session: RecentAgentSession): string {
	return session.projectName
		? `${session.projectName} / ${session.workspaceName}`
		: session.workspaceName;
}

interface DashboardSidebarRecentSessionsProps {
	isCollapsed?: boolean;
}

/**
 * The agent conversations worked on most recently, newest first, under the
 * Sessions header. A row is a shortcut to the workspace the conversation
 * belongs to, never a workspace of its own: an agent finds its conversation
 * by working directory, so a second workspace over the same worktree would
 * resume into the wrong place and put two agents in one tree.
 */
export function DashboardSidebarRecentSessions({
	isCollapsed = false,
}: DashboardSidebarRecentSessionsProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const hostUrl = useHostUrl(null);
	const sessions = useRecentAgentSessions();

	const openSession = useCallback(
		(session: RecentAgentSession) => {
			const { workspaceId } = session;
			// Navigate first: the workspace takes a moment to mount, and a
			// resume takes longer still, so the person should not sit on the
			// sidebar wondering whether the click registered.
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			});

			// A live session only needs its pane. A dead one has to come back
			// first, and its successor terminal is what the pane must show.
			if (session.isLive) {
				useOpenSessionIntent
					.getState()
					.request(workspaceId, session.terminalId);
				return;
			}

			void (async () => {
				if (!hostUrl) return;
				try {
					const result = await getHostServiceClientByUrl(
						hostUrl,
					).terminalAgents.resume.mutate({
						workspaceId,
						terminalId: session.terminalId,
					});
					// `resumed: false` means someone else already claimed it —
					// its successor is the terminal to show, not this row's.
					const successor = result.resumed
						? { terminalId: result.terminalId }
						: await getHostServiceClientByUrl(
								hostUrl,
							).terminalAgents.resumedSuccessor.query({
								workspaceId,
								terminalId: session.terminalId,
							});
					const terminalId = successor?.terminalId;
					if (terminalId) {
						useOpenSessionIntent.getState().request(workspaceId, terminalId);
					}
				} catch (error) {
					toast.error(
						t({
							message: `Could not resume ${session.agentLabel}`,
						}),
					);
					console.warn("[recent-sessions] resume failed", error);
				}
			})();
		},
		[hostUrl, navigate, t],
	);

	if (isCollapsed || sessions.length === 0) return null;

	return (
		<div className="flex flex-col gap-0.5">
			{sessions.map((session) => (
				<Tooltip key={session.terminalId} delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => openSession(session)}
							className="flex w-full items-center gap-2 rounded-md py-1 pr-2 pl-6 text-left text-muted-foreground text-sm transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<span
								aria-hidden
								className={cn(
									"size-1.5 shrink-0 rounded-full",
									session.isLive ? "bg-green-500" : "bg-muted-foreground/40",
								)}
							/>
							<span className="truncate">
								{session.title ?? workspaceLabel(session)}
							</span>
							{/* Ten conversations in one workspace all read "1d" ago;
							    the clock time is what separates them. */}
							<span className="ml-auto shrink-0 text-muted-foreground/70 text-xs">
								{formatDateTime(session.lastEventAt, {
									timeStyle: "short",
								})}
							</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="right" className="max-w-xs">
						<span className="block font-medium">
							{session.title ?? workspaceLabel(session)}
						</span>
						<span className="block text-muted-foreground">
							{workspaceLabel(session)}
						</span>
						<span className="block text-muted-foreground">
							{session.isLive
								? t({
										message: `${session.agentLabel} running · last active ${formatCompactRelativeTime(session.lastEventAt)}`,
									})
								: t({
										message: `Resume ${session.agentLabel} · last active ${formatCompactRelativeTime(session.lastEventAt)}`,
									})}
						</span>
					</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}
