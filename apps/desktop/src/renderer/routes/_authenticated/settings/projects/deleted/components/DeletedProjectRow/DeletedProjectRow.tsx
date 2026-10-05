import { Plural, Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import type { DeletedProject } from "../../../hooks/useDeletedProjects/useDeletedProjects.utils";

const DAY_MS = 24 * 60 * 60 * 1000;

interface DeletedProjectRowProps {
	project: DeletedProject;
	deviceNames: string;
	deletedBy: string | null;
	canRestore: boolean;
	isRestoring: boolean;
	onRestore: () => void;
	onDeletePermanently: () => void;
}

export function DeletedProjectRow({
	project,
	deviceNames,
	deletedBy,
	canRestore,
	isRestoring,
	onRestore,
	onDeletePermanently,
}: DeletedProjectRowProps) {
	const deletedWhen = formatRelativeTime(project.deletedAt);
	const daysLeft = Math.max(
		0,
		Math.ceil((project.purgeAt - Date.now()) / DAY_MS),
	);
	return (
		<li className="flex items-center gap-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{project.name}</div>
				<div className="truncate text-xs text-muted-foreground">
					{deletedBy ? (
						<Trans>
							Deleted by {deletedBy} {deletedWhen} · {deviceNames}
						</Trans>
					) : (
						<Trans>
							Deleted {deletedWhen} · {deviceNames}
						</Trans>
					)}
				</div>
			</div>
			<div className="shrink-0 text-xs text-muted-foreground tabular-nums">
				<Plural value={daysLeft} one="# day left" other="# days left" />
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={!canRestore || isRestoring}
				onClick={onRestore}
			>
				{isRestoring ? <Trans>Restoring…</Trans> : <Trans>Restore</Trans>}
			</Button>
			<Button
				type="button"
				variant="destructive"
				size="sm"
				disabled={!canRestore || isRestoring}
				onClick={onDeletePermanently}
			>
				<Trans>Delete permanently</Trans>
			</Button>
		</li>
	);
}
