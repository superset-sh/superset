"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { Bot } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../../ui/avatar";
import type { CommentThread } from "../../../../providers/CommentProvider";
import { commentAuthor } from "../../../../utils/commentAuthor";
import { initialsOf } from "../../../../utils/initialsOf";
import { relativeTime } from "../../../../utils/relativeTime";
import { CommentComposer } from "../../../CommentComposer";
import { CommentList } from "../../../CommentList";

interface SidebarThreadProps {
	thread: CommentThread;
	active: boolean;
	servedVersion: number | null;
	onSelect: () => void;
	onReply: (body: string) => void | Promise<void>;
	onEdit?: (commentId: string, body: string) => void | Promise<void>;
	onToggleResolved?: () => void;
	onDelete?: () => void;
}

export function SidebarThread({
	thread,
	active,
	servedVersion,
	onSelect,
	onReply,
	onEdit,
	onToggleResolved,
	onDelete,
}: SidebarThreadProps) {
	const first = thread.comments[0];
	const author = first ? commentAuthor(first) : null;
	const rest = thread.comments.length - 1;
	const fromAnotherVersion =
		servedVersion !== null && thread.version !== servedVersion;

	const versionBadge = fromAnotherVersion ? (
		<span className="shrink-0 rounded bg-foreground/[0.06] px-1 text-[10px] leading-4 text-muted-foreground">
			v{thread.version}
		</span>
	) : null;

	if (active) {
		return (
			<div
				className={cn(
					"flex flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-sm",
					thread.resolved && "opacity-60",
				)}
			>
				{thread.anchor.text || versionBadge ? (
					<button
						type="button"
						onClick={onSelect}
						className="flex w-full items-center gap-2 border-b px-3.5 py-2 text-left"
					>
						{thread.anchor.text ? (
							<span className="truncate text-xs text-muted-foreground italic">
								“{thread.anchor.text}”
							</span>
						) : null}
						<span className="ml-auto">{versionBadge}</span>
					</button>
				) : null}

				<CommentList
					thread={thread}
					onEdit={onEdit}
					onToggleResolved={onToggleResolved}
					onDelete={onDelete}
					className="max-h-80 overflow-y-auto"
				/>

				<CommentComposer isReply onSubmit={onReply} className="border-t" />
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full flex-col gap-1 rounded-lg border border-transparent p-3.5 text-left transition-colors hover:bg-foreground/[0.03]",
				thread.resolved && "opacity-60",
			)}
		>
			<div className="flex h-7 items-center gap-2.5">
				<Avatar className="size-7">
					{author?.image ? <AvatarImage src={author.image} alt="" /> : null}
					<AvatarFallback className="text-[11px]">
						{author?.isAgent ? (
							<Bot className="size-3.5" />
						) : (
							initialsOf(author?.name ?? "?")
						)}
					</AvatarFallback>
				</Avatar>
				<div className="flex min-w-0 items-baseline gap-2">
					<span className="truncate font-medium text-sm">
						{author?.name ?? <Trans>Unknown</Trans>}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{first ? relativeTime(first.createdAt) : ""}
					</span>
				</div>
				<span className="ml-auto">{versionBadge}</span>
			</div>

			<div className="flex flex-col gap-1 pl-[38px]">
				{thread.anchor.text ? (
					<span className="truncate text-xs text-muted-foreground italic">
						“{thread.anchor.text}”
					</span>
				) : null}
				<p className="line-clamp-3 whitespace-pre-wrap text-sm">
					{first?.body ?? ""}
				</p>
				{rest > 0 ? (
					<span className="text-xs text-muted-foreground">
						<Plural value={rest} one="# reply" other="# replies" />
					</span>
				) : null}
			</div>
		</button>
	);
}
