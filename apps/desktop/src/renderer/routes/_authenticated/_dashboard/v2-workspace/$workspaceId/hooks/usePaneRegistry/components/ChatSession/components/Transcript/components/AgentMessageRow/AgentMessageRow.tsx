import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentMessage } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Check, Copy, GitBranch } from "lucide-react";
import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { ChatForkTarget } from "../../../../types";
import { MarkdownView } from "../../../MarkdownView";
import { useBlockFading } from "./hooks/useBlockFading";
import { usePacedText } from "./hooks/usePacedText";

const COPIED_MS = 1500;

function clockLabel(item: AgentMessage): string {
	const at = item.completedAtMs ?? item.startedAtMs;
	return new Date(at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function AgentMessageRow({
	canForkToWorktree = true,
	lastReply,
	item,
	onFork,
	text,
}: {
	item: AgentMessage;
	text: string;
	/** Absent when this agent cannot branch its own session. */
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	/** False when there is no project to cut a worktree from. */
	canForkToWorktree?: boolean;
	lastReply: boolean;
}) {
	const { t } = useLingui();
	const { copied, copyToClipboard } = useCopyToClipboard(COPIED_MS);
	const streaming = item.completedAtMs === undefined;
	const paced = usePacedText(text, streaming);
	const fading = useBlockFading(streaming || paced.revealing);

	const copy = useCallback(() => {
		copyToClipboard(text).catch((error: unknown) => {
			console.error("[chat] copy failed", error);
		});
	}, [copyToClipboard, text]);

	return (
		// Actions stay out of the way until the message is pointed at, and stay
		// reachable by keyboard regardless.
		<div className="group/message flex flex-col gap-1">
			<MarkdownView
				className="text-foreground/[0.78] [&_em]:text-foreground [&_strong]:text-foreground"
				fading={fading}
				text={paced.text}
			/>
			{lastReply && !streaming && (
				<div className="flex items-center gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
					<button
						aria-label={t({ message: "Copy message" })}
						className={cn(
							"rounded p-1 transition-colors hover:bg-secondary hover:text-foreground",
							copied && "text-foreground",
						)}
						onClick={copy}
						type="button"
					>
						{copied ? (
							<Check className="size-3.5" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
					{onFork && (
						<DropdownMenu>
							<DropdownMenuTrigger
								aria-label={t({ message: "Branch this conversation" })}
								className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
							>
								<GitBranch className="size-3.5" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-72">
								<DropdownMenuItem
									className="flex-col items-start gap-0.5"
									onSelect={() => onFork("workspace")}
								>
									<span className="text-xs">
										<Trans>Branch in this workspace</Trans>
									</span>
									<span className="text-[11px] text-muted-foreground">
										<Trans>
											The agent copies the conversation; the branch opens here
										</Trans>
									</span>
								</DropdownMenuItem>
								{canForkToWorktree && (
									<DropdownMenuItem
										className="flex-col items-start gap-0.5"
										onSelect={() => onFork("worktree")}
									>
										<span className="text-xs">
											<Trans>Branch in a new worktree</Trans>
										</span>
										<span className="text-[11px] text-muted-foreground">
											<Trans>
												A new workspace off this branch, with the conversation
												handed to a fresh agent
											</Trans>
										</span>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
					<span className="text-[11px] tabular-nums">{clockLabel(item)}</span>
				</div>
			)}
		</div>
	);
}
