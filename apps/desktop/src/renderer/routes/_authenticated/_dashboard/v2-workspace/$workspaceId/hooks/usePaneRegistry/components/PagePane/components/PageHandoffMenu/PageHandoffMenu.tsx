import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useComments, useFramePointerDown } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { formatDistanceToNowStrict } from "date-fns";
import { Bot, ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { buildPrompt } from "./utils/buildPrompt";

interface PageHandoffMenuProps {
	workspaceId: string;
	pageTitle: string;
	pageSlug: string;
}

export function PageHandoffMenu({
	workspaceId,
	pageTitle,
	pageSlug,
}: PageHandoffMenuProps) {
	const { threads } = useComments();
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
			toast.error("Could not hand off these comments", {
				description: error instanceof Error ? error.message : undefined,
			});
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
				onSuccess: () => toast.success("Sent to agent"),
				onError: (error) =>
					toast.error("Could not reach that agent", {
						description: error.message,
					}),
			},
		);
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					size="xs"
					variant="ghost"
					disabled={send.isPending || activate.isPending}
				>
					<Bot className="size-3.5" />
					Hand off
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					{open.length} open {open.length === 1 ? "comment" : "comments"}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{running.length === 0 ? (
					<DropdownMenuItem disabled>No agents running here</DropdownMenuItem>
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
									active{" "}
									{formatDistanceToNowStrict(binding.lastEventAt, {
										addSuffix: true,
									})}
								</span>
							</div>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
