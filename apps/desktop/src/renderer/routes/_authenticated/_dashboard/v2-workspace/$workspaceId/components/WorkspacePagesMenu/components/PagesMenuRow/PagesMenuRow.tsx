import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { FileText, Lock } from "lucide-react";
import type { MouseEvent } from "react";
import type { MenuPage } from "../../utils/selectMenuPages";

interface PagesMenuRowProps {
	page: MenuPage;
	onOpen: (page: MenuPage, event: MouseEvent) => void;
}

export function PagesMenuRow({ page, onOpen }: PagesMenuRowProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();

	return (
		<button
			type="button"
			onClick={(event) => onOpen(page, event)}
			className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
		>
			<FileText className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate font-medium">{page.title}</span>
			{page.isNew && (
				<span className="shrink-0 text-[10px] font-semibold text-blue-500">
					<Trans context="badge on a page published since the menu was last opened">
						New
					</Trans>
				</span>
			)}
			{page.isPrivate && (
				<Lock
					className="size-3 shrink-0 text-muted-foreground"
					aria-label={t({ message: "Only you can see this page" })}
				/>
			)}
			<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
				{formatCompactRelativeTime(page.publishedAtMs)}
			</span>
		</button>
	);
}
