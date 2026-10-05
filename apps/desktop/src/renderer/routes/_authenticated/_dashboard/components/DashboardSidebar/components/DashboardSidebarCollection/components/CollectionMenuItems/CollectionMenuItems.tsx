import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";

interface CollectionMenuItemsProps {
	kind: "context" | "dropdown";
	color: string | null;
	canDelete: boolean;
	onRename: () => void;
	onColor: (color: string | null) => void;
	onDelete: () => void;
}

export function CollectionMenuItems({
	kind,
	color,
	canDelete,
	onRename,
	onColor,
	onDelete,
}: CollectionMenuItemsProps) {
	const { t } = useLingui();
	const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
	const Sub = kind === "context" ? ContextMenuSub : DropdownMenuSub;
	const SubTrigger =
		kind === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
	const SubContent =
		kind === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
	const RadioGroup =
		kind === "context" ? ContextMenuRadioGroup : DropdownMenuRadioGroup;
	const RadioItem =
		kind === "context" ? ContextMenuRadioItem : DropdownMenuRadioItem;
	return (
		<>
			<Item onSelect={onRename}>
				<Trans>Rename</Trans>
			</Item>
			<Sub>
				<SubTrigger>
					<Trans>Color</Trans>
				</SubTrigger>
				<SubContent>
					<RadioGroup
						value={color ?? PROJECT_COLOR_DEFAULT}
						onValueChange={(value) =>
							onColor(value === PROJECT_COLOR_DEFAULT ? null : value)
						}
					>
						<RadioItem value={PROJECT_COLOR_DEFAULT}>
							<span className="relative inline-flex size-3 shrink-0 items-center justify-center rounded-full border border-border/50">
								<span className="size-1.5 rounded-full bg-muted-foreground/35" />
							</span>
							<Trans>Default</Trans>
						</RadioItem>
						{PROJECT_COLORS.map((option) => (
							<RadioItem key={option.value} value={option.value}>
								<span
									className="size-3 shrink-0 rounded-full"
									style={{ backgroundColor: option.value }}
								/>
								{option.name()}
							</RadioItem>
						))}
					</RadioGroup>
				</SubContent>
			</Sub>
			<Item
				disabled={!canDelete}
				variant="destructive"
				onSelect={onDelete}
				aria-label={t({ message: "Delete collection" })}
			>
				<Trans>Delete collection</Trans>
			</Item>
			{!canDelete && (
				<p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">
					<Trans>
						All project hosts must be online and support collections
					</Trans>
				</p>
			)}
		</>
	);
}
