import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	type CommentThread,
	useFramePointerDown,
} from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { formatDistanceToNowStrict } from "date-fns";
import { Bot } from "lucide-react";
import { useCallback, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { buildPrompt } from "./utils/buildPrompt";

interface PageHandoffMenuProps {
	workspaceId: string;
	pageTitle: string;
	pageSlug: string;
	threads: CommentThread[];
}

export function PageHandoffMenu({
	workspaceId,
	pageTitle,
	pageSlug,
	threads,
}: PageHandoffMenuProps) {
	const { t } = useLingui();
	const bindings = useTerminalAgentBindings(workspaceId);
	const send = workspaceTrpc.terminal.send.useMutation();
	const activate = cloudTrpc.pageComment.activate.useMutation();
	const [menuOpen, setMenuOpen] = useState(false);

	useFramePointerDown(useCallback(() => setMenuOpen(false), []));

	const open = threads.filter((thread) => !thread.resolved);
	if (open.length === 0) return null;

	const running = [...bindings.values()]
		.filter((binding) => !binding.endedAt)
		.sort((a, b) => b.lastEventAt - a.lastEventAt);

	// Activate first, then prompt. The agent can only act on threads the server
	// has been told were handed to it, so sending the prompt before the stamp
	// lands would hand over ids the agent is refused on.
	const handoff = async (terminalId: string) => {
		try {
			await activate.mutateAsync({
				threadIds: open.map((thread) => thread.id),
			});
		} catch (error) {
			toast.error(
				t({
					id: "workspace.pagePane.handoffFailedToast",
					message: "Could not hand off these comments",
				}),
				{
					description: error instanceof Error ? error.message : undefined,
				},
			);
			return;
		}

		send.mutate(
			{
				workspaceId,
				terminalId,
				text: buildPrompt(pageTitle, pageSlug, open),
				submit: true,
			},
			{
				onSuccess: () =>
					toast.success(
						t({
							id: "workspace.pagePane.sentToAgentToast",
							message: "Sent to agent",
						}),
					),
				onError: (error) =>
					toast.error(
						t({
							id: "workspace.pagePane.agentUnreachableToast",
							message: "Could not reach that agent",
						}),
						{
							description: errorMessage(error),
						},
					),
			},
		);
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 p-0 text-muted-foreground/60 hover:text-muted-foreground"
					aria-label={t({
						id: "workspace.pagePane.handoffAria",
						message: "Hand off to an agent",
					})}
					title={t({
						id: "workspace.pagePane.handoffTitle",
						message: "Hand off to an agent",
					})}
					disabled={send.isPending || activate.isPending}
				>
					<Bot className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					<Plural
						id="workspace.pagePane.openCommentCount"
						value={open.length}
						one="# open comment"
						other="# open comments"
					/>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{running.length === 0 ? (
					<DropdownMenuItem disabled>
						<Trans id="workspace.pagePane.noAgentsRunning">
							No agents running here
						</Trans>
					</DropdownMenuItem>
				) : (
					running.map((binding) => (
						<DropdownMenuItem
							key={binding.terminalId}
							onSelect={() => handoff(binding.terminalId)}
							className="gap-2"
						>
							<Bot className="size-4 text-muted-foreground" />
							<div className="flex min-w-0 flex-col">
								<span className="truncate text-sm">
									{binding.definitionId ?? binding.agentId}
								</span>
								<span className="text-muted-foreground text-xs">
									<Trans id="workspace.pagePane.agentActiveSince">
										active{" "}
										{formatDistanceToNowStrict(binding.lastEventAt, {
											addSuffix: true,
										})}
									</Trans>
								</span>
							</div>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
