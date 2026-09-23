import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineTrash } from "react-icons/hi2";
import { LuPencil, LuStar } from "react-icons/lu";

interface SourceFolderMenuItemsProps {
	isPrimary: boolean;
	disabled?: boolean;
	onMakePrimary: () => void;
	onRename?: () => void;
	onRemove: () => void;
}

export function SourceFolderMenuItems({
	isPrimary,
	disabled,
	onMakePrimary,
	onRename,
	onRemove,
}: SourceFolderMenuItemsProps) {
	return (
		<>
			{!isPrimary && (
				<DropdownMenuItem
					className="gap-2"
					disabled={disabled}
					onSelect={onMakePrimary}
				>
					<LuStar className="size-4" />
					<span>
						<Trans>Make primary</Trans>
					</span>
				</DropdownMenuItem>
			)}
			{onRename && (
				<DropdownMenuItem
					className="gap-2"
					disabled={disabled}
					onSelect={onRename}
				>
					<LuPencil className="size-4" />
					<span>
						<Trans>Rename folder</Trans>
					</span>
				</DropdownMenuItem>
			)}
			{isPrimary ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span data-testid="source-folder-remove-reason">
							<DropdownMenuItem className="gap-2" disabled>
								<HiOutlineTrash className="size-4" />
								<span>
									<Trans>Remove</Trans>
								</span>
							</DropdownMenuItem>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left">
						<Trans>
							The primary folder can't be removed. Make another folder primary
							first.
						</Trans>
					</TooltipContent>
				</Tooltip>
			) : (
				<DropdownMenuItem
					className="gap-2 text-destructive"
					disabled={disabled}
					onSelect={onRemove}
				>
					<HiOutlineTrash className="size-4 text-destructive" />
					<span>
						<Trans>Remove</Trans>
					</span>
				</DropdownMenuItem>
			)}
		</>
	);
}
