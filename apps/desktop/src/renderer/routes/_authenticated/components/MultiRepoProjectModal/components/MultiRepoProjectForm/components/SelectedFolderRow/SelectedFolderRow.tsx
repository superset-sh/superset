import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { LuFolder, LuX } from "react-icons/lu";
import type { SelectedFolder } from "../../../../MultiRepoProjectModal.utils";

interface SelectedFolderRowProps {
	folder: SelectedFolder;
	isPrimary: boolean;
	canRemove: boolean;
	onRemove: () => void;
}

export function SelectedFolderRow({
	folder,
	isPrimary,
	canRemove,
	onRemove,
}: SelectedFolderRowProps) {
	const { t } = useLingui();

	return (
		<div
			className="flex items-center gap-3 px-3 py-2.5"
			data-testid="selected-folder-row"
			data-folder={folder.name}
		>
			<LuFolder className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{folder.name}</span>
					{isPrimary && (
						<Badge
							variant="secondary"
							data-testid="selected-folder-primary-badge"
						>
							<Trans context="badge on a project's primary source folder">
								Primary
							</Trans>
						</Badge>
					)}
				</div>
				<p
					className="truncate font-mono text-xs text-muted-foreground"
					title={folder.path}
				>
					{folder.path}
				</p>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-8 shrink-0"
				disabled={!canRemove}
				onClick={onRemove}
				aria-label={t({ message: `Remove ${folder.name}` })}
			>
				<LuX className="size-4" />
			</Button>
		</div>
	);
}
