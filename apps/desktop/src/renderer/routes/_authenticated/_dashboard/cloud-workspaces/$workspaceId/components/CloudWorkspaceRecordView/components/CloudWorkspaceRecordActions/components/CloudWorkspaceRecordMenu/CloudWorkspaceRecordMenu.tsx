import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuArchive, LuArchiveRestore, LuBox, LuEllipsis } from "react-icons/lu";

interface CloudWorkspaceRecordMenuProps {
	isArchived: boolean;
	onSaveAsEnvironment?: () => void;
	onArchive: () => void;
	onUnarchive: () => void;
}

export function CloudWorkspaceRecordMenu({
	isArchived,
	onSaveAsEnvironment,
	onArchive,
	onUnarchive,
}: CloudWorkspaceRecordMenuProps) {
	const { t } = useLingui();
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={t({ message: "More actions" })}
					className="text-muted-foreground hover:text-foreground"
				>
					<LuEllipsis className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				{onSaveAsEnvironment && (
					<>
						<DropdownMenuItem onSelect={onSaveAsEnvironment}>
							<LuBox className="size-4" />
							<Trans>Save as environment</Trans>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				{isArchived ? (
					<DropdownMenuItem onSelect={onUnarchive}>
						<LuArchiveRestore className="size-4" />
						<Trans>Unarchive</Trans>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onSelect={onArchive}>
						<LuArchive className="size-4" />
						<Trans>Archive</Trans>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
