import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import { LuArchive, LuArchiveRestore } from "react-icons/lu";

interface CloudWorkspaceArchivedStateProps {
	name: string;
	archivedAt: Date;
	now?: Date;
	onUnarchive: () => void;
}

export function CloudWorkspaceArchivedState({
	name,
	archivedAt,
	now,
	onUnarchive,
}: CloudWorkspaceArchivedStateProps) {
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
							Archived · {formatCompactRelativeTime(archivedAt, now)}
						</Trans>
					</p>
				</div>
				<Button size="sm" onClick={onUnarchive}>
					<LuArchiveRestore className="size-3.5" />
					<Trans>Unarchive</Trans>
				</Button>
			</div>
		</div>
	);
}
