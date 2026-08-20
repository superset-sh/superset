import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronsUpDown } from "react-icons/lu";
import type { ReviewComment } from "../../../../../../../../types/review";
import { REVIEW_TAG_STYLES } from "../../../../../../../../utils/reviewTagStyles";

const STATUS_STYLES: Record<
	ReviewComment["status"],
	{ label: string; className: string }
> = {
	resolved: { label: "Resolved", className: REVIEW_TAG_STYLES.green },
	"high-risk": { label: "High risk", className: REVIEW_TAG_STYLES.red },
};

interface ReviewCommentRowProps {
	comment: ReviewComment;
}

export function ReviewCommentRow({ comment }: ReviewCommentRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const status = STATUS_STYLES[comment.status];

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={setIsExpanded}
			className="rounded-lg bg-[#ececec] p-2 dark:bg-muted"
		>
			<div className="flex items-center gap-2">
				<Avatar className="size-5">
					{comment.authorAvatarUrl && (
						<AvatarImage src={comment.authorAvatarUrl} />
					)}
					<AvatarFallback className="text-[10px]">
						{comment.authorName.slice(0, 1).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
					{comment.authorName}
				</span>
				<Badge
					variant="outline"
					className={cn("rounded-full font-medium", status.className)}
				>
					{status.label}
				</Badge>
				<CollapsibleTrigger className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
					expand
					<LuChevronsUpDown className="size-3.5" />
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent className="overflow-hidden transition-[height] duration-200 ease-out data-[state=closed]:h-0 data-[state=open]:h-[var(--radix-collapsible-content-height)]">
				<p className="pt-2 text-[13px] leading-relaxed text-muted-foreground">
					{comment.body}
				</p>
			</CollapsibleContent>
		</Collapsible>
	);
}
