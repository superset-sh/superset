import type { PullRequestComment } from "@superset/local-db";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ReviewCommentCardProps {
	comment: PullRequestComment;
	isHighlighted?: boolean;
}

export function ReviewCommentCard({
	comment,
	isHighlighted = false,
}: ReviewCommentCardProps) {
	const [isCopied, setIsCopied] = useState(false);
	const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyToClipboardMutation = electronTrpc.external.copyText.useMutation();

	const handleCopy = async () => {
		try {
			await copyToClipboardMutation.mutateAsync(comment.body);

			if (copiedTimeoutRef.current) {
				clearTimeout(copiedTimeoutRef.current);
			}

			setIsCopied(true);
			copiedTimeoutRef.current = setTimeout(() => {
				setIsCopied(false);
				copiedTimeoutRef.current = null;
			}, 1500);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.error(`Failed to copy comment: ${message}`);
		}
	};

	const handleOpenInGitHub = () => {
		if (comment.url) {
			window.open(comment.url, "_blank", "noopener,noreferrer");
		}
	};

	const age = formatShortAge(comment.createdAt);
	const kindText = getCommentKindText(comment);
	const avatarFallback = getCommentAvatarFallback(comment.authorLogin);

	return (
		<div
			data-comment-id={comment.id}
			className={cn(
				"group border-b last:border-b-0 transition-colors",
				isHighlighted
					? "border-l-2 border-l-accent bg-accent/10"
					: "border-l-2 border-l-transparent",
			)}
		>
			<div className="px-4 py-3">
				{/* Header */}
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-2.5">
						<Avatar className="mt-0.5 size-5 shrink-0">
							{comment.avatarUrl ? (
								<AvatarImage
									src={comment.avatarUrl}
									alt={comment.authorLogin}
								/>
							) : null}
							<AvatarFallback className="text-[9px] font-medium">
								{avatarFallback}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5 flex-wrap">
								<span className="text-xs font-medium">
									{comment.authorLogin}
								</span>
								<span className="text-[10px] text-muted-foreground">
									{kindText}
								</span>
								{age ? (
									<span className="text-[10px] text-muted-foreground/70">
										{age}
									</span>
								) : null}
							</div>
							{comment.path ? (
								<div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
									<span className="truncate font-mono">{comment.path}</span>
									{comment.line ? (
										<>
											<span>:</span>
											<span className="font-mono">{comment.line}</span>
										</>
									) : null}
								</div>
							) : null}
						</div>
					</div>

					{/* Actions */}
					<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
						{comment.url ? (
							<button
								type="button"
								onClick={handleOpenInGitHub}
								className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
								aria-label="Open on GitHub"
							>
								<LuArrowUpRight className="size-3" />
							</button>
						) : null}
						<button
							type="button"
							onClick={handleCopy}
							className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
							aria-label={isCopied ? "Copied" : "Copy"}
						>
							{isCopied ? (
								<LuCheck className="size-3" />
							) : (
								<LuCopy className="size-3" />
							)}
						</button>
					</div>
				</div>

				{/* Body */}
				<div className="mt-2 pl-7">
					<MarkdownRenderer
						content={comment.body}
						className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-xs leading-relaxed"
					/>
				</div>
			</div>
		</div>
	);
}

// Helper functions
function formatShortAge(timestamp?: number): string | null {
	if (!timestamp || Number.isNaN(timestamp)) {
		return null;
	}

	const deltaMs = Math.max(0, Date.now() - timestamp);
	const deltaSeconds = Math.round(deltaMs / 1000);

	if (deltaSeconds < 60) {
		return `${Math.max(1, deltaSeconds)}s`;
	}

	const deltaMinutes = Math.round(deltaSeconds / 60);
	if (deltaMinutes < 60) {
		return `${deltaMinutes}m`;
	}

	const deltaHours = Math.round(deltaMinutes / 60);
	if (deltaHours < 24) {
		return `${deltaHours}h`;
	}

	return `${Math.round(deltaHours / 24)}d`;
}

function getCommentKindText(comment: PullRequestComment): string {
	return comment.kind === "review" ? "review" : "comment";
}

function getCommentAvatarFallback(authorLogin: string): string {
	return authorLogin.slice(0, 2).toUpperCase();
}
