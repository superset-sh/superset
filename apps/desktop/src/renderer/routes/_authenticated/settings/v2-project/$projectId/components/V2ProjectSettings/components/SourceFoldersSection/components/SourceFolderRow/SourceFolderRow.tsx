import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiEllipsisVertical } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import type { ProjectFolder } from "../../types";
import { SourceFolderMenuItems } from "./components/SourceFolderMenuItems";

interface SourceFolderRowProps {
	folder: ProjectFolder;
	isPrimary: boolean;
	disabled?: boolean;
	onMakePrimary: () => void;
	onRename?: () => void;
	onRemove: () => void;
}

export function SourceFolderRow({
	folder,
	isPrimary,
	disabled,
	onMakePrimary,
	onRename,
	onRemove,
}: SourceFolderRowProps) {
	const { t } = useLingui();
	const source =
		folder.repoPath ??
		folder.repoUrl ??
		t({ message: "Cloned into each new workspace" });

	return (
		<div
			className="flex items-center gap-3 px-3 py-2.5"
			data-testid="source-folder-row"
			data-folder={folder.folder}
		>
			<LuFolder className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{folder.folder}</span>
					{isPrimary && (
						<Badge
							variant="secondary"
							data-testid="source-folder-primary-badge"
						>
							<Trans context="badge on a project's primary source folder">
								Primary
							</Trans>
						</Badge>
					)}
				</div>
				<p
					className="truncate font-mono text-xs text-muted-foreground"
					title={source}
				>
					{source}
				</p>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						aria-label={t({ message: `Actions for ${folder.folder}` })}
					>
						<HiEllipsisVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<SourceFolderMenuItems
						isPrimary={isPrimary}
						disabled={disabled}
						onMakePrimary={onMakePrimary}
						onRename={onRename}
						onRemove={onRemove}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
