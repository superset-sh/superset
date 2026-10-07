import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { cn } from "@superset/ui/utils";
import { Lock } from "lucide-react";
import type { MouseEvent } from "react";
import { PageThumbnail } from "renderer/routes/_authenticated/_dashboard/components/PageThumbnail";

export interface PagesListItem {
	id: string;
	slug: string;
	title: string;
	visibility: string;
	thumbnailUrl: string | null;
	publishedAt?: Date | string | null;
	updatedAt: Date | string;
}

interface PagesListCardProps {
	page: PagesListItem;
	isActive: boolean;
	onOpen: (page: PagesListItem, event: MouseEvent) => void;
}

export function PagesListCard({ page, isActive, onOpen }: PagesListCardProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	const publishedAtMs = new Date(page.publishedAt ?? page.updatedAt).getTime();

	return (
		<button
			type="button"
			onClick={(event) => onOpen(page, event)}
			title={page.title}
			className={cn(
				"group flex flex-col overflow-hidden rounded-md border border-border/60 text-left outline-none transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring",
				isActive && "border-primary/60",
			)}
		>
			<PageThumbnail src={page.thumbnailUrl} />
			<div className="flex items-center gap-1.5 border-border/60 border-t px-2 py-1.5 transition-colors group-hover:bg-accent/40">
				<span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
					{page.title}
				</span>
				{page.visibility === "just_me" && (
					<Lock
						className="size-3 shrink-0 text-muted-foreground"
						aria-label={t({ message: "Only you can see this page" })}
					/>
				)}
				<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
					{formatCompactRelativeTime(publishedAtMs)}
				</span>
			</div>
		</button>
	);
}
