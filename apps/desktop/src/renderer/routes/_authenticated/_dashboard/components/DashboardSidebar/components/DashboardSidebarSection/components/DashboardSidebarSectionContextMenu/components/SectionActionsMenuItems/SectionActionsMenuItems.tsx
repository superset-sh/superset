import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { HiCheck } from "react-icons/hi2";
import { LuPalette, LuPencil, LuTrash2 } from "react-icons/lu";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import type {
	DashboardSidebarSectionActionsProps,
	SectionActionsMenuKind,
} from "../../types";

interface SectionActionsMenuItemsProps
	extends DashboardSidebarSectionActionsProps {
	kind: SectionActionsMenuKind;
}

export function SectionActionsMenuItems({
	color,
	kind,
	onRename,
	onSetColor,
	onDelete,
}: SectionActionsMenuItemsProps) {
	const selectedValue = color ?? PROJECT_COLOR_DEFAULT;
	const colorOptions = [
		{ name: "Default", value: PROJECT_COLOR_DEFAULT },
		...PROJECT_COLORS,
	];
	const iconClassName = kind === "context" ? "size-4 mr-2" : "size-4";

	const renderItem = ({
		children,
		destructive = false,
		key,
		onSelect,
	}: {
		children: React.ReactNode;
		destructive?: boolean;
		key?: string;
		onSelect?: () => void;
	}) => {
		if (kind === "context") {
			return (
				<ContextMenuItem
					key={key}
					onSelect={(event) => {
						event.stopPropagation();
						onSelect?.();
					}}
					className={
						destructive ? "text-destructive focus:text-destructive" : undefined
					}
				>
					{children}
				</ContextMenuItem>
			);
		}

		return (
			<DropdownMenuItem
				key={key}
				onSelect={(event) => {
					event.stopPropagation();
					onSelect?.();
				}}
				variant={destructive ? "destructive" : "default"}
			>
				{children}
			</DropdownMenuItem>
		);
	};

	const colorItems = colorOptions.map((projectColor) => {
		const isDefault = projectColor.value === PROJECT_COLOR_DEFAULT;
		const isSelected = selectedValue === projectColor.value;

		return renderItem({
			key: projectColor.value,
			onSelect: () => onSetColor(isDefault ? null : projectColor.value),
			children: (
				<>
					<span
						className="relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border/50"
						style={
							isDefault ? undefined : { backgroundColor: projectColor.value }
						}
					>
						{isDefault ? (
							<span className="size-1.5 rounded-full bg-muted-foreground/35" />
						) : null}
					</span>
					<span>{projectColor.name}</span>
					{isSelected ? (
						<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
					) : null}
				</>
			),
		});
	});
	const colorTrigger = (
		<>
			<LuPalette className={iconClassName} />
			Set group color
		</>
	);

	return (
		<>
			{renderItem({
				onSelect: onRename,
				children: (
					<>
						<LuPencil className={iconClassName} />
						Rename group
					</>
				),
			})}
			{kind === "context" ? (
				<ContextMenuSub>
					<ContextMenuSubTrigger>{colorTrigger}</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</ContextMenuSubContent>
				</ContextMenuSub>
			) : (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>{colorTrigger}</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						{colorItems}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			)}
			{kind === "context" ? (
				<ContextMenuSeparator />
			) : (
				<DropdownMenuSeparator />
			)}
			{renderItem({
				destructive: true,
				onSelect: onDelete,
				children: (
					<>
						<LuTrash2
							className={
								kind === "context"
									? "size-4 mr-2 text-destructive"
									: "size-4 text-destructive"
							}
						/>
						Delete group
					</>
				),
			})}
		</>
	);
}
