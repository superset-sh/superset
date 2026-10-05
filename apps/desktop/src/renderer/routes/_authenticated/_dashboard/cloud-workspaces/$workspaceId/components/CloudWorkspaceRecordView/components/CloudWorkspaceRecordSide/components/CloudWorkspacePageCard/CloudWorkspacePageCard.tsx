import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Building2 } from "lucide-react";
import { PageThumbnail } from "renderer/routes/_authenticated/_dashboard/pages/components/PagesGrid/components/PageCard/components/PageThumbnail";
import type { CloudWorkspaceRecordPage } from "../../../../../../types";

interface CloudWorkspacePageCardProps {
	page: CloudWorkspaceRecordPage;
	now: Date;
	onOpen: () => void;
}

export function CloudWorkspacePageCard({
	page,
	now,
	onOpen,
}: CloudWorkspacePageCardProps) {
	const { formatCompactRelativeTime } = useFormat();
	const wasEdited =
		page.updatedAt.getTime() - page.createdAt.getTime() > 60_000;
	const ago = formatCompactRelativeTime(
		wasEdited ? page.updatedAt : page.createdAt,
		now,
	);
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex aspect-[11/8] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-muted-foreground/30"
		>
			<PageThumbnail src={page.thumbnailUrl} fill />
			<span className="flex shrink-0 flex-col gap-0.5 border-t border-border/60 px-3 py-2">
				<span className="truncate text-xs font-medium">{page.title}</span>
				<span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<Building2 className="size-3 shrink-0" />
					<span aria-hidden="true">·</span>
					<span className="truncate">
						{wasEdited ? (
							<Trans>Edited {ago}</Trans>
						) : (
							<Trans>Created {ago}</Trans>
						)}
					</span>
				</span>
			</span>
		</button>
	);
}
