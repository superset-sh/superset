import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import { LuArchive, LuArchiveRestore } from "react-icons/lu";

interface LocalWorkspaceArchivedStateProps {
	name: string;
	archivedAt: Date;
	now?: Date;
	onRestore: () => void;
}

/**
 * What opening a deleted local workspace shows: the tombstone with a way
 * back. The confirm dialog (opened by `onRestore`) carries the honest
 * limits — only committed or pushed work returns.
 */
export function LocalWorkspaceArchivedState({
	name,
	archivedAt,
	now,
	onRestore,
}: LocalWorkspaceArchivedStateProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<LuArchive
					className="size-5 text-muted-foreground"
					aria-hidden="true"
				/>
				<div className="flex min-w-0 max-w-full flex-col gap-1.5">
					<h1 className="truncate text-[15px] font-medium tracking-tight text-foreground">
						{name || t({ message: "Untitled workspace" })}
					</h1>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						<Trans>
							Deleted · {formatCompactRelativeTime(archivedAt, now)}
						</Trans>
					</p>
				</div>
				<Button size="sm" onClick={onRestore}>
					<LuArchiveRestore className="size-3.5" />
					<Trans>Restore workspace</Trans>
				</Button>
			</div>
		</div>
	);
}
