import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	PAGE_THUMBNAIL_HEIGHT,
	PAGE_THUMBNAIL_WIDTH,
} from "@superset/shared/usercontent";
import { cn } from "@superset/ui/utils";
import { FileText } from "lucide-react";
import { type MouseEvent, useState } from "react";

export type ChatPageCardPage = {
	title: string;
	description: string | null;
	updatedAt: Date;
	thumbnailUrl: string | null;
};

/**
 * A page link, unfurled. One height whether the thumbnail shows, is still
 * loading, or has failed, so the transcript moves once when the card arrives
 * and never again.
 */
export function ChatPageCard({
	className,
	onOpen,
	page,
}: {
	page: ChatPageCardPage;
	onOpen: (event: MouseEvent) => void;
	className?: string;
}) {
	const { formatCompactRelativeTime } = useFormat();
	const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
	const thumbnail =
		page.thumbnailUrl === failedThumbnail ? null : page.thumbnailUrl;
	const ago = formatCompactRelativeTime(page.updatedAt);

	return (
		<button
			className={cn(
				"flex h-[68px] w-full max-w-md shrink-0 overflow-hidden rounded-lg border border-border bg-card text-left font-sans transition-colors hover:border-muted-foreground/30",
				className,
			)}
			onClick={onOpen}
			type="button"
		>
			{thumbnail !== null && (
				<img
					alt=""
					aria-hidden="true"
					className="h-full shrink-0 border-border/60 border-r bg-muted/40 object-cover object-top"
					decoding="async"
					onError={() => setFailedThumbnail(thumbnail)}
					src={thumbnail}
					style={{
						aspectRatio: `${PAGE_THUMBNAIL_WIDTH} / ${PAGE_THUMBNAIL_HEIGHT}`,
					}}
				/>
			)}
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
				<span className="flex min-w-0 items-center gap-1.5">
					{thumbnail === null && (
						<FileText className="size-3.5 shrink-0 text-muted-foreground" />
					)}
					<span className="truncate font-medium text-foreground text-sm leading-5">
						{page.title}
					</span>
				</span>
				{page.description && (
					<span className="truncate text-muted-foreground text-xs leading-4">
						{page.description}
					</span>
				)}
				<span className="truncate text-[11px] text-muted-foreground/80 leading-4">
					<Trans>Edited {ago}</Trans>
				</span>
			</span>
		</button>
	);
}
