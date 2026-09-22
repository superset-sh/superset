import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	ChevronDown,
	Copy as CopyIcon,
	ExternalLink,
	GitCompare,
	MessageSquare,
	SquarePlus,
} from "lucide-react";
import { LuArrowUpRight, LuCheck } from "react-icons/lu";
import { getMarkdownPreviewText } from "renderer/utils/markdownPreview";
import type { CommentPaneData, DiffFocusSide } from "../../../../types";
import type { NormalizedComment } from "../../types";

interface CommentRowProps {
	comment: NormalizedComment;
	copiedActionKey: string | null;
	onCopy: (comment: NormalizedComment) => void;
	onOpen?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

export function CommentRow({
	comment,
	copiedActionKey,
	onCopy,
	onOpen,
	onOpenInDiff,
}: CommentRowProps) {
	const { t } = useLingui();
	const createdAt = comment.createdAt ? new Date(comment.createdAt) : null;
	const age =
		createdAt && Number.isFinite(createdAt.getTime())
			? formatCompactRelativeTime(createdAt)
			: null;
	const isCopied = copiedActionKey === `comment:${comment.id}`;

	const handleClick = () => {
		// Default click jumps to the comment in the diff. Fall back to the
		// standalone comment pane when there's no file anchor (conversation
		// comments) or no diff handler wired up.
		if (comment.kind === "review" && comment.path && onOpenInDiff) {
			onOpenInDiff(
				comment.path,
				comment.line,
				undefined,
				toDiffFocusSide(comment.diffSide),
			);
			return;
		}
		onOpen?.({
			commentId: comment.id,
			authorLogin: comment.authorLogin,
			avatarUrl: comment.avatarUrl,
			body: comment.body,
			url: comment.url,
			path: comment.path,
			line: comment.line,
		});
	};

	const content = (
		<>
			<Avatar className="mt-0.5 size-4 shrink-0">
				{comment.avatarUrl ? (
					<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
				) : null}
				<AvatarFallback className="text-[10px] font-medium">
					{comment.authorLogin.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-xs font-medium text-foreground">
						{comment.authorLogin}
					</span>
					{comment.kind === "review" && comment.isOutdated ? (
						<span className="shrink-0 rounded border border-border/70 bg-muted/35 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
							<Trans>Outdated</Trans>
						</span>
					) : null}
					<span className="flex-1" />
					{age ? (
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{age}
						</span>
					) : null}
				</div>
				{comment.path && onOpenInDiff ? (
					<span
						className="mt-0.5 block truncate font-mono text-[10px] text-primary"
						title={comment.path}
					>
						{comment.path}
						{comment.line != null ? `:${comment.line}` : ""}
					</span>
				) : null}
				<p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
					{getMarkdownPreviewText(comment.body)}
				</p>
			</div>
		</>
	);

	return (
		<div className="group relative flex items-start gap-1 rounded-sm px-1.5 py-1 transition-colors hover:bg-accent/50">
			<button
				type="button"
				onClick={handleClick}
				className="flex min-w-0 flex-1 items-start gap-2 text-left"
				aria-label={t({
					message: `View comment by ${comment.authorLogin}`,
				})}
			>
				{content}
			</button>
			<div className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-sm bg-background/90 px-0.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
				{comment.url ? (
					<a
						href={comment.url}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label={t({
							message: "Open comment on GitHub",
						})}
					>
						<LuArrowUpRight className="size-3" />
					</a>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							onClick={(e) => e.stopPropagation()}
							aria-label={t({
								message: "More actions",
							})}
							className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
						>
							<ChevronDown className="size-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						{comment.kind === "review" && comment.path && onOpenInDiff ? (
							<>
								<DropdownMenuItem
									onSelect={() =>
										onOpenInDiff(
											comment.path as string,
											comment.line,
											undefined,
											toDiffFocusSide(comment.diffSide),
										)
									}
								>
									<GitCompare />
									<Trans>Open in diff</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() =>
										onOpenInDiff(
											comment.path as string,
											comment.line,
											true,
											toDiffFocusSide(comment.diffSide),
										)
									}
								>
									<SquarePlus />
									<Trans>Open in diff in new tab</Trans>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						) : null}
						{onOpen ? (
							<DropdownMenuItem
								onSelect={() =>
									onOpen({
										commentId: comment.id,
										authorLogin: comment.authorLogin,
										avatarUrl: comment.avatarUrl,
										body: comment.body,
										url: comment.url,
										path: comment.path,
										line: comment.line,
									})
								}
							>
								<MessageSquare />
								<Trans>Open as comment pane</Trans>
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem onSelect={() => onCopy(comment)}>
							{isCopied ? <LuCheck /> : <CopyIcon />}
							{isCopied
								? t({
										message: "Copied",
									})
								: t({
										message: "Copy comment",
									})}
						</DropdownMenuItem>
						{comment.url ? (
							<DropdownMenuItem
								onSelect={() => window.open(comment.url, "_blank", "noopener")}
							>
								<ExternalLink />
								<Trans>Open on GitHub</Trans>
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function toDiffFocusSide(
	side: NormalizedComment["diffSide"],
): DiffFocusSide | undefined {
	if (side === "LEFT") return "deletions";
	if (side === "RIGHT") return "additions";
	return undefined;
}
